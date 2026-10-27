import {
  MarketUtils as BlueMarketUtils,
  MathLib,
  UnsupportedMarketIrmError,
} from "@morpho-org/blue-sdk";
import { fetchMarket as fetchBlueMarket } from "@morpho-org/blue-sdk-viem";
import {
  type AccrualPosition,
  fetchAccrualPosition,
  fetchMarket,
  type Market,
  MarketParams,
  MarketUtils,
  type MidnightFetchParams,
  Payload,
  PriceRatifierV1,
  RateRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { _try, getChainAddress, Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  isAddress,
  isAddressEqual,
  maxUint256,
  zeroAddress,
} from "viem";
import {
  midnightCancelAndMake,
  midnightRedeem,
  midnightRepayWithdrawCollateral,
  midnightSupplyCollateral,
  midnightSupplyCollateralTakeBorrow,
  midnightTakeBorrow,
  midnightTakeLend,
  midnightTakeRepayWithdrawCollateral,
  midnightTakeWithdraw,
} from "../../actions/midnight/index.js";
import {
  getMidnightApprovalRequirements,
  getMidnightAuthorizationRequirement,
} from "../../actions/requirements/index.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
} from "../../helpers/callback.js";
import { MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS } from "../../helpers/constant.js";
import {
  encodeMidnightMarketId,
  wrapMidnightEncoding,
} from "../../helpers/encodeMidnightCalldata.js";
import {
  getMidnightMaxSafeDebt,
  validateChainId,
} from "../../helpers/index.js";
import {
  validateMidnightAccount,
  validateMidnightAddress,
} from "../../helpers/validateMidnightAccount.js";
import { validateMidnightUint128Field } from "../../helpers/validateMidnightBounds.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightBytes32 } from "../../helpers/validateMidnightPublication.js";
import { validateMidnightTakeFeasibility } from "../../helpers/validateMidnightTakeFeasibility.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AccrualPositionUserMismatchError,
  type ActionRequirement,
  BorrowExceedsSafeLtvError,
  EmptyBlueParkingMarketError,
  InsufficientMidnightWithdrawableLiquidityError,
  MarketIdMismatchError,
  type MidnightCancelAndMakeAction,
  type MidnightGroupCancellation,
  MidnightInvalidAccountAddressError,
  MidnightOfferCallbackDataMismatchError,
  MidnightOfferCallbackMismatchError,
  MidnightOfferContinuousFeeCapError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferNotReduceOnlyError,
  MidnightOfferRatifierMismatchError,
  MidnightOfferReduceOnlyError,
  MidnightOfferSellerReceiverMismatchError,
  type MidnightRedeemAction,
  MidnightRedeemExceedsCreditError,
  MidnightRepayExceedsDebtError,
  type MidnightRepayWithdrawCollateralAction,
  type MidnightSupplyCollateralAction,
  type MidnightSupplyCollateralTakeBorrowAction,
  type MidnightTakeBorrowAction,
  MidnightTakeDeadlineTooFarError,
  type MidnightTakeLendAction,
  type MidnightTakeRepayWithdrawCollateralAction,
  MidnightTakeTargetUnreachableError,
  type MidnightTakeWithdrawAction,
  MidnightZeroOnBehalfError,
  MissingAccrualPositionError,
  NegativeInputError,
  NoMidnightCreditToRedeemError,
  NonPositiveInputError,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
  ZeroBlueParkingSharesError,
} from "../../types/index.js";
import { validateMidnightDeadline } from "./deadline.js";
import {
  fetchMidnightMakerOfferStates,
  offerMarketParams,
  validateMidnightMakerOfferCallbacks,
  validateMidnightMakerOfferStates,
} from "./publication.js";
import type {
  GetOffersDataParams,
  GetPositionDataParams,
  MakeLendParams,
  MakeOffersOutput,
  MakeOffersParams,
  MidnightActionOutput,
  MidnightRequirementsParams,
  OffersData,
  RedeemParams,
  RepayWithdrawCollateralParams,
  SupplyBlueMakeLendParams,
  SupplyCollateralMakeBorrowParams,
  SupplyCollateralParams,
  SupplyCollateralTakeBorrowParams,
  TakeBorrowParams,
  TakeLendParams,
  TakeRepayWithdrawCollateralParams,
  TakeWithdrawParams,
} from "./types.js";

const validatePositionBinding = (params: {
  readonly positionData: AccrualPosition;
  readonly accountAddress: Address;
  readonly marketData: Market;
}): void => {
  if (params.positionData.marketId !== params.marketData.id) {
    throw new MarketIdMismatchError(
      params.positionData.marketId,
      params.marketData.id,
    );
  }
  // Reject a malformed address before viem compares it.
  validateMidnightAddress("positionData.user", params.positionData.user);
  if (!isAddressEqual(params.positionData.user, params.accountAddress)) {
    throw new AccrualPositionUserMismatchError(
      params.positionData.user,
      params.accountAddress,
    );
  }
};

const validateTakeDeadlineWindow = (deadline: bigint): void => {
  const now = Time.timestamp();
  // Throws when the deadline is at or before now.
  validateMidnightDeadline(deadline, now);
  const maxDeadline = now + MIDNIGHT_TAKE_MAX_DEADLINE_SECONDS;
  if (deadline > maxDeadline) {
    throw new MidnightTakeDeadlineTooFarError({ deadline, maxDeadline });
  }
};

/**
 * Entity methods exposed by `client.morpho.midnight(chainId)`.
 *
 * Use this surface for app flows: fetch market or position data first when a
 * method asks for it, call the flow method to receive lazy `getRequirements`
 * and `buildTx` handles, collect requirements, then build the final
 * transaction synchronously.
 *
 * @example
 * ```ts
 * import { Time } from "@morpho-org/morpho-ts";
 * import { maxUint256 } from "viem";
 *
 * const midnight = client.morpho.midnight(8453);
 * const marketData = await midnight.getMarketData(marketId);
 * const output = midnight.takeLend({
 *   accountAddress: lender,
 *   marketData,
 *   target: { type: "assets", assets: 1_000_000n, minUnits: 900_000n },
 *   takeableOffers: quote.data.takeableOffers,
 *   maxContinuousFee: maxUint256,
 *   deadline: Time.timestamp() + 600n,
 * });
 * const requirements = await output.getRequirements();
 * const tx = output.buildTx();
 * ```
 */
export type MidnightActions = Pick<
  MorphoMidnight,
  | "getMarketData"
  | "getPositionData"
  | "getOffersData"
  | "takeLend"
  | "takeBorrow"
  | "takeWithdraw"
  | "supplyCollateralTakeBorrow"
  | "takeRepayWithdrawCollateral"
  | "supplyCollateral"
  | "makeLend"
  | "makeBorrow"
  | "supplyBlueMakeLend"
  | "makeWithdraw"
  | "makeRepay"
  | "supplyCollateralMakeBorrow"
  | "redeem"
  | "repayWithdrawCollateral"
  | "cancelOffers"
>;

const assertNonNegativeAmount = (label: string, amount: bigint) => {
  if (amount < 0n) throw new NegativeInputError(label, amount);
};

const assertPositiveAmount = (label: string, amount: bigint) => {
  if (amount <= 0n) throw new NonPositiveInputError(label, amount);
};

const rejectReduceOnlyOffers = (
  offers: readonly { readonly reduceOnly: boolean }[],
) => {
  offers.forEach((offer, index) => {
    if (offer.reduceOnly) throw new MidnightOfferReduceOnlyError({ index });
  });
};

const getOffersDataInternal = async ({
  client,
  chainId,
  params,
  marketCreationTime = "expiry",
}: {
  readonly client: MorphoClientType;
  readonly chainId: number;
  readonly params: GetOffersDataParams;
  readonly marketCreationTime?: "expiry" | "now";
}): Promise<OffersData> => {
  validateChainId(client.viemClient.chain?.id, chainId);
  // Reject a malformed or zero maker before comparing offers against it.
  validateMidnightAccount("accountAddress", params.accountAddress);
  const tree: OffersData["tree"] = wrapMidnightEncoding("offers", () =>
    Tree.from(params.offers),
  );
  const midnight = getChainAddress(chainId, "midnight");
  tree.offers.forEach((offer, index) => {
    if (!isAddressEqual(offer.maker, params.accountAddress)) {
      throw new MidnightOfferMakerMismatchError({
        index,
        expectedMaker: params.accountAddress,
        actualMaker: offer.maker,
      });
    }
    if (offer.continuousFeeCap !== 0n) {
      throw new MidnightOfferContinuousFeeCapError({
        index,
        continuousFeeCap: offer.continuousFeeCap,
      });
    }
    if (
      !offer.buy &&
      !isAddressEqual(offer.receiverIfMakerIsSeller, offer.maker)
    ) {
      throw new MidnightOfferSellerReceiverMismatchError({
        index,
        expectedReceiver: offer.maker,
        actualReceiver: offer.receiverIfMakerIsSeller,
      });
    }
    const market = offerMarketParams(offer);
    if (market.chainId !== BigInt(chainId)) {
      throw new MidnightOfferMarketChainMismatchError({
        index,
        expectedChainId: chainId,
        actualChainId: market.chainId,
      });
    }
    if (!isAddressEqual(market.midnight, midnight)) {
      throw new MidnightOfferMarketAddressMismatchError({
        index,
        expectedMidnight: midnight,
        actualMidnight: market.midnight,
      });
    }
  });
  const ratifierType = tree.type;
  const ratifier = getChainAddress(
    chainId,
    ratifierType === "priceV1" ? "priceRatifierV1" : "rateRatifierV1",
  );
  tree.offers.forEach((offer, index) => {
    if (!isAddressEqual(offer.ratifier, ratifier)) {
      throw new MidnightOfferRatifierMismatchError({
        index,
        expectedRatifier: ratifier,
        actualRatifier: offer.ratifier,
      });
    }
  });

  const { states, now } = await fetchMidnightMakerOfferStates({
    client: client.viemClient,
    chainId,
    tree,
  });
  validateMidnightMakerOfferStates({
    tree,
    states,
    now,
    marketCreationTime,
  });

  const groups: Hex[] = [];
  const seenGroups = new Set<string>();
  for (const offer of tree.offers) {
    const group = offer.group;
    const key = group.toLowerCase();
    if (!seenGroups.has(key)) {
      seenGroups.add(key);
      groups.push(group);
    }
  }

  if (params.validation !== false) {
    await tree.mempoolValidate({
      ...params.validation,
      chainId,
    });
  }

  const items =
    tree.type === "priceV1"
      ? PriceRatifierV1.ratify({ tree })
      : RateRatifierV1.ratify({ tree });

  return {
    accountAddress: params.accountAddress,
    groups,
    tree,
    ratifierType,
    ratifier,
    payload: await Payload.encode(items),
  };
};

const validateMarketData = (market: Market, chainId: number) => {
  // Reject snapshots from another chain deployment before exposing requirements.
  validateMidnightMarket({ market, chainId });
};

/**
 * Entity facade for Midnight fixed-rate action flows.
 *
 * `MorphoMidnight` keeps reads and transaction construction separated. Methods
 * that need chain or API state fetch it up front, while returned `buildTx`
 * callbacks are synchronous and only consume the data already passed in.
 *
 * @example
 * ```ts
 * const midnight = client.morpho.midnight(8453);
 * const block = await client.getBlock();
 * const positionData = (
 *   await midnight.getPositionData({
 *     marketId,
 *     accountAddress: user,
 *     parameters: { blockNumber: block.number },
 *   })
 * ).accrueInterest(block.timestamp);
 * const { buildTx } = midnight.redeem({
 *   accountAddress: user,
 *   positionData,
 * });
 * const tx = buildTx();
 * ```
 */
export class MorphoMidnight {
  constructor(
    private readonly client: MorphoClientType,
    private readonly chainId: number,
  ) {}

