import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { parseMidnightApprovalRequirements } from "../../actions/requirements/midnight/getMidnightApprovalRequirements.js";
import { getTokenRequirements } from "../requirements.js";
import type { TransactionPlan } from "../types.js";
import { prepareMidnightBundleAuthorization } from "./authorization.js";
import {
  type MidnightMakerPublicationPlanParams,
  prepareMidnightMakerPublication,
} from "./makerPublication.js";
import { parseMakeLendParams, parseMakeRepayParams } from "./prepare.js";

/**
 * Inputs for publishing resting Midnight lend offers funded from the maker's token balance.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightMakeLendPlanParams
  extends MidnightMakerPublicationPlanParams {
  /** Loan token shared by every offer market. */
  readonly loanToken: Address;
  /** Loan assets to cover in the core allowance check. Count an alternative offer group's budget once. */
  readonly loanAssets: bigint;
  /** Additional loan assets reserved by other open groups, excluding groups being cancelled. */
  readonly reservedLoanAssets?: bigint;
}

/**
 * Prepares a PriceRatifierV1 or RateRatifierV1 buy-offer publication for the submitting maker.
 * Midnight pulls loan tokens from the maker only at fill time. Preparation checks the core
 * allowance against `loanAssets + reservedLoanAssets`, not the offer caps or the wallet balance.
 * The publication bundle pulls nothing and cannot fund this flow with native ETH. Approvals
 * and authorizations are separate transactions and do not expire with the plan.
 * Builds the offer tree and checks the offer-capped `expiresAt` first, then validates the
 * publication with a plan-side copy of the entity `makeLend` constructor, in its order, except
 * that malformed cancellations are rejected before any state read, and a deadline already reached
 * at the pinned block is rejected before the mempool API call. So an input with several errors can fail on the tree or expiry here where the entity reports another error
 * first. The chain and the bundle, Midnight and ratifier code are checked once, right before
 * the first publication-state read. The allowance bound is checked like the entity's
 * `getRequirements()`, after the publication is parsed and before the allowance read.
 * @param client - Plain viem client for network, deployment, offer and prerequisite reads.
 * @param params - Maker, offer tree or tree creation request, and loan-token allowance bounds.
 * @param params.chainId - Chain containing Midnight, MidnightBundlesV2 and the selected ratifier.
 * @param params.account - Non-zero maker that names itself on every offer and sends the plan.
 * @param params.offers - Caller-supplied buy-offer tree, or a PriceRatifierV1 or RateRatifierV1 tree creation request.
 * @param params.validation - Optional mempool API request controls; `false` skips the API call.
 * @param params.cancellations - Optional groups and consumed ceilings to cancel atomically with publication; must not overlap the new tree.
 *   Omitting it cancels nothing (an untyped JavaScript `null` does too).
 * @param params.loanToken - Loan token shared by every offer market.
 * @param params.loanAssets - Positive loan assets to cover in the core allowance check; count an alternative offer group's budget once.
 * @param params.reservedLoanAssets - Optional loan assets reserved by other open groups, excluding cancelled groups; defaults to `0n`.
 * @param params.now - Reference Unix timestamp in seconds for plan expiry; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Unix seconds. Defaults to the earlier of `now + 2h` and the first offer expiry minus one second.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen, signature-free plan whose publication payload can be built offline.
 * @throws {InvalidBigIntInputError} If `loanAssets`, a cancellation ceiling, or a supplied non-null `now`
 *   or `reservedLoanAssets` is not a bigint; checked before any request.
 * @throws {ZeroAccountError} If the submitting account is zero.
 * @throws {InvalidTransactionPlanError} If the account is not an address, calldata origin exceeds 1 MiB,
 *   or a supplied non-null `cancellations` is not an array or has a non-object entry; checked
 *   before any request.
 * @throws {InvalidCalldataOriginError} If calldata origin is not nonempty, even-length hex.
 * @throws {NonIntegerInputError} If `expiresAt` is not a safe integer.
 * @throws {InvalidTreeError} If the offer tree is empty or invalid.
 * @throws {InvalidTreeHeightError} If the tree exceeds the allowed height.
 * @throws {InvalidMidnightOfferGroupError} If a tree request uses an invalid explicit group.
 * @throws {InvalidMidnightRateRatifierV1RateError} If a Rate V1 tree request has a negative leaf rate.
 * @throws {InvalidMidnightRateRatifierV1TickError} If a Rate V1 tree request has an offer tick below the ratifier's minimum.
 * @throws {NonPositiveInputError} If `loanAssets` or `expiresAt` is not positive.
 * @throws {NegativeInputError} If `reservedLoanAssets` or a cancellation ceiling is negative.
 * @throws {InputExceedsMaxError} If `loanAssets + reservedLoanAssets` exceeds uint256, a cancellation ceiling exceeds uint128, or explicit expiry reaches an offer's expiry while every offer is still live at the reference time.
 * @throws {MidnightCalldataEncodingError} If the loan-token address or publication input cannot be encoded.
 * @throws {MidnightOfferMarketLoanTokenMismatchError} If an offer uses a different loan token.
 * @throws {MidnightOfferSideMismatchError} If an offer is not a buy offer.
 * @throws {MidnightOfferReduceOnlyError} If an offer is reduce-only.
 * @throws {MidnightOfferMakerMismatchError} If an offer names another maker.
 * @throws {MidnightOfferCallbackNotSupportedError} If an offer has a callback.
 * @throws {MidnightOfferContinuousFeeCapError} If an offer sets a nonzero continuous fee cap.
 * @throws {MidnightOfferExpiredError} If an offer expires at or before the pinned block timestamp.
 * @throws {MidnightOfferExpiryAfterMaturityError} If an offer expiry exceeds its market maturity.
 * @throws {MidnightOfferGroupConsumedError} If an offer group has no capacity remaining.
 * @throws {MidnightOfferTickSpacingError} If an offer tick is not accessible in its market.
 * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} If the market fee exceeds an offer's cap.
 * @throws {MidnightOfferRateBoundUnreachableError} If a Rate V1 offer cannot satisfy its rate bound.
 * @throws {MidnightMarketMaturityTooFarError} If an uncreated market matures more than 100 years after offer expiry.
 * @throws {MidnightMarketLltvNotEnabledError} If an uncreated market uses a disabled LLTV.
 * @throws {MidnightMarketLiquidationCursorNotEnabledError} If an uncreated market uses a disabled liquidation cursor.
 * @throws {MidnightMarketOracleWithoutCodeError} If an uncreated market's oracle has no code.
 * @throws {MidnightOfferMarketChainMismatchError} If an offer targets another chain.
 * @throws {MidnightOfferMarketAddressMismatchError} If an offer targets another Midnight deployment.
 * @throws {MidnightOfferRatifierMismatchError} If an offer uses a different ratifier than the tree's route.
 * @throws {MidnightPayloadDecodeError} If the offers cannot be encoded in the publication payload,
 *   including when the encoded payload exceeds its size limit; split the offer tree.
 * @throws {InvalidMidnightHexInputError} If a cancellation group is not bytes32.
 * @throws {DuplicateMidnightGroupCancellationError} If the same group is cancelled more than once.
 * @throws {MidnightReplacementGroupCancelledError} If a cancellation overlaps the published tree.
 * @throws {ExpiredDeadlineError} If the resolved deadline is at or before the reference time or
 *   pinned block timestamp, or an offer has expired by the reference time but not at the pinned
 *   block; this skips API validation, ratification and payload encoding.
 * @throws {MidnightOfferSellerReceiverMismatchError} If an offer routes proceeds to someone other than the maker.
 * @throws {ChainIdMismatchError} If the configured or transport chain differs from the requested chain.
 * @throws {UnsupportedChainIdError} If the chain has no address registry.
 * @throws {UnknownAddressError} If a required deployment is not registered.
 * @throws {MissingContractCodeError} If a registered write target has no code.
 * @throws {MidnightMempoolValidationError} If optional API validation rejects the tree.
 * @throws {MidnightApiError} If API validation returns a non-2xx response.
 * @throws {InvalidMidnightApiResponseError} If the API returns malformed successful validation data.
 * @throws {viem.BaseError} If a chain, deployment, pinned offer-state, allowance or authorization read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightMakeLend } from "@morpho-org/morpho-sdk";
 * import { type Offer, Tree } from "@morpho-org/morpho-sdk/midnight/entities";
 * import { type Address, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function buildLend(maker: Address, loanToken: Address, buyOffers: readonly Offer[]) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   // Use the maker's proposed buy offers, each naming the Base PriceRatifierV1.
 *   const offers = Tree.create({ type: "priceV1", entries: buyOffers.map(offer => ({ offer })) });
 *   const plan = await prepareMidnightMakeLend(client, {
 *     chainId: base.id, account: maker, offers, loanToken, loanAssets: 1_000_000n,
 *     now: (await client.getBlock()).timestamp,
 *   });
 *   // Simulate and send the transactions in order from maker.
 *   return buildTransactions(plan);
 * }
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export async function prepareMidnightMakeLend(
  client: Client,
  params: MidnightMakeLendPlanParams,
): Promise<TransactionPlan> {
  return prepareFundedMidnightMakerPublication(client, {
    params,
    operation: "lend",
  });
}

const fundedPublications = {
  lend: {
    type: "midnightMakeLend",
    label: "Publish Midnight lend offers",
    parse: parseMakeLendParams,
  },
  repay: {
    type: "midnightMakeRepay",
    label: "Publish Midnight repay offers",
    parse: parseMakeRepayParams,
  },
} as const;

/**
 * @internal Prepares a buy-offer publication with the core loan-token allowance needed at fill
 * time, through the operation's entity parse constructor.
 */
