import {
  type AccrualPosition,
  DEFAULT_SLIPPAGE_TOLERANCE,
  type Holding,
  type Market,
  type MarketId,
  type MarketParams,
  MathLib,
  type Position,
  type Vault,
  type VaultMarketConfig,
} from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  fetchHolding,
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { type MinimalBlock, SimulationState } from "@morpho-org/simulation-sdk";
import type { Address } from "viem";
import {
  getMorphoAuthorizationRequirement,
  getRequirements,
  marketV1Borrow,
  marketV1Repay,
  marketV1RepayWithdrawCollateral,
  marketV1SupplyCollateral,
  marketV1SupplyCollateralBorrow,
  marketV1WithdrawCollateral,
} from "../../actions/index.js";
import {
  computeMaxRepaySharePrice,
  computeMinBorrowSharePrice,
  computeReallocations,
  validateAccrualPosition,
  validateChainId,
  validateNativeCollateral,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateRepayAmount,
  validateRepayShares,
  validateSlippageTolerance,
  validateUserAddress,
} from "../../helpers/index.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type DepositAmountArgs,
  type ERC20ApprovalAction,
  MarketIdMismatchError,
  type MarketV1BorrowAction,
  type MarketV1RepayAction,
  type MarketV1RepayWithdrawCollateralAction,
  type MarketV1SupplyCollateralAction,
  type MarketV1SupplyCollateralBorrowAction,
  type MarketV1WithdrawCollateralAction,
  MissingAccrualPositionError,
  type MorphoAuthorizationAction,
  type MorphoClientType,
  MutuallyExclusiveRepayAmountsError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveBorrowAmountError,
  NonPositiveRepayAmountError,
  NonPositiveWithdrawCollateralAmountError,
  type ReallocationComputeOptions,
  type RepayAmountArgs,
  type Requirement,
  type RequirementSignature,
  type Transaction,
  type VaultReallocation,
  WithdrawExceedsCollateralError,
  ZeroCollateralAmountError,
} from "../../types/index.js";

export interface MarketV1Actions {
  /**
   * Fetches the latest market data with accrued interest.
   *
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns Market state including total supply/borrow assets and shares.
   */
  getMarketData: (parameters?: FetchParameters) => Promise<Market>;

  /**
   * Fetches the user's position in this market with accrued interest.
   *
   * @param userAddress - The user whose position to fetch.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns Accrual position with health metrics (maxBorrowAssets, ltv, isHealthy).
   */
  getPositionData: (
    userAddress: Address,
    parameters?: FetchParameters,
  ) => Promise<AccrualPosition>;

