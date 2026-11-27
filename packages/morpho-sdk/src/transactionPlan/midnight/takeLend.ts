import type { Market } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import {
  type MidnightTakeLendParams,
  midnightTakeLend,
  parseMidnightTakeLend,
} from "../../actions/midnight/takeLend.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS } from "../../helpers/constant.js";
import { validateReferenceTime } from "../../helpers/validate.js";
import { validateMidnightTakeableOfferFields } from "../../helpers/validateMidnightTakeableOfferFields.js";
import { validateMidnightTakeFeasibility } from "../../helpers/validateMidnightTakeFeasibility.js";
import {
  InvalidBigIntInputError,
  MidnightTakeDeadlineTooFarError,
} from "../../types/error.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getTokenRequirements } from "../requirements.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import {
  prepareMidnightBundleAuthorization,
  validateSignaturelessMidnightAction,
} from "./authorization.js";
import { storedFills, storedMarketTuple } from "./market.js";
import {
  validateMidnightTargetAmountTypes,
  validateStoredMidnightFills,
  validateStoredMidnightMarket,
} from "./validation.js";

/**
 * Inputs for preparing a fixed-rate lend from caller-selected borrow offers.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightTakeLendPlanParams
  extends Omit<IntentParams, "supportSignature" | "deployless">,
    Pick<
      MidnightTakeLendParams,
      "target" | "takeableOffers" | "nativeAmount" | "maxContinuousFee"
    > {
  /** Hydrated market snapshot used for validation and fill feasibility. */
  readonly marketData: Market;
  /** Reference timestamp in seconds; defaults to the device clock. */
  readonly now?: bigint;
  /** Unix seconds; defaults to one hour after the reference timestamp. */
  readonly expiresAt?: number;
}

