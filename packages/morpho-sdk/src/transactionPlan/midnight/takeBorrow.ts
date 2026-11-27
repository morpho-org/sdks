import { MathLib } from "@morpho-org/blue-sdk";
import { AccrualPosition, type Market } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import {
  type MidnightSupplyCollateralTakeBorrowParams,
  midnightSupplyCollateralTakeBorrow,
  parseMidnightSupplyCollateralTakeBorrow,
} from "../../actions/midnight/supplyCollateralTakeBorrow.js";
import {
  type MidnightTakeBorrowParams,
  midnightTakeBorrow,
  parseMidnightTakeBorrow,
} from "../../actions/midnight/takeBorrow.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { parseMidnightApprovalRequirements } from "../../actions/requirements/midnight/getMidnightApprovalRequirements.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS } from "../../helpers/constant.js";
import { validateMidnightPositionBinding } from "../../helpers/parseMidnight.js";
import {
  validateMidnightBorrowHealth,
  validateReferenceTime,
} from "../../helpers/validate.js";
import { validateMidnightTakeableOfferFields } from "../../helpers/validateMidnightTakeableOfferFields.js";
import { validateMidnightTakeFeasibility } from "../../helpers/validateMidnightTakeFeasibility.js";
import { MidnightTakeDeadlineTooFarError } from "../../types/error.js";
import { InvalidTransactionPlanError } from "../error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import { getTokenRequirements } from "../requirements.js";
import type { Action, TransactionPlan } from "../types.js";
import { getPlanObject, validatePlanFields } from "../validation.js";
import { prepareMidnightBundleAuthorization } from "./authorization.js";
import {
  storedFills,
  storedMarketTuple,
  validateCollateralIndexTypes,
  validateStoredCollateralOrder,
} from "./market.js";
import {
  invalidSellTargetType,
  validateMidnightSellPlanAction,
  validateMidnightTargetAmountTypes,
} from "./validation.js";

/**
 * Inputs for preparing a fixed-rate borrow from caller-selected lend offers.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightTakeBorrowPlanParams
  extends Omit<IntentParams, "supportSignature" | "deployless">,
    Pick<MidnightTakeBorrowParams, "target" | "takeableOffers"> {
  /** Hydrated market snapshot used to assess fill feasibility and collateral capacity. */
  readonly marketData: Market;
  /** Borrower's position snapshot for the same market. */
  readonly positionData: AccrualPosition;
  /** Oracle prices indexed by market collateral, scaled by ORACLE_PRICE_SCALE. */
  readonly collateralPrices: readonly bigint[];
  /** Recipient of the loan assets; defaults to account. */
  readonly receiver?: Address;
  /** Reference timestamp in seconds; defaults to the device clock. */
  readonly now?: bigint;
  /** Unix seconds; defaults to one hour after the reference timestamp. */
  readonly expiresAt?: number;
}

