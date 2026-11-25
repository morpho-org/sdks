import {
  type MarketId,
  type MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  parseBlueAllocations,
  parseBlueBundlesV1Common,
} from "../../actions/blue/common.js";
import { blueRefinance } from "../../actions/blue/refinance.js";
import {
  validateBlueRefinanceQuote,
  validateBlueRefinanceSource,
} from "../../actions/blue/refinanceValidation.js";
import { DEFAULT_LLTV_BUFFER } from "../../helpers/index.js";
import { parseBlueMarket } from "../../helpers/parse.js";
import type {
  AuthorizationRequirementSignature,
  BlueRefinanceAction,
  ReferenceTimestampParams,
  Transaction,
  VaultV2BlueReallocation,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
} from "../error.js";
import type { IntentParams } from "../intent.js";
import type { Action, SignatureRequest, TransactionPlan } from "../types.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "../validation.js";
import {
  type BlueMarketSnapshot,
  type BluePositionSnapshot,
  prepareBlue,
} from "./prepare.js";
import { validateBlueRefinanceDestination } from "./refinanceValidation.js";

type RefinanceAction = Extract<Action, { type: "blueRefinance" }>;

interface RefinanceMarket {
  readonly marketId: MarketId;
  readonly marketData: BlueMarketSnapshot;
  readonly positionData: BluePositionSnapshot;
}

/**
 * Intent and caller-fetched snapshots for a full Blue borrow-position migration.
 * @example
 * ```ts
 * import type { BlueRefinancePlanParams } from "@morpho-org/morpho-sdk";
 * const withSignature = (params: BlueRefinancePlanParams): BlueRefinancePlanParams => ({
 *   ...params,
 *   supportSignature: true,
 * });
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface BlueRefinancePlanParams
  extends Omit<IntentParams, "deployless">,
    ReferenceTimestampParams {
  /** Request a Morpho authorization signature instead of a direct transaction when needed. Defaults to `false`. */
  readonly supportSignature?: boolean;
  /** Source market and borrowing account's position. */
  readonly source: RefinanceMarket;
  /** Destination market and the same account's position, including an empty position. */
  readonly destination: RefinanceMarket;
  /** Optional ordered Vault V2 reallocations into the destination market. */
  readonly reallocations?: readonly VaultV2BlueReallocation[];
}

