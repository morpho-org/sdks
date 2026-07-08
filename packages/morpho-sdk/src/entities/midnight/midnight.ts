import {
  type AccrualPosition,
  EcrecoverRatifierUtils,
  fetchAccrualPosition,
  fetchMarket,
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
import { getBlock } from "viem/actions";
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
import { validateOfferSides } from "../../helpers/validateOfferSides.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  type ActionRequirement,
  InsufficientMidnightWithdrawableLiquidityError,
  MarketIdMismatchError,
  type MidnightCancelOfferAction,
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
  NegativeMidnightAmountError,
  NoMidnightCreditToRedeemError,
  NonPositiveMidnightAmountError,
  selectRequirementSignatures,
  UnknownMidnightRatifierError,
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
  ): MidnightActionOutput<MidnightTakeLendAction, undefined>;
  takeBorrow(
    params: TakeBorrowParams,
  ): MidnightActionOutput<MidnightTakeBorrowAction, undefined>;
  supplyCollateralTakeBorrow(
    params: SupplyCollateralTakeBorrowParams,
  ): MidnightActionOutput<MidnightSupplyCollateralTakeBorrowAction, undefined>;
  supplyCollateral(
    params: SupplyCollateralParams,
  ): MidnightActionOutput<MidnightSupplyCollateralAction, undefined>;
  makeLend(params: MakeLendParams): Promise<MakeOffersOutput>;
  makeBorrow(params: MakeOffersParams): Promise<MakeOffersOutput>;
  supplyCollateralMakeBorrow(
    params: SupplyCollateralMakeBorrowParams,
  ): Promise<MakeOffersOutput>;
  redeem(
    params: RedeemParams,
  ): MidnightActionOutput<MidnightRedeemAction, undefined>;
  repayWithdrawCollateral(
    params: RepayWithdrawCollateralParams,
  ): MidnightActionOutput<MidnightRepayWithdrawCollateralAction, undefined>;
  cancelOffer(params: {
    readonly group: Hex;
    readonly accountAddress: Address;
  }): MidnightActionOutput<MidnightCancelOfferAction, undefined>;
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
    const parameters = params.parameters ?? {};
    const blockParameters =
      parameters.blockNumber != null
        ? { blockNumber: parameters.blockNumber }
        : parameters.blockTag != null
          ? { blockTag: parameters.blockTag }
          : {};
    const block = await getBlock(this.client.viemClient, blockParameters);
    const {
      blockNumber: _blockNumber,
      blockTag: _blockTag,
      ...fetchParams
    } = parameters;
    const fetchBlockParameters =
      block.number != null ? { blockNumber: block.number } : blockParameters;

    const position = await fetchAccrualPosition(this.client.viemClient, {
      ...fetchParams,
      deployless: this.client.options.supportDeployless,
      ...fetchBlockParameters,
      marketId: params.marketId,
      user: params.accountAddress,
    });

    return position.accrueInterest(block.timestamp);
  }

  async getOffersData(params: GetOffersDataParams): Promise<OffersData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    const tree = Tree.from(params.offers);
    const midnight = getChainAddress(this.chainId, "midnight");
    tree.offers.forEach((offer, index) => {
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
    assertNonNegativeAmount("deadline", params.deadline);

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

  takeBorrow(params: TakeBorrowParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount("maxUnits", params.maxUnits);
    assertNonNegativeAmount("deadline", params.deadline);

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

  supplyCollateralTakeBorrow(params: SupplyCollateralTakeBorrowParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertPositiveAmount("collateralAssets", params.collateralAssets);
    assertPositiveAmount("loanAssets", params.loanAssets);
    assertNonNegativeAmount("maxUnits", params.maxUnits);
    assertNonNegativeAmount("deadline", params.deadline);

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

  async makeBorrow(params: MakeOffersParams): Promise<MakeOffersOutput> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const data = await this.getOffersData({
      accountAddress: params.accountAddress,
      offers: params.offers,
      validation: params.validation,
    });
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

  repayWithdrawCollateral(params: RepayWithdrawCollateralParams) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateMarketData(params.marketData, this.chainId);
    assertNonNegativeAmount("repayAssets", params.repayAssets);
    assertNonNegativeAmount(
      "withdrawCollateralAssets",
      params.withdrawCollateralAssets,
    );
    assertNonNegativeAmount("deadline", params.deadline);
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
      assertNonNegativeAmount(
        `collateralWithdrawals[${index}].assets`,
        withdrawal.assets,
      );
    }
    if (
      params.repayAssets === 0n &&
      collateralWithdrawals.every((withdrawal) => withdrawal.assets === 0n)
    ) {
      throw new NonPositiveMidnightAmountError("repay or withdraw amount", 0n);
    }

    const market = params.marketData;
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
  }) {
    const data = params.offersData;
    const collectedSignatures =
      params.signatures == null
        ? undefined
        : "action" in params.signatures
          ? [params.signatures]
          : params.signatures;
    let payload = data.setterPayload;
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
      payload = signature.args.payload;
    } else {
      selectRequirementSignatures(collectedSignatures, {});
    }

    if (payload == null) throw new MissingMidnightOfferRootSignatureError();

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