/**
 * Prepares a MidnightBundlesV2 borrow for the submitting account, using existing
 * credit first and then filling lend offers under the given target and referral fee.
 * Validates inputs with the same parse-once constructor, position binding, buffered health
 * check and fill feasibility check as the entity `takeBorrow`, then reads the registry
 * targets' bytecode and the bundle authorization. Feasibility uses the position's credit
 * accrued to the reference timestamp against `marketData`, the same snapshot that caps
 * withdrawable credit. On an assets target, offers that would revert the
 * whole bundle are dropped from the stored fills. Like the entity check, fill feasibility counts
 * units at par and does not price discounted bids after settlement fees, so a plan can pass
 * preparation and still revert onchain; the onchain bounds keep funds safe. Simulate before sending.
 * @param client - Viem client used to verify chain, deployments and authorization.
 * @param params - Account, market and position snapshots, collateral prices, fills and intent.
 * @param params.chainId - Chain containing the market and MidnightBundlesV2.
 * @param params.account - Non-zero borrower that sends the plan and owns any new debt.
 * @param params.marketData - Hydrated market snapshot used for fill feasibility and collateral capacity.
 * @param params.positionData - Borrower's position snapshot for the same market.
 * @param params.collateralPrices - Oracle prices indexed by market collateral, scaled by `ORACLE_PRICE_SCALE`.
 * @param params.takeableOffers - ABI-ready lend offers from the caller's quote, in fill order.
 * @param params.target.type - `"assets"` to receive loan assets, or `"units"` to sell exact units.
 * @param params.target.assets - Exact loan assets paid to the receiver on an assets target; any referral fee is sold on top.
 * @param params.target.maxUnits - Unit cap on an assets target; also bounds the buffered health check.
 * @param params.target.units - Exact units to sell on a units target.
 * @param params.target.minSellerAssets - Loan-asset floor on a units target, checked against the
 *   proceeds after any referral fee.
 * @param params.receiver - Optional recipient of the loan assets; defaults to `account`.
 * @param params.referralFee.bps - Optional referral fee in integer basis points, at most 10%.
 * @param params.referralFee.recipient - Recipient required for a positive referral fee.
 * @param params.now - Reference Unix timestamp in seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Onchain deadline in Unix seconds; defaults to, and may not exceed, one hour after `now`.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan with a standalone authorization step if needed and no signature requests.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, or a target amount, is not a bigint;
 *   checked before any request.
 * @throws {ZeroAccountError} If `account` is the zero address.
 * @throws {NonIntegerInputError} If `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} If `expiresAt`, the target amount, `maxUnits` or
 *   `minSellerAssets` is not positive.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference timestamp.
 * @throws {NegativeInputError} If `referralFee.bps` or an offer cap is negative.
 * @throws {InputExceedsMaxError} If `referralFee.bps` exceeds 1,000 (10%), or a target amount or
 *   offer cap exceeds uint128.
 * @throws {InvalidCalldataOriginError} If `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {MidnightTakeDeadlineTooFarError} If expiry is more than one hour away.
 * @throws {InvalidTransactionPlanError} If `account` is malformed or the target type is neither assets nor units.
 * @throws {ChainIdMismatchError} If the client, transport or market is on a different chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {EmptyMidnightTakeableOffersError} If no offers are supplied.
 * @throws {MidnightOfferSideMismatchError} If an offer is not a lend offer.
 * @throws {MidnightTakeableOfferMarketMismatchError} If an offer trades another market.
 * @throws {MidnightCalldataEncodingError} If an offer field cannot be ABI-encoded.
 * @throws {MidnightZeroReceiverError} If the receiver is the zero address.
 * @throws {MidnightContractReceiverError} If the receiver, or the referral fee recipient of a
 *   positive fee, is a Midnight protocol or market token contract.
 * @throws {UnboundedMidnightTakeInputError} If `target.units` or `target.maxUnits` is `maxUint256`.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no recipient.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If the chain has no `midnightBundlesV2` deployment.
 * @throws {MarketIdMismatchError} If the position belongs to another market.
 * @throws {AccrualPositionUserMismatchError} If the position is not owned by the account.
 * @throws {BorrowExceedsSafeLtvError} If the debt bound exceeds buffered collateral capacity.
 * @throws {MissingMarketPriceError} If any held collateral has no supplied price.
 * @throws {InvalidMidnightPositionLossFactorError} If `marketData`'s loss factor is below the position's
 *   last loss factor; fetch the market and position at the same block.
 * @throws {InvalidMidnightPositionAccrualStateError} If the position's credit and fee snapshot cannot be accrued.
 * @throws {MidnightTakeableOffersNotFillableError} If the supplied offers cannot be used.
 * @throws {MidnightTakeTargetUnreachableError} If the supplied target and bounds cannot be met.
 * @throws {MissingContractCodeError} If either registered Midnight target has no deployed code.
 * @throws {viem.BaseError} If an `eth_chainId` request or the authorization read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightTakeBorrow, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { MidnightApi } from "@morpho-org/morpho-sdk/midnight-api";
 * import { type Address, type Hash, createPublicClient, http, parseAbi } from "viem";
 * import { base } from "viem/chains";
 *
 * async function prepareBorrow(account: Address, marketId: Hash) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const block = await client.getBlock();
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId,
 *     user: account,
 *     blockNumber: block.number,
 *   });
 *   const marketData = positionData.market;
 *   const collateralPrices = await Promise.all(
 *     marketData.params.collateralParams.map(({ oracle }) =>
 *       client.readContract({
 *         address: oracle,
 *         abi: parseAbi(["function price() view returns (uint256)"]),
 *         functionName: "price",
 *         blockNumber: block.number,
 *       }),
 *     ),
 *   );
 *   const assets = 1_000_000n;
 *   const maxUnits = 1_100_000n;
 *   // Quote the unit ceiling: fees come out of the proceeds, so fills sized to the net
 *   // assets could not deliver them.
 *   const quote = await new MidnightApi().fetchBookQuote({
 *     marketId,
 *     side: "bids",
 *     units: maxUnits,
 *     taker: account,
 *   });
 *   const plan: TransactionPlan = await prepareMidnightTakeBorrow(client, {
 *     chainId: base.id,
 *     account,
 *     marketData,
 *     positionData,
 *     collateralPrices,
 *     now: block.timestamp,
 *     target: { type: "assets", assets, maxUnits },
 *     takeableOffers: quote.data.takeableOffers,
 *   });
 *   // Simulate, then send in order from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightTakeBorrow(
  client: Client,
  params: MidnightTakeBorrowPlanParams,
): Promise<TransactionPlan> {
  return prepareBorrow(client, { params });
}

/**
 * Inputs for supplying collateral and taking lend offers in one Midnight transaction.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightSupplyCollateralTakeBorrowPlanParams
  extends MidnightTakeBorrowPlanParams,
    Pick<
      MidnightSupplyCollateralTakeBorrowParams,
      "collateralSupplies" | "nativeAmount"
    > {}

/**
 * Prepares an atomic collateral supply and fixed-rate borrow on MidnightBundlesV2.
 * Validates inputs with the same parse-once constructor, position binding, buffered health
 * check and fill feasibility check as the entity `supplyCollateralTakeBorrow`. Pass the
 * position before the supply: the health check adds the supplied collateral to it, and
 * repeated collateral indexes are summed. Native ETH may fund wrapped-native collateral, but
 * the ERC-20 allowance must cover the full pull. Approvals and authorization are separate
 * steps, so they can remain even if the bundled transaction fails.
 * @param client - Viem client used to verify chain, deployments, allowances and authorization.
 * @param params - Account, market and pre-supply position snapshots, collateral prices,
 *   collateral supplies, optional native funding, fills and intent.
 * @param params.chainId - Chain containing the market and MidnightBundlesV2.
 * @param params.account - Non-zero borrower that supplies the collateral, sends the plan and owns any new debt.
 * @param params.marketData - Hydrated market snapshot used for fill feasibility and collateral capacity.
 * @param params.positionData - Borrower's position snapshot for the same market, taken before the supply.
 * @param params.collateralPrices - Oracle prices indexed by market collateral, scaled by `ORACLE_PRICE_SCALE`.
 * @param params.collateralSupplies - Positive collateral supplies; each `collateralIndex` indexes
 *   `marketData.params.collateralParams`, `assets` is in that token's base units, and repeated indexes are summed.
 * @param params.nativeAmount - Optional native ETH in wei for wrapped-native collateral, capped by its pull.
 * @param params.takeableOffers - ABI-ready lend offers from the caller's quote, in fill order.
 * @param params.target.type - `"assets"` to receive loan assets, or `"units"` to sell exact units.
 * @param params.target.assets - Exact loan assets paid to the receiver on an assets target; any referral fee is sold on top.
 * @param params.target.maxUnits - Unit cap on an assets target; also bounds the buffered health check.
 * @param params.target.units - Exact units to sell on a units target.
 * @param params.target.minSellerAssets - Loan-asset floor on a units target, checked against the
 *   proceeds after any referral fee.
 * @param params.receiver - Optional recipient of the loan assets; defaults to `account`.
 * @param params.referralFee.bps - Optional referral fee in integer basis points, at most 10%.
 * @param params.referralFee.recipient - Recipient required for a positive referral fee.
 * @param params.now - Reference Unix timestamp in seconds; defaults to the device clock.
 * @param params.expiresAt - Onchain deadline in Unix seconds; defaults to, and may not exceed, one hour after `now`.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan with any necessary approvals and authorization, without signature requests.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, a target amount or a collateral index
 *   is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If `account` is the zero address.
 * @throws {NonIntegerInputError} If `expiresAt` or `referralFee.bps` is not a safe integer.
 * @throws {NonPositiveInputError} If `expiresAt`, a supply amount, the target amount,
 *   `maxUnits` or `minSellerAssets` is not positive.
 * @throws {ExpiredDeadlineError} If expiry is at or before the reference timestamp.
 * @throws {NegativeInputError} If `referralFee.bps`, an offer cap or `nativeAmount` is negative.
 * @throws {InputExceedsMaxError} If `referralFee.bps` exceeds 1,000 (10%), a supply amount, per-index
 *   sum, target amount or offer cap exceeds uint128, or `nativeAmount` exceeds the wrapped-native pull.
 * @throws {InvalidCalldataOriginError} If `calldataOrigin` is empty, malformed or has an odd number of hex digits.
 * @throws {MidnightTakeDeadlineTooFarError} If expiry is more than one hour away.
 * @throws {InvalidTransactionPlanError} If `account` is malformed, `collateralSupplies` is not an
 *   array of objects, or the target type is neither assets nor units.
 * @throws {ChainIdMismatchError} If the client, transport or market is on a different chain.
 * @throws {MidnightMarketAddressMismatchError} If the market targets another Midnight deployment.
 * @throws {EmptyMidnightCollateralSuppliesError} If no collateral is supplied.
 * @throws {UnknownCollateralIndexError} If a supply names an unconfigured collateral index.
 * @throws {EmptyMidnightTakeableOffersError} If no offers are supplied.
 * @throws {MidnightOfferSideMismatchError} If an offer is not a lend offer.
 * @throws {MidnightTakeableOfferMarketMismatchError} If an offer trades another market.
 * @throws {MidnightCalldataEncodingError} If an offer field cannot be ABI-encoded.
 * @throws {MidnightZeroReceiverError} If the receiver is the zero address.
 * @throws {MidnightContractReceiverError} If the receiver, or the referral fee recipient of a
 *   positive fee, is a Midnight protocol or market token contract.
 * @throws {UnboundedMidnightTakeInputError} If `target.units` or `target.maxUnits` is `maxUint256`.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no recipient.
 * @throws {MidnightTakeTargetUnreachableError} If the supplied target and bounds cannot be met.
 * @throws {InvalidMidnightNativeAmountTypeError} If `nativeAmount` is not a bigint.
 * @throws {ChainWNativeMissingError} If native funding is used on a chain without wrapped native.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding is used without a wrapped-native supply.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If the chain has no `midnightBundlesV2` deployment.
 * @throws {MarketIdMismatchError} If the position belongs to another market.
 * @throws {AccrualPositionUserMismatchError} If the position is not owned by the account.
 * @throws {BorrowExceedsSafeLtvError} If the debt bound exceeds the post-supply buffered capacity.
 * @throws {MissingMarketPriceError} If any held collateral has no supplied price.
 * @throws {InvalidMidnightPositionLossFactorError} If `marketData`'s loss factor is below the position's
 *   last loss factor; fetch the market and position at the same block.
 * @throws {InvalidMidnightPositionAccrualStateError} If the position's credit and fee snapshot cannot be accrued.
 * @throws {MidnightTakeableOffersNotFillableError} If the supplied offers cannot be used.
 * @throws {MissingContractCodeError} If either registered Midnight target has no deployed code.
 * @throws {viem.BaseError} If an `eth_chainId` request, an allowance read or the authorization read fails.
 * @example
 * ```ts
 * import {
 *   buildTransactions,
 *   prepareMidnightSupplyCollateralTakeBorrow,
 *   type TransactionPlan,
 * } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { MidnightApi } from "@morpho-org/morpho-sdk/midnight-api";
 * import { type Address, type Hash, createPublicClient, http, parseAbi } from "viem";
 * import { base } from "viem/chains";
 *
 * async function prepareSupplyAndBorrow(account: Address, marketId: Hash, collateralAssets: bigint) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const block = await client.getBlock();
 *   // Read the position before the supply; the health check adds the supplied collateral.
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId,
 *     user: account,
 *     blockNumber: block.number,
 *   });
 *   const marketData = positionData.market;
 *   const collateralPrices = await Promise.all(
 *     marketData.params.collateralParams.map(({ oracle }) =>
 *       client.readContract({
 *         address: oracle,
 *         abi: parseAbi(["function price() view returns (uint256)"]),
 *         functionName: "price",
 *         blockNumber: block.number,
 *       }),
 *     ),
 *   );
 *   const assets = 1_000_000n;
 *   const maxUnits = 1_100_000n;
 *   // Quote the unit ceiling: fees come out of the proceeds.
 *   const quote = await new MidnightApi().fetchBookQuote({
 *     marketId,
 *     side: "bids",
 *     units: maxUnits,
 *     taker: account,
 *   });
 *   const plan: TransactionPlan = await prepareMidnightSupplyCollateralTakeBorrow(client, {
 *     chainId: base.id,
 *     account,
 *     marketData,
 *     positionData,
 *     collateralPrices,
 *     now: block.timestamp,
 *     collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
 *     target: { type: "assets", assets, maxUnits },
 *     takeableOffers: quote.data.takeableOffers,
 *   });
 *   // Simulate, then send in order from plan.account on plan.chainId.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightSupplyCollateralTakeBorrow(
  client: Client,
  params: MidnightSupplyCollateralTakeBorrowPlanParams,
): Promise<TransactionPlan> {
  return prepareBorrow(client, {
    params,
    supply: {
      collateralSupplies: params.collateralSupplies,
      nativeAmount: params.nativeAmount,
    },
  });
}

const supplyActionId = "midnightSupplyCollateralTakeBorrow";
const sellTargetAmounts = {
  assets: ["assets", "maxUnits"],
  units: ["units", "minSellerAssets"],
} as const;

function parseFundedBorrow(
  borrow: Parameters<typeof parseMidnightTakeBorrow>[0],
  supply: Pick<
    MidnightSupplyCollateralTakeBorrowParams,
    "collateralSupplies" | "nativeAmount"
  >,
) {
  // Throws typed errors before reading entries when a JS caller passes a malformed list.
  validateStoredSuppliesArray(
    supply.collateralSupplies,
    "$.collateralSupplies",
  );
  for (const [index, entry] of supply.collateralSupplies.entries()) {
    getPlanObject(entry, `$.collateralSupplies[${index}]`);
  }
  validateCollateralIndexTypes("collateralSupplies", supply.collateralSupplies);
  return parseMidnightSupplyCollateralTakeBorrow({ ...borrow, ...supply });
}

async function prepareBorrow(
  client: Client,
  {
    params,
    supply,
  }: {
    readonly params: MidnightTakeBorrowPlanParams;
    readonly supply?: Pick<
      MidnightSupplyCollateralTakeBorrowParams,
      "collateralSupplies" | "nativeAmount"
    >;
  },
): Promise<TransactionPlan> {
  const {
    chainId,
    account,
    marketData,
    positionData,
    collateralPrices,
    target,
  } = params;
  const now = params.now ?? Time.timestamp();
  // Reject a non-bigint clock so the window sum below cannot throw a generic TypeError.
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
    throw invalidSellTargetType("$.target");
  }
  validateMidnightTargetAmountTypes(target, sellTargetAmounts[target.type]);

  const borrow = {
    chainId,
    market: marketData.params,
    target,
    receiver: params.receiver ?? account,
    takeableOffers: params.takeableOffers,
    deadline: intent.deadline,
    referralFeePct: intent.referralFeePct,
    referralFeeRecipient: intent.referralFeeRecipient,
  };
  const funded = supply && parseFundedBorrow(borrow, supply);
  const parsed = funded ?? parseMidnightTakeBorrow(borrow);
  validateMidnightTakeableOfferFields(parsed.takeableOffers);
  const bundle = getChainAddress(chainId, "midnightBundlesV2");
  validateMidnightPositionBinding({
    positionData,
    accountAddress: account,
    marketData,
  });
  const collateral: bigint[] = funded
    ? Array.from(
        { length: parsed.market.collateralParams.length },
        (_, index) => positionData.collateral[index] ?? 0n,
      )
    : [...positionData.collateral];
  const pulls = new Map<Address, bigint>();
  for (const { collateralIndex, token, assets } of funded?.collateralSupplies ??
    []) {
    const index = Number(collateralIndex);
    collateral[index] = (collateral[index] ?? 0n) + assets;
    pulls.set(token, (pulls.get(token) ?? 0n) + assets);
  }
  validateMidnightBorrowHealth({
    market: marketData,
    collateral,
    collateralPrices,
    debt: positionData.debt,
    borrowUnits:
      parsed.target.type === "units"
        ? parsed.target.units
        : parsed.target.maxUnits,
  });
  const { credit } = new AccrualPosition(
    positionData,
    marketData,
  ).accrueInterest(MathLib.max(now, positionData.lastAccrual));
  const takeableOffers = validateMidnightTakeFeasibility({
    side: "sell",
    takeableOffers: parsed.takeableOffers,
    accountAddress: account,
    marketData,
    now,
    deadline: parsed.deadline,
    referralFeePct: parsed.referralFeePct,
    fallbackUnits: MathLib.min(credit, marketData.withdrawable),
    credit,
    target: parsed.target,
    increasesDebt: true,
  });

  const requirement = { chainId, account, bundle, pulls };
  const [approvals, authorization] = await prepareBorrowRequirements(
    client,
    requirement,
  );
  const inputs = {
    chainId,
    account,
    market: parsed.market,
    target: parsed.target,
    receiver: parsed.receiver,
    takeableOffers,
    deadline: parsed.deadline,
    referralFeePct: parsed.referralFeePct,
    referralFeeRecipient: parsed.referralFeeRecipient,
  };
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      ...approvals,
      ...(authorization === undefined ? [] : [authorization]),
      funded
        ? {
            id: supplyActionId,
            label: "Supply collateral and borrow on Midnight",
            action: {
              type: supplyActionId,
              inputs: {
                ...inputs,
                collateralSupplies: funded.collateralSupplies.map(
                  ({ collateralIndex, assets }) => ({
                    collateralIndex,
                    assets,
                  }),
                ),
                ...(supply?.nativeAmount !== undefined && {
                  nativeAssets: supply.nativeAmount,
                }),
              },
            },
          }
        : {
            id: "midnightTakeBorrow",
            label: "Borrow on Midnight",
            action: { type: "midnightTakeBorrow", inputs },
          },
    ],
    signatureRequests: [],
  });
}

async function prepareBorrowRequirements(
  client: Client,
  requirement: Parameters<typeof prepareCollateralApprovals>[1],
) {
  const { chainId, account, bundle } = requirement;
  const chainCheck = createChainCheck(client, chainId);
  await chainCheck();
  // Check deployments before an authorization read can fail decoding empty data.
  await assertRegistryTargetsHaveCode(
    client,
    chainId,
    [
      { role: "midnightBundlesV2", address: bundle },
      { role: "midnight", address: getChainAddress(chainId, "midnight") },
    ],
    chainCheck,
  );
  return Promise.all([
    prepareCollateralApprovals(client, requirement),
    prepareMidnightBundleAuthorization(client, { chainId, account }),
  ]);
}

async function prepareCollateralApprovals(
  client: Client,
  {
    chainId,
    account,
    bundle,
    pulls,
  }: {
    readonly chainId: number;
    readonly account: Address;
    readonly bundle: Address;
    readonly pulls: ReadonlyMap<Address, bigint>;
  },
) {
  const requirements = await Promise.all(
    [...pulls].map(([token, amount], tokenIndex) => {
      // Validation only; the entity checks the same per-token bound in getRequirements().
      parseMidnightApprovalRequirements({
        viemClient: client,
        chainId,
        token,
        owner: account,
        spender: bundle,
        amount,
      });
      return getTokenRequirements(client, {
        chainId,
        owner: account,
        token,
        spender: bundle,
        amount,
        approvalId: (index) =>
          `${supplyActionId}:approval:${tokenIndex}:${index}`,
      });
    }),
  );
  return requirements.flatMap(({ approvals }) => approvals);
}

type TakeBorrowAction = Extract<Action, { type: "midnightTakeBorrow" }>;
type SupplyBorrowAction = Extract<Action, { type: typeof supplyActionId }>;

function storedBorrowParams({
  chainId,
  market,
  target,
  receiver,
  takeableOffers,
  deadline,
  referralFeePct,
  referralFeeRecipient,
}: TakeBorrowAction["inputs"]) {
  if (target.type !== "assets" && target.type !== "units") {
    throw invalidSellTargetType("$.inputs.target");
  }
  return {
    chainId,
    market: storedMarketTuple(market),
    target,
    receiver,
    takeableOffers: storedFills(takeableOffers),
    deadline,
    referralFeePct,
    referralFeeRecipient,
  };
}

function storedSupplyBorrowParams({ inputs }: SupplyBorrowAction) {
  return {
    ...storedBorrowParams(inputs),
    collateralSupplies: inputs.collateralSupplies.map(
      ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
    ),
    nativeAmount: inputs.nativeAssets,
  };
}

/** @internal Encodes the prepared borrow from persisted inputs without state reads. */
export function buildMidnightTakeBorrow(
  action: TakeBorrowAction | SupplyBorrowAction,
) {
  if (action.type !== supplyActionId) {
    return midnightTakeBorrow(storedBorrowParams(action.inputs));
  }
  validateStoredCollateralOrder(
    action.inputs.market.collateralParams,
    "$.inputs.market.collateralParams",
  );
  validateStoredSuppliesArray(
    action.inputs.collateralSupplies,
    "$.inputs.collateralSupplies",
  );
  for (const [index, supply] of action.inputs.collateralSupplies.entries()) {
    getPlanObject(supply, `$.inputs.collateralSupplies[${index}]`);
  }
  const { type } = getPlanObject(action.inputs.target, "$.inputs.target");
  if (type !== "assets" && type !== "units") {
    throw invalidSellTargetType("$.inputs.target");
  }
  return midnightSupplyCollateralTakeBorrow(storedSupplyBorrowParams(action));
}

