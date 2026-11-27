import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import type { TransactionPlan } from "../types.js";
import { prepareMidnightBundleAuthorization } from "./authorization.js";
import {
  type MidnightMakerPublicationPlanParams,
  prepareMidnightMakerPublication,
} from "./makerPublication.js";
import { parseMakeWithdrawParams } from "./prepare.js";

/**
 * Inputs for publishing resting Midnight reduce-only sell offers against the maker's credit.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export type MidnightMakeWithdrawPlanParams = MidnightMakerPublicationPlanParams;

/**
 * Prepares publication of resting reduce-only sell offers through MidnightBundlesV2.
 * The bundle activates the PriceRatifierV1 or RateRatifierV1 root and can cancel old groups
 * atomically. The maker must have current credit in each offer's market. Publication does not
 * reduce that credit or transfer tokens. An eventual fill is a separate transaction.
 *
 * No token approval or signature is needed. The standalone bundle authorization (if needed)
 * and the ratifier grant made by the bundle persist until revoked.
 * Builds the offer tree and checks the offer-capped `expiresAt` first, then validates the
 * publication with a plan-side copy of the entity `makeWithdraw` constructor, in its order, except
 * that malformed cancellations are rejected before any state read, and a bundle deadline already
 * reached at the pinned block is rejected before the mempool API call, which the entity flow does
 * not check. So an
 * input with several errors can fail on the tree or expiry here where the entity reports another
 * error first. The chain and the bundle, Midnight and ratifier code are checked once, right before
 * the first publication-state read.
 *
 * @param client - Plain viem client used to check network, deployments, offers and bundle authorization.
 * @param params - Maker, caller-supplied tree or tree creation request, and optional cancellations.
 * @param params.expiresAt - Unix seconds. Defaults to the earlier of `now + 2h` and the first offer expiry minus one second.
 * @returns A frozen plan that can be restored and built offline without the original tree.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now` or a cancellation ceiling is not a bigint;
 *   checked before any request.
 * @throws {ZeroAccountError} If the submitting account is zero.
 * @throws {InvalidTransactionPlanError} If the account is not an address, calldata origin exceeds 1 MiB,
 *   or a supplied non-null `cancellations` is not an array or has a non-object entry; checked
 *   before any request.
 * @throws {InvalidCalldataOriginError} If the supplied calldata origin is not nonempty, even-length hex.
 * @throws {NonIntegerInputError} If `expiresAt` is not a safe integer.
 * @throws {NonPositiveInputError} If `expiresAt` is not positive.
 * @throws {NegativeInputError} If a cancellation ceiling is negative.
 * @throws {InvalidTreeError} If the offer tree is empty or invalid.
 * @throws {InvalidTreeHeightError} If the tree exceeds the maximum height.
 * @throws {InvalidMidnightOfferGroupError} If a tree request uses an invalid explicit group.
 * @throws {InvalidMidnightRateRatifierV1RateError} If a Rate V1 tree request has a negative leaf rate.
 * @throws {InvalidMidnightRateRatifierV1TickError} If a Rate V1 tree request has an offer tick below the ratifier's minimum.
 * @throws {MidnightCalldataEncodingError} If the offer tree or bundle input cannot be ABI-encoded.
 * @throws {MidnightOfferSideMismatchError} If an offer is not a sell offer.
 * @throws {MidnightOfferNotReduceOnlyError} If an offer is not reduce-only.
 * @throws {MidnightOfferNoCreditError} If the maker has no credit in an offer's market.
 * @throws {MidnightOfferMakerMismatchError} If an offer names another maker.
 * @throws {MidnightOfferSellerReceiverMismatchError} If an offer routes proceeds to someone other than the maker.
 * @throws {MidnightOfferCallbackNotSupportedError} If an offer has a callback.
 * @throws {MidnightOfferContinuousFeeCapError} If an offer sets a nonzero continuous fee cap.
 * @throws {MidnightOfferRatifierMismatchError} If an offer names a different ratifier than the tree's route.
 * @throws {InvalidMidnightHexInputError} If a cancellation group is not bytes32.
 * @throws {DuplicateMidnightGroupCancellationError} If a group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} If a cancelled group appears in the new tree.
 * @throws {InputExceedsMaxError} If explicit expiry is at or after the first offer expiry while every offer is still live at the reference time, or a cancellation ceiling exceeds uint128.
 * @throws {ExpiredDeadlineError} If the resolved deadline is at or before the reference time or
 *   pinned block timestamp, or an offer has expired by the reference time but not at the pinned
 *   block; this skips API validation.
 * @throws {MidnightOfferExpiredError} If an offer has expired at the pinned block.
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
 * @throws {MidnightPayloadDecodeError} If the offers cannot be encoded in the publication payload,
 *   including when the encoded payload exceeds its size limit; split the offer tree.
 * @throws {ChainIdMismatchError} If the configured or transport chain differs from `chainId`.
 * @throws {UnsupportedChainIdError} If the chain has no address registry.
 * @throws {UnknownAddressError} If a required deployment is not registered.
 * @throws {MissingContractCodeError} If a registered write target has no code.
 * @throws {MidnightMempoolValidationError} If optional API validation rejects the tree.
 * @throws {MidnightApiError} If API validation returns a non-2xx response.
 * @throws {InvalidMidnightApiResponseError} If the API returns malformed successful validation data.
 * @throws {viem.BaseError} If a chain, deployment, pinned offer-state or authorization read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightMakeWithdraw } from "@morpho-org/morpho-sdk";
 * import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { type Address, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function buildExit(maker: Address, exitOffers: readonly Offer[]) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   // Use the maker's proposed reduce-only sell offers naming the Base PriceRatifierV1.
 *   const offers = Tree.create({ type: "priceV1", entries: exitOffers.map(offer => ({ offer })) });
 *   const plan = await prepareMidnightMakeWithdraw(client, {
 *     chainId: base.id, account: maker, offers, now: (await client.getBlock()).timestamp,
 *   });
 *   // Simulate, then send in order from maker on Base.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightMakeWithdraw(
  client: Client,
  params: MidnightMakeWithdrawPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account } = params;
  const { inputs, calldataOrigin } = await prepareMidnightMakerPublication(
    client,
    { params, parse: parseMakeWithdrawParams },
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
        id: "midnightMakeWithdraw",
        label: "Publish Midnight withdrawal offers",
        action: { type: "midnightMakeWithdraw", inputs },
      },
    ],
    signatureRequests: [],
  });
}