/**
 * Prepares an ordered plan to lend through MidnightBundlesV2. Validates inputs with the same
 * parse-once constructor and fill feasibility check as the entity `takeLend`, then reads the
 * registry targets' bytecode, allowance, and authorization. It does not read live fill availability.
 * On an assets target, an offer is dropped from the stored fills only when its price would revert
 * the bundle at every time up to the deadline; one that is invalid for part of that window stays, so
 * simulate before sending.
 * Even with native input, the bundle needs allowance for the full loan-token pull.
 * @param client - Viem client connected to the intent chain for prerequisite reads.
 * @param params - Sender, market snapshot, ABI-ready fills, target bounds, funding and expiry.
 * @param params.now - Optional reference timestamp in Unix seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @returns A frozen plan with any approval and authorization steps before the lend.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, `maxContinuousFee` or a target amount
 *   is not a bigint.
 * @throws {ZeroAccountError} If `account` is the zero address.
 * @throws {NonIntegerInputError} If `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} If `expiresAt`, the target amount, `minUnits` or
 *   `maxBuyerAssets` is not positive.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference timestamp.
 * @throws {NegativeInputError} If `referralFee.bps`, an offer cap, `maxContinuousFee` or
 *   `nativeAmount` is negative.
 * @throws {InputExceedsMaxError} If `referralFee.bps` exceeds 1,000 (10%), a target amount or offer
 *   cap exceeds uint128, `maxContinuousFee` exceeds uint256, or `nativeAmount` exceeds the pull.
 * @throws {InvalidCalldataOriginError} If `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {MidnightTakeDeadlineTooFarError} If expiry is more than one hour away.
 * @throws {InvalidTransactionPlanError} If `account` is malformed or the target type is neither assets nor units.
 * @throws {ChainIdMismatchError} If the client, transport or market is on a different chain.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If the chain has no `midnightBundlesV2` deployment.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} If no offers are supplied.
 * @throws {MidnightOfferSideMismatchError} If an offer is not borrow-side.
 * @throws {MidnightTakeableOfferMarketMismatchError} If an offer trades a different market.
 * @throws {MidnightTakeableOfferZeroSellerReceiverError} If an offer routes seller proceeds to the zero address.
 * @throws {UnboundedMidnightTakeInputError} If `target.units` or `target.maxBuyerAssets` is `maxUint256`.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no recipient.
 * @throws {MidnightContractReceiverError} If the referral fee recipient is a Midnight protocol or market token contract.
 * @throws {InvalidMidnightNativeAmountTypeError} If `nativeAmount` is not a bigint.
 * @throws {MidnightCalldataEncodingError} If an offer field, including a `maxUnits` or
 *   `maxAssets` cap that is not a bigint, cannot be ABI-encoded.
 * @throws {ChainWNativeMissingError} If wNative is not configured for the chain.
 * @throws {NativeAmountOnNonWNativeAssetError} If positive native input is used with another loan token.
 * @throws {MidnightContinuousFeeAboveMaxError} If `maxContinuousFee` is below the market's continuous fee.
 * @throws {MidnightTakeableOffersNotFillableError} If every offer is expired, not yet started,
 *   self-made, capped below the market fee or otherwise dead.
 * @throws {MidnightTakeTargetUnreachableError} If the live offers cannot meet the target and its bounds.
 * @throws {MissingContractCodeError} If either registered Midnight target has no deployed code.
 * @throws {viem.BaseError} If an `eth_chainId` request or prerequisite read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightTakeLend } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightMarket } from "@morpho-org/morpho-sdk/fetch";
 * import { MidnightApi } from "@morpho-org/morpho-sdk/midnight-api";
 * import { type Address, createPublicClient, type Hex, http, maxUint256 } from "viem";
 * import { base } from "viem/chains";
 *
 * export async function takeLendTransactions(marketId: Hex, account: Address) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const marketData = await fetchMidnightMarket(client, { marketId });
 *   const quote = await new MidnightApi().fetchBookQuote({
 *     marketId, side: "asks", units: 1_000_000n, taker: account,
 *   });
 *   const plan = await prepareMidnightTakeLend(client, {
 *     chainId: base.id, account, marketData, takeableOffers: quote.data.takeableOffers,
 *     target: { type: "units", units: 1_000_000n, maxBuyerAssets: 990_000n },
 *     maxContinuousFee: maxUint256,
 *   });
 *   // Simulate, then send in order from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightTakeLend(
  client: Client,
  params: MidnightTakeLendPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, marketData, target, nativeAmount } = params;
  const now = params.now ?? Time.timestamp();
  // Reject a non-bigint clock before the deadline window sum can mix types.
  validateReferenceTime(now);
  const maxDeadline = now + MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS;
  const intent = resolveIntent(
    { ...params, expiresAt: params.expiresAt ?? Number(maxDeadline) },
    now,
  );
  if (intent.deadline > maxDeadline) {
    throw new MidnightTakeDeadlineTooFarError({
      deadline: intent.deadline,
      maxDeadline,
    });
  }
  if (target.type !== "assets" && target.type !== "units") {
    throw invalidTargetType("$.target");
  }
  if (typeof params.maxContinuousFee !== "bigint") {
    throw new InvalidBigIntInputError(
      "maxContinuousFee",
      params.maxContinuousFee,
    );
  }
  validateMidnightTargetAmountTypes(
    target,
    target.type === "assets"
      ? ["assets", "minUnits"]
      : ["units", "maxBuyerAssets"],
  );

  const parsed = parseMidnightTakeLend({
    chainId,
    market: marketData.params,
    target,
    takeableOffers: params.takeableOffers,
    maxContinuousFee: params.maxContinuousFee,
    nativeAmount,
    deadline: intent.deadline,
    referralFeePct: intent.referralFeePct,
    referralFeeRecipient: intent.referralFeeRecipient,
  });
  validateMidnightTakeableOfferFields(parsed.takeableOffers);
  const bundle = getChainAddress(chainId, "midnightBundlesV2");
  const takeableOffers = validateMidnightTakeFeasibility({
    side: "buy",
    takeableOffers: parsed.takeableOffers,
    accountAddress: account,
    marketData,
    now,
    deadline: parsed.deadline,
    referralFeePct: parsed.referralFeePct,
    fallbackUnits: 0n,
    target: parsed.target,
    maxContinuousFee: parsed.maxContinuousFee,
  });

  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // Check deployments before allowance or authorization reads can fail decoding empty data.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [
      { role: "midnightBundlesV2", address: bundle },
      { role: "midnight", address: getChainAddress(chainId, "midnight") },
    ],
    chainCheck,
  );
  const [{ approvals }, authorization] = await Promise.all([
    getTokenRequirements(client, {
      chainId,
      token: parsed.market.loanToken,
      owner: account,
      spender: bundle,
      amount:
        parsed.target.type === "assets"
          ? parsed.target.assets
          : parsed.target.maxBuyerAssets,
      approvalId: (index) => `midnightTakeLend:approval:${index}`,
    }),
    prepareMidnightBundleAuthorization(client, { chainId, account }),
  ]);

  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      ...approvals,
      ...(authorization === undefined ? [] : [authorization]),
      {
        id: "midnightTakeLend",
        label: "Lend on Midnight",
        action: {
          type: "midnightTakeLend",
          inputs: {
            chainId,
            account,
            market: parsed.market,
            target: parsed.target,
            takeableOffers,
            maxContinuousFee: parsed.maxContinuousFee,
            ...(nativeAmount !== undefined && { nativeAssets: nativeAmount }),
            deadline: parsed.deadline,
            referralFeePct: parsed.referralFeePct,
            referralFeeRecipient: parsed.referralFeeRecipient,
          },
        },
      },
    ],
    signatureRequests: [],
  });
}

type TakeLendAction = Extract<Action, { type: "midnightTakeLend" }>;

function invalidTargetType(targetPath: string) {
  return new InvalidTransactionPlanError({
    path: `${targetPath}.type`,
    reason: "expected assets or units",
  });
}

/** @internal Encodes the prepared lend from persisted inputs without state reads. */
export function buildMidnightTakeLend({
  inputs: {
    chainId,
    market,
    target,
    takeableOffers,
    maxContinuousFee,
    deadline,
    referralFeePct,
    referralFeeRecipient,
    nativeAssets,
  },
}: TakeLendAction) {
  if (target.type !== "assets" && target.type !== "units") {
    throw invalidTargetType("$.inputs.target");
  }
  return midnightTakeLend({
    chainId,
    market: storedMarketTuple(market),
    target,
    takeableOffers: storedFills(takeableOffers),
    maxContinuousFee,
    deadline,
    referralFeePct,
    referralFeeRecipient,
    nativeAmount: nativeAssets,
  });
}

