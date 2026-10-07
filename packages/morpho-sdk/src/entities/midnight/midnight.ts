import {
  MarketUtils as BlueMarketUtils,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
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
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  encodeAbiParameters,
  type Hex,
  isAddressEqual,
} from "viem";
import { readContract } from "viem/actions";
import {
  midnightCancelAndMake,
  midnightCancelOffer,
  midnightRedeem,
  midnightRepayWithdrawCollateral,
  midnightSupplyCollateral,
  midnightSupplyCollateralTakeBorrow,
  midnightTakeBorrow,
  midnightTakeLend,
  midnightTakeRepayWithdrawCollateral,
} from "../../actions/midnight/index.js";
import {
  getMidnightApprovalRequirements,
  getMidnightAuthorizationRequirement,
} from "../../actions/requirements/index.js";
import { getMidnightBlueBuyCallbackAddress } from "../../helpers/callback.js";
import { validateChainId } from "../../helpers/index.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AccrualPositionUserMismatchError,
  type ActionRequirement,
  EmptyBlueParkingMarketError,
  InsufficientMidnightWithdrawableLiquidityError,
  MarketIdMismatchError,
  type MidnightCancelAndMakeAction,
  type MidnightCancelOfferAction,
  type MidnightGroupCancellation,
  MidnightOfferCallbackDataMismatchError,
  MidnightOfferCallbackMismatchError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferNotReduceOnlyError,
  MidnightOfferRatifierMismatchError,
  type MidnightRedeemAction,
  MidnightRedeemExceedsCreditError,
  type MidnightRepayWithdrawCollateralAction,
  type MidnightSupplyCollateralAction,
  type MidnightSupplyCollateralTakeBorrowAction,
  type MidnightTakeBorrowAction,
  type MidnightTakeLendAction,
  type MidnightTakeRepayWithdrawCollateralAction,
  MissingAccrualPositionError,
  NegativeInputError,
  NoMidnightCreditToRedeemError,
  NonPositiveInputError,
} from "../../types/index.js";
import type {
  GetOffersDataParams,
  GetPositionDataParams,
  MakeLendParams,
  MakeOffersOutput,
  MakeOffersParams,
  MidnightActionOutput,
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
 *   deadline: maxUint256,
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
  | "cancelOffer"
  | "cancelOffers"
>;

const assertNonNegativeAmount = (label: string, amount: bigint) => {
  if (amount < 0n) throw new NegativeInputError(label, amount);
};

const assertPositiveAmount = (label: string, amount: bigint) => {
  if (amount <= 0n) throw new NonPositiveInputError(label, amount);
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
   * @throws {ChainIdMismatchError} when the client chain differs from this entity's chain.
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
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

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
   * @throws {ChainIdMismatchError} when the client chain differs from this entity's chain.
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
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchAccrualPosition(this.client.viemClient, {
      ...params.parameters,
      deployless: this.client.options.supportDeployless,
      marketId: params.marketId,
      user: params.accountAddress,
    });
  }

  /**
   * Builds and validates a maker offer tree against the Midnight mempool API.
   *
   * @param params - Maker account, raw offer or group inputs, and optional API validation controls.
   * @param params.accountAddress - Maker expected on every offer.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @returns Prepared tree, groups, ratifier, and encoded payload used by maker flows.
   * @throws {ChainIdMismatchError} when the client chain differs from this entity's chain.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {UnknownAddressError} when the chain has no deployment for the tree's V1 ratifier.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @example
   * ```ts
   * const offersData = await midnight.getOffersData({
   *   accountAddress: maker,
   *   offers: { type: "rateV1", entries: [{ offer, rate }] },
   * });
   * ```
   */
  async getOffersData(params: GetOffersDataParams): Promise<OffersData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const tree: OffersData["tree"] = Tree.from(params.offers);
    const midnight = getChainAddress(this.chainId, "midnight");
    tree.offers.forEach((offer, index) => {
      if (!isAddressEqual(offer.maker, params.accountAddress)) {
        throw new MidnightOfferMakerMismatchError({
          index,
          expectedMaker: params.accountAddress,
          actualMaker: offer.maker,
        });
      }
      const market =
        "params" in offer.market ? offer.market.params : offer.market;
      if (market.chainId !== BigInt(this.chainId)) {
        throw new MidnightOfferMarketChainMismatchError({
          index,
          expectedChainId: this.chainId,
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
      this.chainId,
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

    await tree.mempoolValidate({
      ...params.validation,
      chainId: this.chainId,
    });

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
  }

  /**
   * Prepares a `MidnightBundlesV2` buy that lends into borrow-side offers for `accountAddress`.
   *
   * @param params - Lender, market snapshot, buy target, offers, fee cap, deadline, and optional referral fee.
   * @param params.accountAddress - Lender; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`.
   * @param params.takeableOffers - Borrow-side offers returned by the Midnight API.
   * @param params.maxContinuousFee - Largest market continuous fee accepted; pass `maxUint256` for no cap.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee paid out of the pulled assets.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy loan-token approval and `MidnightBundlesV2` authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when the target amount, `maxBuyerAssets` or `deadline` is not positive.
   * @throws {NegativeInputError} when `minUnits`, `maxContinuousFee` or `referralFeePct` is negative.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @example
   * ```ts
   * const output = midnight.takeLend({
   *   accountAddress: lender,
   *   marketData,
   *   target: { type: "assets", assets: 1_000_000n, minUnits: 900_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   maxContinuousFee: maxUint256,
   *   deadline: maxUint256,
   * });
   * ```
   */
  takeLend(
    params: TakeLendParams,
  ): MidnightActionOutput<MidnightTakeLendAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const market = params.marketData.params;
    const tx = midnightTakeLend({
      chainId: this.chainId,
      market,
      target: params.target,
      takeableOffers: params.takeableOffers,
      maxContinuousFee: params.maxContinuousFee,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    });
    const pulledAssets =
      params.target.type === "assets"
        ? params.target.assets
        : params.target.maxBuyerAssets;

    return {
      getRequirements: async () => {
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
   * @param params - Borrower, market snapshot, sell target, offers, deadline, receiver, and optional referral fee.
   * @param params.accountAddress - Borrower; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
   * @param params.receiver - Optional loan-asset recipient; defaults to `accountAddress`.
   * @param params.takeableOffers - Lend-side offers returned by the Midnight API.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the received assets.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy `MidnightBundlesV2` authorization requirement and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when the target amount, `maxUnits` or `deadline` is not positive.
   * @throws {NegativeInputError} when `minSellerAssets` or `referralFeePct` is negative.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @example
   * ```ts
   * const output = midnight.takeBorrow({
   *   accountAddress: borrower,
   *   marketData,
   *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: maxUint256,
   * });
   * ```
   */
  takeBorrow(
    params: TakeBorrowParams,
  ): MidnightActionOutput<MidnightTakeBorrowAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const tx = midnightTakeBorrow({
      chainId: this.chainId,
      market: params.marketData.params,
      target: params.target,
      receiver: params.receiver ?? params.accountAddress,
      takeableOffers: params.takeableOffers,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    });

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
   * @param params - Borrower, market snapshot, collateral supplies, sell target, offers, deadline, receiver, and optional referral fee.
   * @param params.accountAddress - Borrower; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.collateralSupplies - Collateral index and assets per supply; must not be empty.
   * @param params.target - `{ type: "assets", assets, maxUnits }` or `{ type: "units", units, minSellerAssets }`.
   * @param params.receiver - Optional loan-asset recipient; defaults to `accountAddress`.
   * @param params.takeableOffers - Lend-side offers returned by the Midnight API.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee taken from the received assets.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy collateral approvals and `MidnightBundlesV2` authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256`.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {EmptyMidnightCollateralSuppliesError} when no collateral supply is provided.
   * @throws {UnknownCollateralIndexError} when a collateral index is not configured.
   * @throws {NonPositiveInputError} when a supply amount, the target amount, `maxUnits` or `deadline` is not positive.
   * @throws {NegativeInputError} when `minSellerAssets` or `referralFeePct` is negative.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @example
   * ```ts
   * const output = midnight.supplyCollateralTakeBorrow({
   *   accountAddress: borrower,
   *   marketData,
   *   collateralSupplies: [{ collateralIndex: 0n, assets: 2_000_000n }],
   *   target: { type: "assets", assets: 1_000_000n, maxUnits: 1_100_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: maxUint256,
   * });
   * ```
   */
  supplyCollateralTakeBorrow(
    params: SupplyCollateralTakeBorrowParams,
  ): MidnightActionOutput<MidnightSupplyCollateralTakeBorrowAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const market = params.marketData.params;
    const tx = midnightSupplyCollateralTakeBorrow({
      chainId: this.chainId,
      market,
      collateralSupplies: params.collateralSupplies,
      target: params.target,
      receiver: params.receiver ?? params.accountAddress,
      takeableOffers: params.takeableOffers,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    });
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
      getRequirements: async () => {
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
   * @param params - Borrower, market snapshot, buy target, offers, repay fallback, withdrawals, fee cap, deadline and optional referral fee.
   * @param params.accountAddress - Borrower; must send the transaction, since V2 acts for `msg.sender`.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.target - `{ type: "assets", assets, minUnits }` or `{ type: "units", units, maxBuyerAssets }`.
   * @param params.takeableOffers - Borrow-side offers returned by the Midnight API.
   * @param params.repayEnabled - Whether the unfilled remainder is repaid directly to Midnight.
   * @param params.collateralWithdrawals - Optional collateral withdrawals; `maxUint256` assets withdraws the whole balance.
   * @param params.collateralReceiver - Optional collateral recipient; defaults to `accountAddress`.
   * @param params.maxContinuousFee - Largest market continuous fee accepted; pass `maxUint256` for no cap.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.referralFeePct - Optional WAD-scaled referral fee paid out of the pulled assets.
   * @param params.referralFeeRecipient - Referral fee recipient; required with a positive fee.
   * @returns Lazy loan-token approval and `MidnightBundlesV2` authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when the target amount, a withdrawal amount or `deadline` is not positive.
   * @throws {NegativeInputError} when the target bound or `maxContinuousFee` is negative.
   * @throws {UnknownCollateralIndexError} when a withdrawal targets a collateral index not configured on the market.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @throws {ReferralFeePctExceededError} when `referralFeePct` is not below WAD.
   * @throws {ReferralFeeRecipientMissingError} when a positive referral fee has no recipient.
   * @example
   * ```ts
   * const output = midnight.takeRepayWithdrawCollateral({
   *   accountAddress: borrower,
   *   marketData,
   *   target: { type: "units", units: 1_000_000n, maxBuyerAssets: 990_000n },
   *   takeableOffers: quote.data.takeableOffers,
   *   repayEnabled: true,
   *   collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
   *   maxContinuousFee: maxUint256,
   *   deadline: maxUint256,
   * });
   * ```
   */
  takeRepayWithdrawCollateral(
    params: TakeRepayWithdrawCollateralParams,
  ): MidnightActionOutput<MidnightTakeRepayWithdrawCollateralAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const market = params.marketData.params;
    const tx = midnightTakeRepayWithdrawCollateral({
      chainId: this.chainId,
      market,
      target: params.target,
      takeableOffers: params.takeableOffers,
      repayEnabled: params.repayEnabled,
      collateralWithdrawals: params.collateralWithdrawals ?? [],
      collateralReceiver: params.collateralReceiver ?? params.accountAddress,
      maxContinuousFee: params.maxContinuousFee,
      deadline: params.deadline,
      referralFeePct: params.referralFeePct,
      referralFeeRecipient: params.referralFeeRecipient,
      metadata: this.client.options.metadata,
    });
    const pulledAssets =
      params.target.type === "assets"
        ? params.target.assets
        : params.target.maxBuyerAssets;

    return {
      getRequirements: async () => {
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
   * @param params.accountAddress - Account receiving the supplied collateral position.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.collateralAssets - Collateral assets supplied in this transaction.
   * @param params.reservedCollateralAssets - Existing collateral reserved by other open maker groups.
   * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
   * @returns Lazy token-approval requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when `collateralAssets` is non-positive.
   * @throws {NegativeInputError} when `reservedCollateralAssets` is negative.
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
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    assertNonNegativeAmount(
      "reservedCollateralAssets",
      params.reservedCollateralAssets ?? 0n,
    );

    const market = params.marketData;
    const collateralIndex = params.collateralIndex ?? 0n;
    const collateral = market.getCollateralByIndex(collateralIndex);
    const midnight = getChainAddress(this.chainId, "midnight");

    return {
      getRequirements: async () =>
        await getMidnightApprovalRequirements({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          token: collateral.token,
          owner: params.accountAddress,
          spender: midnight,
          amount:
            params.collateralAssets + (params.reservedCollateralAssets ?? 0n),
        }),
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
   * One transaction cancels `cancellations` under their consumption ceilings, activates the
   * PriceRatifierV1 or RateRatifierV1 root, and publishes its payload. Pass no cancellations
   * for a new publication. Calls the Midnight mempool validation API while preparing the tree.
   *
   * @param params - Maker, lend-side offers, loan reserve, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @param params.loanToken - Loan token shared by every offer market.
   * @param params.loanAssets - New loan reserve assigned to the published groups.
   * @param params.reservedLoanAssets - Existing loan assets reserved by other open groups.
   * @returns Prepared group metadata, lazy approval/authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {NonPositiveInputError} when `loanAssets` is non-positive.
   * @throws {NegativeInputError} when `reservedLoanAssets` or a `maxConsumed` ceiling is negative.
   * @throws {NonPositiveInputError} when `deadline` is not positive.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer uses another loan token.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
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
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount(
      "reservedLoanAssets",
      params.reservedLoanAssets ?? 0n,
    );

    const data = await this.getOffersData(params);
    validateOfferSides(data.tree.offers, true);
    data.tree.offers.forEach((offer, index) => {
      const market =
        "params" in offer.market ? offer.market.params : offer.market;
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
      getRequirements: async () => {
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
   * Blue markets with no supply shares. Calls the Midnight mempool validation API while
   * preparing the tree. Computes the callback's CREATE2 address from the chain's
   * `midnightBlueBuyCallbackFactory`, `accountAddress` and `callbackSalt`, and reads `market(id)`
   * on the chain's `blue` for its supply shares.
   *
   * @param params - Maker, lend-side offers, Blue market, parked assets, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @param params.blueMarket - Morpho Blue market the parked assets are supplied to.
   * @param params.assetsToPark - Loan assets supplied to `blueMarket` for the maker's callback.
   * @param params.callbackSalt - Salt selecting the maker's callback; the same salt reuses the same callback.
   * @returns Prepared group metadata, lazy approval/authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2`, `midnightBlueBuyCallbackFactory`, `midnight`, `blue` or V1 ratifier deployment.
   * @throws {NonPositiveInputError} when `assetsToPark` is non-positive.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {NonPositiveInputError} when `deadline` is not positive.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer's loan token differs from `blueMarket`'s.
   * @throws {MidnightOfferCallbackMismatchError} when an offer does not use the maker's derived callback.
   * @throws {MidnightOfferCallbackDataMismatchError} when an offer's callback data is not `abi.encode(blueMarket)`.
   * @throws {EmptyBlueParkingMarketError} when `blueMarket` has no supply shares.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @example
   * ```ts
   * const callback = getMidnightBlueBuyCallbackAddress({ chainId, owner: maker, salt: callbackSalt });
   * const callbackData = encodeAbiParameters([marketParamsAbi], [blueMarket]);
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
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    assertPositiveAmount("assetsToPark", params.assetsToPark);
    const { callbackSalt } = params;
    const blueMarketId = BlueMarketUtils.getMarketId(params.blueMarket);

    const callback = getMidnightBlueBuyCallbackAddress({
      chainId: this.chainId,
      owner: params.accountAddress,
      salt: callbackSalt,
    });
    const [data, [, totalSupplyShares]] = await Promise.all([
      this.getOffersData(params),
      readContract(this.client.viemClient, {
        address: getChainAddress(this.chainId, "blue"),
        abi: blueAbi,
        functionName: "market",
        args: [blueMarketId],
      }),
    ]);
    if (totalSupplyShares === 0n) {
      throw new EmptyBlueParkingMarketError({ marketId: blueMarketId });
    }
    validateOfferSides(data.tree.offers, true);
    const callbackData = encodeAbiParameters(
      [marketParamsAbi],
      [params.blueMarket],
    );
    data.tree.offers.forEach((offer, index) => {
      const market =
        "params" in offer.market ? offer.market.params : offer.market;
      if (!isAddressEqual(market.loanToken, params.blueMarket.loanToken)) {
        throw new MidnightOfferMarketLoanTokenMismatchError({
          index,
          expectedLoanToken: params.blueMarket.loanToken,
          actualLoanToken: market.loanToken,
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
      cancellations: params.cancellations ?? [],
      deadline: params.deadline,
      metadata: this.client.options.metadata,
    });

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async () => {
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
   * Prepares an atomic borrow-offer publication or repost through `MidnightBundlesV2`.
   *
   * One transaction cancels `cancellations` under their consumption ceilings, activates the
   * PriceRatifierV1 or RateRatifierV1 root, and publishes its payload. Pass no cancellations for
   * a new publication. Calls the Midnight mempool validation API while preparing the tree.
   *
   * @param params - Maker, borrow-side offers, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @returns Prepared group metadata, lazy authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client chain differs from this entity's chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {NonPositiveInputError} when `deadline` is not positive.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
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
    const data = await this.getOffersData(params);
    validateOfferSides(data.tree.offers, false);
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
   * Reuses {@link MorphoMidnight.makeBorrow} publication and requirement handling.
   * No tokens are pulled during publication and no token approval is required.
   * Execution waits for a taker; publication does not close the position or withdraw collateral.
   * Every offer must already have `buy = false` and `reduceOnly = true`.
   * The supplied tree, group caps and prices are preserved; no separate root signature is needed.
   *
   * @param params - Maker, reduce-only offers, optional cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @returns Prepared root and groups, lazy requirements, and a synchronous publication builder.
   * @throws {ChainIdMismatchError} when the client chain differs from this entity's chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {NonPositiveInputError} when `deadline` is not positive.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {MidnightOfferNotReduceOnlyError} when any offer can increase a position.
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
    const tree = Tree.from(params.offers);
    // Reject the wrong exit intent before calling the mempool validation API.
    validateOfferSides(tree.offers, false);
    for (const [index, offer] of tree.offers.entries()) {
      if (!offer.reduceOnly)
        throw new MidnightOfferNotReduceOnlyError({ index });
    }
    return this.makeBorrow({ ...params, offers: tree });
  }

  /**
   * Publishes reduce-only buy offers for a borrow limit exit through MidnightBundlesV2.
   *
   * Reuses {@link MorphoMidnight.makeLend} publication and requirement handling.
   * Loan assets are pulled by Midnight when the offers fill, not during publication.
   * The loan reserve uses the same approval sizing as `makeLend`.
   * Execution waits for a taker; publication does not close the position or withdraw collateral.
   * Every offer must already have `buy = true` and `reduceOnly = true`.
   * The supplied tree, group caps and prices are preserved; no separate root signature is needed.
   *
   * @param params - Maker, reduce-only offers, optional cancellations, loan reserve, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @param params.loanToken - Loan token shared by every offer market.
   * @param params.loanAssets - New loan reserve assigned to the published groups.
   * @param params.reservedLoanAssets - Existing loan assets reserved by other open groups.
   * @returns Prepared root and groups, lazy requirements, and a synchronous publication builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {NonPositiveInputError} when `loanAssets` is non-positive.
   * @throws {NegativeInputError} when `reservedLoanAssets` or a `maxConsumed` ceiling is negative.
   * @throws {NonPositiveInputError} when `deadline` is not positive.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer uses another loan token.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
   * @throws {MidnightOfferNotReduceOnlyError} when any offer can increase a position.
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
    const tree = Tree.from(params.offers);
    // Reject the wrong exit intent before calling the mempool validation API.
    validateOfferSides(tree.offers, true);
    for (const [index, offer] of tree.offers.entries()) {
      if (!offer.reduceOnly)
        throw new MidnightOfferNotReduceOnlyError({ index });
    }
    return this.makeLend({ ...params, offers: tree });
  }

  /**
   * Prepares an atomic borrow-offer publication or repost through `MidnightBundlesV2`,
   * requiring collateral before activation.
   *
   * One transaction cancels `cancellations` under their consumption ceilings, pulls and supplies
   * required `collateral`, activates the PriceRatifierV1 or RateRatifierV1 root, and publishes its
   * payload. Pass no cancellations for a new publication. Calls the Midnight mempool validation
   * API while preparing the tree.
   *
   * @param params - Maker, borrow-side offers, required collateral, cancellations, and deadline.
   * @param params.accountAddress - Maker expected on every offer; must send the transaction.
   * @param params.offers - PriceRatifierV1 or RateRatifierV1 tree, or its `Tree.create` request.
   * @param params.cancellations - Previous groups to cancel with their consumption ceilings.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @param params.collateral - Required market and collateral supplies; every offer must target that market.
   * @param params.collateral.market - Midnight market receiving the collateral; every offer must target it.
   * @param params.collateral.supplies - Collateral index and assets per supply; must not be empty.
   * @returns Prepared group metadata, lazy approval/authorization requirements, and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client or collateral market targets another chain.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` or V1 ratifier deployment.
   * @throws {MidnightMarketAddressMismatchError} when the collateral market targets another Midnight deployment.
   * @throws {UnknownCollateralIndexError} when a collateral index is not configured.
   * @throws {NonPositiveInputError} when a collateral supply amount is non-positive.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {NonPositiveInputError} when `deadline` is not positive.
   * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128` or `deadline` exceeds `uint256`.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferRatifierMismatchError} when an offer does not use its tree's ratifier.
   * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
   * @throws {MarketIdMismatchError} when an offer targets another market than `collateral.market`.
   * @throws {EmptyMidnightCollateralSuppliesError} when a collateral market has no collateral supplies.
   * @throws {MidnightReplacementGroupCancelledError} when a published group is also cancelled.
   * @throws {DuplicateMidnightGroupCancellationError} when a cancelled group appears more than once.
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
    const market =
      params.collateral.market instanceof MarketParams
        ? params.collateral.market
        : MarketParams.from(params.collateral.market);

    const data = await this.getOffersData(params);
    validateOfferSides(data.tree.offers, false);
    const marketId = MarketUtils.toId(market);
    for (const offer of data.tree.offers) {
      const offerMarketId = MarketUtils.toId(offer.market);
      if (offerMarketId.toLowerCase() !== marketId.toLowerCase()) {
        throw new MarketIdMismatchError(offerMarketId, marketId);
      }
    }

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
      getRequirements: async () => {
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
   * @param params.accountAddress - Position owner whose credit is redeemed.
   * @param params.positionData - Accrued position and hydrated market snapshot.
   * @param params.receiver - Optional credit receiver; defaults to the position owner.
   * @param params.units - Optional credit units to redeem; defaults to the position face value.
   * @returns No requirements and a synchronous redemption transaction builder.
   * @throws {ChainIdMismatchError} when the position market targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when the position market targets another Midnight deployment.
   * @throws {MissingAccrualPositionError} when no position snapshot is supplied.
   * @throws {AccrualPositionUserMismatchError} when the position snapshot belongs to another account.
   * @throws {NoMidnightCreditToRedeemError} when the selected unit amount is non-positive.
   * @throws {MidnightRedeemExceedsCreditError} when the selected amount exceeds position credit.
   * @throws {InsufficientMidnightWithdrawableLiquidityError} when market liquidity cannot cover the redemption.
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
    if (!params.positionData) {
      throw new MissingAccrualPositionError();
    }
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
    const units = params.units ?? params.positionData.faceValue;
    if (params.units !== undefined && units <= 0n) {
      throw new NonPositiveInputError("units", units);
    }
    if (units <= 0n) throw new NoMidnightCreditToRedeemError(market.id);
    if (params.positionData.credit < units) {
      throw new MidnightRedeemExceedsCreditError({
        market: market.id,
        units,
        credit: params.positionData.credit,
      });
    }
    if (market.withdrawable < units) {
      throw new InsufficientMidnightWithdrawableLiquidityError({
        market: market.id,
        units,
        withdrawable: market.withdrawable,
      });
    }

    return {
      getRequirements: async () => {
        return [];
      },
      buildTx: () =>
        midnightRedeem({
          chainId: this.chainId,
          market: market.params,
          units,
          onBehalf: params.accountAddress,
          receiver: params.receiver,
          metadata: this.client.options.metadata,
        }),
    };
  }

  /**
   * Prepares a direct `MidnightBundlesV2` repayment, collateral withdrawal, or both, for `accountAddress`.
   *
   * @param params - Account, market snapshot, repaid units, asset cap, withdrawals, and deadline.
   * @param params.accountAddress - Position owner and transaction sender.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.repay - `{ type: "assets", assets }` (`0n` to only withdraw) or `{ type: "full", maxBuyerAssets }`; the pulled amount is approved and any unused part refunded.
   * @param params.collateralWithdrawals - Optional withdrawals; `assets: maxUint256` withdraws the full balance.
   * @param params.collateralReceiver - Optional collateral recipient; defaults to `accountAddress`.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @returns Lazy loan approval/authorization requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NegativeInputError} when `repay.assets` is negative.
   * @throws {NonPositiveInputError} when nothing is repaid or withdrawn, a withdrawal amount is zero, `repay.maxBuyerAssets` is zero, or `deadline` is not positive.
   * @throws {InputExceedsMaxError} when `repay.maxBuyerAssets` is `maxUint256` or `deadline` exceeds uint256.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {UnknownCollateralIndexError} when a withdrawal selects an unconfigured collateral.
   * @example
   * ```ts
   * // Close the position: repay all debt, withdraw all collateral.
   * const output = midnight.repayWithdrawCollateral({
   *   accountAddress: borrower,
   *   marketData,
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
    const market = params.marketData.params;
    const tx = midnightRepayWithdrawCollateral({
      chainId: this.chainId,
      market,
      repay: params.repay,
      collateralWithdrawals: params.collateralWithdrawals ?? [],
      collateralReceiver: params.collateralReceiver ?? params.accountAddress,
      deadline: params.deadline,
      metadata: this.client.options.metadata,
    });

    const pulledAssets =
      params.repay.type === "assets"
        ? params.repay.assets
        : params.repay.maxBuyerAssets;

    return {
      getRequirements: async () => {
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
   * Prepares full cancellation of a maker offer group.
   *
   * @param params - Group id and maker account whose consumption is updated.
   * @param params.group - Offer group id to fully consume.
   * @param params.accountAddress - Maker whose group consumption is updated.
   * @returns No requirements and a synchronous cancellation transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @example
   * ```ts
   * const output = midnight.cancelOffer({
   *   group,
   *   accountAddress: maker,
   * });
   * ```
   */
  cancelOffer(params: {
    readonly group: Hex;
    readonly accountAddress: Address;
  }): MidnightActionOutput<MidnightCancelOfferAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return {
      getRequirements: async () => {
        return [];
      },
      buildTx: () =>
        midnightCancelOffer({
          chainId: this.chainId,
          group: params.group,
          onBehalf: params.accountAddress,
          metadata: this.client.options.metadata,
        }),
    };
  }

  /**
   * Prepares guarded cancellation of several maker offer groups through `MidnightBundlesV2`.
   *
   * The transaction reverts as a whole when any group's consumption exceeds its
   * `maxConsumed` ceiling, so fills landing before execution never leave a partial cancel.
   *
   * @param params - Maker account, groups with consumption ceilings, and deadline.
   * @param params.accountAddress - Maker that must send the transaction; V2 cancels for `msg.sender`,
   *   so sending from another account cancels that account's groups instead.
   * @param params.cancellations - Offer groups and the largest consumption accepted for each.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @returns Lazy Midnight authorization requirement for `MidnightBundlesV2` and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
   * @throws {UnknownAddressError} when the chain has no `midnightBundlesV2` deployment.
   * @throws {EmptyMidnightGroupCancellationsError} when no groups are provided.
   * @throws {DuplicateMidnightGroupCancellationError} when a group appears more than once.
   * @throws {NonPositiveInputError} when `deadline` is not positive.
   * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
   * @throws {InputExceedsMaxError} when `deadline` exceeds `uint256` or a `maxConsumed` ceiling exceeds `uint128`.
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

    const tx = midnightCancelAndMake({
      chainId: this.chainId,
      cancellations: params.cancellations,
      deadline: params.deadline,
      metadata: this.client.options.metadata,
    });

    return {
      getRequirements: () =>
        this.getBundlesV2AuthorizationRequirements(params.accountAddress),
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