  /**
   * Prepares a supply-collateral transaction.
   *
   * Routed through bundler via GeneralAdapter1.
   * `getRequirements` returns ERC20 approval or permit for GeneralAdapter1.
   * When `nativeAmount` is provided, native token is wrapped; collateral must be wNative.
   *
   * @param params - Supply collateral parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  supplyCollateral: (params: { userAddress: Address } & DepositAmountArgs) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<MarketV1SupplyCollateralAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]>;
  };

  /**
   * Prepares a borrow transaction.
   *
   * Routed through bundler3 via `morphoBorrow`.
   * Validates position health with LLTV buffer (0.5%) using the pre-fetched `positionData`.
   * Computes `minSharePrice` from market borrow state and `slippageTolerance`.
   *
   * When `reallocations` is provided, `reallocateTo` actions are prepended to the bundle,
   * moving liquidity from other markets via the PublicAllocator before borrowing.
   *
   * `getRequirements` returns `morpho.setAuthorization(generalAdapter1, true)` if not yet authorized,
   * since borrowing through bundler3 requires GeneralAdapter1 authorization on Morpho.
   *
   * **Stale `positionData` may cause unexpected health.**
   *
   * @param params - Borrow parameters including pre-fetched `positionData` for health validation.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  borrow: (params: {
    userAddress: Address;
    amount: bigint;
    positionData: AccrualPosition;
    slippageTolerance?: bigint;
    reallocations?: readonly VaultReallocation[];
  }) => {
    buildTx: () => Readonly<Transaction<MarketV1BorrowAction>>;
    getRequirements: () => Promise<
      Readonly<Transaction<MorphoAuthorizationAction>>[]
    >;
  };

  /**
   * Prepares a repay transaction.
   *
   * Routed through bundler3 via GeneralAdapter1.
   * Supports two modes via {@link RepayAmountArgs}:
   * - **By assets** (`{ amount }`): repays an exact asset amount (partial repay).
   * - **By shares** (`{ shares }`): repays exact shares (full repay, immune to interest accrual).
   *
   * Computes `maxSharePrice` from market borrow state and `slippageTolerance`.
   *
   * `getRequirements` returns ERC20 approval for loan token to GeneralAdapter1.
   * Does NOT require Morpho authorization (anyone can repay on behalf of anyone).
   *
   * **Shares mode:** `slippageTolerance` also caps `transferAmount`.
   *
   * @param params - Repay parameters including pre-fetched `positionData`.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  repay: (
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<MarketV1RepayAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]>;
  };

  /**
   * Prepares a withdraw-collateral transaction.
   *
   * Direct call to `morpho.withdrawCollateral()` — no bundler, no GeneralAdapter1.
   * The caller (`msg.sender`) must be `onBehalf`.
   * Validates position health after withdrawal using the LLTV buffer.
   *
   * No `getRequirements` — no ERC20 approval or GeneralAdapter1 authorization needed
   * (collateral flows out of Morpho, not in).
   *
   * **No on-chain slippage guard — stale `positionData` risks liquidation.**
   *
   * @param params - Withdraw collateral parameters including pre-fetched `positionData` for health validation.
   * @returns Object with `buildTx`.
   */
  withdrawCollateral: (params: {
    userAddress: Address;
    amount: bigint;
    positionData: AccrualPosition;
  }) => {
    buildTx: () => Readonly<Transaction<MarketV1WithdrawCollateralAction>>;
  };

  /**
   * Prepares an atomic repay-and-withdraw-collateral transaction.
   *
   * Routed through bundler3. Bundle order: repay FIRST, then withdraw.
   * Validates combined position health: simulates the repay, then checks
   * that the resulting position can sustain the collateral withdrawal.
   *
   * `getRequirements` returns in parallel:
   * - ERC20 approval for loan token to GeneralAdapter1 (for the repay).
   * - `morpho.setAuthorization(generalAdapter1, true)` if not yet authorized (for the withdraw).
   *
   * **Stale `positionData` risks underestimated debt and unsafe withdrawal.**
   *
   * @param params - Combined parameters including pre-fetched `positionData`.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  repayWithdrawCollateral: (
    params: {
      userAddress: Address;
      withdrawAmount: bigint;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<MarketV1RepayWithdrawCollateralAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Readonly<Transaction<MorphoAuthorizationAction>>
        | Requirement
      )[]
    >;
  };

  /**
   * Prepares an atomic supply-collateral-and-borrow transaction.
   *
   * Routed through the bundler. Validates position health with LLTV buffer
   * to prevent instant liquidation on new positions near the LLTV threshold.
   *
   * When `reallocations` is provided, `reallocateTo` actions are prepended before
   * `morphoBorrow` in the bundle.
   *
   * `getRequirements` returns in parallel:
   * - ERC20 approval or permit for collateral token (to GeneralAdapter1).
   * - `morpho.setAuthorization(generalAdapter1, true)` if adapter is not yet authorized.
   *
   * **Stale `positionData` may cause unexpected health.**
   *
   * @param params - Combined parameters including pre-fetched `positionData` for health validation.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  supplyCollateralBorrow: (
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      borrowAmount: bigint;
      slippageTolerance?: bigint;
      reallocations?: readonly VaultReallocation[];
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<MarketV1SupplyCollateralBorrowAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Readonly<Transaction<MorphoAuthorizationAction>>
        | Requirement
      )[]
    >;
  };

  /**
   * Fetches all on-chain data needed to construct a {@link SimulationState}
   * for computing vault reallocations via the public allocator.
   *
   * The returned simulation state can be passed to {@link getReallocations}
   * to compute the `VaultReallocation[]` array for `borrow()` or
   * `supplyCollateralBorrow()`.
   *
   * **Stale data reverts on-chain (fail-safe).**
   *
   * @param params.vaultAddresses - Addresses of MetaMorpho vaults that allocate to this market.
   * @param params.market - The target market data (from {@link getPositionData} or {@link getMarketData}).
   * @param params.block - The block to fetch data at (number and timestamp).
   * @returns A SimulationState populated with all required data.
   */
  getReallocationData: (params: {
    vaultAddresses: readonly Address[];
    market: Market;
    block: MinimalBlock;
  }) => Promise<SimulationState>;

