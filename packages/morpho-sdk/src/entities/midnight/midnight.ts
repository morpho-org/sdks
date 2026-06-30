import {
  type AccrualPosition,
  EcrecoverRatifierUtils,
  fetchAccrualPosition,
  fetchMarket,
  fetchRatifierInfo,
  Group,
  type Market,
  type MarketInput,
  MarketParams,
  type MidnightFetchParams,
  Offer,
  Payload,
  SetterRatifierUtils,
  Tree,
  type TreeMempoolValidateParams,
} from "@morpho-org/midnight-sdk";
import {
  type BigIntish,
  deepFreeze,
  getChainAddress,
} from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  isAddressEqual,
  type TypedDataDefinition,
  verifyTypedData,
  type WalletClient,
} from "viem";
import { getBlock, signTypedData } from "viem/actions";
import {
  type MidnightTakeableOffer,
  midnightCancelOffer,
  midnightRedeem,
  midnightRepayWithdrawCollateral,
  midnightSubmitOffers,
  midnightSupplyCollateral,
  midnightSupplyCollateralTakeBorrow,
  midnightTakeBorrow,
  midnightTakeLend,
} from "../../actions/midnight/index.js";
import {
  getMidnightApprovalRequirements,
  getMidnightAuthorizationRequirement,
  getMidnightRatifyRootRequirement,
  getMidnightTokenPullRequirements,
} from "../../actions/requirements/index.js";
import { validateChainId, validateUserAddress } from "../../helpers/index.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  type ActionOutput,
  type ActionRequirement,
  type AnyRequirementSignature,
  EmptyMidnightMakeOfferInputsError,
  InsufficientMidnightWithdrawableLiquidityError,
  InvalidSignatureError,
  MarketIdMismatchError,
  type MidnightCancelOfferAction,
  MidnightMixedLoanTokenError,
  MidnightOfferRootMismatchError,
  MidnightOfferRootOfferCountMismatchError,
  MidnightOfferRootOwnerMismatchError,
  MidnightOfferRootRatifierMismatchError,
  type MidnightOfferRootRequirement,
  type MidnightOfferRootSignature,
  type MidnightOfferRootSignatureAction,
  type MidnightRedeemAction,
  type MidnightRepayWithdrawCollateralAction,
  type MidnightSubmitOffersAction,
  type MidnightSupplyCollateralAction,
  type MidnightSupplyCollateralTakeBorrowAction,
  type MidnightTakeBorrowAction,
  type MidnightTakeLendAction,
  MissingAccrualPositionError,
  MissingMidnightOfferRootSignatureError,
  NegativeMidnightAmountError,
  NoMidnightCreditToRedeemError,
  NonPositiveMidnightAmountError,
  UnknownMidnightCollateralError,
} from "../../types/index.js";

/** One precomputed make-offer input retained on the integrator side. */
export interface MakeOfferInput {
  readonly market: MarketInput;
  readonly tick: BigIntish;
  readonly start: BigIntish;
  readonly expiry: BigIntish;
}

/** Optional Midnight API validation controls for make-offer flows. */
export type OfferValidationParams = Omit<TreeMempoolValidateParams, "chainId">;

/** Parameters shared by Midnight maker-offer flows. */
export interface MakeOffersParams {
  readonly accountAddress: Address;
  readonly loanAssets: bigint;
  readonly offers: readonly MakeOfferInput[];
  readonly validation?: OfferValidationParams;
}

/** Parameters for the Midnight make-lend maker flow. */
export interface MakeLendParams extends MakeOffersParams {
  readonly reservedLoanAssets?: bigint;
}

/** Parameters for the Midnight supply-collateral-and-make-borrow maker flow. */
export interface SupplyCollateralMakeBorrowParams extends MakeOffersParams {
  readonly market: MarketInput;
  readonly collateralAssets: bigint;
  readonly reservedCollateralAssets?: bigint;
  readonly collateralIndex?: bigint;
}

/** Requirement-resolution options accepted by Midnight action outputs. */
export interface MidnightRequirementsParams {
  /**
   * Prefer the ERC-2612 simple-permit path when the SDK detects support.
   * Leave unset or set to `false` to force the Permit2/classic approval fallback when
   * a token is known to be incompatible despite passing the SDK's shallow `nonces`
   * compatibility probe.
   */
  readonly useSimplePermit?: boolean;
}