  /**
   * Fetches a hydrated Midnight market from `Midnight.toMarket` and `Midnight.marketState`.
   *
   * @param marketId - Market id to fetch.
   * @param parameters - Optional block, account, and state-override parameters forwarded to every read.
   * @returns The market parameters and current onchain market state.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`, another chain than this entity's.
   * @throws {viem.BaseError} when the `eth_chainId` request or a state read fails.
   * @example
   * ```ts
   * const midnight = client.morpho.midnight(8453);
   * const marketData = await midnight.getMarketData(marketId, {
   *   blockNumber: 48_287_000n,
   * });
   * ```
   */
  async getMarketData(
    marketId: Hex,
    parameters?: MidnightFetchParams,
  ): Promise<Market> {
    await validateClientChainId(this.client.viemClient, this.chainId);

    return await fetchMarket(this.client.viemClient, {
      ...parameters,
      marketId,
    });
  }

  /**
   * Fetches a Midnight position and its hydrated market from onchain state.
   *
   * Reads `Midnight.toMarket`, `Midnight.marketState`, and either the deployless
   * position query or the direct position and collateral getters.
   *
   * @param params - Position owner, market id, and optional fetch parameters.
   * @param params.marketId - Market id whose position is fetched.
   * @param params.accountAddress - Position owner address.
   * @param params.parameters - Optional block, account, and state-override parameters forwarded to every read.
   * @returns The account's position paired with the fetched market.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`, another chain than this entity's.
   * @throws {viem.BaseError} when the `eth_chainId` request or a state read fails.
   * @example
   * ```ts
   * const positionData = await midnight.getPositionData({
   *   marketId,
   *   accountAddress: user,
   *   parameters: { blockNumber: 48_287_000n },
   * });
   * ```
   */
  async getPositionData(
    params: GetPositionDataParams,
  ): Promise<AccrualPosition> {
    await validateClientChainId(this.client.viemClient, this.chainId);

    return fetchAccrualPosition(this.client.viemClient, {
      ...params.parameters,
      deployless: this.client.options.supportDeployless,
      marketId: params.marketId,
      user: params.accountAddress,
    });
  }

  /**
   * Checks the RPC chain and reads Midnight state at one pinned block, then rejects unfillable offers
   * before calling the mempool API unless `validation: false` skips that call. Reads market state,
   * group consumption, maker credit and debt,
   * plus the default continuous fee, LLTV and liquidation-cursor enablement, and oracle code for
   * uncreated markets.
   *
   * @param params - Maker account, PriceRatifierV1 or RateRatifierV1 tree input, and optional API validation controls.
   * @param params.accountAddress - Maker expected on every offer.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @returns Prepared tree, groups, ratifier, and encoded payload used by maker flows.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`, another chain than this entity's.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {InvalidMidnightOfferGroupError} when a priceV1/rateV1 `Tree.create` request has explicit groups that break `OfferUtils.validateOfferGroup` rules.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferContinuousFeeCapError} when an offer has a nonzero continuous fee cap.
   * @throws {MidnightOfferSellerReceiverMismatchError} when a sell offer routes proceeds to another address.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {UnknownAddressError} when the chain has no deployment for the tree's V1 ratifier.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an offer cannot be ABI-encoded, such as an out-of-range integer, or `accountAddress` is not a well-formed address.
   * @throws {viem.BaseError} when a pinned block, multicall, or oracle-code read fails.
   * @throws {MidnightOfferExpiredError} when an offer expiry is not later than the pinned block timestamp.
   * @throws {MidnightOfferExpiryAfterMaturityError} when an offer expiry exceeds its market maturity.
   * @throws {MidnightOfferGroupConsumedError} when an offer group has no remaining capacity.
   * @throws {MidnightOfferTickSpacingError} when an offer tick is not accessible in its market.
   * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds an offer's cap.
   * @throws {MidnightOfferZeroPriceSellError} when a sell offer has a zero tick.
   * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 offer cannot satisfy its bound.
   * @throws {MidnightOfferNoDebtError} when a reduce-only buy is submitted without maker debt.
   * @throws {MidnightOfferNoCreditError} when a reduce-only sell is submitted without maker credit.
   * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the offer's expiry.
   * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market uses a disabled LLTV.
   * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market uses a disabled liquidation cursor.
   * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
   * @example
   * ```ts
   * const offersData = await midnight.getOffersData({
   *   accountAddress: maker,
   *   offers: { type: "rateV1", entries: [{ offer, rate }] },
   * });
   * ```
   */
  async getOffersData(params: GetOffersDataParams): Promise<OffersData> {
    return getOffersDataInternal({
      client: this.client,
      chainId: this.chainId,
      params,
    });
  }

