import { getChainAddress, MathLib, Time } from "@morpho-org/morpho-ts";
import { type Client, type Hex, isAddressEqual } from "viem";
import {
  type ParsedMidnightCancelAndMake,
  parseMidnightCancelAndMake,
} from "../../actions/midnight/cancelAndMake.js";
import { encodeMidnightCancelAndMake } from "../../actions/midnight/encode.js";
import {
  type ChainCheck,
  createChainCheck,
} from "../../actions/requirements/chainCheck.js";
import type {
  GetOffersDataParams,
  MakeOffersParams,
  OffersData,
} from "../../entities/midnight/types.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { parseMidnightMakerTree } from "../../helpers/parseMidnightMaker.js";
import { validateReferenceTime } from "../../helpers/validate.js";
import { validateMidnightAccount } from "../../helpers/validateMidnightAccount.js";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  UnsupportedMidnightAuthorizationTargetError,
} from "../../types/error.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import { validateSignaturelessMidnightAction } from "./authorization.js";
import { storedMarketTuple, validateStoredCollateralOrder } from "./market.js";
import type { MakerParamsContext } from "./prepare.js";
import { validateStoredMidnightMarket } from "./validation.js";

type MakerPublicationAction = Extract<
  Action,
  {
    type:
      | "midnightMakeBorrow"
      | "midnightMakeLend"
      | "midnightMakeRepay"
      | "midnightMakeWithdraw"
      | "midnightSupplyCollateralMakeBorrow"
      | "midnightSupplyBlueMakeLend";
  }
>;
type CollateralFunding = Pick<
  Extract<Action, { type: "midnightSupplyCollateralMakeBorrow" }>["inputs"],
  "collateral" | "nativeAssets"
>;
type BlueFunding = Pick<
  Extract<Action, { type: "midnightSupplyBlueMakeLend" }>["inputs"],
  "blueSupply" | "nativeAssets"
>;
const publicationKinds = {
  midnightMakeBorrow: "borrow",
  midnightMakeLend: "lend",
  midnightMakeRepay: "repay",
  midnightMakeWithdraw: "withdraw",
  midnightSupplyCollateralMakeBorrow: "collateral-backed borrow",
  midnightSupplyBlueMakeLend: "Blue-backed lend",
} as const satisfies Record<MakerPublicationAction["type"], string>;
type MidnightMakerPublicationInputs = Omit<
  MakerPublicationAction["inputs"],
  keyof CollateralFunding | keyof BlueFunding
>;
const ratifierRoles = {
  priceV1: "priceRatifierV1",
  rateV1: "rateRatifierV1",
} as const;

/**
 * Inputs shared by every resting Midnight maker publication plan.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightMakerPublicationPlanParams
  extends Pick<IntentParams, "chainId" | "account" | "calldataOrigin">,
    Pick<GetOffersDataParams, "offers" | "validation"> {
  /** Optional groups to cancel atomically with publication; must not overlap the new tree. */
  readonly cancellations?: MakerPublicationAction["inputs"]["cancellations"];
  /** Unix seconds, strictly before every offer expiry. Defaults to the earlier of now + 2 hours and the earliest offer expiry minus one second. */
  readonly expiresAt?: number;
  /** Reference time in Unix seconds for plan expiry; defaults to the device clock. */
  readonly now?: bigint;
}

/**
 * @internal Resolves the plan intent and offer-capped deadline, then runs the operation's maker
 * parse constructor with a chain check that also checks bundle, Midnight and ratifier code once,
 * right before the first publication-state read, plus any operation-specific `codeRoles`. The
 * constructor also rejects a deadline at or before the pinned block timestamp while every offer
 * is live.
 */
export async function prepareMidnightMakerPublication<
  Parsed extends {
    readonly action: ParsedMidnightCancelAndMake;
    readonly data: OffersData;
  },
