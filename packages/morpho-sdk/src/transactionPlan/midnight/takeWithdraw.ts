import { MathLib } from "@morpho-org/blue-sdk";
import { AccrualPosition, type Market } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress, Time } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import {
  type MidnightTakeWithdrawParams,
  midnightTakeWithdraw,
  parseMidnightTakeWithdraw,
} from "../../actions/midnight/takeWithdraw.js";
import { createChainCheck } from "../../actions/requirements/chainCheck.js";
import { assertRegistryTargetsHaveCode } from "../../entities/requirements/assertContractCode.js";
import { MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS } from "../../helpers/constant.js";
import { validateMidnightPositionBinding } from "../../helpers/parseMidnight.js";
import { validateReferenceTime } from "../../helpers/validate.js";
import { validateMidnightTakeableOfferFields } from "../../helpers/validateMidnightTakeableOfferFields.js";
import { MidnightTakeDeadlineTooFarError } from "../../types/error.js";
import { type IntentParams, resolveIntent } from "../intent.js";
import type { Action, TransactionPlan } from "../types.js";
import { prepareMidnightBundleAuthorization } from "./authorization.js";
import { storedFills, storedMarketTuple } from "./market.js";
import { validateMidnightReduceOnlySellFeasibility } from "./reduceOnlySellFeasibility.js";
import {
  invalidSellTargetType,
  validateMidnightTargetAmountTypes,
} from "./validation.js";

/**
 * Inputs for withdrawing the account's Midnight credit using caller-selected lend offers.
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export interface MidnightTakeWithdrawPlanParams
  extends Omit<IntentParams, "supportSignature" | "deployless">,
    Pick<MidnightTakeWithdrawParams, "target" | "takeableOffers"> {
  /** Market snapshot used to assess liquidity and fill feasibility. */
  readonly marketData: Market;
  /** Owner-bound position snapshot for the same market, read at the same block. */
  readonly positionData: AccrualPosition;
  /** Recipient of the withdrawn loan assets; defaults to account. */
  readonly receiver?: Address;
  /** Reference timestamp in seconds; defaults to the device clock. */
  readonly now?: bigint;
  /** Unix seconds; defaults to one hour after the reference timestamp. */
  readonly expiresAt?: number;
}