/** @internal Validates the restored recipe shape without encoding or fetching offers. */
export function validateMidnightTakeLendPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validatePlanFields(inputs, {
    path: inputsPath,
    fields: {
      maxContinuousFee: "uint256 bigint",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
      ...(inputs.nativeAssets !== undefined && {
        nativeAssets: "uint256 bigint",
      }),
    },
  });
  const targetPath = `${inputsPath}.target`;
  const target = getPlanObject(inputs.target, targetPath);
  switch (target.type) {
    case "assets":
      validatePlanFields(target, {
        path: targetPath,
        fields: { assets: "uint256 bigint", minUnits: "uint256 bigint" },
      });
      break;
    case "units":
      validatePlanFields(target, {
        path: targetPath,
        fields: { units: "uint256 bigint", maxBuyerAssets: "uint256 bigint" },
      });
      break;
    default:
      throw invalidTargetType(targetPath);
  }
  // Validate nested market and quote fields without a chain registry or RPC.
  const chainId = inputs.chainId as number; // Checked by the parse dispatcher.
  validateStoredMidnightMarket(inputs.market, {
    path: `${inputsPath}.market`,
    chainId,
  });
  validateStoredMidnightFills(inputs.takeableOffers, {
    path: `${inputsPath}.takeableOffers`,
    chainId,
  });
  // Midnight never consumes a signature reference.
  validateSignaturelessMidnightAction(action, path);
}