export async function prepareFundedMidnightMakerPublication(
  client: Client,
  {
    params,
    operation,
  }: {
    readonly params: MidnightMakeLendPlanParams;
    readonly operation: keyof typeof fundedPublications;
  },
): Promise<TransactionPlan> {
  const { chainId, account, loanToken, loanAssets, reservedLoanAssets } =
    params;
  const { type, label, parse } = fundedPublications[operation];
  const { parsed, inputs, calldataOrigin } =
    await prepareMidnightMakerPublication<Awaited<ReturnType<typeof parse>>>(
      client,
      {
        params,
        parse: (raw, context) =>
          parse({ ...raw, loanToken, loanAssets, reservedLoanAssets }, context),
      },
    );
  const midnight = getChainAddress(chainId, "midnight");
  // Validation only; the entity checks the same allowance bound in getRequirements().
  parseMidnightApprovalRequirements({
    viemClient: client,
    chainId,
    token: parsed.loanToken,
    owner: account,
    spender: midnight,
    amount: parsed.approvalAmount,
  });
  const [{ approvals }, authorization] = await Promise.all([
    getTokenRequirements(client, {
      chainId,
      owner: account,
      token: parsed.loanToken,
      spender: midnight,
      amount: parsed.approvalAmount,
      approvalId: (index) => `${type}:approval:${index}`,
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
      ...approvals,
      ...(authorization === undefined ? [] : [authorization]),
      { id: type, label, action: { type, inputs } },
    ],
    signatureRequests: [],
  });
}
