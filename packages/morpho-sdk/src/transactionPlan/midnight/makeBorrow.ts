import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import type { TransactionPlan } from "../types.js";
import { prepareMidnightBundleAuthorization } from "./authorization.js";
import {
  type MidnightMakerPublicationPlanParams,
  prepareMidnightMakerPublication,
} from "./makerPublication.js";
import { parseMakeBorrowParams } from "./prepare.js";

/**
 * Inputs for publishing resting Midnight borrow offers without supplying collateral.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export type MidnightMakeBorrowPlanParams = MidnightMakerPublicationPlanParams;

/**
 * Prepares a PriceRatifierV1 or RateRatifierV1 sell-offer publication for the submitting maker.
 * The bundle activates the root and optionally cancels old groups; it does not supply collateral
 * or create debt. No ERC-20 approval or root signature is needed. The standalone bundle grant
 * (if needed) and the ratifier authorization made by the bundle persist until revoked.
 * The bundle accepts execution at its deadline, so the deadline must be strictly before every offer expiry.
 * Builds the offer tree and checks the offer-capped `expiresAt` first, then validates the
 * publication with a plan-side copy of the entity `makeBorrow` constructor, in its order, except
 * that malformed cancellations are rejected before any state read, and a deadline already reached
 * at the pinned block is rejected before the mempool API call. So an input with several errors can fail on the tree or expiry here where the entity reports another
 * error first. The chain and the bundle, Midnight and ratifier code are checked once, right before
 * the first publication-state read.
 * @param client - Plain viem client used to check network, deployments, offers and bundle authorization.
 * @param params - Maker, caller-supplied offer tree or tree creation request, and publication intent.
 * @param params.chainId - Chain containing Midnight, MidnightBundlesV2 and the selected ratifier.
 * @param params.account - Non-zero maker that names itself on every offer and sends the plan.
 * @param params.offers - Caller-supplied sell-offer tree, or a PriceRatifierV1 or RateRatifierV1 tree creation request.
 * @param params.validation - Optional mempool API request controls; `false` skips the API call.
 * @param params.cancellations - Optional groups and consumed ceilings to cancel atomically with publication; must not overlap the new tree.
 *   Omitting it cancels nothing (an untyped JavaScript `null` does too).
 * @param params.now - Reference Unix timestamp in seconds for plan expiry; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Unix seconds. Defaults to the earlier of `now + 2h` and the first offer expiry minus one second.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan with persisted publication data that can be restored and built offline.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now` or a cancellation ceiling is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If the submitting account is zero.
 * @throws {InvalidTransactionPlanError} If the account is not an address, calldata origin exceeds 1 MiB, or a supplied non-null `cancellations` is not an array or has a non-object entry; checked before any request.
 * @throws {InvalidCalldataOriginError} If the supplied calldata origin is not nonempty, even-length hex.
 * @throws {NonIntegerInputError} If `expiresAt` is not a safe integer.
 * @throws {NonPositiveInputError} If `expiresAt` is not positive.
 * @throws {ExpiredDeadlineError} If the resolved deadline is at or before the reference time or
 *   pinned block timestamp, or an offer has expired by the reference time but not at the pinned
 *   block; this skips API validation, ratification and payload encoding.
 * @throws {InputExceedsMaxError} If explicit `expiresAt` is at or after the first offer expiry while every offer is still live at the reference time, or a cancellation ceiling exceeds uint128.
 * @throws {NegativeInputError} If a cancellation ceiling is negative.
 * @throws {InvalidTreeError} If the offer tree is empty or invalid.
 * @throws {InvalidTreeHeightError} If the tree exceeds the maximum height.
 * @throws {InvalidMidnightOfferGroupError} If a tree request uses an invalid explicit group.
 * @throws {InvalidMidnightRateRatifierV1RateError} If a Rate V1 tree request has a negative leaf rate.
 * @throws {InvalidMidnightRateRatifierV1TickError} If a Rate V1 tree request has an offer tick below the ratifier's minimum.
 * @throws {MidnightCalldataEncodingError} If the offer tree or bundle input cannot be ABI-encoded.
 * @throws {InvalidMidnightHexInputError} If a cancellation group is not bytes32.
 * @throws {DuplicateMidnightGroupCancellationError} If the same group is cancelled more than once.
 * @throws {MidnightOfferMakerMismatchError} If an offer names another maker.
 * @throws {MidnightOfferSideMismatchError} If an offer is not a sell offer.
 * @throws {MidnightOfferReduceOnlyError} If an offer is reduce-only.
 * @throws {MidnightOfferCallbackNotSupportedError} If an offer has a callback.
 * @throws {MidnightOfferSellerReceiverMismatchError} If an offer routes proceeds to someone other than the maker.
 * @throws {MidnightOfferContinuousFeeCapError} If an offer sets a nonzero continuous fee cap.
 * @throws {MidnightReplacementGroupCancelledError} If a cancelled group is also in the new tree.
 * @throws {MidnightOfferExpiredError} If an offer expires at or before the pinned block timestamp.
 * @throws {MidnightOfferExpiryAfterMaturityError} If an offer expiry exceeds its market maturity.
 * @throws {MidnightOfferGroupConsumedError} If an offer group has no capacity remaining.
 * @throws {MidnightOfferTickSpacingError} If an offer tick is not accessible in its market.
 * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} If the market fee exceeds an offer's cap.
 * @throws {MidnightOfferZeroPriceSellError} If a sell offer has a zero tick.
 * @throws {MidnightOfferRateBoundUnreachableError} If a Rate V1 offer cannot satisfy its rate bound.
 * @throws {MidnightMarketMaturityTooFarError} If an uncreated market matures more than 100 years after the offer expires.
 * @throws {MidnightMarketLltvNotEnabledError} If an uncreated market uses a disabled LLTV.
 * @throws {MidnightMarketLiquidationCursorNotEnabledError} If an uncreated market uses a disabled liquidation cursor.
 * @throws {MidnightMarketOracleWithoutCodeError} If an uncreated market's oracle has no code.
 * @throws {MidnightOfferMarketChainMismatchError} If an offer's market uses another chain.
 * @throws {MidnightOfferMarketAddressMismatchError} If an offer's market names another Midnight deployment.
 * @throws {MidnightOfferRatifierMismatchError} If an offer names a different ratifier than the tree's route.
 * @throws {MidnightPayloadDecodeError} If the offers cannot be encoded in the publication payload,
 *   including when the encoded payload exceeds its size limit; split the offer tree.
 * @throws {MidnightMempoolValidationError} If the mempool API rejects the tree; not thrown with `validation: false`.
 * @throws {MidnightApiError} If API validation returns a non-2xx response.
 * @throws {InvalidMidnightApiResponseError} If the API returns malformed successful validation data.
 * @throws {ChainIdMismatchError} If the configured or transport chain differs from `chainId`.
 * @throws {UnsupportedChainIdError} If the chain has no address registry.
 * @throws {UnknownAddressError} If Midnight, the bundle or the selected ratifier is not registered on the chain.
 * @throws {MissingContractCodeError} If a registered write target has no code.
 * @throws {viem.BaseError} If a chain, deployment, pinned offer-state or authorization read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightMakeBorrow } from "@morpho-org/morpho-sdk";
 * import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { type Address, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function buildPublication(maker: Address, sellOffers: readonly Offer[]) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   // Use your proposed sell offers, each naming the Base PriceRatifierV1.
 *   const offers = Tree.create({ type: "priceV1", entries: sellOffers.map(offer => ({ offer })) });
 *   const plan = await prepareMidnightMakeBorrow(client, {
 *     chainId: base.id, account: maker, offers, now: (await client.getBlock()).timestamp,
 *   });
 *   // Simulate, then send in order from maker. No token allowance is needed.
 *   // The bundle and ratifier grants remain active until you revoke them.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightMakeBorrow(
  client: Client,
  params: MidnightMakeBorrowPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account } = params;
  const { inputs, calldataOrigin } = await prepareMidnightMakerPublication(
    client,
    { params, parse: parseMakeBorrowParams },
  );
  const authorization = await prepareMidnightBundleAuthorization(client, {
    chainId,
    account,
  });
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: Number(inputs.deadline),
    ...(calldataOrigin && { calldataOrigin }),
    steps: [
      ...(authorization === undefined ? [] : [authorization]),
      {
        id: "midnightMakeBorrow",
        label: "Publish Midnight borrow offers",
        action: { type: "midnightMakeBorrow", inputs },
      },
    ],
    signatureRequests: [],
  });
}