function validateStoredSuppliesArray(
  value: unknown,
  path: string,
): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new InvalidTransactionPlanError({
      path,
      reason: "expected an array",
    });
  }
}

/**
 * @internal Validates a stored collateral supply and borrow recipe: the sell shape, the
 * collateral order, the supply and native funding fields, then the action's clock-free parse
 * checks on the stored inputs.
 */
export function validateMidnightSupplyCollateralTakeBorrowPlanAction(
  action: Record<string, unknown>,
  path: string,
): void {
  validateMidnightSellPlanAction(action, path);
  const inputsPath = `${path}.inputs`;
  const inputs = getPlanObject(action.inputs, inputsPath);
  validateStoredCollateralOrder(
    (inputs.market as SupplyBorrowAction["inputs"]["market"]).collateralParams,
    `${inputsPath}.market.collateralParams`,
  );
  const suppliesPath = `${inputsPath}.collateralSupplies`;
  validateStoredSuppliesArray(inputs.collateralSupplies, suppliesPath);
  for (const [index, supply] of inputs.collateralSupplies.entries()) {
    const supplyPath = `${suppliesPath}[${index}]`;
    validatePlanFields(getPlanObject(supply, supplyPath), {
      path: supplyPath,
      fields: { collateralIndex: "uint256 bigint", assets: "uint128 bigint" },
    });
  }
  if (inputs.nativeAssets !== undefined) {
    validatePlanFields(inputs, {
      path: inputsPath,
      fields: { nativeAssets: "uint256 bigint" },
    });
  }
  try {
    parseMidnightSupplyCollateralTakeBorrow(
      storedSupplyBorrowParams(action as SupplyBorrowAction),
    );
  } catch (cause) {
    throw new InvalidTransactionPlanError({
      path: inputsPath,
      reason: "expected a valid Midnight collateral supply and borrow",
      cause,
    });
  }
}