  /**
   * Computes vault reallocations for a borrow on this market.
   *
   * Uses the shared liquidity algorithm to determine which vaults should
   * reallocate liquidity to this market via the PublicAllocator, based on
   * post-borrow utilization targets.
   *
   * @param params.reallocationData - The current on-chain state (from {@link getReallocationData}).
   * @param params.borrowAmount - The intended borrow amount.
   * @param params.options - Optional reallocation computation options
   *        (utilization targets, reallocatable vaults filter, etc.).
   * @returns Array of vault reallocations ready to pass to `borrow()` or
   *          `supplyCollateralBorrow()`. Empty array if no reallocation is needed.
   */
  getReallocations: (params: {
    reallocationData: SimulationState;
    borrowAmount: bigint;
    options?: ReallocationComputeOptions;
  }) => readonly VaultReallocation[];
}

export class MorphoMarketV1 implements MarketV1Actions {
  constructor(
    private readonly client: MorphoClientType,
    public readonly marketParams: MarketParams,
    private readonly chainId: number,
  ) {}

  async getMarketData(parameters?: FetchParameters): Promise<Market> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchMarket(this.marketParams.id, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    });
  }

  async getPositionData(
    userAddress: Address,
    parameters?: FetchParameters,
  ): Promise<AccrualPosition> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchAccrualPosition(
      userAddress,
      this.marketParams.id,
      this.client.viemClient,
      {
        ...parameters,
        deployless: this.client.options.supportDeployless,
        chainId: this.chainId,
      },
    );
  }

  supplyCollateral({
    amount = 0n,
    userAddress,
    nativeAmount,
  }: { userAddress: Address } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(this.client.viemClient.account?.address, userAddress);

    if (amount < 0n) {
      throw new NonPositiveAssetAmountError(this.marketParams.collateralToken);
    }

    if (nativeAmount !== undefined && nativeAmount < 0n) {
      throw new NegativeNativeAmountError(nativeAmount);
    }

    const totalCollateral = amount + (nativeAmount ?? 0n);
    if (totalCollateral === 0n) {
      throw new ZeroCollateralAmountError(this.marketParams.id);
    }

    if (nativeAmount !== undefined && nativeAmount > 0n) {
      validateNativeCollateral(this.chainId, this.marketParams.collateralToken);
    }

    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getRequirements(this.client.viemClient, {
          address: this.marketParams.collateralToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: params?.useSimplePermit,
          args: { amount, from: userAddress },
        }),

      buildTx: (requirementSignature?: RequirementSignature) =>
        marketV1SupplyCollateral({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            nativeAmount,
            onBehalf: userAddress,
            requirementSignature,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  borrow({
    amount,
    userAddress,
    positionData,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    reallocations,
  }: {
    amount: bigint;
    userAddress: Address;
    positionData: AccrualPosition;
    slippageTolerance?: bigint;
    reallocations?: readonly VaultReallocation[];
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(this.client.viemClient.account?.address, userAddress);

    if (amount <= 0n) {
      throw new NonPositiveBorrowAmountError(this.marketParams.id);
    }

    validateSlippageTolerance(slippageTolerance);

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    validatePositionHealth({
      positionData,
      additionalCollateral: 0n,
      borrowAmount: amount,
      marketId: this.marketParams.id,
      lltv: this.marketParams.lltv,
    });
    const minSharePrice = computeMinBorrowSharePrice({
      borrowAmount: amount,
      market: positionData.market,
      slippageTolerance,
    });

    return {
      getRequirements: async () => {
        const authTx = await getMorphoAuthorizationRequirement({
          viemClient: this.client.viemClient,
          chainId: this.chainId,
          userAddress,
        });
        return authTx ? [authTx] : [];
      },

      buildTx: () =>
        marketV1Borrow({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            receiver: userAddress,
            minSharePrice,
            reallocations,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  repay(
    params: {
      userAddress: Address;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(
      this.client.viemClient.account?.address,
      params.userAddress,
    );

    const {
      userAddress,
      positionData,
      slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    } = params;

    if ("assets" in params && "shares" in params) {
      throw new MutuallyExclusiveRepayAmountsError(this.marketParams.id);
    }

    const isSharesMode = "shares" in params;

    if (isSharesMode) {
      if (params.shares <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
    } else {
      if (params.assets <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
    }

    validateSlippageTolerance(slippageTolerance);

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    let assets: bigint;
    let shares: bigint;
    let transferAmount: bigint;

    if (isSharesMode) {
      validateRepayShares({
        positionData,
        repayShares: params.shares,
        marketId: this.marketParams.id,
      });
      assets = 0n;
      shares = params.shares;
      // Add slippage buffer to cover interest accrued between tx construction and execution.
      // Without this, the on-chain repay amount may exceed the pre-transferred ERC20 amount.
      const baseTransferAmount = positionData.market.toBorrowAssets(
        shares,
        "Up",
      );
      transferAmount = MathLib.wMulUp(
        baseTransferAmount,
        MathLib.WAD + slippageTolerance,
      );
    } else {
      validateRepayAmount({
        positionData,
        repayAssets: params.assets,
        marketId: this.marketParams.id,
      });
      assets = params.assets;
      shares = 0n;
      transferAmount = params.assets;
    }

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets: assets,
      repayShares: shares,
      market: positionData.market,
      slippageTolerance,
    });

    return {
      getRequirements: (reqParams?: { useSimplePermit?: boolean }) =>
        getRequirements(this.client.viemClient, {
          address: this.marketParams.loanToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: reqParams?.useSimplePermit,
          args: { amount: transferAmount, from: userAddress },
        }),

      buildTx: (requirementSignature?: RequirementSignature) =>
        marketV1Repay({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            assets,
            shares,
            transferAmount,
            onBehalf: userAddress,
            receiver: userAddress,
            maxSharePrice,
            requirementSignature,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  withdrawCollateral({
    userAddress,
    amount,
    positionData,
  }: {
    userAddress: Address;
    amount: bigint;
    positionData: AccrualPosition;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(this.client.viemClient.account?.address, userAddress);

    if (amount <= 0n) {
      throw new NonPositiveWithdrawCollateralAmountError(this.marketParams.id);
    }

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    if (amount > positionData.collateral) {
      throw new WithdrawExceedsCollateralError({
        withdrawAmount: amount,
        available: positionData.collateral,
        market: positionData.marketId,
      });
    }

    validatePositionHealthAfterWithdraw({
      positionData,
      withdrawAmount: amount,
      lltv: this.marketParams.lltv,
      marketId: this.marketParams.id,
    });

    return {
      buildTx: () =>
        marketV1WithdrawCollateral({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            onBehalf: userAddress,
            receiver: userAddress,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  repayWithdrawCollateral(
    params: {
      userAddress: Address;
      withdrawAmount: bigint;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
    } & RepayAmountArgs,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(
      this.client.viemClient.account?.address,
      params.userAddress,
    );

    const {
      userAddress,
      withdrawAmount,
      positionData,
      slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    } = params;

    if ("assets" in params && "shares" in params) {
      throw new MutuallyExclusiveRepayAmountsError(this.marketParams.id);
    }

    const isSharesMode = "shares" in params;

    if (isSharesMode) {
      if (params.shares <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
    } else {
      if (params.assets <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
    }

    if (withdrawAmount <= 0n) {
      throw new NonPositiveWithdrawCollateralAmountError(this.marketParams.id);
    }

    validateSlippageTolerance(slippageTolerance);

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    let assets: bigint;
    let shares: bigint;
    let transferAmount: bigint;

    if (isSharesMode) {
      validateRepayShares({
        positionData,
        repayShares: params.shares,
        marketId: this.marketParams.id,
      });
      assets = 0n;
      shares = params.shares;
      const baseTransferAmount = positionData.market.toBorrowAssets(
        shares,
        "Up",
      );
      transferAmount = MathLib.wMulUp(
        baseTransferAmount,
        MathLib.WAD + slippageTolerance,
      );
    } else {
      validateRepayAmount({
        positionData,
        repayAssets: params.assets,
        marketId: this.marketParams.id,
      });
      assets = params.assets;
      shares = 0n;
      transferAmount = params.assets;
    }

    if (withdrawAmount > positionData.collateral) {
      throw new WithdrawExceedsCollateralError({
        withdrawAmount,
        available: positionData.collateral,
        market: positionData.marketId,
      });
    }

    // +10 min accrual buffer: residual debt grows between build and execute.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
      Time.s.from.min(10n);
    const { position: positionAfterRepay } = positionData.repay(
      assets,
      shares,
      accrualTimestamp,
    );
    validatePositionHealthAfterWithdraw({
      positionData: positionAfterRepay,
      withdrawAmount,
      lltv: this.marketParams.lltv,
      marketId: this.marketParams.id,
    });

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets: assets,
      repayShares: shares,
      market: positionData.market,
      slippageTolerance,
    });

    return {
      getRequirements: async (reqParams?: { useSimplePermit?: boolean }) => {
        const [erc20Requirements, authTx] = await Promise.all([
          getRequirements(this.client.viemClient, {
            address: this.marketParams.loanToken,
            chainId: this.chainId,
            supportSignature: this.client.options.supportSignature,
            supportDeployless: this.client.options.supportDeployless,
            useSimplePermit: reqParams?.useSimplePermit,
            args: { amount: transferAmount, from: userAddress },
          }),
          getMorphoAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress,
          }),
        ]);

        return [...erc20Requirements, ...(authTx ? [authTx] : [])];
      },

      buildTx: (requirementSignature?: RequirementSignature) =>
        marketV1RepayWithdrawCollateral({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            assets,
            shares,
            transferAmount,
            withdrawAmount,
            onBehalf: userAddress,
            receiver: userAddress,
            maxSharePrice,
            requirementSignature,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  supplyCollateralBorrow({
    amount = 0n,
    userAddress,
    positionData,
    borrowAmount,
    nativeAmount,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    reallocations,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    borrowAmount: bigint;
    slippageTolerance?: bigint;
    reallocations?: readonly VaultReallocation[];
  } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(this.client.viemClient.account?.address, userAddress);

    if (amount < 0n) {
      throw new NonPositiveAssetAmountError(this.marketParams.collateralToken);
    }

    if (nativeAmount !== undefined && nativeAmount < 0n) {
      throw new NegativeNativeAmountError(nativeAmount);
    }

    if (borrowAmount <= 0n) {
      throw new NonPositiveBorrowAmountError(this.marketParams.id);
    }

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    const totalCollateral = amount + (nativeAmount ?? 0n);
    if (totalCollateral === 0n) {
      throw new ZeroCollateralAmountError(this.marketParams.id);
    }

    validateSlippageTolerance(slippageTolerance);

    if (nativeAmount !== undefined && nativeAmount > 0n) {
      validateNativeCollateral(this.chainId, this.marketParams.collateralToken);
    }

    validatePositionHealth({
      positionData,
      additionalCollateral: totalCollateral,
      borrowAmount,
      marketId: this.marketParams.id,
      lltv: this.marketParams.lltv,
    });

    const minSharePrice = computeMinBorrowSharePrice({
      borrowAmount,
      market: positionData.market,
      slippageTolerance,
    });

    return {
      getRequirements: async (params?: { useSimplePermit?: boolean }) => {
        const [erc20Requirements, authTx] = await Promise.all([
          getRequirements(this.client.viemClient, {
            address: this.marketParams.collateralToken,
            chainId: this.chainId,
            supportSignature: this.client.options.supportSignature,
            supportDeployless: this.client.options.supportDeployless,
            useSimplePermit: params?.useSimplePermit,
            args: { amount, from: userAddress },
          }),
          getMorphoAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress,
          }),
        ]);

        return [...erc20Requirements, ...(authTx ? [authTx] : [])];
      },

      buildTx: (requirementSignature?: RequirementSignature) =>
        marketV1SupplyCollateralBorrow({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args: {
            amount,
            nativeAmount,
            borrowAmount,
            onBehalf: userAddress,
            receiver: userAddress,
            minSharePrice,
            requirementSignature,
            reallocations,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  async getReallocationData({
    vaultAddresses,
    market,
    block,
  }: {
    vaultAddresses: readonly Address[];
    market: Market;
    block: MinimalBlock;
  }): Promise<SimulationState> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    if (market.id !== this.marketParams.id) {
      throw new MarketIdMismatchError(market.id, this.marketParams.id);
    }

    const client = this.client.viemClient;
    const fetchParams = {
      blockNumber: block.number,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    };

    // Phase 1: Fetch all vaults in parallel to get their withdrawQueues.
    const vaults = await Promise.all(
      vaultAddresses.map((addr) => fetchVault(addr, client, fetchParams)),
    );

    // Collect unique market IDs from all vault withdrawQueues + target market.
    const targetMarketId = this.marketParams.id;
    const allMarketIds = new Set<MarketId>([targetMarketId]);
    const vaultMarketPairs: { vault: Address; marketId: MarketId }[] = [];

    for (const vault of vaults) {
      // Always include target market pair so its config/position is fetched
      // even when the target market is only in the vault's supplyQueue.
      vaultMarketPairs.push({ vault: vault.address, marketId: targetMarketId });
      for (const mid of vault.withdrawQueue) {
        allMarketIds.add(mid);
        if (mid !== targetMarketId) {
          vaultMarketPairs.push({ vault: vault.address, marketId: mid });
        }
      }
    }

    // Phase 2: Fetch all source markets, vault configs, and positions in parallel.
    const sourceMarketIds = [...allMarketIds].filter(
      (mid) => mid !== targetMarketId,
    );

    const loanToken = market.params.loanToken;

    const [markets, configs, positions, holdings] = await Promise.all([
      Promise.all(
        sourceMarketIds.map((mid) => fetchMarket(mid, client, fetchParams)),
      ),
      Promise.all(
        vaultMarketPairs.map(({ vault, marketId: mid }) =>
          fetchVaultMarketConfig(vault, mid, client, fetchParams).then(
            (config) => ({ vault, mid, config }),
          ),
        ),
      ),
      Promise.all(
        vaultMarketPairs.map(({ vault, marketId: mid }) =>
          fetchPosition(vault, mid, client, fetchParams).then((position) => ({
            vault,
            mid,
            position,
          })),
        ),
      ),
      Promise.all(
        vaultAddresses.map((addr) =>
          fetchHolding(addr, loanToken, client, fetchParams),
        ),
      ),
    ]);

    // Assemble records for SimulationState.
    const marketsRecord: Record<MarketId, Market | undefined> = {
      [targetMarketId]: market,
    };
    for (const m of markets) {
      marketsRecord[m.id] = m;
    }

    const vaultsRecord: Record<Address, Vault | undefined> = {};
    for (const v of vaults) {
      vaultsRecord[v.address] = v;
    }

    const vaultMarketConfigsRecord: Record<
      Address,
      Record<MarketId, VaultMarketConfig | undefined>
    > = {};
    for (const { vault, mid, config } of configs) {
      (vaultMarketConfigsRecord[vault] ??= {})[mid] = config;
    }

    const positionsRecord: Record<
      Address,
      Record<MarketId, Position | undefined>
    > = {};
    for (const { vault, mid, position } of positions) {
      (positionsRecord[vault] ??= {})[mid] = position;
    }

    const holdingsRecord: Record<
      Address,
      Record<Address, Holding | undefined>
    > = {};
    for (const holding of holdings) {
      (holdingsRecord[holding.user] ??= {})[holding.token] = holding;
    }

    return new SimulationState({
      chainId: this.chainId,
      block,
      markets: marketsRecord,
      vaults: vaultsRecord,
      vaultMarketConfigs: vaultMarketConfigsRecord,
      positions: positionsRecord,
      holdings: holdingsRecord,
    });
  }

  getReallocations({
    reallocationData,
    borrowAmount,
    options,
  }: {
    reallocationData: SimulationState;
    borrowAmount: bigint;
    options?: ReallocationComputeOptions;
  }): readonly VaultReallocation[] {
    return computeReallocations({
      reallocationData,
      marketId: this.marketParams.id,
      borrowAmount,
      options: { enabled: true, ...options },
    });
  }
}