/**
 * Prepares a full Blue borrow-position migration. Fetch both market and position snapshots at the
 * same block and pass that block's timestamp as `now`. Penalties and fees increase destination debt;
 * the quote checks the buffered destination LLTV and the transaction enforces it again onchain.
 *
 * BlueBundlesV1 moves the full live debt and collateral without pulling tokens from the account.
 * When Morpho authorization is missing, the plan requests a signature inline if supported,
 * otherwise it puts a direct authorization step before the migration.
 * @param client - Viem client used to check deployed contracts and resolve Morpho authorization.
 * @param params - Chain, sending account, market and position snapshots, and optional reallocations.
 * @returns A frozen plan with only the steps and signature requests required for the migration.
 * @throws {BlueSnapshotChainMismatchError} when either snapshot comes from another chain.
 * @throws {MarketIdMismatchError} when a snapshot or embedded market tuple does not match its market ID.
 * @throws {AccrualPositionUserMismatchError} when a position belongs to another account.
 * @throws {RefinanceSameMarketError} when the source and destination are the same market.
 * @throws {RefinanceTokenMismatchError} when the markets have different loan or collateral tokens.
 * @throws {MissingMarketPriceError} when the destination price is unavailable.
 * @throws {UnsupportedBlueMarketIrmError} when debt projection requires an unsupported IRM.
 * @throws {BorrowExceedsSafeLtvError} when the resulting debt exceeds the buffered destination LLTV.
 * @throws {ZeroAccountError} when the sending account is the zero address.
 * @throws {NonIntegerInputError} when `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} when the source has no debt shares, or expiry or reallocation assets are not positive.
 * @throws {ExpiredDeadlineError} when expiry is at or before `now`.
 * @throws {NegativeInputError} when a referral fee or reallocation penalty is negative.
 * @throws {InputExceedsMaxError} when the fee or a reallocation value exceeds its bound.
 * @throws {ReferralFeePctExceededError} when `referralFee.bps` is 10,000.
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no nonzero recipient.
 * @throws {InvalidTransactionPlanError} when the account, referral fee recipient, market tuples, or stored reallocation fields are malformed.
 * @throws {InvalidCalldataOriginError} when calldata origin is not nonempty, whole-byte hex.
 * @throws {InvalidVaultV2BlueReallocationShapeError} when a reallocation is not a Vault V2 entry.
 * @throws {InvalidReallocationAddressError} when a vault or adapter address is invalid.
 * @throws {InvalidReallocationSourceTypeError} when a reallocation source is malformed.
 * @throws {InconsistentReallocationPenaltyError} when one vault uses different penalties.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a reallocation withdraws from the destination market.
 * @throws {ReallocationLoanTokenMismatchError} when a reallocation uses another loan token.
 * @throws {ChainIdMismatchError} when the client or RPC serves another chain.
 * @throws {UnsupportedChainIdError} when the chain is not in the address registry.
 * @throws {UnknownAddressError} when Morpho Blue or BlueBundlesV1 is not registered on the chain.
 * @throws {MissingContractCodeError} when either registered contract has no deployed code.
 * @throws {viem.BaseError} when a required RPC read fails.
 * @example
 * ```ts
 * import { getPendingSignatureRequests, prepareBlueRefinance, type BlueRefinancePlanParams } from "@morpho-org/morpho-sdk";
 * import type { Client } from "viem";
 * async function prepare(client: Client, snapshots: BlueRefinancePlanParams) {
 *   const plan = await prepareBlueRefinance(client, { ...snapshots, supportSignature: true });
 *   return { plan, requests: getPendingSignatureRequests(plan) };
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareBlueRefinance(
  client: Client,
  params: BlueRefinancePlanParams,
): Promise<TransactionPlan> {
  const { account, chainId, source, destination } = params;
  const now = params.now ?? Time.timestamp();
  const sourceMarketParams = structuredClone(source.marketData.market.params);
  const destinationMarketParams = structuredClone(
    destination.marketData.market.params,
  );
  const reallocations = structuredClone(params.reallocations ?? []);
  const id = "blueRefinance";
  const { intent, steps, signatureRequests, morphoAuthorizationRequestId } =
    await prepareBlue(
      {
        client,
        params: {
          ...params,
          marketId: source.marketId,
          marketData: source.marketData,
          positionData: source.positionData,
          now,
        },
      },
      ({ deadline, referralFeePct, referralFeeRecipient }) => {
        // Reject malformed market tuples before quoting or resolving authorization.
        validatePlanMarketParams(
          sourceMarketParams,
          "$.source.marketData.market.params",
        );
        validatePlanMarketParams(
          destinationMarketParams,
          "$.destination.marketData.market.params",
        );
        // Validate destination identity and fee before using them to quote migration health.
        validateBlueRefinanceDestination({
          chainId,
          account,
          marketId: destination.marketId,
          marketData: destination.marketData,
          positionData: destination.positionData,
        });
        if (referralFeeRecipient !== undefined) {
          validatePlanField(referralFeeRecipient, {
            path: "$.referralFee.recipient",
            type: "address",
          });
        }
        parseBlueBundlesV1Common({
          chainId,
          userAddress: account,
          deadline,
          referralFeePct,
          referralFeeRecipient,
        });
        // Check that the source debt can move into this destination market.
        validateBlueRefinanceSource({
          sourceMarketParams,
          destinationMarketParams,
          borrowShares: source.positionData.position.borrowShares,
        });
        // The quote only gates preparation; the contract migrates the actual live position.
        const { penaltyAssets } = parseBlueAllocations(
          reallocations,
          parseBlueMarket(destinationMarketParams),
        );
        for (const [index, reallocation] of reallocations.entries()) {
          validatePlanReallocationShape(
            reallocation,
            `$.reallocations[${index}]`,
          );
        }
        validateBlueRefinanceQuote({
          destinationMarketParams,
          sourcePosition: source.positionData.position,
          destinationPosition: destination.positionData.position,
          penaltyAssets,
          referralFeePct,
          now,
        });
        return { id, needsAuthorization: true };
      },
    );

  const request = signatureRequests.find(
    (candidate) =>
      candidate.kind === "morphoAuthorization" &&
      candidate.id === morphoAuthorizationRequestId,
  );
  const common = parseBlueBundlesV1Common({
    chainId,
    userAddress: account,
    ...intent,
  });
  const action: RefinanceAction = {
    type: "blueRefinance",
    inputs: {
      chainId,
      account,
      sourceMarketParams,
      destinationMarketParams,
      maxLtv: MathLib.zeroFloorSub(
        destinationMarketParams.lltv,
        DEFAULT_LLTV_BUFFER,
      ),
      ...common,
      reallocations,
      ...(request && { authorizationNonce: request.args.nonce }),
    },
    signatureRequestIds:
      request === undefined ? {} : { morphoAuthorization: request.id },
  };
  return deepFreeze(
    structuredClone({
      version: 2,
      account,
      chainId,
      expiresAt: intent.expiresAt,
      ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
      steps: [
        ...steps,
        { id, label: "Refinance Blue borrow position", action },
      ],
      signatureRequests,
    } satisfies TransactionPlan),
  );
}

function validatePlanMarketParams(value: unknown, path: string): void {
  const params = getPlanObject(value, path);
  validatePlanFields(params, {
    path,
    fields: {
      loanToken: "address",
      collateralToken: "address",
      oracle: "address",
      irm: "address",
      lltv: "uint256 bigint",
      id: "hex",
      liquidationIncentiveFactor: "uint256 bigint",
    } satisfies Record<
      keyof MarketParams,
      Parameters<typeof validatePlanField>[1]["type"]
    >,
  });
  if (typeof params.id !== "string" || params.id.length !== 66) {
    throw new InvalidTransactionPlanError({
      path: `${path}.id`,
      reason: "expected a 32-byte market ID",
    });
  }
}

function validatePlanReallocations(
  legs: readonly unknown[],
  path: string,
): void {
  for (const [index, leg] of legs.entries()) {
    const legPath = `${path}[${index}]`;
    validatePlanReallocationShape(leg, legPath);
    validatePlanFields(getPlanObject(leg, legPath), {
      path: legPath,
      fields: { assets: "uint256 bigint", penalty: "uint256 bigint" },
    });
  }
}

function validatePlanReallocationShape(value: unknown, path: string): void {
  const leg = getPlanObject(value, path);
  validatePlanFields(leg, {
    path,
    fields: {
      vault: "address",
      assets: "bigint",
      penalty: "bigint",
    },
  });
  validatePlanField(getPlanObject(leg.to, `${path}.to`).adapter, {
    path: `${path}.to.adapter`,
    type: "address",
  });
  const from = getPlanObject(leg.from, `${path}.from`);
  if (from.type === "idle") {
    return;
  }
  if (from.type !== "market") {
    throw new InvalidTransactionPlanError({
      path: `${path}.from.type`,
      reason: "expected idle or market",
    });
  }
  validatePlanField(from.adapter, {
    path: `${path}.from.adapter`,
    type: "address",
  });
  validatePlanMarketParams(from.marketParams, `${path}.from.marketParams`);
}

/** @internal Validates the stored migration inputs and optional authorization binding. */
export function validateRefinancePlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      maxLtv: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
      reallocations: "array",
    },
  });
  validatePlanMarketParams(
    inputs.sourceMarketParams,
    `${path}.inputs.sourceMarketParams`,
  );
  validatePlanMarketParams(
    inputs.destinationMarketParams,
    `${path}.inputs.destinationMarketParams`,
  );
  validatePlanReallocations(
    inputs.reallocations as unknown[],
    `${path}.inputs.reallocations`,
  );

  const ids = getPlanObject(
    action.signatureRequestIds,
    `${path}.signatureRequestIds`,
  );
  if (Object.keys(ids).some((role) => role !== "morphoAuthorization")) {
    throw new InvalidTransactionPlanError({
      path: `${path}.signatureRequestIds`,
      reason: "expected only a Morpho authorization role",
    });
  }
  if (ids.morphoAuthorization !== undefined) {
    validatePlanField(inputs.authorizationNonce, {
      path: `${path}.inputs.authorizationNonce`,
      type: "uint256 bigint",
    });
  } else if (inputs.authorizationNonce !== undefined) {
    throw new InvalidTransactionPlanError({
      path: `${path}.inputs.authorizationNonce`,
      reason: "expected a referenced authorization request",
    });
  }
}

/** @internal Encodes the stored migration with the referenced signature inline, if required. */
export function buildBlueRefinance(
  action: RefinanceAction,
  requests: readonly SignatureRequest[],
): Readonly<Transaction<BlueRefinanceAction>> {
  const {
    account,
    chainId,
    sourceMarketParams,
    destinationMarketParams,
    ...args
  } = action.inputs;
  const id = action.signatureRequestIds.morphoAuthorization;
  let authorizationSignature: AuthorizationRequirementSignature | undefined;
  if (id !== undefined) {
    const request = requests.find((candidate) => candidate.id === id);
    if (
      request?.kind !== "morphoAuthorization" ||
      request.signature === undefined
    ) {
      throw new IncompleteTransactionPlanError(id);
    }
    const { authorized, deadline } = request.args;
    authorizationSignature = {
      args: {
        ...request.args,
        isAuthorized: true,
        signature: request.signature,
      },
      action: {
        type: "authorization",
        args: { authorized, isAuthorized: true, deadline },
      },
    };
  }
  return blueRefinance({
    market: { chainId, sourceMarketParams, destinationMarketParams },
    args: { ...args, userAddress: account, authorizationSignature },
  });
}
