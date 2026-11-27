import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { parseMidnightApprovalRequirements } from "../../actions/requirements/midnight/getMidnightApprovalRequirements.js";
import type { MidnightMakeBorrowCollateral } from "../../types/midnightCancelAndMake.js";
import { getTokenRequirements } from "../requirements.js";
import type { TransactionPlan } from "../types.js";
import { prepareMidnightBundleAuthorization } from "./authorization.js";
import {
  type MidnightMakerPublicationPlanParams,
  prepareMidnightMakerPublication,
} from "./makerPublication.js";
import { parseSupplyCollateralMakeBorrowParams } from "./prepare.js";

const actionId = "midnightSupplyCollateralMakeBorrow";

/**
 * Inputs for atomically supplying collateral and publishing resting Midnight borrow offers.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightSupplyCollateralMakeBorrowPlanParams
  extends MidnightMakerPublicationPlanParams {
  /**
   * Market shared by all offers, with one positive supply per selected collateral index.
   * Indexes are zero-based positions in ascending collateral token address order.
   */
  readonly collateral: MidnightMakeBorrowCollateral;
  /** Native ETH in wei, capped by the wrapped-native collateral pull. */
  readonly nativeAmount?: bigint;
}

/**
 * Prepares one MidnightBundlesV2 call to supply collateral, optionally cancel groups, and
 * activate the maker's Price V1 or Rate V1 offer root without filling an offer or creating debt.
 * Per-token allowance to the bundle is checked against the full pull, even when native ETH funds
 * some wrapped collateral; when it falls short, the plan approves `maxUint256` (capped per token
 * by the SDK), and unused allowance remains after publication. Operator grants remain until
 * revoked; a standalone bundle grant can remain even if publication fails. No signature is requested.
 * Builds the offer tree and checks the offer-capped `expiresAt` first, then validates the
 * publication with the entity `supplyCollateralMakeBorrow` checks through a plan-side
 * constructor, with the market, collateral and native funding checks before any state read. So an
 * input with several errors can fail on another error here than in the entity. The chain and the bundle, Midnight and ratifier code are checked
 * once, right before the first publication-state read. Approvals are checked per
 * token like the entity's `getRequirements()`, summing supplies that pull the same token.
 *
 * @param client - Plain viem client used to validate deployments, offers and prerequisites.
 * @param params - Maker, collateral supplies and the maker's offer tree or tree creation request.
 * @param params.chainId - Chain containing Midnight, MidnightBundlesV2 and the selected ratifier.
 * @param params.account - Non-zero maker that supplies the collateral, names itself on every offer and sends the plan.
 * @param params.offers - Caller-supplied sell-offer tree, or a PriceRatifierV1 or RateRatifierV1 tree creation request.
 * @param params.validation - Optional mempool API request controls; `false` skips the API call.
 * @param params.cancellations - Optional groups and consumed ceilings to cancel atomically with publication; must not overlap the new tree.
 *   Omitting it cancels nothing (an untyped JavaScript `null` does too).
 * @param params.collateral.market - Market shared by every offer.
 * @param params.collateral.supplies - Positive collateral supplies; each `collateralIndex` is a zero-based position in ascending collateral token address order, and `assets` is in that token's base units. Entries may repeat an index; their amounts are summed for that token's allowance check.
 * @param params.nativeAmount - Optional native ETH in wei, capped by the wrapped-native collateral pull.
 * @param params.now - Reference Unix timestamp in seconds for plan expiry; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Unix seconds. The default is the earlier of now + 2 hours and the first offer expiry minus one second.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan that builds offline from saved steps and opaque offer payload bytes.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now`, a cancellation ceiling, or a collateral
 *   index or amount is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If the submitting account is zero.
 * @throws {InvalidTransactionPlanError} If the account is not an address, calldata origin exceeds 1 MiB,
 *   or a supplied non-null `cancellations` is not an array or has a non-object entry; checked
 *   before any request.
 * @throws {InvalidCalldataOriginError} If the supplied calldata origin is not nonempty, even-length hex.
 * @throws {NonIntegerInputError} If `expiresAt` is not a safe integer.
 * @throws {InvalidMarketParameterError} If the supplied collateral market parameters are invalid.
 * @throws {InvalidTreeError} If the offer tree is empty or invalid.
 * @throws {InvalidTreeHeightError} If the tree exceeds the maximum height.
 * @throws {InvalidMidnightOfferGroupError} If a tree request uses an invalid explicit group.
 * @throws {InvalidMidnightRateRatifierV1RateError} If a Rate V1 request has a negative leaf rate.
 * @throws {InvalidMidnightRateRatifierV1TickError} If a Rate V1 request uses a tick below its minimum.
 * @throws {MidnightOfferMakerMismatchError} If any offer names another maker.
 * @throws {MidnightOfferSideMismatchError} If any offer is a buy offer.
 * @throws {MidnightOfferCallbackNotSupportedError} If an offer names a callback.
 * @throws {MidnightOfferReduceOnlyError} If an offer is reduce-only.
 * @throws {MidnightOfferSellerReceiverMismatchError} If an offer names another proceeds receiver.
 * @throws {MidnightOfferContinuousFeeCapError} If an offer sets a nonzero continuous fee cap.
 * @throws {InvalidMidnightHexInputError} If a cancellation group is not bytes32.
 * @throws {DuplicateMidnightGroupCancellationError} If a cancellation group appears twice.
 * @throws {MidnightReplacementGroupCancelledError} If a cancellation group is also in the new tree.
 * @throws {ExpiredDeadlineError} If the resolved deadline is at or before the reference time or
 *   pinned block timestamp, or an offer has expired by the reference time but not at the pinned
 *   block; this skips API validation.
 * @throws {MidnightOfferExpiredError} If an offer is already expired at the pinned block timestamp.
 * @throws {MidnightOfferExpiryAfterMaturityError} If an offer expiry exceeds its market maturity.
 * @throws {MidnightOfferGroupConsumedError} If an offer group has no capacity remaining.
 * @throws {MidnightOfferTickSpacingError} If an offer tick is not accessible in its market.
 * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} If the market fee exceeds an offer's cap.
 * @throws {MidnightOfferZeroPriceSellError} If a sell offer has a zero tick.
 * @throws {MidnightOfferRateBoundUnreachableError} If a Rate V1 offer cannot satisfy its rate bound.
 * @throws {MidnightMarketMaturityTooFarError} If an uncreated market matures more than 100 years after the pinned block timestamp.
 * @throws {MidnightMarketLltvNotEnabledError} If an uncreated market uses a disabled LLTV.
 * @throws {MidnightMarketLiquidationCursorNotEnabledError} If an uncreated market uses a disabled liquidation cursor.
 * @throws {MidnightMarketOracleWithoutCodeError} If an uncreated market's oracle has no code.
 * @throws {MidnightOfferMarketChainMismatchError} If an offer's market uses another chain.
 * @throws {MidnightOfferMarketAddressMismatchError} If an offer's market names another Midnight deployment.
 * @throws {MidnightOfferRatifierMismatchError} If an offer names the wrong ratifier for its tree.
 * @throws {MidnightPayloadDecodeError} If the offers cannot be encoded in the publication payload,
 *   including when the encoded payload exceeds its size limit; split the offer tree.
 * @throws {MidnightMempoolValidationError} If optional mempool validation rejects the tree.
 * @throws {MidnightApiError} If API validation returns a non-2xx response.
 * @throws {InvalidMidnightApiResponseError} If the API returns malformed successful validation data.
 * @throws {MarketIdMismatchError} If an offer bound to this chain and Midnight deployment targets another market than `collateral.market`.
 * @throws {EmptyMidnightCollateralSuppliesError} If no collateral supply is specified.
 * @throws {UnknownCollateralIndexError} If a collateral index is not configured in the supplied market.
 * @throws {NonPositiveInputError} If a collateral amount or explicit expiry is not positive.
 * @throws {NegativeInputError} If native funding or a cancellation ceiling is negative.
 * @throws {InputExceedsMaxError} If a supply, per-index sum or cancellation ceiling exceeds uint128, native funding exceeds the wrapped-native pull, or explicit expiry reaches the first offer expiry while every offer is still live at the reference time.
 * @throws {InvalidMidnightNativeAmountTypeError} If `nativeAmount` is not a bigint.
 * @throws {ChainWNativeMissingError} If native funding is requested on a chain without registered wrapped native.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding is requested without a wrapped-native pull.
 * @throws {MidnightCalldataEncodingError} If the offer tree, collateral market or bundle input cannot be ABI-encoded.
 * @throws {ChainIdMismatchError} If the configured or transport chain differs from `chainId`.
 * @throws {UnsupportedChainIdError} If the chain has no address registry.
 * @throws {UnknownAddressError} If Midnight, the bundle or the selected ratifier is not registered on the chain.
 * @throws {MissingContractCodeError} If a registered write target has no code.
 * @throws {viem.BaseError} If a chain, deployment, offer-state, allowance or authorization read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightSupplyCollateralMakeBorrow } from "@morpho-org/morpho-sdk";
 * import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { type Address, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function buildBorrowPublication(first: Offer, rest: readonly Offer[], maker: Address) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   // The maker constructs same-market sell offers naming the Base PriceRatifierV1.
 *   const offers = Tree.create({ type: "priceV1", entries: [first, ...rest].map(offer => ({ offer })) });
 *   const plan = await prepareMidnightSupplyCollateralMakeBorrow(client, {
 *     chainId: base.id, account: maker, offers,
 *     collateral: { market: first.market, supplies: [{ collateralIndex: 0n, assets: 1_000_000n }] },
 *     now: (await client.getBlock()).timestamp,
 *   });
 *   // Simulate and send the steps in order from maker.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightSupplyCollateralMakeBorrow(
  client: Client,
  params: MidnightSupplyCollateralMakeBorrowPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, collateral, nativeAmount } = params;
  const { parsed, inputs, calldataOrigin } =
    await prepareMidnightMakerPublication(client, {
      params,
      parse: (raw, context) =>
        parseSupplyCollateralMakeBorrowParams(
          { ...raw, collateral, nativeAmount },
          context,
        ),
    });
  const spender = getChainAddress(chainId, "midnightBundlesV2");
  const pulls = new Map<Address, bigint>();
  for (const { token, assets } of parsed.action.collateralPulls) {
    pulls.set(token, (pulls.get(token) ?? 0n) + assets);
  }
  const [prerequisites, authorization] = await Promise.all([
    Promise.all(
      [...pulls].map(([token, amount], tokenIndex) => {
        // Validation only; the entity checks the same per-token bound in getRequirements().
        parseMidnightApprovalRequirements({
          viemClient: client,
          chainId,
          token,
          owner: account,
          spender,
          amount,
        });
        return getTokenRequirements(client, {
          chainId,
          owner: account,
          token,
          spender,
          amount,
          approvalId: (index) => `${actionId}:approval:${tokenIndex}:${index}`,
        });
      }),
    ),
    prepareMidnightBundleAuthorization(client, { chainId, account }),
  ]);
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: Number(inputs.deadline),
    ...(calldataOrigin && { calldataOrigin }),
    steps: [
      ...prerequisites.flatMap(({ approvals }) => approvals),
      ...(authorization === undefined ? [] : [authorization]),
      {
        id: actionId,
        label: "Supply collateral and publish Midnight borrow offers",
        action: {
          type: actionId,
          inputs: {
            ...inputs,
            collateral: parsed.collateral,
            ...(nativeAmount !== undefined && { nativeAssets: nativeAmount }),
          },
        },
      },
    ],
    signatureRequests: [],
  });
}