/** Signatures accepted by Midnight action-output transaction builders. */
export type MidnightActionSignatures =
  | AnyRequirementSignature
  | readonly AnyRequirementSignature[];

/** Output returned by maker-offer flows. */
export interface MakeOffersOutput
  extends ActionOutput<MidnightSubmitOffersAction, MidnightActionSignatures> {
  readonly group: Hex;
  readonly root: Hex;
  readonly ratifierType: "ecrecover" | "setter";
}

/** Parameters shared by Midnight market action flows. */
export interface MarketActionParams {
  readonly accountAddress: Address;
  readonly marketData: Market;
}

/** Parameters for the Midnight take-lend taker flow. */
export interface TakeLendParams extends MarketActionParams {
  readonly assets: bigint;
  readonly minUnits: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
}

/** Parameters for the Midnight take-borrow taker flow. */
export interface TakeBorrowParams extends MarketActionParams {
  readonly loanAssets: bigint;
  readonly maxUnits: bigint;
  readonly takeableOffers: readonly MidnightTakeableOffer[];
}

/** Parameters for the Midnight supply-collateral-and-take-borrow taker flow. */
export interface SupplyCollateralTakeBorrowParams extends TakeBorrowParams {
  readonly collateralAssets: bigint;
  readonly collateralIndex?: bigint;
}

/** Parameters for the Midnight supply-collateral flow. */
export interface SupplyCollateralParams extends MarketActionParams {
  readonly collateralAssets: bigint;
  readonly reservedCollateralAssets?: bigint;
  readonly collateralIndex?: bigint;
}

/** Parameters for the Midnight redeem flow. */
export interface RedeemParams extends MarketActionParams {
  readonly positionData: AccrualPosition;
  readonly receiver?: Address;
  readonly units?: bigint;
}

/** Parameters for the Midnight repay-and-withdraw-collateral flow. */
export interface RepayWithdrawCollateralParams extends MarketActionParams {
  readonly repayAssets: bigint;
  readonly withdrawCollateralAssets: bigint;
  readonly collateralIndex?: bigint;
}

/** Parameters for fetching a Midnight user position with market data. */
export interface GetPositionDataParams {
  readonly marketId: Hex;
  readonly accountAddress: Address;
  readonly parameters?: MidnightFetchParams;
}

/** Midnight entity methods exposed by `client.morpho.midnight(chainId)`. */
export interface MidnightActions {
  getMarketData(
    marketId: Hex,
    parameters?: MidnightFetchParams,
  ): Promise<Market>;
  getPositionData(params: GetPositionDataParams): Promise<AccrualPosition>;
  takeLend(
    params: TakeLendParams,
  ): ActionOutput<MidnightTakeLendAction, MidnightActionSignatures>;
  takeBorrow(
    params: TakeBorrowParams,
  ): ActionOutput<MidnightTakeBorrowAction, undefined>;
  supplyCollateralTakeBorrow(
    params: SupplyCollateralTakeBorrowParams,
  ): ActionOutput<
    MidnightSupplyCollateralTakeBorrowAction,
    MidnightActionSignatures
  >;
  supplyCollateral(
    params: SupplyCollateralParams,
  ): ActionOutput<MidnightSupplyCollateralAction, undefined>;
  makeLend(params: MakeLendParams): Promise<MakeOffersOutput>;
  makeBorrow(params: MakeOffersParams): Promise<MakeOffersOutput>;
  supplyCollateralMakeBorrow(
    params: SupplyCollateralMakeBorrowParams,
  ): Promise<MakeOffersOutput>;
  redeem(params: RedeemParams): ActionOutput<MidnightRedeemAction, undefined>;
  repayWithdrawCollateral(
    params: RepayWithdrawCollateralParams,
  ): ActionOutput<
    MidnightRepayWithdrawCollateralAction,
    MidnightActionSignatures
  >;
  cancelOffer(params: {
    readonly group: Hex;
    readonly accountAddress: Address;
  }): ActionOutput<MidnightCancelOfferAction, undefined>;
}

interface PreparedOffers {
  readonly group: Group;
  readonly tree: Tree;
  readonly ratifierType: "ecrecover" | "setter";
  readonly ratifier: Address;
  readonly setterPayload?: Hex;
}

