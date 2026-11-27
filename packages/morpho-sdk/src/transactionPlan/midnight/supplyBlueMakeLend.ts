import type { InputMarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import type { Client, Hex } from "viem";
import { parseMidnightApprovalRequirements } from "../../actions/requirements/midnight/getMidnightApprovalRequirements.js";

import { getTokenRequirements } from "../requirements.js";
import type { TransactionPlan } from "../types.js";
import { prepareMidnightBundleAuthorization } from "./authorization.js";
import {
  type MidnightMakerPublicationPlanParams,
  prepareMidnightMakerPublication,
} from "./makerPublication.js";
import { parseSupplyBlueMakeLendParams } from "./prepare.js";

const actionId = "midnightSupplyBlueMakeLend";

/**
 * Inputs for supplying Blue liquidity to a maker's callback and publishing Midnight lend offers.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightSupplyBlueMakeLendPlanParams
  extends MidnightMakerPublicationPlanParams {
  /** Blue market with the same loan token as every Midnight offer market. */
  readonly blueMarket: InputMarketParams;
  /** Positive loan assets to park for the callback. */
  readonly assetsToPark: bigint;
  /** 32-byte salt that selects the submitting maker's BlueBuyCallback. */
  readonly callbackSalt: Hex;
  /** Native ETH in wei, allowed only for wrapped-native loan tokens and capped at the parking amount. */
  readonly nativeAmount?: bigint;
}

