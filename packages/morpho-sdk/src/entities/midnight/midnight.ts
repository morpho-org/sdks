import {
  type AccrualPosition,
  EcrecoverRatifierUtils,
  fetchAccrualPosition,
  fetchMarket,
  type Market,
  type MarketInput,
  MarketParams,
  type MidnightFetchParams,
  Payload,
  SetterRatifierUtils,
  Tree,
  type TreeCreateParams,
  type TreeMempoolValidateParams,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
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
  getMidnightBundlesRequirements,
  getMidnightRatifyRootRequirement,
} from "../../actions/requirements/index.js";
import { validateChainId, validateUserAddress } from "../../helpers/index.js";
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  type ActionOutput,
  type ActionRequirement,
  type AnyRequirementSignature,
  InsufficientMidnightWithdrawableLiquidityError,
  InvalidSignatureError,
  MarketIdMismatchError,
  type MidnightCancelOfferAction,
  MidnightOfferRootMismatchError,
  MidnightOfferRootOfferCountMismatchError,
  MidnightOfferRootOwnerMismatchError,
  MidnightOfferRootRatifierMismatchError,
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
  UnknownMidnightRatifierError,
} from "../../types/index.js";

/** Optional Midnight API validation controls for make-offer flows. */
export type OfferValidationParams = Omit<TreeMempoolValidateParams, "chainId">;

/** Parameters for building and validating Midnight offer data. */
export interface GetOffersDataParams {
  readonly accountAddress: Address;
  readonly tree: TreeCreateParams;
  readonly validation?: OfferValidationParams;
}

/** Precomputed Midnight maker-offer data consumed by synchronous maker action flows. */
export interface OffersData {
  readonly accountAddress: Address;
  readonly groups: readonly Hex[];
  readonly tree: Tree;
  readonly ratifierType: "ecrecover" | "setter";
  readonly ratifier: Address;
  readonly setterPayload?: Hex;
}

/** Parameters shared by Midnight maker-offer flows. */
export interface MakeOffersParams {
  readonly offersData: OffersData;
}

/** Parameters for the Midnight make-lend maker flow. */
export interface MakeLendParams extends MakeOffersParams {
  readonly loanToken: Address;
  readonly loanAssets: bigint;
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
  readonly groups: readonly Hex[];
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
  getOffersData(params: GetOffersDataParams): Promise<OffersData>;
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
  makeLend(params: MakeLendParams): MakeOffersOutput;
  makeBorrow(params: MakeOffersParams): MakeOffersOutput;
  supplyCollateralMakeBorrow(
    params: SupplyCollateralMakeBorrowParams,
  ): MakeOffersOutput;
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

const assertNonNegativeAmount = (label: string, amount: bigint) => {
  if (amount < 0n) throw new NegativeMidnightAmountError(label, amount);
};

const assertPositiveAmount = (label: string, amount: bigint) => {
  if (amount <= 0n) throw new NonPositiveMidnightAmountError(label, amount);
};

const validateMarketData = (market: Market, chainId: number) => {
  validateChainId(Number(market.chainId), chainId);
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

  async getOffersData(params: GetOffersDataParams): Promise<OffersData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const tree = Tree.create(params.tree);
    const ratifier = tree.offers[0]!.ratifier;
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
    const collateral = market.getCollateralParamsByIndex(collateralIndex);
    if (collateral == null) {
      throw new UnknownMidnightCollateralError({
        market: market.id,
        collateralIndex,
      });
    }

    return {
      getRequirements: async (reqParams?: MidnightRequirementsParams) => {
        const requirements: ActionRequirement[] = [
          ...(await this.getTokenPullRequirements(
            {
              token: collateral.token,
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
    const collateral = market.getCollateralParamsByIndex(collateralIndex);
    if (collateral == null) {
      throw new UnknownMidnightCollateralError({
        market: market.id,
        collateralIndex,
      });
    }
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

  makeLend(params: MakeLendParams): MakeOffersOutput {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount(
      "reservedLoanAssets",
      params.reservedLoanAssets ?? 0n,
    );

    const data = params.offersData;
    validateOfferSides(data.tree.offers, true);
    const midnight = getChainAddress(this.chainId, "midnight");

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
          })),
        );

        return requirements;
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          offersData: data,
          signatures,
        }),
    };
  }

  makeBorrow(params: MakeOffersParams): MakeOffersOutput {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const data = params.offersData;
    validateOfferSides(data.tree.offers, false);

    return {
      groups: data.groups,
      root: data.tree.root,
      ratifierType: data.ratifierType,
      getRequirements: async () => {
        return await this.getRatifierRequirements({
          offersData: data,
        });
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          offersData: data,
          signatures,
        }),
    };
  }

  supplyCollateralMakeBorrow(
    params: SupplyCollateralMakeBorrowParams,
  ): MakeOffersOutput {
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
    const collateralIndex = params.collateralIndex ?? 0n;
    const collateral = market.collateralParams[Number(collateralIndex)];
    if (collateral == null) {
      throw new UnknownMidnightCollateralError({
        market: "provided market",
        collateralIndex,
      });
    }

    const data = params.offersData;
    validateOfferSides(data.tree.offers, false);
    const midnight = getChainAddress(this.chainId, "midnight");

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
          })),
        ];

        return requirements;
      },
      buildTx: (signatures?: MidnightActionSignatures) =>
        this.buildSubmitOffersTx({
          offersData: data,
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
    if (
      params.positionData.market.id.toLowerCase() !==
      params.marketData.id.toLowerCase()
    ) {
      throw new MarketIdMismatchError(
        params.positionData.market.id,
        params.marketData.id,
      );
    }

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

  private async getRatifierRequirements(params: {
    readonly offersData: OffersData;
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
          const account = client.account;
          validateUserAddress(account?.address, userAddress);
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
            tree: data.tree,
            signature,
          });
          const payload = await Payload.encode(items);

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

    const ratifyRoot = await getMidnightRatifyRootRequirement({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      maker: data.accountAddress,
      root: data.tree.root,
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
      return await getMidnightBundlesRequirements({
        viemClient: this.client.viemClient,
        chainId: this.chainId,
        supportDeployless: this.client.options.supportDeployless,
        supportSignature: true,
        useSimplePermit: reqParams?.useSimplePermit,
        ...params,
      });
    }

    return await getMidnightBundlesRequirements({
      viemClient: this.client.viemClient,
      chainId: this.chainId,
      supportDeployless: this.client.options.supportDeployless,
      supportSignature: false,
      ...params,
    });
  }

  private buildSubmitOffersTx(params: {
    readonly offersData: OffersData;
    readonly signatures?: MidnightActionSignatures;
  }) {
    const data = params.offersData;
    let payload = data.setterPayload;
    if (data.ratifierType === "ecrecover") {
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
      payload = signature.args.payload;
    }

    if (payload == null) throw new MissingMidnightOfferRootSignatureError();

    return midnightSubmitOffers({
      chainId: this.chainId,
      groups: data.groups,
      root: data.tree.root,
      maker: data.accountAddress,
      ratifier: data.ratifier,
      ratifierType: data.ratifierType,
      offers: data.tree.offers.length,
      payload,
    });
  }
}