>(
  client: Client,
  {
    params,
    parse,
    codeRoles = [],
  }: {
    readonly params: MidnightMakerPublicationPlanParams;
    readonly codeRoles?: readonly ("blue" | "midnightBlueBuyCallbackFactory")[];
    readonly parse: (
      raw: MakeOffersParams,
      context: MakerParamsContext,
    ) => Promise<Parsed>;
  },
): Promise<{
  readonly parsed: Parsed;
  readonly inputs: MidnightMakerPublicationInputs;
  readonly calldataOrigin: Hex | undefined;
}> {
  const { chainId, account } = params;
  const now = params.now ?? Time.timestamp();
  validateReferenceTime(now);
  const intent = resolveIntent(
    {
      account,
      chainId,
      expiresAt: params.expiresAt,
      calldataOrigin: params.calldataOrigin,
    },
    now,
  );
  const tree = parseMidnightMakerTree({
    offers: params.offers,
    accountAddress: account,
  });
  // Conservative SDK cutoff: the core still fills an offer at its expiry second.
  const offerDeadline = tree.offers.reduce(
    (earliest, offer) => MathLib.min(earliest, offer.expiry - 1n),
    intent.deadline,
  );
  // An offer expired at the reference time is reported by the pinned offer-state check, as in the entity.
  const offerExpired = offerDeadline < now;
  const deadline = offerExpired ? intent.deadline : offerDeadline;
  if (params.expiresAt !== undefined && deadline < intent.deadline) {
    throw new InputExceedsMaxError({
      field: "expiresAt",
      value: intent.deadline,
      max: deadline,
    });
  }
  const chainCheck = createChainCheck(client, chainId);
  let preflightPassed = false;
  const checkChainAndCode: ChainCheck = async () => {
    if (preflightPassed) {
      return;
    }
    await chainCheck();
    await assertRegistryTargetsHaveCode(
      client,
      chainId,
      (
        [
          "midnightBundlesV2",
          "midnight",
          ratifierRoles[tree.type],
          ...codeRoles,
        ] as const
      ).map((role) => ({ role, address: getChainAddress(chainId, role) })),
      chainCheck,
    );
    preflightPassed = true;
  };
  const parsed = await parse(
    {
      accountAddress: account,
      offers: tree,
      cancellations: params.cancellations,
      deadline,
      now,
      validation: params.validation,
    },
    {
      client,
      chainId,
      chainCheck: checkChainAndCode,
      // No plan can be returned for an expired offer, so stop once the pinned check passes.
      ...(offerExpired && {
        rejectAfterPinnedChecks: new ExpiredDeadlineError(offerDeadline, now),
      }),
    },
  );
  const { action, data } = parsed;
  return {
    parsed,
    inputs: {
      chainId,
      account,
      deadline: action.deadline,
      cancellations: action.cancellations.map(({ group, maxConsumed }) => ({
        group,
        maxConsumed,
      })),
      root: data.tree.root,
      ratifierType: data.ratifierType,
      ratifier: data.ratifier,
      groups: [...data.groups],
      payload: data.payload,
    },
    calldataOrigin: intent.calldataOrigin,
  };
}

function parseStoredMidnightMakerPublication({
  type,
  inputs,
}: MakerPublicationAction) {
  const {
    chainId,
    account,
    deadline,
    ratifierType,
    ratifier,
    root,
    groups,
    payload,
  } = inputs;
  validateMidnightAccount("accountAddress", account);
  if (ratifierType !== "priceV1" && ratifierType !== "rateV1") {
    throw new InvalidTransactionPlanError({
      path: "inputs.ratifierType",
      reason: "expected priceV1 or rateV1",
    });
  }
  const registered = getChainAddress(chainId, ratifierRoles[ratifierType]);
  if (!isAddressEqual(ratifier, registered)) {
    throw new UnsupportedMidnightAuthorizationTargetError({
      authorized: ratifier,
      chainId,
      supportedTargets: [registered],
    });
  }
  const cancellations = inputs.cancellations.map(({ group, maxConsumed }) => ({
    group,
    maxConsumed,
  }));
  const publication = { ratifier, root, groups, payload };
  if (type === "midnightSupplyCollateralMakeBorrow") {
    const { collateral } = inputs;
    if (collateral == null) {
      throw missingFunding("collateral");
    }
    return parseMidnightCancelAndMake({
      chainId,
      deadline,
      nativeAmount: inputs.nativeAssets,
      cancellations,
      publication: {
        ...publication,
        collateral: {
          market: storedMarketTuple(collateral.market),
          supplies: collateral.supplies.map(({ collateralIndex, assets }) => ({
            collateralIndex,
            assets,
          })),
        },
      },
    });
  }
  if (type === "midnightSupplyBlueMakeLend") {
    const { blueSupply } = inputs;
    if (blueSupply == null) {
      throw missingFunding("blueSupply");
    }
    const { loanToken, collateralToken, oracle, irm, lltv } = blueSupply.market;
    return parseMidnightCancelAndMake({
      chainId,
      deadline,
      nativeAmount: inputs.nativeAssets,
      cancellations,
      publication: {
        ...publication,
        blueSupply: {
          market: { loanToken, collateralToken, oracle, irm, lltv },
          assets: blueSupply.assets,
          callbackSalt: blueSupply.callbackSalt,
        },
      },
    });
  }
  return parseMidnightCancelAndMake({
    chainId,
    deadline,
    cancellations,
    publication,
  });
}

function missingFunding(field: "collateral" | "blueSupply") {
  return new InvalidTransactionPlanError({
    path: `inputs.${field}`,
    reason: "expected funding for the maker publication",
  });
}