/**
 * Prepares a reduce-only Midnight withdrawal that redeems available credit at par
 * before selling the rest of the target into lend offers. It cannot open debt.
 * Validates inputs with the same parse-once constructor and fill feasibility check as the
 * entity `takeWithdraw`, checks every taken offer field, binds the position to the account and
 * market, and caps fills at the
 * position's credit accrued to the reference timestamp against `marketData`, the snapshot that
 * caps withdrawable credit. It then reads the registry targets'
 * bytecode and the bundle authorization. On an assets target, offers that would revert the
 * whole bundle are dropped from the stored fills. Like the entity check, fill feasibility counts
 * units at par and does not price discounted bids after settlement fees, so a plan can pass
 * preparation and still revert onchain; the onchain bounds keep funds safe. Simulate before sending.
 * @param client - Viem client used to verify chain, deployments and authorization.
 * @param params - Account, market and position snapshots, fills and intent.
 * @param params.chainId - Chain containing the market and MidnightBundlesV2.
 * @param params.account - Non-zero position owner that sends the plan; its credit is withdrawn.
 * @param params.marketData - Market snapshot used to assess liquidity and fill feasibility.
 * @param params.positionData - Owner-bound position snapshot for the same market, read at the same block.
 * @param params.takeableOffers - ABI-ready lend offers from the caller's quote, in fill order.
 * @param params.target.type - `"assets"` to receive loan assets, or `"units"` to sell exact credit units.
 * @param params.target.assets - Exact loan assets paid to the receiver on an assets target; any referral fee is sold on top.
 * @param params.target.maxUnits - Unit cap on an assets target.
 * @param params.target.units - Exact credit units to sell on a units target.
 * @param params.target.minSellerAssets - Loan-asset floor on a units target.
 * @param params.receiver - Optional recipient of the withdrawn loan assets; defaults to `account`.
 * @param params.referralFee.bps - Optional referral fee in integer basis points, at most 10%.
 * @param params.referralFee.recipient - Recipient required for a positive referral fee.
 * @param params.now - Reference Unix timestamp in seconds; omitting it uses the device clock (an untyped JavaScript `null` does too).
 * @param params.expiresAt - Onchain deadline in Unix seconds; defaults to, and may not exceed, one hour after `now`.
 * @param params.calldataOrigin - Optional attribution bytes appended to each built transaction.
 * @returns A frozen plan with a standalone authorization step if needed and no signature requests.
 * @throws {InvalidBigIntInputError} If a supplied non-null `now` or a target amount is not a
 *   bigint; checked before any request.
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
 * @throws {InvalidMarketParameterError} If the market tuple has invalid parameters.
 * @throws {EmptyMidnightTakeableOffersError} If no offers are supplied.
 * @throws {MidnightOfferSideMismatchError} If an offer is not a lend offer.
 * @throws {MidnightTakeableOfferMarketMismatchError} If an offer trades another market.
 * @throws {MidnightCalldataEncodingError} If an address or offer field cannot be ABI-encoded.
 * @throws {MidnightZeroReceiverError} If the receiver is the zero address.
 * @throws {MidnightContractReceiverError} If the receiver, or the referral fee recipient of a
 *   positive fee, is a Midnight protocol or market token contract.
 * @throws {UnboundedMidnightTakeInputError} If `target.units` or `target.maxUnits` is `maxUint256`.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no recipient.
 * @throws {UnsupportedChainIdError} If the chain is absent from the address registry.
 * @throws {UnknownAddressError} If the chain has no `midnightBundlesV2` deployment.
 * @throws {MarketIdMismatchError} If the position belongs to another market.
 * @throws {AccrualPositionUserMismatchError} If the position is not owned by the account.
 * @throws {InvalidPositionLossFactorError} If the position's loss factor is ahead of its market's.
 * @throws {InvalidPositionAccrualStateError} If the position's credit and fee snapshot cannot be accrued.
 * @throws {MidnightTakeableOffersNotFillableError} If the supplied offers cannot be used.
 * @throws {MidnightTakeCreditInsufficientError} If the target needs more units than the
 *   position's accrued credit.
 * @throws {MidnightTakeTargetUnreachableError} With field `target.maxUnits` if `maxUnits` cannot
 *   cover the requested assets, or `target.minSellerAssets` if the units cannot yield it; change the
 *   target instead of re-quoting. With field `takeableOffers` if the credit covers the target but
 *   the offers plus withdrawable liquidity cannot fill it.
 * @throws {MissingContractCodeError} If either registered Midnight target has no deployed code.
 * @throws {viem.BaseError} If an `eth_chainId` request or the authorization read fails.
 * @example
 * ```ts
 * import { buildTransactions, prepareMidnightTakeWithdraw, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * import { fetchMidnightAccrualPosition } from "@morpho-org/morpho-sdk/fetch";
 * import { MidnightApi } from "@morpho-org/morpho-sdk/midnight-api";
 * import { type Address, type Hash, createPublicClient, http } from "viem";
 * import { base } from "viem/chains";
 *
 * async function prepareWithdrawal(account: Address, marketId: Hash) {
 *   const client = createPublicClient({ chain: base, transport: http() });
 *   const block = await client.getBlock();
 *   const positionData = await fetchMidnightAccrualPosition(client, {
 *     marketId,
 *     user: account,
 *     blockNumber: block.number,
 *   });
 *   const marketData = positionData.market;
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
 *   const plan: TransactionPlan = await prepareMidnightTakeWithdraw(client, {
 *     chainId: base.id,
 *     account,
 *     marketData,
 *     positionData,
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
export async function prepareMidnightTakeWithdraw(
  client: Client,
  params: MidnightTakeWithdrawPlanParams,
): Promise<TransactionPlan> {
  const { chainId, account, marketData, positionData, target } = params;
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
    throw invalidSellTargetType("$.target");
  }
  validateMidnightTargetAmountTypes(
    target,
    target.type === "assets"
      ? ["assets", "maxUnits"]
      : ["units", "minSellerAssets"],
  );

  const parsed = parseMidnightTakeWithdraw({
    chainId,
    market: marketData.params,
    target,
    receiver: params.receiver ?? account,
    takeableOffers: params.takeableOffers,
    deadline: intent.deadline,
    referralFeePct: intent.referralFeePct,
    referralFeeRecipient: intent.referralFeeRecipient,
  });
  validateMidnightTakeableOfferFields(parsed.takeableOffers);
  const bundle = getChainAddress(chainId, "midnightBundlesV2");
  validateMidnightPositionBinding({
    positionData,
    accountAddress: account,
    marketData,
  });
  const { credit } = new AccrualPosition(
    positionData,
    marketData,
  ).accrueInterest(MathLib.max(now, positionData.lastAccrual));
  const takeableOffers = validateMidnightReduceOnlySellFeasibility({
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
    increasesDebt: false,
  });

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
  const authorization = await prepareMidnightBundleAuthorization(client, {
    chainId,
    account,
  });
  return deepFreeze({
    version: 2,
    chainId,
    account,
    expiresAt: intent.expiresAt,
    ...(intent.calldataOrigin && { calldataOrigin: intent.calldataOrigin }),
    steps: [
      ...(authorization === undefined ? [] : [authorization]),
      {
        id: "midnightTakeWithdraw",
        label: "Withdraw Midnight credit",
        action: {
          type: "midnightTakeWithdraw",
          inputs: {
            chainId,
            account,
            market: parsed.market,
            target: parsed.target,
            receiver: parsed.receiver,
            takeableOffers,
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

/** @internal Encodes the prepared credit withdrawal from persisted inputs without state reads. */
export function buildMidnightTakeWithdraw({
  inputs: {
    chainId,
    market,
    target,
    receiver,
    takeableOffers,
    deadline,
    referralFeePct,
    referralFeeRecipient,
  },
}: Extract<Action, { type: "midnightTakeWithdraw" }>) {
  if (target.type !== "assets" && target.type !== "units") {
    throw invalidSellTargetType("$.inputs.target");
  }
  return midnightTakeWithdraw({
    chainId,
    market: storedMarketTuple(market),
    target,
    receiver,
    takeableOffers: storedFills(takeableOffers),
    deadline,
    referralFeePct,
    referralFeeRecipient,
  });
}