  /**
   * Prepares a `MidnightBundlesV2` buy that lends into borrow-side offers for `accountAddress`.
   *
   * On an assets target, sell offers whose tick is out of range or whose buyer price is zero or
   * above one are dropped from the transaction because one of them would revert the whole bundle.
   *
   * @param params - Lender, market snapshot, buy target, offers, fee cap, deadline, and optional referral fee.
   * @param params.accountAddress - Lender; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`.
   * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
   *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of
   *   the maximum wNative amount this call can pull, but not more. Any wrapped native not pulled
   *   stays in the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still
   *   required for the full pulled amount.
   * @param params.takeableOffers - Borrow-side offers returned by the Midnight API.
   * @param params.maxContinuousFee - Largest market continuous fee accepted, in the unit of the market's
   *   onchain `continuousFee` (`Market.continuousFee`): a WAD-scaled per-second rate, so `317097919n`
   *   is about 1% per year. The take reverts if the market fee is higher. Pass `maxUint256` for no cap.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee paid out of the pulled assets.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy loan-token approval and `MidnightBundlesV2` authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {InputExceedsMaxError} when a target amount or offer cap exceeds `uint128`, when
   *   `target.maxBuyerAssets` exceeds `uint128` (an SDK cap: the bundle accepts `uint256`, but a
   *   higher ceiling gives no slippage protection), when `maxContinuousFee` exceeds `uint256`, or
   *   when `nativeAmount` exceeds the maximum wNative amount this call can pull.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when the target amount, `minUnits` or `maxBuyerAssets` is not positive.
   * @throws {NegativeInputError} when a takeable offer cap, `maxContinuousFee`,
   *   `referralFeePct` or `nativeAmount` is negative.
   * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
   * @throws {NativeAmountOnNonWNativeAssetError} when `marketData.params.loanToken` is not wNative.
   * @throws {UnboundedMidnightTakeInputError} when `target.units` or
   *   `target.maxBuyerAssets` is `maxUint256`.
   * @throws {ExpiredDeadlineError} when `deadline` has expired.
   * @throws {MidnightTakeDeadlineTooFarError} when `deadline` is more than one hour from now.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @throws {MidnightContinuousFeeAboveMaxError} when `maxContinuousFee` is below the market's
   *   current continuous fee.
   * @throws {MidnightTakeableOffersNotFillableError} when every takeable offer is expired, not yet
   *   started, self-made, capped below the market fee or otherwise dead.
   * @throws {MidnightTakeTargetUnreachableError} when the live offers cannot hold the target, or
   *   its bounds cannot hold at any fill, or a buy assets target's `minUnits` exceeds the live
   *   offers plus the fallback.
   * @throws {MidnightContractReceiverError} when `referralFeeRecipient` is a Midnight protocol
   *   contract or a market token contract with a positive referral fee.
   * @example
   * ```ts
   * const output = midnight.takeLend({
   *   accountAddress: lender,
   *   marketData,
   *   target: { type: "assets", assets: 1_000_000n, minUnits: 900_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   maxContinuousFee: maxUint256,
   *   deadline: Time.timestamp() + 600n,
   * });
   * ```
   */
  takeLend(
    params: TakeLendParams,
  ): MidnightActionOutput<MidnightTakeLendAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    validateTakeDeadlineWindow(params.deadline);
    const market = params.marketData.params;
    const rawParams = {
      chainId: this.chainId,
      market,
      target: params.target,
      nativeAmount: params.nativeAmount,
      takeableOffers: params.takeableOffers,
      maxContinuousFee: params.maxContinuousFee,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    };
    let tx = midnightTakeLend(rawParams);
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "buy",
      takeableOffers: params.takeableOffers,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
      now: Time.timestamp(),
      deadline: params.deadline,
      referralFeePct: tx.action.args.referralFeePct,
      fallbackUnits: 0n,
      target: params.target,
      maxContinuousFee: params.maxContinuousFee,
    });
    if (takeableOffers !== params.takeableOffers) {
      tx = midnightTakeLend({ ...rawParams, takeableOffers });
    }
    const pulledAssets =
      params.target.type === "assets"
        ? params.target.assets
        : params.target.maxBuyerAssets;

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const approvals = await getMidnightApprovalRequirements({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          token: market.loanToken,
          owner: params.accountAddress,
          spender: tx.to,
          amount: pulledAssets,
        });
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          params.accountAddress,
        );
        return [...approvals, ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares a `MidnightBundlesV2` sell that borrows from lend-side offers for `accountAddress`.
   *
   * The bundle first withdraws as much of the sender's existing credit as the target and market
   * liquidity allow, then fills the rest from offers.
   *
   * Buy offers whose tick is out of range, whose price is zero, or whose price stays below the
   * settlement fee until `deadline` (at or below it on an assets target) are dropped from the transaction because one of them would
   * revert the whole bundle.
   *
   * @param params - Borrower, market snapshot, sell target, offers, deadline, receiver, and optional referral fee.
   * @param params.accountAddress - Borrower; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.positionData - Owner-bound position snapshot returned by `getPositionData`. The
   *   `DEFAULT_LLTV_BUFFER` check is only as current as this snapshot and `collateralPrices`: it
   *   does not see transactions mined or prices moved since, so two transactions built from one
   *   snapshot can together end inside the buffer. Midnight still rejects any position above
   *   LLTV onchain. Midnight debt and collateral do not accrue, so the check needs no accrual.
   * @param params.collateralPrices - Values from `price()` on each
   *   `marketData.params.collateralParams[i].oracle`, indexed like `positionData.collateral` and
   *   scaled by `ORACLE_PRICE_SCALE`. A price is required for every held or supplied collateral
   *   index, because debt after a borrow is always positive.
   * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
   * @param params.receiver - Optional loan-asset recipient; defaults to `accountAddress`.
   *   Midnight protocol and market token contracts are rejected.
   * @param params.takeableOffers - Lend-side offers returned by the Midnight API.
   * @param params.deadline - Bounded bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the sale
   *   proceeds; on an assets target it is added on top of `target.assets`.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy `MidnightBundlesV2` authorization requirement and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {InputExceedsMaxError} when a target amount or offer cap exceeds `uint128`, or when
   *   `target.maxUnits` exceeds `uint128` (an SDK cap: the bundle accepts `uint256`, but a higher
   *   ceiling gives no slippage protection).
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when the target amount, `maxUnits` or `minSellerAssets` is not positive.
   * @throws {NegativeInputError} when a takeable offer cap or `referralFeePct` is negative.
   * @throws {UnboundedMidnightTakeInputError} when `target.units` or
   *   `target.maxUnits` is `maxUint256`.
   * @throws {MidnightZeroReceiverError} when `receiver` is the zero address.
   * @throws {MidnightContractReceiverError} when `receiver` is a Midnight protocol contract or a
   *   market token contract, or when `referralFeeRecipient` is either with a positive referral fee.
   * @throws {ExpiredDeadlineError} when `deadline` has expired.
   * @throws {MidnightTakeDeadlineTooFarError} when `deadline` is more than one hour from now.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {AccrualPositionUserMismatchError} when `positionData.user` differs from `accountAddress`.
   * @throws {MarketIdMismatchError} when `positionData.marketId` differs from `marketData.id`.
   * @throws {UnknownCollateralIndexError} when held collateral uses an unconfigured index.
   * @throws {MissingMarketPriceError} when a held collateral index has no supplied price.
   * @throws {BorrowExceedsSafeLtvError} when the post-borrow debt exceeds buffered collateral capacity.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @throws {MidnightTakeableOffersNotFillableError} when every takeable offer is expired, not yet
   *   started, self-made, capped below the market fee or otherwise dead, and no credit withdrawal can fill instead,
   *   or when every offer is dropped for an out-of-range tick, a zero price, or a price below the
   *   settlement fee until `deadline` (at or below it on an assets target), even with a credit
   *   withdrawal.
   * @throws {MidnightTakeTargetUnreachableError} when the live offers cannot hold the target, or
   *   its bounds cannot hold at any fill.
   * @example
   * ```ts
   * import { blueOracleAbi } from "@morpho-org/morpho-sdk/abis";
   *
   * const collateralPrices = await Promise.all(
   *   marketData.params.collateralParams.map(({ oracle }) =>
   *     client.readContract({
   *       address: oracle,
   *       abi: blueOracleAbi,
   *       functionName: "price",
   *     }),
   *   ),
   * );
   * const output = midnight.takeBorrow({
   *   accountAddress: borrower,
   *   marketData,
   *   positionData,
   *   collateralPrices,
   *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: Time.timestamp() + 600n,
   * });
   * ```
   */
  takeBorrow(
    params: TakeBorrowParams,
  ): MidnightActionOutput<MidnightTakeBorrowAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    validateTakeDeadlineWindow(params.deadline);
    const rawParams = {
      chainId: this.chainId,
      market: params.marketData.params,
      target: params.target,
      receiver: params.receiver ?? params.accountAddress,
      takeableOffers: params.takeableOffers,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    };
    let tx = midnightTakeBorrow(rawParams);
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
    });
    const requestedUnits =
      params.target.type === "units"
        ? params.target.units
        : params.target.maxUnits;
    const postDebt = params.positionData.debt + requestedUnits;
    if (postDebt > 0n) {
      const maxSafeDebt = getMidnightMaxSafeDebt({
        market: params.marketData,
        collateral: params.positionData.collateral,
        collateralPrices: params.collateralPrices,
      });
      if (postDebt > maxSafeDebt) {
        throw new BorrowExceedsSafeLtvError(
          requestedUnits,
          MathLib.zeroFloorSub(maxSafeDebt, params.positionData.debt),
        );
      }
    }
    const now = Time.timestamp();
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "sell",
      takeableOffers: params.takeableOffers,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
      now,
      deadline: params.deadline,
      referralFeePct: tx.action.args.referralFeePct,
      // Credit is withdrawn first, up to the market's withdrawable liquidity.
      fallbackUnits: MathLib.min(
        params.positionData.credit,
        params.marketData.withdrawable,
      ),
      credit: params.positionData.credit,
      target: params.target,
      increasesDebt: true,
    });
    if (takeableOffers !== params.takeableOffers) {
      tx = midnightTakeBorrow({ ...rawParams, takeableOffers });
    }

    return {
      getRequirements: () =>
        this.getBundlesV2AuthorizationRequirements(params.accountAddress),
      buildTx: () => tx,
    };
  }

  /**
   * Prepares a reduce-only `MidnightBundlesV2` sell that withdraws `accountAddress`'s credit.
   *
   * The bundle first redeems as much credit as the target and market liquidity allow, then sells
   * the rest to lend-side offers. `reduceOnly` is always set, so it never opens debt. Use `redeem`
   * for a direct redemption without offers.
   *
   * Buy offers whose tick is out of range, whose price is zero, or whose price stays below the
   * settlement fee until `deadline` (at or below it on an assets target) are dropped from the transaction because one of them would
   * revert the whole bundle.
   *
   * @param params - Lender, market snapshot, sell target, offers, deadline, receiver, and optional referral fee.
   * @param params.accountAddress - Lender; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
   * @param params.receiver - Optional loan-asset recipient; defaults to `accountAddress`.
   *   Midnight protocol and market token contracts are rejected.
   * @param params.takeableOffers - Lend-side offers returned by the Midnight API.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the sale
   *   proceeds; on an assets target it is added on top of `target.assets`.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy `MidnightBundlesV2` authorization requirement and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {InputExceedsMaxError} when a target amount or offer cap exceeds `uint128`, or when
   *   `target.maxUnits` exceeds `uint128` (an SDK cap: the bundle accepts `uint256`, but a higher
   *   ceiling gives no slippage protection).
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when the target amount, `maxUnits` or `minSellerAssets` is
   *   not positive.
   * @throws {NegativeInputError} when a takeable offer cap or `referralFeePct` is negative.
   * @throws {UnboundedMidnightTakeInputError} when `target.units` or `target.maxUnits` is `maxUint256`.
   * @throws {MidnightZeroReceiverError} when `receiver` is the zero address.
   * @throws {MidnightContractReceiverError} when `receiver` is a Midnight protocol contract or a
   *   market token contract, or when `referralFeeRecipient` is either with a positive referral fee.
   * @throws {ExpiredDeadlineError} when `deadline` has expired.
   * @throws {MidnightTakeDeadlineTooFarError} when `deadline` is more than one hour from now.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @throws {MidnightTakeableOffersNotFillableError} when every takeable offer is expired, not yet
   *   started, self-made, capped below the market fee or otherwise dead, and no credit withdrawal can fill instead,
   *   or when every offer is dropped for an out-of-range tick, a zero price, or a price below the
   *   settlement fee until `deadline` (at or below it on an assets target), even with a credit
   *   withdrawal.
   * @throws {MidnightTakeTargetUnreachableError} when the live offers cannot hold the target, or
   *   its bounds cannot hold at any fill.
   * @example
   * ```ts
   * const output = midnight.takeWithdraw({
   *   accountAddress: lender,
   *   marketData,
   *   target: { type: "units", units: credit, minSellerAssets: 990_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: Time.timestamp() + 600n,
   * });
   * ```
   */
  takeWithdraw(
    params: TakeWithdrawParams,
  ): MidnightActionOutput<MidnightTakeWithdrawAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    validateTakeDeadlineWindow(params.deadline);
    const rawParams = {
      chainId: this.chainId,
      market: params.marketData.params,
      target: params.target,
      receiver: params.receiver ?? params.accountAddress,
      takeableOffers: params.takeableOffers,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    };
    let tx = midnightTakeWithdraw(rawParams);
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "sell",
      takeableOffers: params.takeableOffers,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
      now: Time.timestamp(),
      deadline: params.deadline,
      referralFeePct: tx.action.args.referralFeePct,
      // The bundle redeems credit first, up to the market's withdrawable liquidity.
      fallbackUnits: params.marketData.withdrawable,
      target: params.target,
      increasesDebt: false,
    });
    if (takeableOffers !== params.takeableOffers) {
      tx = midnightTakeWithdraw({ ...rawParams, takeableOffers });
    }

    return {
      getRequirements: () =>
        this.getBundlesV2AuthorizationRequirements(params.accountAddress),
      buildTx: () => tx,
    };
  }

  /**
   * Prepares one `MidnightBundlesV2` sell that supplies collateral and borrows from lend-side
   * offers for `accountAddress`.
   *
   * Like `takeBorrow`, the sender's existing credit is withdrawn before offers are taken.
   *
   * Buy offers whose tick is out of range, whose price is zero, or whose price stays below the
   * settlement fee until `deadline` (at or below it on an assets target) are dropped from the transaction because one of them would
   * revert the whole bundle.
   *
   * @param params - Borrower, market snapshot, collateral supplies, sell target, offers, deadline, receiver, and optional referral fee.
   * @param params.accountAddress - Borrower; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.positionData - Owner-bound position snapshot returned by `getPositionData`. The
   *   `DEFAULT_LLTV_BUFFER` check is only as current as this snapshot and `collateralPrices`: it
   *   does not see transactions mined or prices moved since, so two transactions built from one
   *   snapshot can together end inside the buffer. Midnight still rejects any position above
   *   LLTV onchain. Midnight debt and collateral do not accrue, so the check needs no accrual.
   * @param params.collateralPrices - Values from `price()` on each
   *   `marketData.params.collateralParams[i].oracle`, indexed like `positionData.collateral` and
   *   scaled by `ORACLE_PRICE_SCALE`. A price is required for every held or supplied collateral
   *   index, because debt after a borrow is always positive.
   * @param params.collateralSupplies - Collateral index and assets per supply; must not be empty.
   * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
   * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
   *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of
   *   the maximum wNative amount this call can pull, but not more. Any wrapped native not pulled
   *   stays in the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still
   *   required for the full pulled amount.
   * @param params.receiver - Optional loan-asset recipient; defaults to `accountAddress`.
   *   Midnight protocol and market token contracts are rejected.
   * @param params.takeableOffers - Lend-side offers returned by the Midnight API.
   * @param params.deadline - Bounded bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the sale
   *   proceeds; on an assets target it is added on top of `target.assets`.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy collateral approvals and `MidnightBundlesV2` authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {InputExceedsMaxError} when a collateral supply amount, per-index sum, target amount,
   *   or offer cap exceeds `uint128`, or when `target.maxUnits` exceeds `uint128` (an SDK cap: the
   *   bundle accepts `uint256`, but a higher ceiling gives no slippage protection), or when
   *   `nativeAmount` exceeds the maximum wNative collateral amount this call can pull.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {EmptyMidnightCollateralSuppliesError} when no collateral supply is provided.
   * @throws {UnknownCollateralIndexError} when a collateral index is not configured.
   * @throws {AccrualPositionUserMismatchError} when `positionData.user` differs from `accountAddress`.
   * @throws {MarketIdMismatchError} when `positionData.marketId` differs from `marketData.id`.
   * @throws {MissingMarketPriceError} when a held collateral index has no supplied price.
   * @throws {BorrowExceedsSafeLtvError} when the post-borrow debt exceeds buffered collateral capacity.
   * @throws {NonPositiveInputError} when a supply amount, the target amount, `maxUnits` or `minSellerAssets` is not positive.
   * @throws {NegativeInputError} when a takeable offer cap, `referralFeePct` or `nativeAmount`
   *   is negative.
   * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
   * @throws {NativeAmountOnNonWNativeAssetError} when no collateral pull uses wNative.
   * @throws {UnboundedMidnightTakeInputError} when `target.units` or
   *   `target.maxUnits` is `maxUint256`.
   * @throws {MidnightZeroReceiverError} when `receiver` is the zero address.
   * @throws {MidnightContractReceiverError} when `receiver` is a Midnight protocol contract or a
   *   market token contract, or when `referralFeeRecipient` is either with a positive referral fee.
   * @throws {ExpiredDeadlineError} when `deadline` has expired.
   * @throws {MidnightTakeDeadlineTooFarError} when `deadline` is more than one hour from now.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @throws {MidnightTakeableOffersNotFillableError} when every takeable offer is expired, not yet
   *   started, self-made, capped below the market fee or otherwise dead, and no credit withdrawal can fill instead,
   *   or when every offer is dropped for an out-of-range tick, a zero price, or a price below the
   *   settlement fee until `deadline` (at or below it on an assets target), even with a credit
   *   withdrawal.
   * @throws {MidnightTakeTargetUnreachableError} when the live offers cannot hold the target, or
   *   its bounds cannot hold at any fill.
   * @example
   * ```ts
   * const output = midnight.supplyCollateralTakeBorrow({
   *   accountAddress: borrower,
   *   marketData,
   *   positionData,
   *   collateralPrices,
   *   collateralSupplies: [{ collateralIndex: 0n, assets: 2_000_000n }],
   *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: Time.timestamp() + 600n,
   * });
   * ```
   */
  supplyCollateralTakeBorrow(
    params: SupplyCollateralTakeBorrowParams,
  ): MidnightActionOutput<MidnightSupplyCollateralTakeBorrowAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    validateTakeDeadlineWindow(params.deadline);
    const market = params.marketData.params;
    const rawParams = {
      chainId: this.chainId,
      market,
      collateralSupplies: params.collateralSupplies,
      nativeAmount: params.nativeAmount,
      target: params.target,
      receiver: params.receiver ?? params.accountAddress,
      takeableOffers: params.takeableOffers,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    };
    let tx = midnightSupplyCollateralTakeBorrow(rawParams);
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
    });
    const postCollateral = Array.from(
      { length: market.collateralParams.length },
      (_, index) => params.positionData.collateral[index] ?? 0n,
    );
    for (const { collateralIndex, assets } of params.collateralSupplies) {
      // Reject unconfigured collateral indexes before updating postCollateral.
      MarketUtils.getCollateralByIndex(market, collateralIndex);
      const index = Number(collateralIndex);
      postCollateral[index] = (postCollateral[index] ?? 0n) + assets;
    }
    const requestedUnits =
      params.target.type === "units"
        ? params.target.units
        : params.target.maxUnits;
    const postDebt = params.positionData.debt + requestedUnits;
    if (postDebt > 0n) {
      const maxSafeDebt = getMidnightMaxSafeDebt({
        market: params.marketData,
        collateral: postCollateral,
        collateralPrices: params.collateralPrices,
      });
      if (postDebt > maxSafeDebt) {
        throw new BorrowExceedsSafeLtvError(
          requestedUnits,
          MathLib.zeroFloorSub(maxSafeDebt, params.positionData.debt),
        );
      }
    }
    const now = Time.timestamp();
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "sell",
      takeableOffers: params.takeableOffers,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
      now,
      deadline: params.deadline,
      referralFeePct: tx.action.args.referralFeePct,
      // Credit is withdrawn first, up to the market's withdrawable liquidity.
      fallbackUnits: MathLib.min(
        params.positionData.credit,
        params.marketData.withdrawable,
      ),
      credit: params.positionData.credit,
      target: params.target,
      increasesDebt: true,
    });
    if (takeableOffers !== params.takeableOffers) {
      tx = midnightSupplyCollateralTakeBorrow({ ...rawParams, takeableOffers });
    }
    // Sum per token so a token supplied at several indices gets one approval.
    const collateralAmounts = new Map<Address, bigint>();
    for (const { collateralIndex, assets } of tx.action.args
      .collateralSupplies) {
      const { token } = MarketUtils.getCollateralByIndex(
        market,
        collateralIndex,
      );
      collateralAmounts.set(
        token,
        (collateralAmounts.get(token) ?? 0n) + assets,
      );
    }

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const approvals = await Promise.all(
          [...collateralAmounts].map(([token, amount]) =>
            getMidnightApprovalRequirements({
              viemClient: this.client.viemClient,
              chainId: this.chainId,
              token,
              owner: params.accountAddress,
              spender: tx.to,
              amount,
            }),
          ),
        );
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          params.accountAddress,
        );
        return [...approvals.flat(), ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares a `MidnightBundlesV2` reduce-only buy that repays `accountAddress`'s debt by taking
   * borrow-side offers, optionally repays the remainder directly, then withdraws collateral.
   *
   * `reduceOnly` is always set, so the buy never opens a lender position.
   *
   * On an assets target, sell offers whose tick is out of range or whose buyer price is zero or
   * above one are dropped from the transaction because one of them would revert the whole bundle.
   *
   * @param params - Borrower, market snapshot, buy target, offers, repay fallback, withdrawals, fee cap, deadline and optional referral fee.
   * @param params.accountAddress - Borrower; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.positionData - Owner-bound position snapshot returned by `getPositionData`. The
   *   `DEFAULT_LLTV_BUFFER` check is only as current as this snapshot and `collateralPrices`: it
   *   does not see transactions mined or prices moved since, so two transactions built from one
   *   snapshot can together end inside the buffer. Midnight still rejects any position above
   *   LLTV onchain. Midnight debt and collateral do not accrue, so the check needs no accrual.
   * @param params.collateralPrices - Values from `price()` on each
   *   `marketData.params.collateralParams[i].oracle`, indexed like `positionData.collateral` and
   *   scaled by `ORACLE_PRICE_SCALE`. An empty array is safe only when
   *   `collateralWithdrawals` is empty or the conservative post-operation debt is zero: a units
   *   `target` covering `positionData.debt`, or an assets target whose `minUnits` covers it.
   * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`; `units: maxUint256` targets the sender's whole debt, capped by `maxBuyerAssets` (must be finite; `units: maxUint256` already selects the whole debt).
   * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
   *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of
   *   the maximum wNative amount this call can pull, but not more. Any wrapped native not pulled
   *   stays in the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still
   *   required for the full pulled amount.
   * @param params.takeableOffers - Borrow-side offers returned by the Midnight API.
   * @param params.repayEnabled - Whether the unfilled remainder is repaid directly to Midnight.
   * @param params.collateralWithdrawals - Optional collateral withdrawals; `maxUint256` assets withdraws the whole balance.
   * @param params.collateralReceiver - Optional collateral recipient; defaults to `accountAddress`,
   *   must be non-zero and not a Midnight protocol or market token contract when
   *   `collateralWithdrawals` is non-empty, and is unused otherwise.
   * @param params.maxContinuousFee - Largest market continuous fee accepted, in the unit of the market's
   *   onchain `continuousFee` (`Market.continuousFee`): a WAD-scaled per-second rate, so `317097919n`
   *   is about 1% per year. The take reverts if the market fee is higher. Pass `maxUint256` for no cap.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee paid out of the pulled assets.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy loan-token approval and `MidnightBundlesV2` authorization requirements, and a synchronous transaction builder.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when the target amount, `minUnits`, `maxBuyerAssets` or a
   *   withdrawal amount is not positive.
   * @throws {NegativeInputError} when a takeable offer cap, `maxContinuousFee`, `referralFeePct`
   *   or `nativeAmount` is negative.
   * @throws {InputExceedsMaxError} when a finite target amount, collateral withdrawal amount, or
   *   offer cap exceeds `uint128`; when `target.maxBuyerAssets` exceeds `uint128` (an SDK cap: the
   *   bundle accepts `uint256`, but a higher ceiling gives no slippage protection); when
   *   `maxContinuousFee` exceeds `uint256`; or when `nativeAmount` exceeds the maximum wNative
   *   amount this call can pull, including zero for a withdraw-only call.
   * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
   * @throws {NativeAmountOnNonWNativeAssetError} when `marketData.params.loanToken` is not wNative.
   * @throws {UnknownCollateralIndexError} when a withdrawal targets a collateral index not configured on the market.
   * @throws {AccrualPositionUserMismatchError} when `positionData.user` differs from `accountAddress`.
   * @throws {MarketIdMismatchError} when `positionData.marketId` differs from `marketData.id`.
   * @throws {WithdrawExceedsCollateralError} when a withdrawal exceeds the position's collateral.
   * @throws {MissingMarketPriceError} when a held collateral index has no supplied price.
   * @throws {WithdrawMakesPositionUnhealthyError} when the withdrawal exceeds buffered collateral capacity.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ExpiredDeadlineError} when `deadline` has expired.
   * @throws {MidnightTakeDeadlineTooFarError} when `deadline` is more than one hour from now.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {MidnightReferralFeePctExceededError} when `referralFeePct` exceeds 10% (`WAD / 10n`).
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @throws {MidnightContinuousFeeAboveMaxError} when `maxContinuousFee` is below the market's
   *   current continuous fee.
   * @throws {MidnightRepayExceedsDebtError} when a reduce-only repay target exceeds the position's debt.
   * @throws {MidnightTakeableOffersNotFillableError} when every takeable offer is expired, not yet
   *   started, self-made, capped below the market fee or otherwise dead, and `repayEnabled` is false,
   *   or when every offer on an assets target has an out-of-range tick or a zero or above-par buyer
   *   price, even with `repayEnabled`.
   * @throws {MidnightTakeTargetUnreachableError} when the live offers cannot hold the target, or
   *   its bounds cannot hold at any fill, or a buy assets target's `minUnits` exceeds the live
   *   offers plus the fallback.
   * @throws {MidnightZeroReceiverError} when collateral is withdrawn to the zero address. Thrown
   *   during this method call, before the lazy output is returned.
   * @throws {MidnightContractReceiverError} when `collateralReceiver` is a Midnight protocol
   *   contract or a market token contract, or when `referralFeeRecipient` is either with a
   *   positive referral fee.
   * @example
   * ```ts
   * const output = midnight.takeRepayWithdrawCollateral({
   *   accountAddress: borrower,
   *   marketData,
   *   positionData,
   *   collateralPrices,
   *   target: { type: "units", units: 1_000_000n, maxBuyerAssets: 990_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   repayEnabled: true,
   *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
   *   maxContinuousFee: maxUint256,
   *   deadline: Time.timestamp() + 600n,
   * });
   * ```
   */
  takeRepayWithdrawCollateral(
    params: TakeRepayWithdrawCollateralParams,
  ): MidnightActionOutput<MidnightTakeRepayWithdrawCollateralAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    validateTakeDeadlineWindow(params.deadline);
    const market = params.marketData.params;
    const rawParams = {
      chainId: this.chainId,
      market,
      target: params.target,
      nativeAmount: params.nativeAmount,
      takeableOffers: params.takeableOffers,
      repayEnabled: params.repayEnabled,
      collateralWithdrawals: params.collateralWithdrawals ?? [],
      collateralReceiver: params.collateralReceiver ?? params.accountAddress,
      maxContinuousFee: params.maxContinuousFee,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    };
    let tx = midnightTakeRepayWithdrawCollateral(rawParams);
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
    });
    const collateralWithdrawals = params.collateralWithdrawals ?? [];
    const postCollateral = Array.from(
      { length: market.collateralParams.length },
      (_, index) => params.positionData.collateral[index] ?? 0n,
    );
    let withdrawAmount = 0n;
    for (const withdrawal of collateralWithdrawals) {
      // Reject unconfigured collateral indexes before updating postCollateral.
      MarketUtils.getCollateralByIndex(market, withdrawal.collateralIndex);
      const index = Number(withdrawal.collateralIndex);
      const available = postCollateral[index] ?? 0n;
      const amount =
        withdrawal.assets === maxUint256 ? available : withdrawal.assets;
      if (amount > available) {
        throw new WithdrawExceedsCollateralError({
          withdrawAmount: amount,
          available,
          market: params.marketData.id,
        });
      }
      postCollateral[index] = available - amount;
      withdrawAmount += amount;
    }
    const debtReduction =
      params.target.type === "units"
        ? params.target.units
        : params.target.minUnits;
    const postDebt =
      debtReduction >= params.positionData.debt
        ? 0n
        : params.positionData.debt - debtReduction;
    if (collateralWithdrawals.length > 0 && postDebt > 0n) {
      const maxSafeDebt = getMidnightMaxSafeDebt({
        market: params.marketData,
        collateral: postCollateral,
        collateralPrices: params.collateralPrices,
      });
      if (postDebt > maxSafeDebt) {
        throw new WithdrawMakesPositionUnhealthyError({
          withdrawAmount,
          borrowAssets: postDebt,
          maxSafeBorrow: maxSafeDebt,
        });
      }
    }
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "buy",
      takeableOffers: params.takeableOffers,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
      now: Time.timestamp(),
      deadline: params.deadline,
      referralFeePct: tx.action.args.referralFeePct,
      // With repayEnabled the bundle repays the unfilled debt directly, at par.
      fallbackUnits: params.repayEnabled ? params.positionData.debt : 0n,
      target: params.target,
      maxContinuousFee: params.maxContinuousFee,
      debt: params.positionData.debt,
    });
    if (takeableOffers !== params.takeableOffers) {
      tx = midnightTakeRepayWithdrawCollateral({
        ...rawParams,
        takeableOffers,
      });
    }
    const pulledAssets =
      params.target.type === "assets"
        ? params.target.assets
        : params.target.maxBuyerAssets;

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const approvals = await getMidnightApprovalRequirements({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          token: market.loanToken,
          owner: params.accountAddress,
          spender: tx.to,
          amount: pulledAssets,
        });
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          params.accountAddress,
        );
        return [...approvals, ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares a direct collateral supply using a caller-provided market snapshot.
   *
   * @param params - Supplier, market snapshot, collateral amount, reserve, and optional collateral index.
   * @param params.accountAddress - Account receiving the supplied collateral position. It must send
   *   the transaction: Midnight pulls the collateral from `msg.sender` and only lets the position owner
   *   or its operators supply for it, and the approval requirements are resolved for this account.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.collateralAssets - Collateral assets supplied in this transaction.
   * @param params.reservedCollateralAssets - Existing collateral reserved by other open maker groups.
   *   Only raises the approval requirement so those groups keep their allowance; the transaction
   *   transfers only `collateralAssets`.
   * @param params.collateralIndex - Optional collateral index; defaults to `0n`. Indexes follow the
   *   market's collateral parameters, which Midnight sorts by token address, not the order they were
   *   listed in when the market was built; check `marketData.getCollateralByIndex(index).token`.
   * @returns Lazy token-approval requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when `collateralAssets` is non-positive.
   * @throws {InputExceedsMaxError} when `collateralAssets` exceeds `uint128`.
   * @throws {NegativeInputError} when `reservedCollateralAssets` is negative.
   * @throws {MidnightZeroOnBehalfError} from `getRequirements()` and `buildTx()` when `accountAddress`
   *   is the zero address.
   * @throws {UnknownCollateralIndexError} when the selected collateral is not configured.
   * @example
   * ```ts
   * const output = midnight.supplyCollateral({
   *   accountAddress: borrower,
   *   marketData,
   *   collateralAssets: 2_000_000n,
   * });
   * ```
   */
  supplyCollateral(
    params: SupplyCollateralParams,
  ): MidnightActionOutput<MidnightSupplyCollateralAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject a malformed account here; the builder rejects the zero account.
    validateMidnightAddress("accountAddress", params.accountAddress);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    validateMidnightUint128Field("collateralAssets", params.collateralAssets);
    assertNonNegativeAmount(
      "reservedCollateralAssets",
      params.reservedCollateralAssets ?? 0n,
    );

    const market = params.marketData;
    const collateralIndex = params.collateralIndex ?? 0n;
    const collateral = market.getCollateralByIndex(collateralIndex);
    const midnight = getChainAddress(this.chainId, "midnight");

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        // Match buildTx(): the requirement helper would report a zero owner with another class.
        if (isAddressEqual(params.accountAddress, zeroAddress)) {
          throw new MidnightZeroOnBehalfError("onBehalf");
        }
        return await getMidnightApprovalRequirements({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          token: collateral.token,
          owner: params.accountAddress,
          spender: midnight,
          amount:
            params.collateralAssets + (params.reservedCollateralAssets ?? 0n),
        });
      },
      buildTx: () =>
        midnightSupplyCollateral({
          chainId: this.chainId,
          market: market.params,
          collateralIndex,
          assets: params.collateralAssets,
          onBehalf: params.accountAddress,
          metadata: this.client.options.metadata,
        }),
    };
  }

  /**
   * Prepares an atomic lend-offer publication or repost through `MidnightBundlesV2`.
   *
   * A partially consumed offer group remains publishable with its shared remaining cap reduced.
   * One transaction cancels `cancellations` under their consumption ceilings, activates the
   * PriceRatifierV1 or RateRatifierV1 root, and publishes its payload. Pass no cancellations
   * for a new publication. Calls the Midnight mempool validation API while preparing the tree;
   * `validation: false` skips that call.
   *
   * @param params - Maker, lend-side offers, loan reserve, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @param params.loanToken - Loan token shared by every offer market.
   * @param params.loanAssets - New loan reserve assigned to the published groups.
   * @param params.reservedLoanAssets - Existing loan assets reserved by other open groups, excluding groups in `cancellations`.
   * @returns Prepared group metadata, lazy approval/authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId` during `getOffersData()` or `getRequirements`, another chain than this entity's.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {InvalidMidnightOfferGroupError} when a priceV1/rateV1 `Tree.create` request has explicit groups that break `OfferUtils.validateOfferGroup` rules.
   * @throws {MidnightOfferReduceOnlyError} when an offer is reduce-only.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {NonPositiveInputError} when `loanAssets` is non-positive.
   * @throws {NegativeInputError} when `reservedLoanAssets` or a `maxConsumed` ceiling is negative.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferContinuousFeeCapError} when an offer has a nonzero continuous fee cap.
   * @throws {MidnightOfferSellerReceiverMismatchError} when a sell offer routes proceeds to another address.
   * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
   * @throws {MidnightOfferCallbackNotSupportedError} when an offer has a nonzero callback.
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer uses another loan token.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {MidnightOfferExpiredError} when an offer expiry is not later than the pinned block timestamp.
   * @throws {MidnightOfferExpiryAfterMaturityError} when an offer expiry exceeds its market maturity.
   * @throws {MidnightOfferGroupConsumedError} when an offer group has no remaining capacity.
   * @throws {MidnightOfferTickSpacingError} when an offer tick is not accessible in its market.
   * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds an offer's cap.
   * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 offer cannot satisfy its bound.
   * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the offer's expiry.
   * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market uses a disabled LLTV.
   * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market uses a disabled liquidation cursor.
   * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
   * @throws {viem.BaseError} when a pinned block, multicall, or oracle-code read fails.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * const output = await midnight.makeLend({
   *   accountAddress: maker,
   *   offers: { type: "rateV1", entries: [{ offer, rate }] },
   *   cancellations: [{ group: previousGroup, maxConsumed: 0n }],
   *   deadline: maxUint256,
   *   loanToken,
   *   loanAssets: 1_000_000n,
   * });
   * ```
   */
  async makeLend(params: MakeLendParams): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);
    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    rejectReduceOnlyOffers(tree.offers);
    return this.prepareLendOffers({ ...params, offers: tree });
  }

  /**
   * Prepares an atomic borrow-offer publication or repost through `MidnightBundlesV2`.
   *
   * One transaction cancels `cancellations` under their consumption ceilings, activates the
   * PriceRatifierV1 or RateRatifierV1 root, and publishes its payload. Pass no cancellations for
   * a new publication. Calls the Midnight mempool validation API while preparing the tree;
   * `validation: false` skips that call.
   *
   * @param params - Maker, borrow-side offers, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @returns Prepared group metadata, lazy authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId` during `getOffersData()` or `getRequirements`, another chain than this entity's.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {InvalidMidnightOfferGroupError} when a priceV1/rateV1 `Tree.create` request has explicit groups that break `OfferUtils.validateOfferGroup` rules.
   * @throws {MidnightOfferReduceOnlyError} when an offer is reduce-only.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferContinuousFeeCapError} when an offer has a nonzero continuous fee cap.
   * @throws {MidnightOfferSellerReceiverMismatchError} when a sell offer routes proceeds to another address.
   * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
   * @throws {MidnightOfferCallbackNotSupportedError} when an offer has a nonzero callback.
   * @throws {MidnightOfferExpiredError} when an offer expiry is not later than the pinned block timestamp.
   * @throws {MidnightOfferExpiryAfterMaturityError} when an offer expiry exceeds its market maturity.
   * @throws {MidnightOfferGroupConsumedError} when an offer group has no remaining capacity.
   * @throws {MidnightOfferTickSpacingError} when an offer tick is not accessible in its market.
   * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds an offer's cap.
   * @throws {MidnightOfferZeroPriceSellError} when a sell offer has a zero tick.
   * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 offer cannot satisfy its bound.
   * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the offer's expiry.
   * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market uses a disabled LLTV.
   * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market uses a disabled liquidation cursor.
   * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
   * @throws {viem.BaseError} when a pinned block, multicall, or oracle-code read fails.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * const output = await midnight.makeBorrow({
   *   accountAddress: maker,
   *   offers: { type: "rateV1", entries: [{ offer, rate }] },
   *   deadline: maxUint256,
   * });
   * ```
   */
  async makeBorrow(params: MakeOffersParams): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);
    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    rejectReduceOnlyOffers(tree.offers);
    return this.prepareBorrowOffers({ ...params, offers: tree });
  }

  /**
   * Prepares lend-side offers for publication.
   */
  private async prepareLendOffers(
    params: MakeLendParams,
  ): Promise<MakeOffersOutput> {
    // Reject a malformed address before viem compares offer markets with it.
    validateMidnightAddress("loanToken", params.loanToken);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount(
      "reservedLoanAssets",
      params.reservedLoanAssets ?? 0n,
    );

    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    validateOfferSides(tree.offers, true);
    validateMidnightMakerOfferCallbacks(tree.offers);
    const data = await getOffersDataInternal({
      client: this.client,
      chainId: this.chainId,
      params: { ...params, offers: tree },
    });
    data.tree.offers.forEach((offer, index) => {
      const market = offerMarketParams(offer);
      if (!isAddressEqual(market.loanToken, params.loanToken)) {
        throw new MidnightOfferMarketLoanTokenMismatchError({
          index,
          expectedLoanToken: params.loanToken,
          actualLoanToken: market.loanToken,
        });
      }
    });
    const tx = midnightCancelAndMake({
      chainId: this.chainId,
      cancellations: params.cancellations ?? [],
      deadline: params.deadline,
      metadata: this.client.options.metadata,
      publication: {
        ratifier: data.ratifier,
        root: data.tree.root,
        groups: data.groups,
        payload: data.payload,
      },
    });
    const midnight = getChainAddress(this.chainId, "midnight");

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const approvals = await getMidnightApprovalRequirements({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          token: params.loanToken,
          owner: data.accountAddress,
          spender: midnight,
          amount: params.loanAssets + (params.reservedLoanAssets ?? 0n),
        });
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          data.accountAddress,
        );
        return [...approvals, ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares an atomic Blue-funded lend-offer publication or repost through `MidnightBundlesV2`.
   *
   * One transaction cancels `cancellations` under their consumption ceilings, pulls `assetsToPark`
   * from the maker and supplies them to `blueMarket` on Morpho Blue for the maker's
   * `BlueBuyCallback` (created if missing), activates the PriceRatifierV1 or RateRatifierV1 root,
   * and publishes its payload. When an offer is taken, the callback withdraws the bought assets
   * from Blue and pays Midnight, so the maker needs no loan-token approval to Midnight.
   *
   * Every offer must set `callback` to the maker's derived `BlueBuyCallback` and `callbackData`
   * to `abi.encode(blueMarket)`. The contract does not check supply share-price slippage, so
   * `blueMarket` must be protected against supply-share-price inflation; this method rejects
   * Blue markets with no supply shares and parked amounts that would mint zero shares. Calls the
   * Midnight mempool validation API while preparing the tree; `validation: false` skips that call.
   * Computes the callback's CREATE2 address from the chain's
   * `midnightBlueBuyCallbackFactory`, `accountAddress` and `callbackSalt`, and fetches the Morpho Blue market,
   * accruing interest to the current time before previewing parked shares (markets whose
   * IRM the SDK cannot accrue are previewed on their last-updated state).
   * The caller is responsible for trusting the Blue market's oracle and IRM. If Blue liquidity is
   * drained, callback offers cannot fill until liquidity returns. `assetsToPark` may underfund the
   * offers; top-ups are allowed.
   *
   * @param params - Maker, lend-side offers, Blue market, parked assets, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @param params.blueMarket - Morpho Blue market the parked assets are supplied to.
   * @param params.assetsToPark - Loan assets supplied to `blueMarket` for the maker's callback.
   * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
   *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of
   *   the maximum wNative amount this call can pull, but not more. Any wrapped native not pulled
   *   stays in the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still
   *   required for the full pulled amount.
   * @param params.callbackSalt - Salt selecting the maker's callback; must be exactly 32 bytes of hex.
   * @returns Prepared group metadata, lazy approval/authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId`,
   *   another chain than `this.chainId`.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when the offer tree or `blueMarket` cannot be ABI-encoded.
   * @throws {viem.BaseError} when the `eth_chainId` request, a Blue market RPC read, or a
   *   requirement RPC read fails.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2`, `midnightBlueBuyCallbackFactory`, `midnight`, `blue` or V1 ratifier deployment.
   * @throws {NonPositiveInputError} when `assetsToPark` is non-positive.
   * @throws {InputExceedsMaxError} when `assetsToPark` exceeds `uint128`.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling or `nativeAmount` is negative.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128`, `deadline` exceeds
   *   `uint256`, or `nativeAmount` exceeds `assetsToPark` when `blueMarket.loanToken` is wNative.
   * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
   * @throws {NativeAmountOnNonWNativeAssetError} when `blueMarket.loanToken` is not wNative.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {InvalidMidnightOfferGroupError} when a priceV1/rateV1 `Tree.create` request has explicit groups that break `OfferUtils.validateOfferGroup` rules.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferContinuousFeeCapError} when an offer has a nonzero continuous fee cap.
   * @throws {MidnightOfferSellerReceiverMismatchError} when a sell offer routes proceeds to another address.
   * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
   * @throws {MidnightOfferReduceOnlyError} when an offer is reduce-only.
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer's loan token differs from `blueMarket`'s.
   * @throws {MidnightOfferCallbackMismatchError} when an offer does not use the maker's derived callback.
   * @throws {MidnightOfferCallbackDataMismatchError} when an offer's callback data is not `abi.encode(blueMarket)`.
   * @throws {MidnightOfferExpiredError} when an offer expiry is not later than the pinned block timestamp.
   * @throws {MidnightOfferExpiryAfterMaturityError} when an offer expiry exceeds its market maturity.
   * @throws {MidnightOfferGroupConsumedError} when an offer group has no remaining capacity.
   * @throws {MidnightOfferTickSpacingError} when an offer tick is not accessible in its market.
   * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds an offer's cap.
   * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 offer cannot satisfy its bound.
   * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the offer's expiry.
   * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market uses a disabled LLTV.
   * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market uses a disabled liquidation cursor.
   * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
   * @throws {viem.BaseError} when a pinned block, multicall, or oracle-code read fails.
   * @throws {EmptyBlueParkingMarketError} when `blueMarket` has no supply shares.
   * @throws {ZeroBlueParkingSharesError} when `assetsToPark` would mint no supply shares at the current share price.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {InvalidMidnightHexInputError} when a cancellation group or `callbackSalt` is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * const callback = getMidnightBlueBuyCallbackAddress({ chainId, owner: maker, salt: callbackSalt });
   * const callbackData = getMidnightBlueBuyCallbackData(blueMarket);
   * const output = await midnight.supplyBlueMakeLend({
   *   accountAddress: maker,
   *   offers: {
   *     type: "rateV1",
   *     entries: [{ offer: { ...offer, callback, callbackData }, rate }],
   *   },
   *   deadline: maxUint256,
   *   blueMarket,
   *   assetsToPark: 1_000_000n,
   *   callbackSalt,
   * });
   * ```
   */
  async supplyBlueMakeLend(
    params: SupplyBlueMakeLendParams,
  ): Promise<MakeOffersOutput> {
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    // Reject wrong-sized salts before callback derivation pads them or any read occurs.
    validateMidnightBytes32("callbackSalt", params.callbackSalt);
    assertPositiveAmount("assetsToPark", params.assetsToPark);
    validateMidnightUint128Field("assetsToPark", params.assetsToPark);
    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    validateOfferSides(tree.offers, true);
    rejectReduceOnlyOffers(tree.offers);
    await validateClientChainId(this.client.viemClient, this.chainId);
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);
    const { callbackSalt } = params;
    // Encode the whole Blue market first so a malformed field fails typed, before the RPC read.
    const callbackData = wrapMidnightEncoding("blueMarket", () =>
      getMidnightBlueBuyCallbackData(params.blueMarket),
    );
    const blueMarketId = BlueMarketUtils.getMarketId(params.blueMarket);
    const callback = getMidnightBlueBuyCallbackAddress({
      chainId: this.chainId,
      owner: params.accountAddress,
      salt: callbackSalt,
    });
    const [data, fetched] = await Promise.all([
      getOffersDataInternal({
        client: this.client,
        chainId: this.chainId,
        params: { ...params, offers: tree },
      }),
      fetchBlueMarket(blueMarketId, this.client.viemClient, {
        deployless: this.client.options.supportDeployless,
      }),
    ]);
    const market =
      _try(
        () =>
          fetched.accrueInterest(
            MathLib.max(Time.timestamp(), fetched.lastUpdate),
          ),
        UnsupportedMarketIrmError,
      ) ?? fetched;
    if (market.totalSupplyShares === 0n) {
      throw new EmptyBlueParkingMarketError({ marketId: blueMarketId });
    }
    if (market.toSupplyShares(params.assetsToPark, "Down") === 0n) {
      throw new ZeroBlueParkingSharesError({
        marketId: blueMarketId,
        assets: params.assetsToPark,
      });
    }
    data.tree.offers.forEach((offer, index) => {
      const offerMarket = offerMarketParams(offer);
      if (!isAddressEqual(offerMarket.loanToken, params.blueMarket.loanToken)) {
        throw new MidnightOfferMarketLoanTokenMismatchError({
          index,
          expectedLoanToken: params.blueMarket.loanToken,
          actualLoanToken: offerMarket.loanToken,
        });
      }
      if (!isAddressEqual(offer.callback, callback)) {
        throw new MidnightOfferCallbackMismatchError({
          index,
          expectedCallback: callback,
          actualCallback: offer.callback,
        });
      }
      if (offer.callbackData.toLowerCase() !== callbackData.toLowerCase()) {
        throw new MidnightOfferCallbackDataMismatchError({
          index,
          expectedCallbackData: callbackData,
          actualCallbackData: offer.callbackData,
        });
      }
    });
    const tx = midnightCancelAndMake({
      chainId: this.chainId,
      publication: {
        ratifier: data.ratifier,
        root: data.tree.root,
        groups: data.groups,
        payload: data.payload,
        blueSupply: {
          market: params.blueMarket,
          assets: params.assetsToPark,
          callbackSalt,
        },
      },
      nativeAmount: params.nativeAmount,
      cancellations: params.cancellations ?? [],
      deadline: params.deadline,
      metadata: this.client.options.metadata,
    });

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const approvals = await getMidnightApprovalRequirements({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          token: params.blueMarket.loanToken,
          owner: data.accountAddress,
          spender: getChainAddress(this.chainId, "midnightBundlesV2"),
          amount: params.assetsToPark,
        });
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          data.accountAddress,
        );
        return [...approvals, ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares borrow-side offers for publication.
   */
  private async prepareBorrowOffers(
    params: MakeOffersParams,
  ): Promise<MakeOffersOutput> {
    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    validateOfferSides(tree.offers, false);
    validateMidnightMakerOfferCallbacks(tree.offers);
    const data = await getOffersDataInternal({
      client: this.client,
      chainId: this.chainId,
      params: { ...params, offers: tree },
    });
    const tx = midnightCancelAndMake({
      chainId: this.chainId,
      cancellations: params.cancellations ?? [],
      deadline: params.deadline,
      metadata: this.client.options.metadata,
      publication: {
        ratifier: data.ratifier,
        root: data.tree.root,
        groups: data.groups,
        payload: data.payload,
      },
    });

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async () =>
        this.getBundlesV2AuthorizationRequirements(data.accountAddress),
      buildTx: () => tx,
    };
  }

  /**
   * Publishes reduce-only sell offers for a lend limit exit through MidnightBundlesV2.
   *
   * Shares the borrow-side publication and requirement handling of {@link MorphoMidnight.makeBorrow}.
   * No tokens are pulled during publication and no token approval is required.
   * Execution waits for a taker; publication does not close the position or withdraw collateral.
   * A partially consumed offer group remains publishable with its shared remaining cap reduced.
   * Every offer must already have `buy = false` and `reduceOnly = true`.
   * The supplied tree, group caps and prices are preserved; no separate root signature is needed.
   *
   * @param params - Maker, reduce-only offers, optional cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @returns Prepared root and groups, lazy requirements, and a synchronous publication builder.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId` during `getOffersData()` or `getRequirements`, another chain than this entity's.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {InvalidMidnightOfferGroupError} when a priceV1/rateV1 `Tree.create` request has explicit groups that break `OfferUtils.validateOfferGroup` rules.
   * @throws {MidnightOfferSideMismatchError} when an offer is not a sell offer (`buy = false`).
   * @throws {MidnightOfferNotReduceOnlyError} when any offer can increase a position.
   * @throws {MidnightOfferCallbackNotSupportedError} when an offer has a nonzero callback.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferContinuousFeeCapError} when an offer has a nonzero continuous fee cap.
   * @throws {MidnightOfferSellerReceiverMismatchError} when a sell offer routes proceeds to another address.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {UnknownAddressError} when the chain has no V1 ratifier or `midnightBundlesV2` deployment.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferExpiredError} when an offer expiry is not later than the pinned block timestamp.
   * @throws {MidnightOfferExpiryAfterMaturityError} when an offer expiry exceeds its market maturity.
   * @throws {MidnightOfferGroupConsumedError} when an offer group has no remaining capacity.
   * @throws {MidnightOfferTickSpacingError} when an offer tick is not accessible in its market.
   * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds an offer's cap.
   * @throws {MidnightOfferZeroPriceSellError} when a sell offer has a zero tick.
   * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 offer cannot satisfy its bound.
   * @throws {MidnightOfferNoCreditError} when a reduce-only sell is submitted without maker credit.
   * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the offer's expiry.
   * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market uses a disabled LLTV.
   * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market uses a disabled liquidation cursor.
   * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
   * @throws {viem.BaseError} when a pinned block, multicall, or oracle-code read fails.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256` or a `maxConsumed` ceiling exceeds `uint128`.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * const output = await midnight.makeWithdraw({
   *   accountAddress: maker,
   *   offers: { type: "priceV1", entries: [{ offer: reduceOnlySellOffer }] },
   *   deadline: maxUint256,
   * });
   * const requirements = await output.getRequirements();
   * const tx = output.buildTx();
   * ```
   */
  async makeWithdraw(params: MakeOffersParams): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);
    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    // Reject the wrong exit intent before calling the mempool validation API.
    validateOfferSides(tree.offers, false);
    for (const [index, offer] of tree.offers.entries()) {
      if (!offer.reduceOnly)
        throw new MidnightOfferNotReduceOnlyError({ index });
    }
    return this.prepareBorrowOffers({ ...params, offers: tree });
  }

  /**
   * Publishes reduce-only buy offers for a borrow limit exit through MidnightBundlesV2.
   *
   * Shares the lend-side publication and requirement handling of {@link MorphoMidnight.makeLend}.
   * Loan assets are pulled by Midnight when the offers fill, not during publication.
   * The loan reserve uses the same approval sizing as `makeLend`.
   * A partially consumed offer group remains publishable with its shared remaining cap reduced.
   * No repay offer can be live after market maturity; late borrowers should repay directly with
   * {@link MorphoMidnight.repayWithdrawCollateral}.
   * Execution waits for a taker; publication does not close the position or withdraw collateral.
   * Every offer must already have `buy = true` and `reduceOnly = true`.
   * The supplied tree, group caps and prices are preserved; no separate root signature is needed.
   *
   * @param params - Maker, reduce-only offers, optional cancellations, loan reserve, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @param params.loanToken - Loan token shared by every offer market.
   * @param params.loanAssets - New loan reserve assigned to the published groups.
   * @param params.reservedLoanAssets - Existing loan assets reserved by other open groups.
   * @returns Prepared root and groups, lazy requirements, and a synchronous publication builder.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId` during `getOffersData()` or `getRequirements`, another chain than this entity's.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {InvalidMidnightOfferGroupError} when a priceV1/rateV1 `Tree.create` request has explicit groups that break `OfferUtils.validateOfferGroup` rules.
   * @throws {MidnightOfferSideMismatchError} when an offer is not a buy offer (`buy = true`).
   * @throws {MidnightOfferNotReduceOnlyError} when any offer can increase a position.
   * @throws {MidnightOfferCallbackNotSupportedError} when an offer has a nonzero callback.
   * @throws {NonPositiveInputError} when `loanAssets` is not positive.
   * @throws {NegativeInputError} when `reservedLoanAssets` or a `maxConsumed` ceiling is negative.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferContinuousFeeCapError} when an offer has a nonzero continuous fee cap.
   * @throws {MidnightOfferSellerReceiverMismatchError} when a sell offer routes proceeds to another address.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {UnknownAddressError} when the chain has no V1 ratifier or `midnightBundlesV2` deployment.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferExpiredError} when an offer expiry is not later than the pinned block timestamp.
   * @throws {MidnightOfferExpiryAfterMaturityError} when an offer expiry exceeds its market maturity.
   * @throws {MidnightOfferGroupConsumedError} when an offer group has no remaining capacity.
   * @throws {MidnightOfferTickSpacingError} when an offer tick is not accessible in its market.
   * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds an offer's cap.
   * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 offer cannot satisfy its bound.
   * @throws {MidnightOfferNoDebtError} when a reduce-only buy is submitted without maker debt.
   * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the offer's expiry.
   * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market uses a disabled LLTV.
   * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market uses a disabled liquidation cursor.
   * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
   * @throws {viem.BaseError} when a pinned block, multicall, or oracle-code read fails.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer uses another loan token.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256` or a `maxConsumed` ceiling exceeds `uint128`.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * const output = await midnight.makeRepay({
   *   accountAddress: maker,
   *   offers: { type: "priceV1", entries: [{ offer: reduceOnlyBuyOffer }] },
   *   loanToken,
   *   loanAssets: 1_000_000n,
   *   deadline: maxUint256,
   * });
   * const requirements = await output.getRequirements();
   * const tx = output.buildTx();
   * ```
   */
  async makeRepay(params: MakeLendParams): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);
    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    // Reject the wrong exit intent before calling the mempool validation API.
    validateOfferSides(tree.offers, true);
    for (const [index, offer] of tree.offers.entries()) {
      if (!offer.reduceOnly)
        throw new MidnightOfferNotReduceOnlyError({ index });
    }
    return this.prepareLendOffers({ ...params, offers: tree });
  }

  /**
   * Prepares an atomic borrow-offer publication or repost through `MidnightBundlesV2`,
   * requiring collateral before activation.
   *
   * One transaction cancels `cancellations` under their consumption ceilings, pulls and supplies
   * required `collateral`, activates the PriceRatifierV1 or RateRatifierV1 root, and publishes its
   * payload. Pass no cancellations for a new publication. Calls the Midnight mempool validation
   * API while preparing the tree; `validation: false` skips that call.
   *
   * @param params - Maker, borrow-side offers, required collateral, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @param params.collateral - Required market and collateral supplies; every offer must target that market.
   * @param params.collateral.market - Midnight market receiving the collateral; every offer must target it.
   * @param params.collateral.supplies - Collateral index and assets per supply; must not be empty.
   * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
   *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of
   *   the maximum wNative amount this call can pull, but not more. Any wrapped native not pulled
   *   stays in the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still
   *   required for the full pulled amount.
   * @returns Prepared group metadata, lazy approval/authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client declares, or its RPC reports via `eth_chainId` during `getOffersData()` or `getRequirements`, another chain than this entity's.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {UnknownCollateralIndexError} when a collateral index is not configured.
   * @throws {NonPositiveInputError} when a collateral supply amount is non-positive.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling or `nativeAmount` is negative.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling, a collateral supply amount or a
   *   per-index sum exceeds `uint128`, `deadline` exceeds `uint256`, or `nativeAmount` exceeds the
   *   maximum wNative collateral amount this call can pull.
   * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
   * @throws {NativeAmountOnNonWNativeAssetError} when no collateral pull uses wNative.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {InvalidMidnightOfferGroupError} when a priceV1/rateV1 `Tree.create` request has explicit groups that break `OfferUtils.validateOfferGroup` rules.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferContinuousFeeCapError} when an offer has a nonzero continuous fee cap.
   * @throws {MidnightOfferSellerReceiverMismatchError} when a sell offer routes proceeds to another address.
   * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
   * @throws {MidnightOfferCallbackNotSupportedError} when an offer has a nonzero callback.
   * @throws {MidnightOfferReduceOnlyError} when an offer is reduce-only.
   * @throws {MidnightOfferExpiredError} when an offer expiry is not later than the pinned block timestamp.
   * @throws {MidnightOfferExpiryAfterMaturityError} when an offer expiry exceeds its market maturity.
   * @throws {MidnightOfferGroupConsumedError} when an offer group has no remaining capacity.
   * @throws {MidnightOfferTickSpacingError} when an offer tick is not accessible in its market.
   * @throws {MidnightOfferContinuousFeeCapBelowMarketFeeError} when the market fee exceeds an offer's cap.
   * @throws {MidnightOfferZeroPriceSellError} when a sell offer has a zero tick.
   * @throws {MidnightOfferRateBoundUnreachableError} when a Rate V1 offer cannot satisfy its bound.
   * @throws {MidnightMarketMaturityTooFarError} when an uncreated market's maturity is more than 100 years after the pinned block timestamp.
   * @throws {MidnightMarketLltvNotEnabledError} when an uncreated market uses a disabled LLTV.
   * @throws {MidnightMarketLiquidationCursorNotEnabledError} when an uncreated market uses a disabled liquidation cursor.
   * @throws {MidnightMarketOracleWithoutCodeError} when an uncreated market's oracle has no code.
   * @throws {viem.BaseError} when a pinned block, multicall, or oracle-code read fails.
   * @throws {MarketIdMismatchError} when an offer targets another market than `collateral.market`, including a `collateral.market` on another chain or Midnight deployment.
   * @throws {EmptyMidnightCollateralSuppliesError} when a collateral market has no collateral supplies.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * const output = await midnight.supplyCollateralMakeBorrow({
   *   accountAddress: maker,
   *   offers: { type: "rateV1", entries: [{ offer, rate }] },
   *   collateral: {
   *     market: marketData.params,
   *     supplies: [{ collateralIndex: 0n, assets: 2_000_000n }],
   *   },
   *   deadline: maxUint256,
   * });
   * ```
   */
  async supplyCollateralMakeBorrow(
    params: SupplyCollateralMakeBorrowParams,
  ): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);
    const market =
      params.collateral.market instanceof MarketParams
        ? params.collateral.market
        : MarketParams.from(params.collateral.market);

    const tree = wrapMidnightEncoding("offers", () => Tree.from(params.offers));
    validateOfferSides(tree.offers, false);
    validateMidnightMakerOfferCallbacks(tree.offers);
    rejectReduceOnlyOffers(tree.offers);
    const data = await getOffersDataInternal({
      client: this.client,
      chainId: this.chainId,
      params: { ...params, offers: tree },
      marketCreationTime: "now",
    });
    const marketId = encodeMidnightMarketId(market);
    for (const offer of data.tree.offers) {
      const offerMarketId = encodeMidnightMarketId(offer.market);
      if (offerMarketId.toLowerCase() !== marketId.toLowerCase()) {
        throw new MarketIdMismatchError(offerMarketId, marketId);
      }
    }

    const tx = midnightCancelAndMake({
      chainId: this.chainId,
      nativeAmount: params.nativeAmount,
      cancellations: params.cancellations ?? [],
      deadline: params.deadline,
      metadata: this.client.options.metadata,
      publication: {
        ratifier: data.ratifier,
        root: data.tree.root,
        groups: data.groups,
        payload: data.payload,
        collateral: {
          market,
          supplies: params.collateral.supplies,
        },
      },
    });
    const midnightBundlesV2 = getChainAddress(
      this.chainId,
      "midnightBundlesV2",
    );
    const collateralAmounts = new Map<Address, bigint>();
    for (const { collateralIndex, assets } of tx.action.args
      .collateralSupplies) {
      const { token } = MarketUtils.getCollateralByIndex(
        market,
        collateralIndex,
      );
      collateralAmounts.set(
        token,
        (collateralAmounts.get(token) ?? 0n) + assets,
      );
    }

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const approvals = await Promise.all(
          [...collateralAmounts].map(([token, amount]) =>
            getMidnightApprovalRequirements({
              viemClient: this.client.viemClient,
              chainId: this.chainId,
              token,
              owner: data.accountAddress,
              spender: midnightBundlesV2,
              amount,
            }),
          ),
        );
        return [
          ...approvals.flat(),
          ...(await this.getBundlesV2AuthorizationRequirements(
            data.accountAddress,
          )),
        ];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares redemption of accrued Midnight credit from a position snapshot.
   *
   * @param params - Position owner, accrued position, optional unit amount, and receiver.
   * @param params.accountAddress - Position owner whose credit is redeemed. It must send the
   *   transaction (or authorize the sender): Midnight reverts `Unauthorized()` otherwise, which
   *   `getRequirements()` cannot detect because it does not know the sender.
   * @param params.positionData - Owner-bound position snapshot returned by `getPositionData`.
   * @param params.receiver - Optional credit receiver; defaults to the position owner.
   *   Midnight protocol and market token contracts are rejected.
   * @param params.units - Optional credit units to redeem; defaults to the position face value.
   *   Credit is checked after applying the realized losses and continuous fees that Midnight
   *   charges before a withdrawal, accrued up to now. Fees keep accruing until maturity, so `units` close to the accrued
   *   credit can still revert when the transaction lands later. The default face value does not
   *   shrink with time, but before maturity on a market with a continuous fee it is not a full
   *   exit: `withdraw` cuts the pending fee in proportion to the units withdrawn, so some credit
   *   is left. Redeem again after maturity to empty the position.
   * @returns No requirements and a synchronous redemption transaction builder.
   * @throws {ChainIdMismatchError} when the position market targets another chain.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {MidnightMarketAddressMismatchError} when the position market targets another Midnight deployment.
   * @throws {MissingAccrualPositionError} when no position snapshot is supplied.
   * @throws {AccrualPositionUserMismatchError} when the position snapshot belongs to another account.
   * @throws {NoMidnightCreditToRedeemError} when the selected unit amount is non-positive.
   * @throws {InputExceedsMaxError} when the selected units exceed `uint128`.
   * @throws {MidnightRedeemExceedsCreditError} when the selected amount exceeds the accrued
   *   position credit.
   * @throws {InvalidMidnightPositionLossFactorError} when the market loss factor is below the
   *   position's `lastLossFactor`, which `getPositionData` snapshots never are.
   * @throws {InvalidMidnightPositionAccrualStateError} when the snapshot's credit, pending fee or
   *   loss factor are inconsistent, which `getPositionData` snapshots never are.
   * @throws {InsufficientMidnightWithdrawableLiquidityError} when market liquidity cannot cover the redemption.
   * @throws {MidnightZeroOnBehalfError} when `accountAddress` is the zero address.
   * @throws {MidnightZeroReceiverError} when `receiver` resolves to the zero address.
   * @throws {MidnightContractReceiverError} when `receiver` is a Midnight protocol contract or a
   *   market token contract.
   * @example
   * ```ts
   * const output = midnight.redeem({
   *   accountAddress: lender,
   *   positionData,
   *   receiver: lender,
   * });
   * ```
   */
  redeem(params: RedeemParams): MidnightActionOutput<MidnightRedeemAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject a malformed account here; the builder rejects the zero account.
    validateMidnightAddress("accountAddress", params.accountAddress);
    if (!params.positionData) {
      throw new MissingAccrualPositionError();
    }
    if (params.positionData.user != null)
      validateMidnightAddress("positionData.user", params.positionData.user);
    if (
      params.positionData.user == null ||
      !isAddressEqual(params.positionData.user, params.accountAddress)
    ) {
      throw new AccrualPositionUserMismatchError(
        params.positionData.user ?? "unbound",
        params.accountAddress,
      );
    }

    const market = params.positionData.market;
    validateMarketData(market, this.chainId);
    // Apply realized losses and continuous fees the way `Midnight._updatePosition` does before a
    // withdrawal; never accrue to before the snapshot's `lastAccrual`.
    const accrued = params.positionData.accrueInterest(
      MathLib.max(Time.timestamp(), params.positionData.lastAccrual),
    );
    const units = params.units ?? accrued.faceValue;
    if (params.units !== undefined && units <= 0n) {
      throw new NonPositiveInputError("units", units);
    }
    if (units <= 0n) throw new NoMidnightCreditToRedeemError(market.id);
    validateMidnightUint128Field("units", units);
    if (accrued.credit < units) {
      throw new MidnightRedeemExceedsCreditError({
        market: market.id,
        units,
        credit: accrued.credit,
      });
    }
    if (market.withdrawable < units) {
      throw new InsufficientMidnightWithdrawableLiquidityError({
        market: market.id,
        units,
        withdrawable: market.withdrawable,
      });
    }

    // Build eagerly so the receiver guard throws on this call like the other flows.
    const tx = midnightRedeem({
      chainId: this.chainId,
      market: market.params,
      units,
      onBehalf: params.accountAddress,
      receiver: params.receiver,
      metadata: this.client.options.metadata,
    });

    return {
      getRequirements: async () => [],
      buildTx: () => tx,
    };
  }

  /**
   * Prepares a direct `MidnightBundlesV2` repayment, collateral withdrawal, or both, for `accountAddress`.
   *
   * @param params - Account, market snapshot, `repay` mode, collateral withdrawals, optional collateral receiver, and deadline.
   * @param params.accountAddress - Position owner and transaction sender.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.positionData - Owner-bound position snapshot returned by `getPositionData`. The
   *   `DEFAULT_LLTV_BUFFER` check is only as current as this snapshot and `collateralPrices`: it
   *   does not see transactions mined or prices moved since, so two transactions built from one
   *   snapshot can together end inside the buffer. Midnight still rejects any position above
   *   LLTV onchain. Midnight debt and collateral do not accrue, so the check needs no accrual.
   * @param params.collateralPrices - Values from `price()` on each
   *   `marketData.params.collateralParams[i].oracle`, indexed like `positionData.collateral` and
   *   scaled by `ORACLE_PRICE_SCALE`. An empty array is safe only when
   *   `collateralWithdrawals` is empty or the conservative post-operation debt is zero: a `full`
   *   repay, or `repay.assets` covering `positionData.debt`.
   * @param params.repay - `{ type: "assets", assets }` (`0n` to only withdraw) or `{ type: "full", maxBuyerAssets }`; a loan-token approval to `MidnightBundlesV2` is required when the allowance is below the pulled amount (unlimited: `maxUint256`, capped per token by `MAX_TOKEN_APPROVALS`), and any unused part is refunded.
   * @param params.nativeAmount - Optional native ETH sent as `value`; the bundle wraps it into the
   *   chain's wNative and transfers it to `msg.sender` before pulling. It may cover part or all of
   *   the maximum wNative amount this call can pull, but not more. Any wrapped native not pulled
   *   stays in the sender's wallet as wNative. The wNative approval to `MidnightBundlesV2` is still
   *   required for the full pulled amount.
   * @param params.collateralWithdrawals - Optional withdrawals; `assets: maxUint256` withdraws the full balance.
   * @param params.collateralReceiver - Optional collateral recipient; defaults to `accountAddress`,
   *   must be non-zero and not a Midnight protocol or market token contract when
   *   `collateralWithdrawals` is non-empty, and is unused otherwise.
   * @param params.deadline - Bundle execution deadline timestamp. Unlike taker builders,
   *   `maxUint256` is accepted because no offers are filled; the pull remains bounded by
   *   `repay.assets` or `repay.maxBuyerAssets`.
   * @returns Lazy loan approval/authorization requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightZeroAccountError} when `accountAddress` is the zero address.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {AccrualPositionUserMismatchError} when `positionData.user` differs from `accountAddress`.
   * @throws {MarketIdMismatchError} when `positionData.marketId` differs from `marketData.id`.
   * @throws {WithdrawExceedsCollateralError} when a withdrawal exceeds the position's collateral.
   * @throws {MissingMarketPriceError} when a held collateral index has no supplied price.
   * @throws {WithdrawMakesPositionUnhealthyError} when the withdrawal exceeds buffered collateral capacity.
   * @throws {NegativeInputError} when `repay.assets` or `nativeAmount` is negative.
   * @throws {NonPositiveInputError} when nothing is repaid or withdrawn, a withdrawal amount is zero, or `repay.maxBuyerAssets` is zero.
   * @throws {InputExceedsMaxError} when `repay.assets` or `repay.maxBuyerAssets` is at least
   *   `maxUint256`, a withdrawal amount or `deadline` exceeds uint256, or `nativeAmount` exceeds
   *   the maximum wNative amount this call can pull, including zero for a withdraw-only call.
   * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
   * @throws {NativeAmountOnNonWNativeAssetError} when `marketData.params.loanToken` is not wNative.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnknownCollateralIndexError} when a withdrawal selects an unconfigured collateral.
   * @throws {MidnightRepayExceedsDebtError} when `repay.assets` exceeds the position's debt.
   * @throws {MidnightTakeTargetUnreachableError} when a full repay's `repay.maxBuyerAssets` is below
   *   the position's debt.
   * @throws {MidnightZeroReceiverError} when collateral is withdrawn to the zero address. Thrown
   *   during this method call, before the lazy output is returned.
   * @throws {MidnightContractReceiverError} when `collateralReceiver` is a Midnight protocol
   *   contract or a market token contract.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * // Close the position: repay all debt, withdraw all collateral.
   * const output = midnight.repayWithdrawCollateral({
   *   accountAddress: borrower,
   *   marketData,
   *   positionData,
   *   collateralPrices,
   *   repay: { type: "full", maxBuyerAssets: 1_010_000n },
   *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
   *   deadline: maxUint256,
   * });
   * ```
   */
  repayWithdrawCollateral(
    params: RepayWithdrawCollateralParams,
  ): MidnightActionOutput<MidnightRepayWithdrawCollateralAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // Reject the zero account before preparing anything for it.
    validateMidnightAccount("accountAddress", params.accountAddress);
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);
    const market = params.marketData.params;
    const tx = midnightRepayWithdrawCollateral({
      chainId: this.chainId,
      market,
      repay: params.repay,
      nativeAmount: params.nativeAmount,
      collateralWithdrawals: params.collateralWithdrawals ?? [],
      collateralReceiver: params.collateralReceiver ?? params.accountAddress,
      deadline: params.deadline,
      metadata: this.client.options.metadata,
    });
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
    });
    const collateralWithdrawals = params.collateralWithdrawals ?? [];
    const postCollateral = Array.from(
      { length: market.collateralParams.length },
      (_, index) => params.positionData.collateral[index] ?? 0n,
    );
    let withdrawAmount = 0n;
    for (const withdrawal of collateralWithdrawals) {
      // Reject unconfigured collateral indexes before updating postCollateral.
      MarketUtils.getCollateralByIndex(market, withdrawal.collateralIndex);
      const index = Number(withdrawal.collateralIndex);
      const available = postCollateral[index] ?? 0n;
      const amount =
        withdrawal.assets === maxUint256 ? available : withdrawal.assets;
      if (amount > available) {
        throw new WithdrawExceedsCollateralError({
          withdrawAmount: amount,
          available,
          market: params.marketData.id,
        });
      }
      postCollateral[index] = available - amount;
      withdrawAmount += amount;
    }
    // The bundle must fill the whole assets target and the direct repay is capped at the debt, so a repay above it reverts `OutOfOffers()`.
    if (
      params.repay.type === "assets" &&
      params.repay.assets > params.positionData.debt
    ) {
      throw new MidnightRepayExceedsDebtError({
        field: "repay.assets",
        value: params.repay.assets,
        debt: params.positionData.debt,
      });
    }
    if (
      params.repay.type === "full" &&
      params.repay.maxBuyerAssets < params.positionData.debt
    ) {
      throw new MidnightTakeTargetUnreachableError({
        field: "repay.maxBuyerAssets",
        value: params.repay.maxBuyerAssets,
        limit: params.positionData.debt,
      });
    }
    const postDebt =
      params.repay.type === "full"
        ? 0n
        : params.positionData.debt > params.repay.assets
          ? params.positionData.debt - params.repay.assets
          : 0n;
    if (collateralWithdrawals.length > 0 && postDebt > 0n) {
      const maxSafeDebt = getMidnightMaxSafeDebt({
        market: params.marketData,
        collateral: postCollateral,
        collateralPrices: params.collateralPrices,
      });
      if (postDebt > maxSafeDebt) {
        throw new WithdrawMakesPositionUnhealthyError({
          withdrawAmount,
          borrowAssets: postDebt,
          maxSafeBorrow: maxSafeDebt,
        });
      }
    }

    const pulledAssets =
      params.repay.type === "assets"
        ? params.repay.assets
        : params.repay.maxBuyerAssets;

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const approvals =
          pulledAssets > 0n
            ? await getMidnightApprovalRequirements({
                viemClient: this.client.viemClient,
                chainId: this.chainId,
                token: market.loanToken,
                owner: params.accountAddress,
                spender: tx.to,
                amount: pulledAssets,
              })
            : [];
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          params.accountAddress,
        );
        return [...approvals, ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares guarded cancellation of several maker offer groups through `MidnightBundlesV2`.
   *
   * The transaction reverts as a whole when any group's consumption exceeds its
   * `maxConsumed` ceiling, so fills landing before execution never leave a partial cancel.
   *
   * @param params - Maker account, groups with consumption ceilings, and deadline.
   * @param params.accountAddress - Maker that must send the transaction. It is used only to check
   *   the maker's Midnight authorization of `MidnightBundlesV2`; the bundle cancels the groups of
   *   `msg.sender`. A transaction sent from another account that has also authorized
   *   `MidnightBundlesV2` does not revert: it cancels that account's groups and leaves the maker's
   *   offers fillable.
   * @param params.cancellations - Offer groups and the largest consumption accepted for each.
   *   To cancel unconditionally, set `maxConsumed` to `maxUint128`; the contract treats
   *   `type(uint128).max` as no limit.
   *   Cancellation is per group: it does not unratify roots or revoke
   *   `MidnightBundlesV2` or ratifier authorization.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @returns Lazy Midnight authorization requirement for `MidnightBundlesV2` and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as an out-of-range integer.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {EmptyMidnightGroupCancellationsError} when no groups are provided.
   * @throws {MidnightInvalidAccountAddressError} when `accountAddress` is malformed or zero.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a group appears more than once.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256` or a `maxConsumed` ceiling exceeds `uint128`.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the local clock (`Time.timestamp()`), including zero or negative values.
   * @example
   * ```ts
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createPublicClient, http, maxUint256, type Address, type Hex } from "viem";
   * import { base } from "viem/chains";
   *
   * declare const maker: Address;
   * declare const group: Hex;
   * const client = createPublicClient({ chain: base, transport: http() }).extend(
   *   morphoViemExtension(),
   * );
   * const midnight = client.morpho.midnight(base.id);
   * const output = midnight.cancelOffers({
   *   accountAddress: maker,
   *   cancellations: [{ group, maxConsumed: 0n }],
   *   deadline: maxUint256,
   * });
   * ```
   */
  cancelOffers(params: {
    readonly accountAddress: Address;
    readonly cancellations: readonly MidnightGroupCancellation[];
    readonly deadline: bigint;
  }): MidnightActionOutput<MidnightCancelAndMakeAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const { accountAddress } = params;
    if (
      !isAddress(accountAddress) ||
      isAddressEqual(accountAddress, zeroAddress)
    ) {
      throw new MidnightInvalidAccountAddressError(accountAddress);
    }
    // Fails before any API read or build when the deadline has already passed.
    validateMidnightDeadline(params.deadline);

    const tx = midnightCancelAndMake({
      chainId: this.chainId,
      cancellations: params.cancellations,
      deadline: params.deadline,
      metadata: this.client.options.metadata,
    });

    return {
      getRequirements: () =>
        this.getBundlesV2AuthorizationRequirements(accountAddress),
      buildTx: () => tx,
    };
  }

  private async getBundlesV2AuthorizationRequirements(
    owner: Address,
  ): Promise<readonly ActionRequirement[]> {
    const authorization = await getMidnightAuthorizationRequirement({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      owner,
      authorized: getChainAddress(this.chainId, "midnightBundlesV2"),
    });
    return authorization ? [authorization] : [];
  }
}
