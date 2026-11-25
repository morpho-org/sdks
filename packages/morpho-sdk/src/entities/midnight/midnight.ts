import { MathLib } from "@morpho-org/blue-sdk";
import {
  type AccrualPosition,
  fetchAccrualPosition,
  fetchMarket,
  type Market,
  MarketUtils,
  type MidnightFetchParams,
} from "@morpho-org/midnight-sdk";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type Address, type Hex, maxUint256 } from "viem";
import { getBlock } from "viem/actions";
import { encodeMidnightCancelOffers } from "../../actions/midnight/cancelOffers.js";
import {
  encodeMidnightCancelAndMake,
  encodeMidnightRedeem,
  encodeMidnightRepayWithdrawCollateral,
  encodeMidnightSupplyCollateral,
  encodeMidnightSupplyCollateralBatch,
  encodeMidnightSupplyCollateralTakeBorrow,
  encodeMidnightTakeBorrow,
  encodeMidnightTakeLend,
  encodeMidnightTakeRepayWithdrawCollateral,
  encodeMidnightTakeWithdraw,
  encodeMidnightWithdrawCollateral,
  encodeMidnightWithdrawCollateralBatch,
} from "../../actions/midnight/encode.js";
import { prepareMidnightSupplyCollateralWithNative } from "../../actions/midnight/supplyCollateralWithNative.js";
import {
  type ChainCheck,
  createChainCheck,
} from "../../actions/requirements/chainCheck.js";
import {
  getParsedMidnightApprovalRequirements,
  parseMidnightApprovalRequirements,
} from "../../actions/requirements/midnight/getMidnightApprovalRequirements.js";
import {
  getParsedMidnightAuthorizationRequirement,
  parseMidnightAuthorizationRequirement,
} from "../../actions/requirements/midnight/getMidnightAuthorizationRequirement.js";
import {
  getMidnightMaxSafeDebt,
  validateChainId,
} from "../../helpers/index.js";
import { resolveTransactionMetadata } from "../../helpers/metadata.js";
import { parseMidnightNativeCollateralAmount } from "../../helpers/parseMidnight.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightTakeFeasibility } from "../../helpers/validateMidnightTakeFeasibility.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  type ActionRequirement,
  BorrowExceedsSafeLtvError,
  InvalidBigIntInputError,
  type MidnightCancelOffersAction,
  type MidnightRedeemAction,
  MidnightRepayExceedsDebtError,
  type MidnightRepayWithdrawCollateralAction,
  type MidnightSupplyCollateralAction,
  type MidnightSupplyCollateralBatchAction,
  type MidnightSupplyCollateralTakeBorrowAction,
  type MidnightSupplyCollateralWithNativeAction,
  type MidnightTakeBorrowAction,
  type MidnightTakeLendAction,
  type MidnightTakeRepayWithdrawCollateralAction,
  MidnightTakeTargetUnreachableError,
  type MidnightTakeWithdrawAction,
  type MidnightWithdrawCollateralAction,
  type MidnightWithdrawCollateralBatchAction,
  NegativeInputError,
  type ReferenceTimestampParams,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
} from "../../types/index.js";
import { validateMidnightDeadline } from "./deadline.js";
import {
  parseCancelOffersParams,
  parseRedeemParams,
  parseRepayWithdrawCollateralParams,
  parseSupplyCollateralBatchParams,
  parseSupplyCollateralParams,
  parseSupplyCollateralTakeBorrowParams,
  parseTakeBorrowParams,
  parseTakeLendParams,
  parseTakeRepayWithdrawCollateralParams,
  parseTakeWithdrawParams,
  parseWithdrawCollateralBatchParams,
  parseWithdrawCollateralParams,
  validatePositionBinding,
} from "./parse.js";
import {
  getOffersDataInternal,
  parseGetOffersDataParams,
  parseMakeBorrowParams,
  parseMakeLendParams,
  parseMakeRepayParams,
  parseMakeWithdrawParams,
  parseSupplyBlueMakeLendParams,
  parseSupplyCollateralMakeBorrowParams,
} from "./prepare.js";
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
  SupplyCollateralBatchParams,
  SupplyCollateralMakeBorrowParams,
  SupplyCollateralParams,
  SupplyCollateralTakeBorrowParams,
  SupplyCollateralWithNativeParams,
  TakeBorrowParams,
  TakeLendParams,
  TakeRepayWithdrawCollateralParams,
  TakeWithdrawParams,
  WithdrawCollateralBatchParams,
  WithdrawCollateralParams,
} from "./types.js";

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
 *   now: (await client.getBlock()).timestamp,
 *   deadline: (await client.getBlock()).timestamp + 600n,
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
  | "supplyCollateralWithNative"
  | "supplyCollateralBatch"
  | "withdrawCollateral"
  | "withdrawCollateralBatch"
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
    await createChainCheck(this.client.viemClient, this.chainId)();

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
    await createChainCheck(this.client.viemClient, this.chainId)();

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
   * @throws {viem.BaseError} when a pinned block, contract, or oracle-code read fails.
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
    const context = { client: this.client, chainId: this.chainId };
    return getOffersDataInternal(
      parseGetOffersDataParams(params, context),
      context,
    );
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
   * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
   * @throws {ChainWNativeMissingError} when wNative is not configured for the chain.
   * @throws {NativeAmountOnNonWNativeAssetError} when `marketData.params.loanToken` is not wNative.
   * @throws {UnboundedMidnightTakeInputError} when `target.units` or
   *   `target.maxBuyerAssets` is `maxUint256`.
   * @throws {ExpiredDeadlineError} when `deadline` has expired.
   * @throws {MidnightTakeDeadlineTooFarError} when `deadline` is more than one hour from now.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {MidnightTakeableOfferZeroSellerReceiverError} when a sell offer routes seller proceeds to the zero address.
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 600n,
   * });
   * ```
   */
  takeLend(raw: TakeLendParams): MidnightActionOutput<MidnightTakeLendAction> {
    const params = parseTakeLendParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const parsed = params;
    const { accountAddress } = params;
    const market = parsed.market;
    let tx = encodeMidnightTakeLend(parsed);
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "buy",
      takeableOffers: parsed.takeableOffers,
      accountAddress: accountAddress,
      marketData: params.marketData,
      now: params.now ?? Time.timestamp(),
      deadline: parsed.deadline,
      referralFeePct: parsed.referralFeePct,
      fallbackUnits: 0n,
      target: parsed.target,
      maxContinuousFee: parsed.maxContinuousFee,
    });
    if (takeableOffers !== parsed.takeableOffers) {
      tx = encodeMidnightTakeLend(
        parsed,
        takeableOffers.map((offer) => parsed.takeableOffers.indexOf(offer)),
      );
    }
    const pulledAssets =
      parsed.target.type === "assets"
        ? parsed.target.assets
        : parsed.target.maxBuyerAssets;

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const approvals = await getParsedMidnightApprovalRequirements(
          parseMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: market.loanToken,
            owner: accountAddress,
            spender: tx.to,
            amount: pulledAssets,
          }),
          chainCheck,
        );
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          accountAddress,
          chainCheck,
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 600n,
   * });
   * ```
   */
  takeBorrow(
    raw: TakeBorrowParams,
  ): MidnightActionOutput<MidnightTakeBorrowAction> {
    const params = parseTakeBorrowParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const parsed = params;
    const { accountAddress } = params;
    let tx = encodeMidnightTakeBorrow(parsed);
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: accountAddress,
      marketData: params.marketData,
    });
    const requestedUnits =
      parsed.target.type === "units"
        ? parsed.target.units
        : parsed.target.maxUnits;
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
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "sell",
      takeableOffers: parsed.takeableOffers,
      accountAddress: accountAddress,
      marketData: params.marketData,
      now: params.now ?? Time.timestamp(),
      deadline: parsed.deadline,
      referralFeePct: parsed.referralFeePct,
      // Credit is withdrawn first, up to the market's withdrawable liquidity.
      fallbackUnits: MathLib.min(
        params.positionData.credit,
        params.marketData.withdrawable,
      ),
      credit: params.positionData.credit,
      target: parsed.target,
      increasesDebt: true,
    });
    if (takeableOffers !== parsed.takeableOffers) {
      tx = encodeMidnightTakeBorrow(
        parsed,
        takeableOffers.map((offer) => parsed.takeableOffers.indexOf(offer)),
      );
    }

    return {
      getRequirements: () =>
        this.getBundlesV2AuthorizationRequirements(accountAddress),
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 600n,
   * });
   * ```
   */
  takeWithdraw(
    raw: TakeWithdrawParams,
  ): MidnightActionOutput<MidnightTakeWithdrawAction> {
    const params = parseTakeWithdrawParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const parsed = params;
    const { accountAddress } = params;
    let tx = encodeMidnightTakeWithdraw(parsed);
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "sell",
      takeableOffers: parsed.takeableOffers,
      accountAddress: accountAddress,
      marketData: params.marketData,
      now: params.now ?? Time.timestamp(),
      deadline: parsed.deadline,
      referralFeePct: parsed.referralFeePct,
      // The bundle redeems credit first, up to the market's withdrawable liquidity.
      fallbackUnits: params.marketData.withdrawable,
      target: parsed.target,
      increasesDebt: false,
    });
    if (takeableOffers !== parsed.takeableOffers) {
      tx = encodeMidnightTakeWithdraw(
        parsed,
        takeableOffers.map((offer) => parsed.takeableOffers.indexOf(offer)),
      );
    }

    return {
      getRequirements: () =>
        this.getBundlesV2AuthorizationRequirements(accountAddress),
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
   * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 600n,
   * });
   * ```
   */
  supplyCollateralTakeBorrow(
    raw: SupplyCollateralTakeBorrowParams,
  ): MidnightActionOutput<MidnightSupplyCollateralTakeBorrowAction> {
    const params = parseSupplyCollateralTakeBorrowParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const parsed = params;
    const { accountAddress } = params;
    const market = parsed.market;
    let tx = encodeMidnightSupplyCollateralTakeBorrow(parsed);
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: accountAddress,
      marketData: params.marketData,
    });
    const postCollateral = Array.from(
      { length: market.collateralParams.length },
      (_, index) => params.positionData.collateral[index] ?? 0n,
    );
    for (const { collateralIndex, assets } of parsed.collateralSupplies) {
      const index = Number(collateralIndex);
      postCollateral[index] = (postCollateral[index] ?? 0n) + assets;
    }
    const requestedUnits =
      parsed.target.type === "units"
        ? parsed.target.units
        : parsed.target.maxUnits;
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
    const takeableOffers = validateMidnightTakeFeasibility({
      side: "sell",
      takeableOffers: parsed.takeableOffers,
      accountAddress: accountAddress,
      marketData: params.marketData,
      now: params.now ?? Time.timestamp(),
      deadline: parsed.deadline,
      referralFeePct: parsed.referralFeePct,
      // Credit is withdrawn first, up to the market's withdrawable liquidity.
      fallbackUnits: MathLib.min(
        params.positionData.credit,
        params.marketData.withdrawable,
      ),
      credit: params.positionData.credit,
      target: parsed.target,
      increasesDebt: true,
    });
    if (takeableOffers !== parsed.takeableOffers) {
      tx = encodeMidnightSupplyCollateralTakeBorrow(
        parsed,
        takeableOffers.map((offer) => parsed.takeableOffers.indexOf(offer)),
      );
    }
    // Sum per token so a token supplied at several indices gets one approval.
    const collateralAmounts = new Map<Address, bigint>();
    for (const { token, assets } of parsed.collateralSupplies) {
      collateralAmounts.set(
        token,
        (collateralAmounts.get(token) ?? 0n) + assets,
      );
    }

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const approvals = await Promise.all(
          [...collateralAmounts].map(async ([token, amount]) =>
            getParsedMidnightApprovalRequirements(
              parseMidnightApprovalRequirements({
                viemClient: this.client.viemClient,
                chainId: this.chainId,
                token,
                owner: accountAddress,
                spender: tx.to,
                amount,
              }),
              chainCheck,
            ),
          ),
        );
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          accountAddress,
          chainCheck,
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
   * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
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
   * @throws {MidnightTakeableOfferZeroSellerReceiverError} when a sell offer routes seller proceeds to the zero address.
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
   *   now: (await client.getBlock()).timestamp,
   *   deadline: (await client.getBlock()).timestamp + 600n,
   * });
   * ```
   */
  takeRepayWithdrawCollateral(
    raw: TakeRepayWithdrawCollateralParams,
  ): MidnightActionOutput<MidnightTakeRepayWithdrawCollateralAction> {
    const params = parseTakeRepayWithdrawCollateralParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const parsed = params;
    const { accountAddress } = params;
    const market = parsed.market;
    let tx = encodeMidnightTakeRepayWithdrawCollateral(parsed);
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: accountAddress,
      marketData: params.marketData,
    });
    const collateralWithdrawals = parsed.collateralWithdrawals;
    const postCollateral = Array.from(
      { length: market.collateralParams.length },
      (_, index) => params.positionData.collateral[index] ?? 0n,
    );
    let withdrawAmount = 0n;
    for (const withdrawal of collateralWithdrawals) {
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
      parsed.target.type === "units"
        ? parsed.target.units
        : parsed.target.minUnits;
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
      takeableOffers: parsed.takeableOffers,
      accountAddress: accountAddress,
      marketData: params.marketData,
      now: params.now ?? Time.timestamp(),
      deadline: parsed.deadline,
      referralFeePct: parsed.referralFeePct,
      // With repayEnabled the bundle repays the unfilled debt directly, at par.
      fallbackUnits: parsed.repayEnabled ? params.positionData.debt : 0n,
      target: parsed.target,
      maxContinuousFee: parsed.maxContinuousFee,
      debt: params.positionData.debt,
    });
    if (takeableOffers !== parsed.takeableOffers) {
      tx = encodeMidnightTakeRepayWithdrawCollateral(
        parsed,
        takeableOffers.map((offer) => parsed.takeableOffers.indexOf(offer)),
      );
    }
    const pulledAssets =
      parsed.target.type === "assets"
        ? parsed.target.assets
        : parsed.target.maxBuyerAssets;

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const approvals = await getParsedMidnightApprovalRequirements(
          parseMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: market.loanToken,
            owner: accountAddress,
            spender: tx.to,
            amount: pulledAssets,
          }),
          chainCheck,
        );
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          accountAddress,
          chainCheck,
        );
        return [...approvals, ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Withdraws collateral directly from Midnight without bundle authorization or token pulls.
   *
   * Uses the supplied position snapshot to resolve maxUint256 and check collateral health.
   * No requirements or RPC reads are needed. The signing account must be accountAddress.
   *
   * @param params - Market, owner-bound position, collateral prices and withdrawal amount.
   * @param params.accountAddress - Collateral owner. This account must send the transaction.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.positionData - Owner-bound position snapshot returned by getPositionData.
   * @param params.collateralPrices - Oracle prices indexed like positionData.collateral and scaled by
   *   ORACLE_PRICE_SCALE; required when the position has debt, otherwise an empty array is safe.
   * @param params.collateralIndex - Optional collateral index; defaults to 0n. Indexes follow the
   *   market's collateral parameters, which Midnight sorts by token address, not the order they were
   *   listed in when the market was built; check marketData.getCollateralByIndex(index).token.
   * @param params.assets - Collateral assets to withdraw. maxUint256 resolves the whole balance of
   *   the selected collateral from positionData before building the transaction.
   * @param params.receiver - Account receiving the withdrawn collateral; defaults to accountAddress.
   * @returns Lazy handles for a direct Midnight withdrawal.
   * @throws {ChainIdMismatchError} when the client or market targets another chain.
   * @throws {MidnightCalldataEncodingError} when accountAddress is malformed or an input cannot be ABI-encoded.
   * @throws {MidnightZeroAccountError} when accountAddress is zero.
   * @throws {MidnightMarketAddressMismatchError} when marketData targets another Midnight deployment.
   * @throws {MissingMarketPriceError} when debt is positive and held collateral has no supplied price.
   * @throws {MarketIdMismatchError} when positionData belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when positionData belongs to another account.
   * @throws {UnknownCollateralIndexError} when collateralIndex is not configured.
   * @throws {NonPositiveInputError} when the resolved amount is not positive.
   * @throws {InputExceedsMaxError} when assets exceeds uint128.
   * @throws {WithdrawExceedsCollateralError} when assets exceeds the collateral balance.
   * @throws {WithdrawMakesPositionUnhealthyError} when remaining collateral cannot safely cover debt.
   * @throws {MidnightZeroReceiverError} when receiver is zero.
   * @throws {MidnightContractReceiverError} when receiver cannot safely receive collateral.
   * @example
   * ```ts
   * const output = midnight.withdrawCollateral({
   *   accountAddress: user,
   *   marketData,
   *   positionData,
   *   collateralPrices,
   *   assets: 1_000n,
   * });
   * const tx = output.buildTx();
   * ```
   */
  withdrawCollateral(
    raw: WithdrawCollateralParams,
  ): MidnightActionOutput<MidnightWithdrawCollateralAction> {
    const params = parseWithdrawCollateralParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const parsed = params;
    const { assets, available, collateralIndex } = params;
    const index = Number(collateralIndex);
    const tx = encodeMidnightWithdrawCollateral(parsed);
    if (assets > available) {
      throw new WithdrawExceedsCollateralError({
        withdrawAmount: assets,
        available,
        market: params.marketData.id,
      });
    }
    if (params.positionData.debt > 0n) {
      const collateral = Array.from(
        { length: params.marketData.params.collateralParams.length },
        (_, i) => params.positionData.collateral[i] ?? 0n,
      );
      collateral[index] = available - assets;
      const maxSafeDebt = getMidnightMaxSafeDebt({
        market: params.marketData,
        collateral,
        collateralPrices: params.collateralPrices,
      });
      if (params.positionData.debt > maxSafeDebt) {
        throw new WithdrawMakesPositionUnhealthyError({
          withdrawAmount: assets,
          borrowAssets: params.positionData.debt,
          maxSafeBorrow: maxSafeDebt,
        });
      }
    }
    return { getRequirements: async () => [], buildTx: () => tx };
  }

  /**
   * Withdraws an ordered collateral batch atomically from Midnight without bundle authorization or token pulls.
   *
   * Uses the supplied position snapshot to resolve maxUint256 and check collateral health.
   * Duplicates are rejected, unlike bundle flows which sum them.
   * No requirements or RPC reads are needed. The signing account must be accountAddress.
   *
   * @param params - Market, owner-bound position, collateral prices and withdrawal amount.
   * @param params.accountAddress - Collateral owner. This account must send the transaction.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.positionData - Owner-bound position snapshot returned by getPositionData.
   * @param params.collateralPrices - Oracle prices indexed like positionData.collateral and scaled by
   *   ORACLE_PRICE_SCALE; required when the position has debt, otherwise an empty array is safe.
   * @param params.collateralWithdrawals - Nonempty ordered withdrawals, one per index.
   *   maxUint256 resolves that index's full snapshot balance.
   * @param params.receiver - Account receiving the withdrawn collateral; defaults to accountAddress.
   * @returns Lazy handles for a direct Midnight withdrawal.
   * @throws {ChainIdMismatchError} when the client or market targets another chain.
   * @throws {MidnightCalldataEncodingError} when accountAddress is malformed or an input cannot be ABI-encoded.
   * @throws {MidnightZeroAccountError} when accountAddress is zero.
   * @throws {MidnightMarketAddressMismatchError} when marketData targets another Midnight deployment.
   * @throws {MissingMarketPriceError} when debt is positive and held collateral has no supplied price.
   * @throws {MarketIdMismatchError} when positionData belongs to another market.
   * @throws {AccrualPositionUserMismatchError} when positionData belongs to another account.
   * @throws {UnknownCollateralIndexError} when collateralIndex is not configured.
   * @throws {EmptyMidnightCollateralWithdrawalsError} when the list is empty.
   * @throws {DuplicateMidnightCollateralIndexError} when an index repeats.
   * @throws {NonPositiveInputError} when the resolved amount is not positive.
   * @throws {InputExceedsMaxError} when assets exceeds uint128.
   * @throws {WithdrawExceedsCollateralError} when assets exceeds the collateral balance.
   * @throws {WithdrawMakesPositionUnhealthyError} when remaining collateral cannot safely cover debt.
   * @throws {MidnightZeroReceiverError} when receiver is zero.
   * @throws {MidnightContractReceiverError} when receiver cannot safely receive collateral.
   * @example
   * ```ts
   * const output = midnight.withdrawCollateralBatch({
   *   accountAddress: user,
   *   marketData,
   *   positionData,
   *   collateralPrices,
   *   collateralWithdrawals: [{ collateralIndex: 0n, assets: 1_000n }],
   * });
   * const tx = output.buildTx();
   * ```
   */
  withdrawCollateralBatch(
    raw: WithdrawCollateralBatchParams,
  ): MidnightActionOutput<MidnightWithdrawCollateralBatchAction> {
    const params = parseWithdrawCollateralBatchParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const { collateralWithdrawals } = params;
    // Withdrawal batches historically encode eagerly, before balance and health checks.
    const tx = encodeMidnightWithdrawCollateralBatch(params);
    const collateral = Array.from(
      { length: params.marketData.params.collateralParams.length },
      (_, i) => params.positionData.collateral[i] ?? 0n,
    );
    for (const { collateralIndex, assets } of collateralWithdrawals) {
      const index = Number(collateralIndex);
      const available = collateral[index] ?? 0n;
      if (assets > available) {
        throw new WithdrawExceedsCollateralError({
          withdrawAmount: assets,
          available,
          market: params.marketData.id,
        });
      }
      collateral[index] = available - assets;
    }
    if (params.positionData.debt > 0n) {
      const maxSafeDebt = getMidnightMaxSafeDebt({
        market: params.marketData,
        collateral,
        collateralPrices: params.collateralPrices,
      });
      if (params.positionData.debt > maxSafeDebt) {
        throw new WithdrawMakesPositionUnhealthyError({
          withdrawAmount: collateralWithdrawals.reduce(
            (sum, entry) => sum + entry.assets,
            0n,
          ),
          borrowAssets: params.positionData.debt,
          maxSafeBorrow: maxSafeDebt,
        });
      }
    }
    return { getRequirements: async () => [], buildTx: () => tx };
  }

  /**
   * Prepares a direct collateral supply using a caller-provided market snapshot.
   *
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
   * @param params.now - Optional reference timestamp in seconds; used for metadata only when the
   *   client sets `metadata.timestamp: true`.
   * @returns Lazy token-approval requirements and a synchronous transaction builder.
   * @throws {NegativeInputError} when the resolved metadata timestamp is negative, or the reserve is negative.
   * @throws {InputExceedsMaxError} when the resolved metadata timestamp exceeds `uint32`, the
   *   collateral exceeds `uint128`, or the collateral plus reserve exceeds `uint256` in `getRequirements()`.
   * @throws {ChainIdMismatchError} when client or market data targets another chain, or from
   *   `getRequirements()` when the RPC reports another chain via `eth_chainId`.
   * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32` or an out-of-range integer.
   * @throws {UnsupportedChainIdError} when the chain has no address registry.
   * @throws {UnknownAddressError} when Midnight is not registered on the chain.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when `collateralAssets` is non-positive.
   * @throws {UnknownCollateralIndexError} when the selected collateral is not configured.
   * @throws {MidnightZeroOnBehalfError} from `getRequirements()` and `buildTx()` when `accountAddress`
   *   is the zero address.
   * @throws {viem.BaseError} from `getRequirements()` when an `eth_chainId` request or requirement
   *   RPC read fails.
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
    raw: SupplyCollateralParams,
  ): MidnightActionOutput<MidnightSupplyCollateralAction> {
    const params = parseSupplyCollateralParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    if ("error" in params) {
      const { error } = params;
      return {
        getRequirements: async () => {
          throw error;
        },
        buildTx: () => {
          throw error;
        },
      };
    }
    const { assets, onBehalf, reservedCollateralAssets } = params;
    const midnight = getChainAddress(this.chainId, "midnight");

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        return await getParsedMidnightApprovalRequirements(
          parseMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: params.token,
            owner: onBehalf,
            spender: midnight,
            amount: assets + reservedCollateralAssets,
          }),
          chainCheck,
        );
      },
      buildTx: () => encodeMidnightSupplyCollateral(params),
    };
  }

  /**
   * Wraps a positive native amount and supplies the full wNative collateral in one bundle.
   * `accountAddress` must send the transaction; the bundle credits the sender.
   * The approval covers the full collateral plus the reserve, even with full native funding.
   * Requirements recheck a finite deadline against the latest block before reading permissions.
   *
   * Validation checks metadata, then the chain, account address, market, and collateral amount
   * and reserve. It resolves the collateral index before the builder checks for a zero account,
   * validates native funding, and checks the deadline's bounds. The entity then checks expiry.
   *
   * @param params.accountAddress - Transaction sender and collateral beneficiary.
   * @param params.marketData - Hydrated Midnight market receiving the collateral.
   * @param params.collateralAssets - Total collateral to supply, in wNative base units.
   * @param params.reservedCollateralAssets - Optional extra wNative included in the allowance check.
   * @param params.collateralIndex - Optional index of the registered wNative collateral; defaults to `0n`.
   * @param params.nativeAmount - Positive amount to wrap in wei, at most `collateralAssets`.
   * @param params.deadline - Unix timestamp in seconds after the reference time.
   * @param params.now - Optional reference timestamp in seconds for the deadline, independent of
   *   metadata. It also supplies the metadata timestamp when the client sets `metadata.timestamp: true`.
   * @returns Lazy bundle approval and authorization requirements and a synchronous transaction builder.
   * @throws {NegativeInputError} when the resolved metadata timestamp or reserve is negative,
   *   or when funding validation after index resolution finds a negative `nativeAmount`.
   * @throws {InputExceedsMaxError} when the resolved metadata timestamp exceeds `uint32` or
   *   `collateralAssets` exceeds `uint128`; after index resolution, when `nativeAmount` exceeds
   *   `collateralAssets` or `deadline` exceeds `uint256`; or in `getRequirements()` when
   *   collateral plus reserve exceeds `uint256`.
   * @throws {ChainIdMismatchError} when the client or market targets another chain, or when
   *   the RPC reports another chain from `getRequirements()`.
   * @throws {MidnightCalldataEncodingError} when an address is malformed or a market or bundle argument cannot be ABI-encoded.
   * @throws {UnsupportedChainIdError} when the chain has no address registry.
   * @throws {UnknownAddressError} when Midnight or MidnightBundlesV2 is not registered on the chain.
   * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
   * @throws {InvalidBigIntInputError} when `collateralAssets` or `reservedCollateralAssets` is not a bigint.
   * @throws {NonPositiveInputError} when `collateralAssets` is not positive; after index resolution,
   *   when `nativeAmount` is zero or `deadline` is not positive.
   * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
   * @throws {MidnightZeroOnBehalfError} when `accountAddress` is the zero address.
   * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
   * @throws {ChainWNativeMissingError} when the chain has no wrapped-native asset.
   * @throws {NativeAmountOnNonWNativeAssetError} when the selected collateral is not wNative.
   * @throws {ExpiredDeadlineError} when the deadline is at or before the reference time,
   *   or at or before the latest block's timestamp when resolving requirements.
   * @throws {viem.BaseError} from `getRequirements()` when a chain id, block, allowance or authorization read fails.
   * @example
   * ```ts
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { type Address, type Hex, createPublicClient, http, maxUint256 } from "viem";
   * import { base } from "viem/chains";
   *
   * export async function supplyWithNative(
   *   marketId: Hex,
   *   accountAddress: Address,
   *   collateralIndex: bigint,
   *   sendAndConfirm: (tx: { to: Address; data: Hex; value: bigint }) => Promise<Hex>,
   * ) {
   *   const client = createPublicClient({ chain: base, transport: http() }).extend(morphoViemExtension());
   *   const midnight = client.morpho.midnight(base.id);
   *   const marketData = await midnight.getMarketData(marketId);
   *   const { getRequirements, buildTx } = midnight.supplyCollateralWithNative({
   *     marketData, accountAddress, collateralIndex,
   *     collateralAssets: 1_000_000_000_000_000n,
   *     nativeAmount: 1_000_000_000_000_000n,
   *     deadline: maxUint256,
   *   });
   *   // Use the wallet for accountAddress and confirm each prerequisite before supplying.
   *   for (const requirement of await getRequirements()) {
   *     if (!("sign" in requirement)) await sendAndConfirm(requirement);
   *   }
   *   return await sendAndConfirm(buildTx()); // Transaction hash (Hex)
   * }
   * ```
   */
  supplyCollateralWithNative(
    params: SupplyCollateralWithNativeParams,
  ): MidnightActionOutput<MidnightSupplyCollateralWithNativeAction> {
    const metadata = resolveTransactionMetadata(
      this.client.options.metadata,
      params.now,
    );
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMidnightAddress("accountAddress", params.accountAddress);
    validateMidnightMarket({
      market: params.marketData,
      chainId: this.chainId,
    });
    const collateralAssets = parseMidnightNativeCollateralAmount(
      "collateralAssets",
      params.collateralAssets,
    );
    const reservedCollateralAssets = params.reservedCollateralAssets ?? 0n;
    if (typeof reservedCollateralAssets !== "bigint") {
      throw new InvalidBigIntInputError(
        "reservedCollateralAssets",
        reservedCollateralAssets,
      );
    }
    if (reservedCollateralAssets < 0n) {
      throw new NegativeInputError(
        "reservedCollateralAssets",
        reservedCollateralAssets,
      );
    }

    const market = params.marketData.params;
    const collateralIndex = params.collateralIndex ?? 0n;
    // Validate the index before the builder checks for a zero account.
    MarketUtils.getCollateralByIndex(market, collateralIndex);
    const { accountAddress, nativeAmount, deadline } = params;
    const approvalAmount = collateralAssets + reservedCollateralAssets;
    const { tx, token } = prepareMidnightSupplyCollateralWithNative({
      chainId: this.chainId,
      market,
      collateralIndex,
      assets: collateralAssets,
      accountAddress,
      nativeAmount,
      deadline,
      metadata,
    });
    validateMidnightDeadline(deadline, params.now);

    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        if (deadline !== maxUint256) {
          await chainCheck();
          const { timestamp } = await getBlock(this.client.viemClient, {
            blockTag: "latest",
          });
          validateMidnightDeadline(deadline, timestamp);
        }
        const approval = await getParsedMidnightApprovalRequirements(
          parseMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token,
            owner: accountAddress,
            spender: tx.to,
            amount: approvalAmount,
          }),
          chainCheck,
        );
        const authorization = await getParsedMidnightAuthorizationRequirement(
          parseMidnightAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            owner: accountAddress,
            authorized: tx.to,
          }),
          chainCheck,
        );
        return authorization ? [...approval, authorization] : approval;
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares ordered direct collateral supplies in one Midnight multicall.
   * Pass one entry per index: duplicates are rejected, unlike bundle flows which sum them.
   *
   * @param params.accountAddress - Sender and collateral beneficiary.
   * @param params.marketData - Snapshot of the target market.
   * @param params.collateralSupplies - Ordered supplies with optional reserved allowance amounts.
   * @returns A lazy approval resolver and synchronous stateless transaction builder.
   * @throws {ChainIdMismatchError} when the client or market targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when the deployment differs.
   * @throws {MidnightCalldataEncodingError} when the account is malformed.
   * @throws {NegativeInputError} when reserved assets are negative.
   * @throws {NonPositiveInputError} when assets are not positive.
   * @throws {InputExceedsMaxError} when assets exceed uint128.
   * @throws {UnknownCollateralIndexError} when an index is not configured.
   * @throws {EmptyMidnightCollateralSuppliesError} when the list is empty.
   * @throws {DuplicateMidnightCollateralIndexError} when an index repeats.
   * @throws {MidnightZeroOnBehalfError} when requirements or construction uses the zero account.
   * @example
   * ```ts
   * const output = midnight.supplyCollateralBatch({
   *   accountAddress: user, marketData,
   *   collateralSupplies: [{ collateralIndex: 0n, assets: 100n }],
   * });
   * const tx = output.buildTx();
   * ```
   */
  supplyCollateralBatch(
    raw: SupplyCollateralBatchParams,
  ): MidnightActionOutput<MidnightSupplyCollateralBatchAction> {
    const params = parseSupplyCollateralBatchParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    if ("error" in params) {
      const { error } = params;
      return {
        getRequirements: async () => {
          throw error;
        },
        buildTx: () => {
          throw error;
        },
      };
    }
    const midnight = getChainAddress(this.chainId, "midnight");
    return {
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const requirements = await Promise.all(
          params.approvals.map(async ({ token, amount }) =>
            getParsedMidnightApprovalRequirements(
              parseMidnightApprovalRequirements({
                viemClient: this.client.viemClient,
                chainId: this.chainId,
                token,
                owner: params.onBehalf,
                spender: midnight,
                amount,
              }),
              chainCheck,
            ),
          ),
        );
        return requirements.flat();
      },
      buildTx: () => {
        if ("error" in params.action) {
          throw params.action.error;
        }
        return encodeMidnightSupplyCollateralBatch(params.action);
      },
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
   * @param params - Maker, lend-side offers, `loanAssets` and `reservedLoanAssets` allowance thresholds, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @param params.loanToken - Loan token shared by every offer market.
   * @param params.loanAssets - Minimum Midnight allowance (with `reservedLoanAssets`) that `getRequirements()` checks; the approval it returns is unlimited. The signed offer caps bound fills.
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
   * @throws {viem.BaseError} when a pinned block, contract, or oracle-code read fails.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the reference timestamp (`params.now`, or the deprecated device-clock fallback), including zero or negative values.
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
    return this.prepareLendOffers(
      await parseMakeLendParams(params, {
        client: this.client,
        chainId: this.chainId,
      }),
    );
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
   * @throws {viem.BaseError} when a pinned block, contract, or oracle-code read fails.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the reference timestamp (`params.now`, or the deprecated device-clock fallback), including zero or negative values.
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
    return this.prepareBorrowOffers(
      await parseMakeBorrowParams(params, {
        client: this.client,
        chainId: this.chainId,
      }),
    );
  }

  /**
   * Prepares lend-side offers for publication.
   */
  private async prepareLendOffers(
    params:
      | Awaited<ReturnType<typeof parseMakeLendParams>>
      | Awaited<ReturnType<typeof parseMakeRepayParams>>,
  ): Promise<MakeOffersOutput> {
    const { data } = params;
    const tx = encodeMidnightCancelAndMake(params.action);
    const midnight = getChainAddress(this.chainId, "midnight");

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const approvals = await getParsedMidnightApprovalRequirements(
          parseMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: params.loanToken,
            owner: data.accountAddress,
            spender: midnight,
            amount: params.approvalAmount,
          }),
          chainCheck,
        );
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          data.accountAddress,
          chainCheck,
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
   * The share check runs once, before signing: the bundle supplies `assetsToPark` with no
   * minimum-shares bound, so interest accrued before inclusion can still round the supply down
   * to zero shares if `assetsToPark` is worth less than one share at inclusion. A preview above
   * one share does not rule this out: interest accrued while the transaction waits, or not
   * accrued by the SDK for an IRM it cannot accrue, raises the share price. Choosing a market
   * whose share price makes that impossible is the caller's responsibility.
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
   * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
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
   * @throws {viem.BaseError} when a pinned block, contract, or oracle-code read fails.
   * @throws {EmptyBlueParkingMarketError} when `blueMarket` has no supply shares.
   * @throws {ZeroBlueParkingSharesError} when `assetsToPark` would mint no supply shares at the current share price (checked at preparation time only).
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {InvalidMidnightHexInputError} when a cancellation group or `callbackSalt` is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the reference timestamp (`params.now`, or the deprecated device-clock fallback), including zero or negative values.
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
    const parsed = await parseSupplyBlueMakeLendParams(params, {
      client: this.client,
      chainId: this.chainId,
    });
    const { data } = parsed;
    const tx = encodeMidnightCancelAndMake(parsed.action);

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async (
        _requirementsParams?: MidnightRequirementsParams,
      ) => {
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const approvals = await getParsedMidnightApprovalRequirements(
          parseMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: parsed.loanToken,
            owner: data.accountAddress,
            spender: getChainAddress(this.chainId, "midnightBundlesV2"),
            amount: parsed.approvalAmount,
          }),
          chainCheck,
        );
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          data.accountAddress,
          chainCheck,
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
    params:
      | Awaited<ReturnType<typeof parseMakeBorrowParams>>
      | Awaited<ReturnType<typeof parseMakeWithdrawParams>>,
  ): Promise<MakeOffersOutput> {
    const { data } = params;
    const tx = encodeMidnightCancelAndMake(params.action);

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
   * @throws {viem.BaseError} when a pinned block, contract, or oracle-code read fails.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256` or a `maxConsumed` ceiling exceeds `uint128`.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the reference timestamp (`params.now`, or the deprecated device-clock fallback), including zero or negative values.
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
    return this.prepareBorrowOffers(
      await parseMakeWithdrawParams(params, {
        client: this.client,
        chainId: this.chainId,
      }),
    );
  }

  /**
   * Publishes reduce-only buy offers for a borrow limit exit through MidnightBundlesV2.
   *
   * Shares the lend-side publication and requirement handling of {@link MorphoMidnight.makeLend}.
   * Loan assets are pulled by Midnight when the offers fill, not during publication.
   * `loanAssets` is only the allowance threshold `getRequirements()` checks, as in `makeLend`; the signed offer caps bound fills.
   * A partially consumed offer group remains publishable with its shared remaining cap reduced.
   * No repay offer can be live after market maturity; late borrowers should repay directly with
   * {@link MorphoMidnight.repayWithdrawCollateral}.
   * Execution waits for a taker; publication does not close the position or withdraw collateral.
   * Every offer must already have `buy = true` and `reduceOnly = true`.
   * The supplied tree, group caps and prices are preserved; no separate root signature is needed.
   *
   * @param params - Maker, reduce-only offers, optional cancellations, `loanAssets` and `reservedLoanAssets` allowance thresholds, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Midnight mempool API request controls, or `false` to skip the API call.
   * @param params.loanToken - Loan token shared by every offer market.
   * @param params.loanAssets - Minimum Midnight allowance (with `reservedLoanAssets`) that `getRequirements()` checks; the approval it returns is unlimited. The signed offer caps bound fills.
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
   * @throws {viem.BaseError} when a pinned block, contract, or oracle-code read fails.
   * @throws {MidnightMempoolValidationError} when the Midnight mempool API rejects the offer tree
   *   (not thrown when `validation` is `false`).
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer uses another loan token.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256` or a `maxConsumed` ceiling exceeds `uint128`.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the reference timestamp (`params.now`, or the deprecated device-clock fallback), including zero or negative values.
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
    return this.prepareLendOffers(
      await parseMakeRepayParams(params, {
        client: this.client,
        chainId: this.chainId,
      }),
    );
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
   * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
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
   * @throws {viem.BaseError} when a pinned block, contract, or oracle-code read fails.
   * @throws {MarketIdMismatchError} when an offer targets another market than `collateral.market`, including a `collateral.market` on another chain or Midnight deployment.
   * @throws {EmptyMidnightCollateralSuppliesError} when a collateral market has no collateral supplies.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {InvalidMidnightHexInputError} when a cancellation group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the reference timestamp (`params.now`, or the deprecated device-clock fallback), including zero or negative values.
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
    const paramsParsed = await parseSupplyCollateralMakeBorrowParams(params, {
      client: this.client,
      chainId: this.chainId,
    });
    const { data, action: parsed } = paramsParsed;
    const tx = encodeMidnightCancelAndMake(parsed);
    const midnightBundlesV2 = getChainAddress(
      this.chainId,
      "midnightBundlesV2",
    );
    const collateralAmounts = new Map<Address, bigint>();
    for (const { token, assets } of parsed.collateralPulls) {
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
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const approvals = await Promise.all(
          [...collateralAmounts].map(async ([token, amount]) =>
            getParsedMidnightApprovalRequirements(
              parseMidnightApprovalRequirements({
                viemClient: this.client.viemClient,
                chainId: this.chainId,
                token,
                owner: data.accountAddress,
                spender: midnightBundlesV2,
                amount,
              }),
              chainCheck,
            ),
          ),
        );
        return [
          ...approvals.flat(),
          ...(await this.getBundlesV2AuthorizationRequirements(
            data.accountAddress,
            chainCheck,
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
  redeem(raw: RedeemParams): MidnightActionOutput<MidnightRedeemAction> {
    const parsed = parseRedeemParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });

    const tx = encodeMidnightRedeem(parsed);
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
   * @throws {InvalidMidnightNativeAmountTypeError} when `nativeAmount` is supplied as a non-bigint.
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
   * @throws {ExpiredDeadlineError} when `params.deadline` is at or before the reference timestamp (`params.now`, or the deprecated device-clock fallback), including zero or negative values.
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
    raw: RepayWithdrawCollateralParams,
  ): MidnightActionOutput<MidnightRepayWithdrawCollateralAction> {
    const params = parseRepayWithdrawCollateralParams(raw, {
      client: this.client,
      chainId: this.chainId,
    });
    const parsed = params;
    const market = params.market.struct;
    const tx = encodeMidnightRepayWithdrawCollateral(parsed);
    validatePositionBinding({
      positionData: params.positionData,
      accountAddress: params.accountAddress,
      marketData: params.marketData,
    });
    const collateralWithdrawals = parsed.collateralWithdrawals;
    const postCollateral = Array.from(
      { length: market.collateralParams.length },
      (_, index) => params.positionData.collateral[index] ?? 0n,
    );
    let withdrawAmount = 0n;
    for (const withdrawal of collateralWithdrawals) {
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
    let postDebt = 0n;
    if (
      params.repay.type !== "full" &&
      params.positionData.debt > params.repay.assets
    ) {
      postDebt = params.positionData.debt - params.repay.assets;
    }
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
        const chainCheck = createChainCheck(
          this.client.viemClient,
          this.chainId,
        );
        const approvals =
          pulledAssets > 0n
            ? await getParsedMidnightApprovalRequirements(
                parseMidnightApprovalRequirements({
                  viemClient: this.client.viemClient,
                  chainId: this.chainId,
                  token: market.loanToken,
                  owner: params.accountAddress,
                  spender: tx.to,
                  amount: pulledAssets,
                }),
                chainCheck,
              )
            : [];
        const authorization = await this.getBundlesV2AuthorizationRequirements(
          params.accountAddress,
          chainCheck,
        );
        return [...approvals, ...authorization];
      },
      buildTx: () => tx,
    };
  }

  /**
   * Prepares direct cancellation of maker offer groups on Midnight.
   *
   * One group stays a bare `setConsumed(group, maxUint128, accountAddress)` so a wallet policy
   * can match it by method name. Two or more groups encode one atomic Midnight `multicall`.
   * This never targets MidnightBundlesV2 and requires no approval, authorization or deadline.
   * Cancellation does not unratify roots or revoke existing authorizations.
   *
   * @param params - Maker account and nonempty ordered list of distinct offer groups.
   * @param params.accountAddress - Maker that must send the transaction, or authorize its sender on Midnight.
   * @param params.groups - Distinct 32-byte groups to cancel completely, regardless of prior consumption.
   * @returns An empty requirements list and a synchronous direct-cancellation builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {MidnightInvalidAccountAddressError} when `accountAddress` is malformed or zero.
   * @throws {MidnightCalldataEncodingError} when an address cannot be ABI-encoded.
   * @throws {EmptyMidnightGroupCancellationsError} when no groups are provided.
   * @throws {InvalidMidnightHexInputError} when a group is not 32-byte hex.
   * @throws {DuplicateMidnightGroupCancellationError} when a group appears more than once.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no `midnight` deployment.
   * @example
   * ```ts
   * import { morphoViemExtension } from "@morpho-org/morpho-sdk";
   * import { createPublicClient, http, type Address, type Hex } from "viem";
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
   *   groups: [group],
   * });
   * ```
   */
  cancelOffers(
    params: {
      readonly accountAddress: Address;
      readonly groups: readonly Hex[];
    } & ReferenceTimestampParams,
  ): MidnightActionOutput<MidnightCancelOffersAction> {
    const parsed = parseCancelOffersParams(params, {
      client: this.client,
      chainId: this.chainId,
    });
    const tx = encodeMidnightCancelOffers(parsed);
    return {
      getRequirements: async () => [],
      buildTx: () => tx,
    };
  }

  private async getBundlesV2AuthorizationRequirements(
    owner: Address,
    chainCheck: ChainCheck = createChainCheck(
      this.client.viemClient,
      this.chainId,
    ),
  ): Promise<readonly ActionRequirement[]> {
    const authorization = await getParsedMidnightAuthorizationRequirement(
      parseMidnightAuthorizationRequirement({
        viemClient: this.client.viemClient,
        chainId: this.chainId,
        owner,
        authorized: getChainAddress(this.chainId, "midnightBundlesV2"),
      }),
      chainCheck,
    );
    return authorization ? [authorization] : [];
  }
}
