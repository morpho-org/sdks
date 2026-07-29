import {
  type AccrualPosition,
  EcrecoverRatifierUtils,
  fetchAccrualPosition,
  fetchMarket,
  InvalidTreeError,
  type Market,
  MarketParams,
  MarketUtils,
  type MidnightFetchParams,
  Payload,
  SetterRatifierUtils,
  Tree,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  isAddressEqual,
  type TypedDataDefinition,
  type WalletClient,
} from "viem";
import {
  mempoolSubmitOffers,
  midnightCancelOffer,
  midnightRedeem,
  midnightRepayWithdrawCollateral,
  midnightSupplyCollateral,
  midnightSupplyCollateralTakeBorrow,
  midnightTakeBorrow,
  midnightTakeLend,
} from "../../actions/midnight/index.js";
import {
  getMidnightApprovalRequirements,
  getMidnightAuthorizationRequirement,
  getSetterRatifierRatifyRootRequirement,
} from "../../actions/requirements/index.js";
import { validateChainId } from "../../helpers/index.js";
import { signAndVerifyTypedData } from "../../helpers/signAndVerifyTypedData.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import { validateTakeableOffers } from "../../helpers/validateTakeableOffers.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AccrualPositionUserMismatchError,
  type ActionRequirement,
  InsufficientMidnightWithdrawableLiquidityError,
  MarketIdMismatchError,
  type MidnightCancelOfferAction,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferRootMismatchError,
  MidnightOfferRootOfferCountMismatchError,
  MidnightOfferRootOwnerMismatchError,
  MidnightOfferRootRatifierMismatchError,
  type MidnightOfferRootSignatureAction,
  type MidnightRedeemAction,
  MidnightRedeemExceedsCreditError,
  type MidnightRepayWithdrawCollateralAction,
  type MidnightSupplyCollateralAction,
  type MidnightSupplyCollateralTakeBorrowAction,
  type MidnightTakeBorrowAction,
  type MidnightTakeLendAction,
  MissingAccrualPositionError,
  MissingMidnightOfferRootSignatureError,
  NegativeInputError,
  NoMidnightCreditToRedeemError,
  NonPositiveInputError,
  selectRequirementSignatures,
  UnknownMidnightRatifierError,
  UnpreparedMidnightOfferRootSignatureError,
} from "../../types/index.js";
import type {
  GetOffersDataParams,
  GetPositionDataParams,
  MakeLendParams,
  MakeOffersOutput,
  MakeOffersParams,
  MidnightActionOutput,
  MidnightActionSignatures,
  OffersData,
  RedeemParams,
  RepayWithdrawCollateralParams,
  SupplyCollateralMakeBorrowParams,
  SupplyCollateralParams,
  SupplyCollateralTakeBorrowParams,
  TakeBorrowParams,
  TakeLendParams,
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
 *   assets: BigInt(quote.data.availableAssets),
 *   minUnits: BigInt(quote.data.availableUnits),
 *   takeableOffers: quote.data.takeableOffers,
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
  | "supplyCollateral"
  | "makeLend"
  | "makeBorrow"
  | "supplyCollateralMakeBorrow"
  | "redeem"
  | "repayWithdrawCollateral"
  | "cancelOffer"
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
   * @param params.offers - Offer, group, tree, or list accepted by `Tree.create`.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @returns Prepared tree data used by maker flows.
   * @throws {ChainIdMismatchError} when the client chain differs from this entity's chain.
   * @throws {InvalidTreeError} when the input does not form a non-empty valid tree.
   * @throws {MidnightOfferMakerMismatchError} when an offer belongs to another maker.
   * @throws {MidnightOfferMarketChainMismatchError} when an offer targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {UnknownMidnightRatifierError} when the tree uses an unsupported ratifier.
   * @example
   * ```ts
   * const offersData = await midnight.getOffersData({
   *   accountAddress: maker,
   *   offers: [offer],
   * });
   * ```
   */
  async getOffersData(params: GetOffersDataParams): Promise<OffersData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const tree = Tree.from(params.offers);
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
    const firstOffer = tree.offers[0];
    if (firstOffer == null) {
      throw new InvalidTreeError("Tree must contain at least one offer.");
    }
    const ratifier = firstOffer.ratifier;
    const ecrecoverRatifier = getChainAddress(
      this.chainId,
      "ecrecoverRatifier",
    );
    const setterRatifier = getChainAddress(this.chainId, "setterRatifier");
    const ratifierType = isAddressEqual(ratifier, ecrecoverRatifier)
      ? "ecrecover"
      : isAddressEqual(ratifier, setterRatifier)
        ? "setter"
        : undefined;
    if (ratifierType == null) {
      throw new UnknownMidnightRatifierError({
        ratifier,
        ecrecoverRatifier,
        setterRatifier,
      });
    }

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

    if (ratifierType === "setter") {
      // Setter ratifier payload generation validates that the created tree has one ratifier.
      const items = SetterRatifierUtils.ratify({ tree });
      return {
        accountAddress: params.accountAddress,
        groups,
        tree,
        ratifierType,
        ratifier,
        setterPayload: await Payload.encode(items),
      };
    }
    // Ecrecover typed-data generation validates that the created tree has one ratifier.
    EcrecoverRatifierUtils.typedData({ tree, chainId: this.chainId });

    return {
      accountAddress: params.accountAddress,
      groups,
      tree,
      ratifierType,
      ratifier,
    };
  }

  /**
   * Prepares a lend-side take using caller-provided market data and API offers.
   *
   * @param params - Lender, market snapshot, target assets, units, offers, and deadline.
   * @param params.accountAddress - Lender executing the take.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.assets - Loan assets spent by the lender.
   * @param params.minUnits - Minimum credit units accepted.
   * @param params.takeableOffers - Borrow-side offers returned by the Midnight API.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @returns Lazy approval/authorization requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when `assets` is non-positive.
   * @throws {NegativeInputError} when `minUnits` or `deadline` is negative.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @example
   * ```ts
   * const output = midnight.takeLend({
   *   accountAddress: lender,
   *   marketData,
   *   assets: 1_000_000n,
   *   minUnits: 900_000n,
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: maxUint256,
   * });
   * ```
   */
  takeLend(
    params: TakeLendParams,
  ): MidnightActionOutput<MidnightTakeLendAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("assets", params.assets);
    assertNonNegativeAmount("minUnits", params.minUnits);
    assertNonNegativeAmount("deadline", params.deadline);
    // Reject inconsistent quotes before exposing requirement reads.
    validateTakeableOffers({
      market: params.marketData.params,
      takeableOffers: params.takeableOffers,
      expectedBuy: false,
    });

    const market = params.marketData;
    const midnightBundles = getChainAddress(this.chainId, "midnightBundles");

    return {
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [
          ...(await getMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: market.params.loanToken,
            owner: params.accountAddress,
            spender: midnightBundles,
            amount: params.assets,
          })),
        ];
        const authorization = await getMidnightAuthorizationRequirement({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          owner: params.accountAddress,
          authorized: midnightBundles,
        });
        if (authorization) requirements.push(authorization);

        return requirements;
      },
      buildTx: () =>
        midnightTakeLend({
          chainId: this.chainId,
          market: market.params,
          assets: params.assets,
          minUnits: params.minUnits,
          taker: params.accountAddress,
          takeableOffers: params.takeableOffers,
          deadline: params.deadline,
          metadata: this.client.options.metadata,
        }),
    };
  }

  /**
   * Prepares a borrow-side take using caller-provided market data and API offers.
   *
   * @param params - Borrower, market snapshot, target assets, unit cap, offers, and deadline.
   * @param params.accountAddress - Borrower executing the take.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.loanAssets - Loan assets received by the borrower.
   * @param params.maxUnits - Maximum debt units accepted.
   * @param params.takeableOffers - Lend-side offers returned by the Midnight API.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @returns Lazy authorization requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when `loanAssets` or `maxUnits` is non-positive.
   * @throws {NegativeInputError} when `deadline` is negative.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @example
   * ```ts
   * const output = midnight.takeBorrow({
   *   accountAddress: borrower,
   *   marketData,
   *   loanAssets: 1_000_000n,
   *   maxUnits: 1_100_000n,
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: maxUint256,
   * });
   * ```
   */
  takeBorrow(
    params: TakeBorrowParams,
  ): MidnightActionOutput<MidnightTakeBorrowAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertPositiveAmount("maxUnits", params.maxUnits);
    assertNonNegativeAmount("deadline", params.deadline);
    // Reject inconsistent quotes before exposing requirement reads.
    validateTakeableOffers({
      market: params.marketData.params,
      takeableOffers: params.takeableOffers,
      expectedBuy: true,
    });

    const market = params.marketData;
    const midnightBundles = getChainAddress(this.chainId, "midnightBundles");

    return {
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [];
        const authorization = await getMidnightAuthorizationRequirement({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          owner: params.accountAddress,
          authorized: midnightBundles,
        });
        if (authorization) requirements.push(authorization);

        return requirements;
      },
      buildTx: () =>
        midnightTakeBorrow({
          chainId: this.chainId,
          market: market.params,
          loanAssets: params.loanAssets,
          maxUnits: params.maxUnits,
          taker: params.accountAddress,
          takeableOffers: params.takeableOffers,
          deadline: params.deadline,
          metadata: this.client.options.metadata,
        }),
    };
  }

  /**
   * Prepares one bundle that supplies collateral and takes borrow-side offers.
   *
   * @param params - Borrower, market snapshot, collateral and loan amounts, unit cap, offers, and deadline.
   * @param params.accountAddress - Borrower executing the bundle.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.collateralAssets - Collateral assets supplied before borrowing.
   * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
   * @param params.loanAssets - Loan assets received by the borrower.
   * @param params.maxUnits - Maximum debt units accepted.
   * @param params.takeableOffers - Lend-side offers returned by the Midnight API.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @returns Lazy collateral approval/authorization requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NonPositiveInputError} when collateral, loan assets, or `maxUnits` is non-positive.
   * @throws {NegativeInputError} when `deadline` is negative.
   * @throws {UnknownCollateralIndexError} when the selected collateral is not configured.
   * @throws {EmptyMidnightTakeableOffersError} when no offers are supplied.
   * @throws {MidnightOfferSideMismatchError} when an offer has the wrong maker side.
   * @throws {MidnightTakeableOfferMarketMismatchError} when an offer targets another market.
   * @example
   * ```ts
   * const output = midnight.supplyCollateralTakeBorrow({
   *   accountAddress: borrower,
   *   marketData,
   *   collateralAssets: 2_000_000n,
   *   loanAssets: 1_000_000n,
   *   maxUnits: 1_100_000n,
   *   takeableOffers: quote.data.takeableOffers,
   *   deadline: maxUint256,
   * });
   * ```
   */
  supplyCollateralTakeBorrow(
    params: SupplyCollateralTakeBorrowParams,
  ): MidnightActionOutput<MidnightSupplyCollateralTakeBorrowAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertPositiveAmount("maxUnits", params.maxUnits);
    assertNonNegativeAmount("deadline", params.deadline);
    // Reject inconsistent quotes before exposing requirement reads.
    validateTakeableOffers({
      market: params.marketData.params,
      takeableOffers: params.takeableOffers,
      expectedBuy: true,
    });

    const market = params.marketData;
    const collateralIndex = params.collateralIndex ?? 0n;
    const midnightBundles = getChainAddress(this.chainId, "midnightBundles");
    const collateral = market.getCollateralByIndex(collateralIndex);

    return {
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [
          ...(await getMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: collateral.token,
            owner: params.accountAddress,
            spender: midnightBundles,
            amount: params.collateralAssets,
          })),
        ];
        const authorization = await getMidnightAuthorizationRequirement({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          owner: params.accountAddress,
          authorized: midnightBundles,
        });
        if (authorization) requirements.push(authorization);

        return requirements;
      },
      buildTx: () =>
        midnightSupplyCollateralTakeBorrow({
          chainId: this.chainId,
          market: market.params,
          collateralAssets: params.collateralAssets,
          loanAssets: params.loanAssets,
          maxUnits: params.maxUnits,
          taker: params.accountAddress,
          collateralIndex,
          takeableOffers: params.takeableOffers,
          deadline: params.deadline,
          metadata: this.client.options.metadata,
        }),
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
   * Validates lend-side maker offers and prepares their reserve and ratifier requirements.
   *
   * Calls the Midnight mempool validation API while preparing the offer tree;
   * allowance and ratifier state are read lazily by `getRequirements()`.
   *
   * @param params - Maker, raw offers, loan token, reserve amounts, and validation controls.
   * @param params.accountAddress - Maker expected on every offer.
   * @param params.offers - Raw lend-side offers or groups.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @param params.loanToken - Loan token shared by every offer market.
   * @param params.loanAssets - New loan reserve assigned to the submitted groups.
   * @param params.reservedLoanAssets - Existing loan assets reserved by other open groups.
   * @returns Prepared group metadata, lazy requirements, and a synchronous mempool transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {NonPositiveInputError} when `loanAssets` is non-positive.
   * @throws {NegativeInputError} when `reservedLoanAssets` is negative.
   * @throws {MidnightOfferSideMismatchError} when an offer is not lend-side.
   * @throws {MidnightOfferMarketLoanTokenMismatchError} when an offer uses another loan token.
   * @example
   * ```ts
   * const output = await midnight.makeLend({
   *   accountAddress: maker,
   *   offers: [offer],
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

    const data = await this.getOffersData({
      accountAddress: params.accountAddress,
      offers: params.offers,
      validation: params.validation,
    });
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
    const midnight = getChainAddress(this.chainId, "midnight");
    const signedPayloads = new Map<string, Hex>();

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [];
        requirements.push(
          ...(await getMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: params.loanToken,
            owner: data.accountAddress,
            spender: midnight,
            amount: params.loanAssets + (params.reservedLoanAssets ?? 0n),
          })),
        );
        requirements.push(
          ...(await this.getRatifierRequirements({
            offersData: data,
            signedPayloads,
          })),
        );

        return requirements;
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          offersData: data,
          signatures,
          signedPayloads,
        }),
    };
  }

  /**
   * Validates borrow-side maker offers and prepares their ratifier requirements.
   *
   * @param params - Maker, raw borrow-side offers, and optional mempool validation controls.
   * @param params.accountAddress - Maker expected on every offer.
   * @param params.offers - Raw borrow-side offers or groups.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @returns Prepared group metadata, lazy ratifier requirements, and a synchronous mempool transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {MidnightOfferMarketAddressMismatchError} when an offer targets another Midnight deployment.
   * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
   * @example
   * ```ts
   * const output = await midnight.makeBorrow({
   *   accountAddress: maker,
   *   offers: [offer],
   * });
   * ```
   */
  async makeBorrow(params: MakeOffersParams): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const data = await this.getOffersData({
      accountAddress: params.accountAddress,
      offers: params.offers,
      validation: params.validation,
    });
    validateOfferSides(data.tree.offers, false);
    const signedPayloads = new Map<string, Hex>();

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async () => {
        return await this.getRatifierRequirements({
          offersData: data,
          signedPayloads,
        });
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          offersData: data,
          signatures,
          signedPayloads,
        }),
    };
  }

  /**
   * Prepares collateral supply followed by borrow-side maker-offer submission.
   *
   * @param params - Maker, market, collateral reserve, raw offers, and validation controls.
   * @param params.accountAddress - Maker expected on every offer.
   * @param params.offers - Raw borrow-side offers or groups.
   * @param params.validation - Optional Midnight mempool API request controls.
   * @param params.market - Market shared by every submitted offer.
   * @param params.collateralAssets - Collateral supplied before offer submission.
   * @param params.reservedCollateralAssets - Existing collateral reserved by other open groups.
   * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
   * @returns Prepared group metadata, lazy supply/ratifier requirements, and a synchronous mempool transaction builder.
   * @throws {ChainIdMismatchError} when the client targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
   * @throws {NonPositiveInputError} when `collateralAssets` is non-positive.
   * @throws {NegativeInputError} when `reservedCollateralAssets` is negative.
   * @throws {UnknownCollateralIndexError} when the selected collateral is not configured.
   * @throws {MidnightOfferSideMismatchError} when an offer is not borrow-side.
   * @throws {MarketIdMismatchError} when an offer targets another market.
   * @example
   * ```ts
   * const output = await midnight.supplyCollateralMakeBorrow({
   *   accountAddress: maker,
   *   market: marketData.params,
   *   collateralAssets: 2_000_000n,
   *   offers: [offer],
   * });
   * ```
   */
  async supplyCollateralMakeBorrow(
    params: SupplyCollateralMakeBorrowParams,
  ): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    assertNonNegativeAmount(
      "reservedCollateralAssets",
      params.reservedCollateralAssets ?? 0n,
    );

    const market =
      params.market instanceof MarketParams
        ? params.market
        : MarketParams.from(params.market);
    // Reject markets from another chain deployment before preparing requirements.
    validateMidnightMarket({ market, chainId: this.chainId });
    const collateralIndex = params.collateralIndex ?? 0n;
    const collateral = MarketUtils.getCollateralByIndex(
      market,
      collateralIndex,
    );

    const data = await this.getOffersData({
      accountAddress: params.accountAddress,
      offers: params.offers,
      validation: params.validation,
    });
    validateOfferSides(data.tree.offers, false);
    const marketId = MarketUtils.toId(market);
    for (const offer of data.tree.offers) {
      const offerMarketId = MarketUtils.toId(offer.market);
      if (offerMarketId.toLowerCase() !== marketId.toLowerCase()) {
        throw new MarketIdMismatchError(offerMarketId, marketId);
      }
    }
    const midnight = getChainAddress(this.chainId, "midnight");
    const signedPayloads = new Map<string, Hex>();

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [
          ...(await getMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: collateral.token,
            owner: data.accountAddress,
            spender: midnight,
            amount:
              params.collateralAssets + (params.reservedCollateralAssets ?? 0n),
          })),
          midnightSupplyCollateral({
            chainId: this.chainId,
            market,
            collateralIndex,
            assets: params.collateralAssets,
            onBehalf: data.accountAddress,
            metadata: this.client.options.metadata,
          }),
          ...(await this.getRatifierRequirements({
            offersData: data,
            signedPayloads,
          })),
        ];

        return requirements;
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          offersData: data,
          signatures,
          signedPayloads,
        }),
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
      getRequirements: async () => [],
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
   * Prepares a bundle that repays debt, withdraws collateral, or performs both.
   *
   * @param params - Account, market snapshot, repay and withdrawal amounts, collateral index, and deadline.
   * @param params.accountAddress - Position owner whose debt or collateral is updated.
   * @param params.marketData - Hydrated market snapshot used for validation and transaction construction.
   * @param params.repayAssets - Loan assets repaid; may be zero for withdrawal-only flows.
   * @param params.withdrawCollateralAssets - Collateral assets withdrawn; may be zero for repay-only flows.
   * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
   * @param params.deadline - Bundle execution deadline timestamp.
   * @returns Lazy loan approval/authorization requirements and a synchronous transaction builder.
   * @throws {ChainIdMismatchError} when client or market data targets another chain.
   * @throws {MidnightMarketAddressMismatchError} when market data targets another Midnight deployment.
   * @throws {NegativeInputError} when an amount, index, or deadline is negative.
   * @throws {NonPositiveInputError} when both repay and withdrawal amounts are zero.
   * @throws {UnknownCollateralIndexError} when a positive withdrawal selects an unconfigured collateral.
   * @example
   * ```ts
   * const output = midnight.repayWithdrawCollateral({
   *   accountAddress: borrower,
   *   marketData,
   *   repayAssets: 1_000_000n,
   *   withdrawCollateralAssets: 2_000_000n,
   *   deadline: maxUint256,
   * });
   * ```
   */
  repayWithdrawCollateral(
    params: RepayWithdrawCollateralParams,
  ): MidnightActionOutput<MidnightRepayWithdrawCollateralAction> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertNonNegativeAmount("repayAssets", params.repayAssets);
    assertNonNegativeAmount(
      "withdrawCollateralAssets",
      params.withdrawCollateralAssets,
    );
    assertNonNegativeAmount("deadline", params.deadline);
    const market = params.marketData;
    const collateralWithdrawals =
      params.withdrawCollateralAssets > 0n
        ? [
            {
              collateralIndex: params.collateralIndex ?? 0n,
              assets: params.withdrawCollateralAssets,
            },
          ]
        : [];
    for (const [index, withdrawal] of collateralWithdrawals.entries()) {
      assertNonNegativeAmount(
        `collateralWithdrawals[${index}].collateralIndex`,
        withdrawal.collateralIndex,
      );
      // Validate the configured collateral before exposing requirement reads.
      market.getCollateralByIndex(withdrawal.collateralIndex);
    }
    if (
      params.repayAssets === 0n &&
      collateralWithdrawals.every((withdrawal) => withdrawal.assets === 0n)
    ) {
      throw new NonPositiveInputError("repay or withdraw amount", 0n);
    }

    const midnightBundles = getChainAddress(this.chainId, "midnightBundles");

    return {
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [];
        if (params.repayAssets > 0n) {
          requirements.push(
            ...(await getMidnightApprovalRequirements({
              viemClient: this.client.viemClient,
              chainId: this.chainId,
              token: market.params.loanToken,
              owner: params.accountAddress,
              spender: midnightBundles,
              amount: params.repayAssets,
            })),
          );
        }
        const authorization = await getMidnightAuthorizationRequirement({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          owner: params.accountAddress,
          authorized: midnightBundles,
        });
        if (authorization) requirements.push(authorization);

        return requirements;
      },
      buildTx: () =>
        midnightRepayWithdrawCollateral({
          chainId: this.chainId,
          market: market.params,
          repayAssets: params.repayAssets,
          withdrawCollateralAssets: params.withdrawCollateralAssets,
          onBehalf: params.accountAddress,
          collateralIndex: params.collateralIndex,
          deadline: params.deadline,
          metadata: this.client.options.metadata,
        }),
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
      getRequirements: async () => [],
      buildTx: () =>
        midnightCancelOffer({
          chainId: this.chainId,
          group: params.group,
          onBehalf: params.accountAddress,
          metadata: this.client.options.metadata,
        }),
    };
  }

  private async getRatifierRequirements(params: {
    readonly offersData: OffersData;
    readonly signedPayloads: Map<string, Hex>;
  }): Promise<readonly ActionRequirement[]> {
    const data = params.offersData;
    const requirements: ActionRequirement[] = [];
    const authorization = await getMidnightAuthorizationRequirement({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      owner: data.accountAddress,
      authorized: data.ratifier,
    });
    if (authorization) requirements.push(authorization);

    if (data.ratifierType === "ecrecover") {
      const chainId = this.chainId;
      const action: MidnightOfferRootSignatureAction = {
        type: "midnightOfferRootSignature",
        args: {
          root: data.tree.root,
          ratifier: data.ratifier,
          offers: data.tree.offers.length,
        },
      };

      requirements.push({
        action,
        async sign(client: WalletClient, userAddress: Address) {
          const typedData = EcrecoverRatifierUtils.typedData({
            tree: data.tree,
            chainId,
          });
          const typedDataDefinition: TypedDataDefinition<
            Record<string, unknown>,
            "OfferTree"
          > = {
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          };
          const signature = await signAndVerifyTypedData({
            client,
            userAddress,
            typedData: typedDataDefinition,
          });

          const items = await EcrecoverRatifierUtils.ratify({
            tree: data.tree,
            account: userAddress,
            signature,
          });
          const payload = await Payload.encode(items);
          params.signedPayloads.set(signature.toLowerCase(), payload);

          return deepFreeze({
            args: {
              owner: userAddress,
              root: data.tree.root,
              signature,
              payload,
            },
            action,
          });
        },
      });
      return requirements;
    }

    const ratifyRoot = await getSetterRatifierRatifyRootRequirement({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      maker: data.accountAddress,
      root: data.tree.root,
    });
    if (ratifyRoot) requirements.push(ratifyRoot);

    return requirements;
  }

  private buildSubmitOffersTx(params: {
    readonly offersData: OffersData;
    readonly signatures?: MidnightActionSignatures;
    readonly signedPayloads: ReadonlyMap<string, Hex>;
  }) {
    const data = params.offersData;
    const collectedSignatures =
      params.signatures == null
        ? undefined
        : "action" in params.signatures
          ? [params.signatures]
          : params.signatures;
    let payload: Hex;
    if (data.ratifierType === "ecrecover") {
      const { midnightOfferRoot: signature } = selectRequirementSignatures(
        collectedSignatures,
        { midnightOfferRoot: true },
      );

      if (signature == null) {
        throw new MissingMidnightOfferRootSignatureError();
      }
      if (!isAddressEqual(signature.args.owner, data.accountAddress)) {
        throw new MidnightOfferRootOwnerMismatchError({
          expectedOwner: data.accountAddress,
          actualOwner: signature.args.owner,
        });
      }
      if (signature.args.root.toLowerCase() !== data.tree.root.toLowerCase()) {
        throw new MidnightOfferRootMismatchError({
          expectedRoot: data.tree.root,
          actualRoot: signature.args.root,
        });
      }
      if (
        signature.action.args.root.toLowerCase() !==
        data.tree.root.toLowerCase()
      ) {
        throw new MidnightOfferRootMismatchError({
          expectedRoot: data.tree.root,
          actualRoot: signature.action.args.root,
        });
      }
      if (!isAddressEqual(signature.action.args.ratifier, data.ratifier)) {
        throw new MidnightOfferRootRatifierMismatchError({
          expectedRatifier: data.ratifier,
          actualRatifier: signature.action.args.ratifier,
        });
      }
      if (signature.action.args.offers !== data.tree.offers.length) {
        throw new MidnightOfferRootOfferCountMismatchError({
          expectedOffers: data.tree.offers.length,
          actualOffers: signature.action.args.offers,
        });
      }
      const signedPayload = params.signedPayloads.get(
        signature.args.signature.toLowerCase(),
      );
      if (signedPayload == null) {
        throw new UnpreparedMidnightOfferRootSignatureError();
      }
      payload = signedPayload;
    } else {
      selectRequirementSignatures(collectedSignatures, {});
      payload = data.setterPayload;
    }

    return mempoolSubmitOffers({
      chainId: this.chainId,
      groups: data.groups,
      root: data.tree.root,
      maker: data.accountAddress,
      ratifier: data.ratifier,
      ratifierType: data.ratifierType,
      offers: data.tree.offers.length,
      payload,
      metadata: this.client.options.metadata,
    });
  }
}