const assertNonNegativeAmount = (label: string, amount: bigint) => {
  if (amount < 0n) throw new NegativeMidnightAmountError(label, amount);
};

const assertPositiveAmount = (label: string, amount: bigint) => {
  if (amount <= 0n) throw new NonPositiveMidnightAmountError(label, amount);
};

const validateMarketData = (market: Market, chainId: number) => {
  validateChainId(Number(market.chainId), chainId);
};

const validatePositionMarket = (position: AccrualPosition, market: Market) => {
  if (!sameHex(position.market.id, market.id)) {
    throw new MarketIdMismatchError(position.market.id, market.id);
  }
};

const findCollateralToken = (market: Market, collateralIndex: bigint) => {
  const collateral = market.getCollateralParamsByIndex(collateralIndex);
  if (collateral == null) {
    throw new UnknownMidnightCollateralError({
      market: market.id,
      collateralIndex,
    });
  }

  return collateral.token;
};

const sameHex = (left: Hex, right: Hex) =>
  left.toLowerCase() === right.toLowerCase();

const makeOfferRootRequirement = (params: {
  readonly chainId: number;
  readonly tree: Tree;
  readonly ratifier: Address;
}): MidnightOfferRootRequirement => {
  const action: MidnightOfferRootSignatureAction = {
    type: "midnightOfferRootSignature",
    args: {
      root: params.tree.root,
      ratifier: params.ratifier,
      offers: params.tree.offers.length,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);
      const typedData = EcrecoverRatifierUtils.typedData({
        tree: params.tree,
        chainId: params.chainId,
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
      const signature = await signTypedData(client, {
        ...typedDataDefinition,
        account,
      });
      const isValid = await verifyTypedData({
        ...typedDataDefinition,
        address: userAddress,
        signature,
      });

      if (!isValid) throw new InvalidSignatureError();

      const items = await EcrecoverRatifierUtils.ratify({
        tree: params.tree,
        signature,
      });
      const payload = await Payload.encode(items);

      return deepFreeze({
        args: {
          owner: userAddress,
          root: params.tree.root,
          signature,
          payload,
        },
        action,
      });
    },
  };
};

/** Entity facade for Midnight Midnight action flows. */
export class MorphoMidnight implements MidnightActions {
  constructor(
    private readonly client: MorphoClientType,
    private readonly chainId: number,
  ) {}

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

  async getPositionData(
    params: GetPositionDataParams,
  ): Promise<AccrualPosition> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const blockParameters =
      params.parameters?.blockNumber != null
        ? { blockNumber: params.parameters.blockNumber }
        : params.parameters?.blockTag != null
          ? { blockTag: params.parameters.blockTag }
          : {};

    const [position, block] = await Promise.all([
      fetchAccrualPosition(this.client.viemClient, {
        ...params.parameters,
        deployless: this.client.options.supportDeployless,
        marketId: params.marketId,
        user: params.accountAddress,
      }),
      getBlock(this.client.viemClient, blockParameters),
    ]);

    return position.accrueInterest(block.timestamp);
  }

  takeLend(params: TakeLendParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("assets", params.assets);
    assertNonNegativeAmount("minUnits", params.minUnits);

    const market = params.marketData;
    const midnightBundles = getChainAddress(this.chainId, "midnightBundles");

    return {
      getRequirements: async (reqParams?: MidnightRequirementsParams) => {
        const requirements: ActionRequirement[] = [
          ...(await this.getTokenPullRequirements(
            {
              token: market.params.loanToken,
              owner: params.accountAddress,
              spender: midnightBundles,
              amount: params.assets,
            },
            reqParams,
          )),
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
      buildTx: (signatures?: MidnightActionSignatures) =>
        midnightTakeLend({
          chainId: this.chainId,
          market: market.params,
          assets: params.assets,
          minUnits: params.minUnits,
          taker: params.accountAddress,
          takeableOffers: params.takeableOffers,
          signatures,
          metadata: this.client.options.metadata,
        }),
    };
  }

  takeBorrow(params: TakeBorrowParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount("maxUnits", params.maxUnits);

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
          metadata: this.client.options.metadata,
        }),
    };
  }

  supplyCollateralTakeBorrow(params: SupplyCollateralTakeBorrowParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount("maxUnits", params.maxUnits);

    const market = params.marketData;
    const collateralIndex = params.collateralIndex ?? 0n;
    const midnightBundles = getChainAddress(this.chainId, "midnightBundles");
    const collateralToken = findCollateralToken(market, collateralIndex);

    return {
      getRequirements: async (reqParams?: MidnightRequirementsParams) => {
        const requirements: ActionRequirement[] = [
          ...(await this.getTokenPullRequirements(
            {
              token: collateralToken,
              owner: params.accountAddress,
              spender: midnightBundles,
              amount: params.collateralAssets,
            },
            reqParams,
          )),
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
      buildTx: (signatures?: MidnightActionSignatures) =>
        midnightSupplyCollateralTakeBorrow({
          chainId: this.chainId,
          market: market.params,
          collateralAssets: params.collateralAssets,
          loanAssets: params.loanAssets,
          maxUnits: params.maxUnits,
          taker: params.accountAddress,
          collateralIndex,
          takeableOffers: params.takeableOffers,
          signatures,
          metadata: this.client.options.metadata,
        }),
    };
  }

  supplyCollateral(params: SupplyCollateralParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    assertNonNegativeAmount(
      "reservedCollateralAssets",
      params.reservedCollateralAssets ?? 0n,
    );

    const market = params.marketData;
    const collateralIndex = params.collateralIndex ?? 0n;
    const collateralToken = findCollateralToken(market, collateralIndex);
    const midnight = getChainAddress(this.chainId, "midnight");

    return {
      getRequirements: async () =>
        await getMidnightApprovalRequirements({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          token: collateralToken,
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

  private async makeOffers(
    params: MakeLendParams & { readonly buy: boolean },
  ): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount(
      "reservedLoanAssets",
      params.reservedLoanAssets ?? 0n,
    );

    const prepared = await this.prepareOffers(params);
    const midnight = getChainAddress(this.chainId, "midnight");
    const loanToken = MarketParams.from(params.offers[0]!.market).loanToken;

    return {
      group: prepared.group.id,
      root: prepared.tree.root,
      ratifierType: prepared.ratifierType,
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [];
        if (params.buy) {
          requirements.push(
            ...(await getMidnightApprovalRequirements({
              viemClient: this.client.viemClient,
              chainId: this.chainId,
              token: loanToken,
              owner: params.accountAddress,
              spender: midnight,
              amount: params.loanAssets + (params.reservedLoanAssets ?? 0n),
            })),
          );
        }
        requirements.push(
          ...(await this.getRatifierRequirements({
            accountAddress: params.accountAddress,
            prepared,
          })),
        );

        return requirements;
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          accountAddress: params.accountAddress,
          prepared,
          signatures,
        }),
    };
  }

  async makeLend(params: MakeLendParams) {
    return await this.makeOffers({ ...params, buy: true });
  }

  async makeBorrow(params: MakeOffersParams): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    assertPositiveAmount("loanAssets", params.loanAssets);

    if (params.offers.length === 0)
      throw new EmptyMidnightMakeOfferInputsError();

    const prepared = await this.prepareOffers({
      accountAddress: params.accountAddress,
      buy: false,
      loanAssets: params.loanAssets,
      offers: params.offers,
      validation: params.validation,
    });

    return {
      group: prepared.group.id,
      root: prepared.tree.root,
      ratifierType: prepared.ratifierType,
      getRequirements: async () => {
        return await this.getRatifierRequirements({
          accountAddress: params.accountAddress,
          prepared,
        });
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          accountAddress: params.accountAddress,
          prepared,
          signatures,
        }),
    };
  }

  async supplyCollateralMakeBorrow(
    params: SupplyCollateralMakeBorrowParams,
  ): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount(
      "reservedCollateralAssets",
      params.reservedCollateralAssets ?? 0n,
    );

    const market =
      params.market instanceof MarketParams
        ? params.market
        : MarketParams.from(params.market);
    const collateralIndex = params.collateralIndex ?? 0n;
    const collateral = market.collateralParams[Number(collateralIndex)];
    if (collateral == null) {
      throw new UnknownMidnightCollateralError({
        market: "provided market",
        collateralIndex,
      });
    }

    if (params.offers.length === 0)
      throw new EmptyMidnightMakeOfferInputsError();

    const prepared = await this.prepareOffers({
      accountAddress: params.accountAddress,
      buy: false,
      loanAssets: params.loanAssets,
      offers: params.offers,
      validation: params.validation,
    });
    const midnight = getChainAddress(this.chainId, "midnight");

    return {
      group: prepared.group.id,
      root: prepared.tree.root,
      ratifierType: prepared.ratifierType,
      getRequirements: async () => {
        const requirements: ActionRequirement[] = [
          ...(await getMidnightApprovalRequirements({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            token: collateral.token,
            owner: params.accountAddress,
            spender: midnight,
            amount:
              params.collateralAssets + (params.reservedCollateralAssets ?? 0n),
          })),
          midnightSupplyCollateral({
            chainId: this.chainId,
            market,
            collateralIndex,
            assets: params.collateralAssets,
            onBehalf: params.accountAddress,
            metadata: this.client.options.metadata,
          }),
          ...(await this.getRatifierRequirements({
            accountAddress: params.accountAddress,
            prepared,
          })),
        ];

        return requirements;
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          accountAddress: params.accountAddress,
          prepared,
          signatures,
        }),
    };
  }

  redeem(params: RedeemParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    if (!params.positionData) {
      throw new MissingAccrualPositionError(params.marketData.id);
    }
    validatePositionMarket(params.positionData, params.marketData);

    const market = params.marketData;
    const units = params.units ?? params.positionData.faceValue;
    if (units <= 0n) throw new NoMidnightCreditToRedeemError(market.id);
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

  repayWithdrawCollateral(params: RepayWithdrawCollateralParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertNonNegativeAmount("repayAssets", params.repayAssets);
    assertNonNegativeAmount(
      "withdrawCollateralAssets",
      params.withdrawCollateralAssets,
    );
    if (params.repayAssets === 0n && params.withdrawCollateralAssets === 0n) {
      throw new NonPositiveMidnightAmountError("repay or withdraw amount", 0n);
    }

    const market = params.marketData;
    const midnightBundles = getChainAddress(this.chainId, "midnightBundles");

    return {
      getRequirements: async (reqParams?: MidnightRequirementsParams) => {
        const requirements: ActionRequirement[] = [];
        if (params.repayAssets > 0n) {
          requirements.push(
            ...(await this.getTokenPullRequirements(
              {
                token: market.params.loanToken,
                owner: params.accountAddress,
                spender: midnightBundles,
                amount: params.repayAssets,
              },
              reqParams,
            )),
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
      buildTx: (signatures?: MidnightActionSignatures) =>
        midnightRepayWithdrawCollateral({
          chainId: this.chainId,
          market: market.params,
          repayAssets: params.repayAssets,
          withdrawCollateralAssets: params.withdrawCollateralAssets,
          onBehalf: params.accountAddress,
          collateralIndex: params.collateralIndex,
          signatures,
          metadata: this.client.options.metadata,
        }),
    };
  }

  cancelOffer(params: {
    readonly group: Hex;
    readonly accountAddress: Address;
  }) {
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

  private async prepareOffers(
    params: MakeOffersParams & { readonly buy: boolean },
  ): Promise<PreparedOffers> {
    if (params.offers.length === 0)
      throw new EmptyMidnightMakeOfferInputsError();

    const firstLoanToken = MarketParams.from(
      params.offers[0]!.market,
    ).loanToken;
    for (const offer of params.offers.slice(1)) {
      const loanToken = MarketParams.from(offer.market).loanToken;
      if (!isAddressEqual(loanToken, firstLoanToken)) {
        throw new MidnightMixedLoanTokenError();
      }
    }

    const ratifier = await fetchRatifierInfo(this.client.viemClient, {
      maker: params.accountAddress,
    });
    const offers = params.offers.map((offer) =>
      Offer.create({
        market: offer.market,
        buy: params.buy,
        maker: params.accountAddress,
        start: offer.start,
        expiry: offer.expiry,
        tick: offer.tick,
        ratifier: ratifier.ratifier,
        maxAssets: params.loanAssets,
        ...(params.buy
          ? {}
          : { receiverIfMakerIsSeller: params.accountAddress }),
      }),
    );
    const group = Group.create(offers);
    const tree = Tree.create([group]);
    await tree.mempoolValidate({
      ...params.validation,
      chainId: this.chainId,
    });

    if (ratifier.type === "setter") {
      const items = SetterRatifierUtils.ratify({ tree });
      return {
        group,
        tree,
        ratifierType: ratifier.type,
        ratifier: ratifier.ratifier,
        setterPayload: await Payload.encode(items),
      };
    }

    return {
      group,
      tree,
      ratifierType: ratifier.type,
      ratifier: ratifier.ratifier,
    };
  }

  private async getRatifierRequirements(params: {
    readonly accountAddress: Address;
    readonly prepared: PreparedOffers;
  }): Promise<readonly ActionRequirement[]> {
    const requirements: ActionRequirement[] = [];
    const authorization = await getMidnightAuthorizationRequirement({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      owner: params.accountAddress,
      authorized: params.prepared.ratifier,
    });
    if (authorization) requirements.push(authorization);

    if (params.prepared.ratifierType === "ecrecover") {
      requirements.push(
        makeOfferRootRequirement({
          chainId: this.chainId,
          tree: params.prepared.tree,
          ratifier: params.prepared.ratifier,
        }),
      );
      return requirements;
    }

    const ratifyRoot = await getMidnightRatifyRootRequirement({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      maker: params.accountAddress,
      root: params.prepared.tree.root,
    });
    if (ratifyRoot) requirements.push(ratifyRoot);

    return requirements;
  }

  private async getTokenPullRequirements(
    params: {
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
    },
    reqParams?: MidnightRequirementsParams,
  ) {
    if (this.client.options.supportSignature) {
      return await getMidnightTokenPullRequirements({
        viemClient: this.client.viemClient,
        chainId: this.chainId,
        supportDeployless: this.client.options.supportDeployless,
        supportSignature: true,
        useSimplePermit: reqParams?.useSimplePermit,
        ...params,
      });
    }

    return await getMidnightTokenPullRequirements({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      supportDeployless: this.client.options.supportDeployless,
      supportSignature: false,
      ...params,
    });
  }

  private buildSubmitOffersTx(params: {
    readonly accountAddress: Address;
    readonly prepared: PreparedOffers;
    readonly signatures?: MidnightActionSignatures;
  }) {
    let payload = params.prepared.setterPayload;
    if (params.prepared.ratifierType === "ecrecover") {
      const collectedSignatures = params.signatures;
      const signature =
        collectedSignatures == null
          ? undefined
          : "action" in collectedSignatures
            ? collectedSignatures.action.type === "midnightOfferRootSignature"
              ? (collectedSignatures as MidnightOfferRootSignature)
              : undefined
            : (collectedSignatures.find(
                (candidate) =>
                  candidate.action.type === "midnightOfferRootSignature",
              ) as MidnightOfferRootSignature | undefined);

      if (signature == null) {
        throw new MissingMidnightOfferRootSignatureError();
      }
      if (!isAddressEqual(signature.args.owner, params.accountAddress)) {
        throw new MidnightOfferRootOwnerMismatchError({
          expectedOwner: params.accountAddress,
          actualOwner: signature.args.owner,
        });
      }
      if (!sameHex(signature.args.root, params.prepared.tree.root)) {
        throw new MidnightOfferRootMismatchError({
          expectedRoot: params.prepared.tree.root,
          actualRoot: signature.args.root,
        });
      }
      if (!sameHex(signature.action.args.root, params.prepared.tree.root)) {
        throw new MidnightOfferRootMismatchError({
          expectedRoot: params.prepared.tree.root,
          actualRoot: signature.action.args.root,
        });
      }
      if (
        !isAddressEqual(
          signature.action.args.ratifier,
          params.prepared.ratifier,
        )
      ) {
        throw new MidnightOfferRootRatifierMismatchError({
          expectedRatifier: params.prepared.ratifier,
          actualRatifier: signature.action.args.ratifier,
        });
      }
      if (signature.action.args.offers !== params.prepared.tree.offers.length) {
        throw new MidnightOfferRootOfferCountMismatchError({
          expectedOffers: params.prepared.tree.offers.length,
          actualOffers: signature.action.args.offers,
        });
      }
      payload = signature.args.payload;
    }

    if (payload == null) throw new MissingMidnightOfferRootSignatureError();

    return midnightSubmitOffers({
      chainId: this.chainId,
      group: params.prepared.group.id,
      root: params.prepared.tree.root,
      maker: params.accountAddress,
      ratifier: params.prepared.ratifier,
      ratifierType: params.prepared.ratifierType,
      offers: params.prepared.tree.offers.length,
      payload,
    });
  }
}