/** @internal Encodes a maker recipe's publication, cancellations and optional collateral or Blue funding. */
export function buildMidnightMakerPublication(action: MakerPublicationAction) {
  if (
    action.type === "midnightSupplyCollateralMakeBorrow" &&
    action.inputs.collateral != null
  ) {
    validateStoredCollateralOrder(
      action.inputs.collateral.market.collateralParams,
      "$.inputs.collateral.market.collateralParams",
    );
  }
  return encodeMidnightCancelAndMake(
    parseStoredMidnightMakerPublication(action),
  );
}

/**
 * @internal Checks stored publication shape and ABI bounds, not the authenticity of offer bytes.
 * Every maker publication type shares this recipe, so the action type is not bound to the payload.
 */
export function validateMidnightMakerPublicationPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  validateSignaturelessMidnightAction(action, path);
  const inputPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputPath);
  validatePlanFields(inputs, {
    path: inputPath,
    fields: {
      ratifier: "address",
      root: "bytes32",
      groups: "array",
      payload: "hex",
      cancellations: "array",
      deadline: "uint256 bigint",
    },
  });
  if (inputs.ratifierType !== "priceV1" && inputs.ratifierType !== "rateV1") {
    throw new InvalidTransactionPlanError({
      path: `${inputPath}.ratifierType`,
      reason: "expected priceV1 or rateV1",
    });
  }
  for (const [index, group] of (inputs.groups as unknown[]).entries()) {
    validatePlanField(group, {
      path: `${inputPath}.groups[${index}]`,
      type: "bytes32",
    });
  }
  for (const [index, value] of (inputs.cancellations as unknown[]).entries()) {
    const cancellationPath = `${inputPath}.cancellations[${index}]`;
    validatePlanFields(getPlanObject(value, cancellationPath), {
      path: cancellationPath,
      fields: { group: "bytes32", maxConsumed: "uint128 bigint" },
    });
  }
  const publication = action as MakerPublicationAction;
  // Validate only the persisted funding values that feed the parse constructor.
  if (publication.type === "midnightSupplyCollateralMakeBorrow") {
    validateStoredCollateralFunding(inputs, inputPath);
  }
  if (publication.type === "midnightSupplyBlueMakeLend") {
    validateStoredBlueFunding(inputs, inputPath);
  }
  try {
    // Reuse the action's clock-free parse checks; do not reconstruct the tree.
    parseStoredMidnightMakerPublication(publication);
  } catch (cause) {
    throw new InvalidTransactionPlanError({
      path: inputPath,
      reason: `expected a valid Midnight ${publicationKinds[publication.type]} publication`,
      cause,
    });
  }
}

function validateStoredNativeAssets(
  inputs: Record<string, unknown>,
  inputPath: string,
): void {
  if (inputs.nativeAssets !== undefined) {
    validatePlanField(inputs.nativeAssets, {
      path: `${inputPath}.nativeAssets`,
      type: "uint256 bigint",
    });
  }
}

function validateStoredBlueFunding(
  inputs: Record<string, unknown>,
  inputPath: string,
): void {
  validateStoredNativeAssets(inputs, inputPath);
  const path = `${inputPath}.blueSupply`;
  const supply = getPlanObject(inputs.blueSupply, path);
  validatePlanFields(supply, {
    path,
    fields: { assets: "uint128 bigint", callbackSalt: "bytes32" },
  });
  const marketPath = `${path}.market`;
  validatePlanFields(getPlanObject(supply.market, marketPath), {
    path: marketPath,
    fields: {
      loanToken: "address",
      collateralToken: "address",
      oracle: "address",
      irm: "address",
      lltv: "uint256 bigint",
    },
  });
}

function validateStoredCollateralFunding(
  inputs: Record<string, unknown>,
  inputPath: string,
): void {
  validateStoredNativeAssets(inputs, inputPath);
  const path = `${inputPath}.collateral`;
  const collateral = getPlanObject(inputs.collateral, path);
  const marketPath = `${path}.market`;
  // Validate the market tuple before checking the order of its indexed tokens.
  validateStoredMidnightMarket(collateral.market, {
    path: marketPath,
    chainId: inputs.chainId as number,
  });
  const { market } = collateral as CollateralFunding["collateral"];
  validateStoredCollateralOrder(
    market.collateralParams,
    `${marketPath}.collateralParams`,
  );
  if (!Array.isArray(collateral.supplies)) {
    throw new InvalidTransactionPlanError({
      path: `${path}.supplies`,
      reason: "expected an array",
    });
  }
  for (const [index, supply] of collateral.supplies.entries()) {
    const supplyPath = `${path}.supplies[${index}]`;
    validatePlanFields(getPlanObject(supply, supplyPath), {
      path: supplyPath,
      fields: { collateralIndex: "uint256 bigint", assets: "uint128 bigint" },
    });
  }
}