/**
 * Prepares an atomic Blue supply to the maker's BlueBuyCallback and activation of a Price V1
 * or Rate V1 Midnight lend-offer root, without filling any offer. Builds the offer tree and checks
 * the offer-capped `expiresAt` first, then runs the entity `supplyBlueMakeLend` checks through a
 * plan-side constructor, so an input with several errors can fail on another error here than in
 * the entity. The input, tree, cancellation, deadline and binding checks run before any RPC read or
 * mempool API call; payload encoding, which also checks market maturity, runs after the reads. The
 * chain and the bundle, Midnight, ratifier, Blue and callback-factory code are checked once, right
 * before the publication-state reads. The share preview reads the Blue market at the block the
 * publication-state reads are pinned to; the transaction does not enforce a minimum share amount. Allowance to MidnightBundlesV2 is checked against the
 * full parking amount, even when native ETH funds part of it; when it falls short, the plan
 * approves `maxUint256` (capped by the SDK). This route needs no direct Midnight token approval
 * and no signature request. Publishing authorizes the selected PriceRatifierV1 or RateRatifierV1 on
 * the maker's Midnight account; that authorization remains until revoked, even after the plan's
 * deadline. Standalone approvals and operator authorization can remain even if publication fails.
 *
 * @param client - Plain viem client for chain, deployment, market and prerequisite reads.
 * @param params - Maker's offer tree or creation request, Blue market, salt and funding.
 * @param params.chainId - Chain containing Midnight, MidnightBundlesV2, Blue and the selected ratifier.
 * @param params.account - Non-zero maker that funds the parking supply, owns the callback, names itself on every offer and sends the plan.
 * @param params.offers - Caller-supplied buy-offer tree routed through the callback, or a PriceRatifierV1 or RateRatifierV1 tree creation request.
 * @param params.validation - Optional mempool API request controls; `false` skips the API call.
 * @param params.validation.apiUrl - Optional Midnight API URL; defaults to `https://api.morpho.org/v0/midnight`.
 * @param params.validation.timestamp - Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
 * @param params.validation.fetch - Optional fetch implementation for the API call; defaults to the global `fetch`.
 * @param params.validation.request - Optional fetch options forwarded to the API request.
 * @param params.cancellations - Optional groups and consumed ceilings to cancel atomically with publication; must not overlap the new tree.
 *   Omitting it cancels nothing (an untyped JavaScript `null` does too).
 * @param params.blueMarket - Blue market with the same loan token as every Midnight offer market.
 * @param params.blueMarket.loanToken - Blue loan token; must match every Midnight offer's loan token.
 * @param params.blueMarket.collateralToken - Blue market collateral token.
 * @param params.blueMarket.oracle - Blue market oracle.
 * @param params.blueMarket.irm - Blue market interest rate model.
 * @param params.blueMarket.lltv - Blue market liquidation LTV, scaled by WAD.
 * @param params.assetsToPark - Positive loan assets supplied to Blue for the callback.
 * @param params.callbackSalt - 32-byte salt that selects the maker's BlueBuyCallback.
 * @param params.nativeAmount - Optional native ETH in wei, allowed only for a wrapped-native loan token and capped at the parking amount.
 * @param params.now - Reference Unix timestamp in seconds for plan expiry; omitting it uses the device clock (an untyped JavaScript `null` does too).
 *   The share preview uses the pinned block's timestamp instead.
 * @param params.expiresAt - Unix seconds. Defaults to the earlier of now + 2 hours and one second before the first offer expiry.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan with opaque publication bytes, buildable without the tree or API.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now` is not a bigint; checked first.
 * @throws {ZeroAccountError} If the submitting account is zero.
 * @throws {InvalidTransactionPlanError} If the account is not an address or calldata origin exceeds 1 MiB.
 * @throws {InvalidCalldataOriginError} If the supplied calldata origin is not nonempty, even-length hex.
 * @throws {NonIntegerInputError} If `expiresAt` is not a safe integer.
 * @throws {InvalidTreeError} If the offer tree is empty or invalid.
 * @throws {InvalidTreeHeightError} If the tree exceeds the maximum height.
 * @throws {InvalidMidnightOfferGroupError} If a tree request uses an invalid explicit group.
 * @throws {InvalidMidnightRateRatifierV1RateError} If a Rate V1 request has a negative leaf rate.
 * @throws {InvalidMidnightRateRatifierV1TickError} If a Rate V1 request uses a tick below its minimum.
 * @throws {MidnightOfferMakerMismatchError} If an offer names another maker.
 * @throws {MidnightOfferSellerReceiverMismatchError} If a tree creation request has a sell leaf for the
 *   maker with a zero `receiverIfMakerIsSeller`; checked while the tree is built, before the side check.
 * @throws {InvalidBigIntInputError} If `assetsToPark`, `blueMarket.lltv` or a cancellation ceiling is not a
 *   bigint; checked after the tree is built and before any request.
 * @throws {InvalidTransactionPlanError} If a supplied non-null `cancellations` is not an array or has a
 *   non-object entry; checked after the tree is built and before any request.
 * @throws {MidnightOfferSideMismatchError} If an offer is not a buy offer.
 * @throws {MidnightOfferReduceOnlyError} If an offer is reduce-only.
 * @throws {MidnightOfferMarketLoanTokenMismatchError} If an offer names a different loan token.
 * @throws {MidnightOfferCallbackMismatchError} If an offer targets a different callback.
 * @throws {MidnightOfferCallbackDataMismatchError} If an offer does not encode the selected Blue market.
 * @throws {InvalidMidnightHexInputError} If the salt or a cancellation group is not bytes32.
 * @throws {DuplicateMidnightGroupCancellationError} If a cancellation group appears twice.
 * @throws {MidnightReplacementGroupCancelledError} If a cancelled group overlaps the new tree.
 * @throws {NonPositiveInputError} If the parking amount or explicit expiry is not positive.
 * @throws {NegativeInputError} If native funding or a cancellation ceiling is negative.
 * @throws {InputExceedsMaxError} If the parking amount or a cancellation ceiling exceeds uint128, native funding exceeds the parking amount, or explicit expiry reaches the first offer expiry while every offer is still live at the reference time.
 * @throws {InvalidMidnightNativeAmountTypeError} If `nativeAmount` is not a bigint.
 * @throws {ChainWNativeMissingError} If native funding is requested on a chain without registered wrapped native.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding is requested for another loan token.
 * @throws {MidnightCalldataEncodingError} If the offer tree, Blue market or bundle input cannot be ABI-encoded.
 * @throws {ExpiredDeadlineError} If the resolved deadline is at or before the reference time or
 *   pinned block timestamp, or an offer has expired by the reference time but not at the pinned
 *   block; this skips API validation.
 * @throws {ChainIdMismatchError} If the configured or transport chain differs from the requested chain.
 * @throws {UnsupportedChainIdError} If the chain has no address registry.
 * @throws {UnknownAddressError} If Midnight, the bundle, Blue, the callback factory or the selected ratifier is not registered on the chain.
 * @throws {MissingContractCodeError} If a required registered deployment has no code.
 * @throws {MidnightOfferExpiredError} If an offer is already expired at the pinned block timestamp.
 * @throws {MidnightOfferExpiryAfterMaturityError} If an offer expiry exceeds its market maturity.
 * @throws {MidnightOfferGroupConsumedError} If an offer group has no capacity remaining.
 * @throws {MidnightOfferTickSpacingError} If an offer tick is not accessible in its market.
 * @throws {MidnightOfferContinuousFeeCapError} If an offer sets a nonzero continuous fee cap.
 * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} If the market fee exceeds an offer's cap.
 * @throws {MidnightOfferRateBoundUnreachableError} If a Rate V1 offer cannot satisfy its rate bound.
 * @throws {MidnightMarketMaturityTooFarError} If an uncreated market matures more than 100 years after an offer's expiry.
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
 * @throws {BlueMarketParamsIdMismatchError} If the Blue market read returns a nonzero market tuple whose ID differs from `blueMarket`.
 * @throws {EmptyBlueParkingMarketError} If the Blue market has no supply shares.
 * @throws {ZeroBlueParkingSharesError} If the parking amount would mint zero shares.
 * @throws {viem.BaseError} If a chain, deployment, offer-state, Blue market, allowance or authorization read fails.
 * @example
 * ```ts
 * import {
 *   buildTransactions, getMidnightBlueBuyCallbackAddress, getMidnightBlueBuyCallbackData,
 *   prepareMidnightSupplyBlueMakeLend, type MidnightSupplyBlueMakeLendPlanParams,
 * } from "@morpho-org/morpho-sdk";
 * import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function buildBlueBackedLend(
 *   inputs: Pick<MidnightSupplyBlueMakeLendPlanParams, "account" | "blueMarket" | "callbackSalt">,
 *   createBuyOffers: (route: Pick<Offer, "callback" | "callbackData">) => readonly Offer[],
 * ) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   // The maker's strategy creates buy offers naming the Base PriceRatifierV1 and this route.
 *   const offers = Tree.create({ type: "priceV1", entries: createBuyOffers({
 *     callback: getMidnightBlueBuyCallbackAddress({
 *       chainId: base.id, owner: inputs.account, salt: inputs.callbackSalt,
 *     }),
 *     callbackData: getMidnightBlueBuyCallbackData(inputs.blueMarket),
 *   }).map(offer => ({ offer })) });
 *   const plan = await prepareMidnightSupplyBlueMakeLend(client, {
 *     ...inputs, chainId: base.id, offers, assetsToPark: 1_000_000n,
 *     now: (await client.getBlock()).timestamp,
 *   });
 *   // Simulate and send the transactions in order from inputs.account.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightSupplyBlueMakeLend(
  client: Client,
  params: MidnightSupplyBlueMakeLendPlanParams,
): Promise<TransactionPlan> {
  const {
    chainId,
    account,
    blueMarket,
    assetsToPark,
    callbackSalt,
    nativeAmount,
  } = params;
  const { parsed, inputs, calldataOrigin } =
    await prepareMidnightMakerPublication(client, {
      params,
      codeRoles: ["blue", "midnightBlueBuyCallbackFactory"],
      parse: (raw, context) =>
        parseSupplyBlueMakeLendParams(
          { ...raw, blueMarket, assetsToPark, callbackSalt, nativeAmount },
          context,
        ),
    });
  const spender = getChainAddress(chainId, "midnightBundlesV2");
  // Validation only; the entity checks the same bound in getRequirements().
  parseMidnightApprovalRequirements({
    viemClient: client,
    chainId,
    token: parsed.loanToken,
    owner: account,
    spender,
    amount: parsed.approvalAmount,
  });
  const [prerequisites, authorization] = await Promise.all([
    getTokenRequirements(client, {
      chainId,
      owner: account,
      token: parsed.loanToken,
      spender,
      amount: parsed.approvalAmount,
      approvalId: (index) => `${actionId}:approval:${index}`,
    }),
    prepareMidnightBundleAuthorization(client, { chainId, account }),
  ]);
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: Number(inputs.deadline),
    ...(calldataOrigin && { calldataOrigin }),
    steps: [
      ...prerequisites.approvals,
      ...(authorization === undefined ? [] : [authorization]),
      {
        id: actionId,
        label: "Supply Blue liquidity and publish Midnight lend offers",
        action: {
          type: actionId,
          inputs: {
            ...inputs,
            blueSupply: parsed.blueSupply,
            ...(nativeAmount !== undefined && { nativeAssets: nativeAmount }),
          },
        },
      },
    ],
    signatureRequests: [],
  });
}
