import {
  AccrualPosition,
  DEFAULT_SLIPPAGE_TOLERANCE,
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
  fetchMarket,
  fetchPosition,
  fetchVault,
  fetchVaultMarketConfig,
} from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import {
  blueBorrow,
  blueRefinance,
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateral,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  blueWithdrawCollateral,
  getMorphoAuthorizationRequirement,
  getRequirements,
} from "../../actions/index.js";
import {
  computeMaxRepaySharePrice,
  computeMaxSupplySharePrice,
  computeMinBorrowSharePrice,
  computeMinWithdrawSharePrice,
  computeReallocations,
  validateAccrualPosition,
  validateChainId,
  validateNativeAsset,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
  validateRepayAmount,
  validateRepayShares,
  validateSlippageTolerance,
  validateWithdrawAmount,
  validateWithdrawShares,
} from "../../helpers/index.js";
import type { FetchParameters } from "../../types/data.js";
import {
  type AssetsOrSharesArgs,
  type BlueBorrowAction,
  type BlueRefinanceAction,
  type BlueRepayAction,
  type BlueRepayWithdrawCollateralAction,
  type BlueSupplyAction,
  type BlueSupplyCollateralAction,
  type BlueSupplyCollateralBorrowAction,
  type BlueWithdrawAction,
  type BlueWithdrawCollateralAction,
  BorrowAmountAndSharesExclusiveError,
  type DepositAmountArgs,
  type ERC20ApprovalAction,
  MarketIdMismatchError,
  MissingAccrualPositionError,
  type MorphoAuthorizationAction,
  type MorphoClientType,
  MutuallyExclusiveRepayAmountsError,
  MutuallyExclusiveWithdrawAmountsError,
  NativeAmountExceedsTransferAmountError,
  NegativeBorrowSharesError,
  NegativeNativeAmountError,
  NegativeSupplyAmountError,
  NonPositiveAssetAmountError,
  NonPositiveBorrowAmountError,
  NonPositiveRepayAmountError,
  NonPositiveWithdrawAmountError,
  NonPositiveWithdrawCollateralAmountError,
  type ReallocationComputeOptions,
  RefinanceExceedsBorrowAssetsError,
  RefinanceExceedsBorrowSharesError,
  RefinanceExceedsCollateralError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
  type RepayAmountArgs,
  type Requirement,
  type RequirementSignature,
  type Transaction,
  type VaultReallocation,
  WithdrawExceedsCollateralError,
  ZeroCollateralAmountError,
  ZeroSupplyAmountError,
} from "../../types/index.js";
import { ReallocationData } from "../reallocationData.js";

export interface BlueActions {
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
    ) => Readonly<Transaction<BlueSupplyCollateralAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]>;
  };

  /**
   * Prepares a loan-asset supply transaction.
   *
   * Routed through bundler via GeneralAdapter1. Computes `maxSharePrice` from market supply
   * state and `slippageTolerance` to protect against share-price inflation.
   * `getRequirements` returns ERC20 approval or permit for `GeneralAdapter1` on the loan token.
   * When `nativeAmount` is provided, native token is wrapped; the loan token must be wNative.
   *
   * No Morpho authorization required (supplier is crediting, not withdrawing).
   *
   * @param params - Supply parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  supply: (
    params: {
      userAddress: Address;
      marketData: Market;
      slippageTolerance?: bigint;
    } & DepositAmountArgs,
  ) => {
    buildTx: (
      requirementSignature?: RequirementSignature,
    ) => Readonly<Transaction<BlueSupplyAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Requirement)[]>;
  };

  /**
   * Prepares a loan-asset withdraw transaction.
   *
   * Routed through bundler3 via `morphoWithdraw`. Supports two modes via {@link AssetsOrSharesArgs}:
   * - **By assets** (`{ assets }`): withdraws an exact asset amount.
   * - **By shares** (`{ shares }`): burns an exact share count (full close, immune to interest accrual).
   *
   * Computes `minSharePrice` from market supply state and `slippageTolerance`.
   *
   * When `reallocations` is provided, `reallocateTo` actions are prepended to the bundle,
   * moving liquidity from other markets via the PublicAllocator before withdrawing — used to
   * unblock withdraws that exceed on-market liquidity.
   *
   * `getRequirements` returns `morpho.setAuthorization(generalAdapter1, true)` if GA1 is not
   * yet authorized on Morpho (returns `[]` when already authorized), since the bundler calls
   * `withdraw(...,onBehalf=user,...)`.
   *
   * **Stale `positionData` may cause unexpected supply share calculations.**
   *
   * @param params - Withdraw parameters including pre-fetched `positionData`.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  withdraw: (
    params: {
      userAddress: Address;
      receiver?: Address;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
      reallocations?: readonly VaultReallocation[];
    } & AssetsOrSharesArgs,
  ) => {
    buildTx: () => Readonly<Transaction<BlueWithdrawAction>>;
    getRequirements: () => Promise<
      Readonly<Transaction<MorphoAuthorizationAction>>[]
    >;
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
    buildTx: () => Readonly<Transaction<BlueBorrowAction>>;
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
    ) => Readonly<Transaction<BlueRepayAction>>;
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
    buildTx: () => Readonly<Transaction<BlueWithdrawCollateralAction>>;
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
    ) => Readonly<Transaction<BlueRepayWithdrawCollateralAction>>;
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
    ) => Readonly<Transaction<BlueSupplyCollateralBorrowAction>>;
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
   * Prepares an atomic refinance migrating this market's position to another Morpho Blue market
   * that shares the same loan and collateral tokens. See {@link blueRefinance} for the bundle.
   *
   * Validates ownership, token/id match, that amounts do not exceed the source position, and that
   * both the residual source and the aggregate target position stay within LLTV − buffer. Both
   * markets are forward-accrued to `now`; in shares mode the target borrow is overshot by
   * `slippageTolerance` and the callback sweeps the residual.
   *
   * `getRequirements` returns `morpho.setAuthorization(generalAdapter1, true)` when GA1 is not yet
   * authorized (a single global authorization covers both markets).
   *
   * @param params.userAddress - Position owner on both markets.
   * @param params.positionData - Pre-fetched source-market accrual position.
   * @param params.target.marketParams - Target market params.
   * @param params.target.positionData - Pre-fetched target-market accrual position (zero-position if none).
   * @param params.collateralAmount - Amount of collateral to migrate from source to target.
   * @param params.borrowAssets - Loan assets to repay on source; exclusive with `borrowShares`.
   * @param params.borrowShares - Borrow shares to repay on source; exclusive with `borrowAssets`.
   * @param params.slippageTolerance - WAD slippage tolerance. Defaults to `DEFAULT_SLIPPAGE_TOLERANCE`.
   * @param params.targetReallocations - PublicAllocator reallocations into the target market.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  refinance: (params: {
    userAddress: Address;
    positionData: AccrualPosition;
    target: {
      marketParams: MarketParams;
      positionData: AccrualPosition;
    };
    collateralAmount: bigint;
    borrowAssets?: bigint;
    borrowShares?: bigint;
    slippageTolerance?: bigint;
    targetReallocations?: readonly VaultReallocation[];
  }) => {
    buildTx: () => Readonly<Transaction<BlueRefinanceAction>>;
    getRequirements: () => Promise<
      Readonly<Transaction<MorphoAuthorizationAction>>[]
    >;
  };

  /**
   * Fetches all on-chain data needed to construct a {@link ReallocationData}
   * for computing vault reallocations via the public allocator.
   *
   * The target market is refetched internally at `block.number` so the
   * reallocation planner always sees a snapshot from the same block as the
   * source vaults. A caller-owned market would let stale or adversarial data
   * inject unnecessary `reallocateTo` actions (and their PublicAllocator
   * fees) into the resulting bundle.
   *
   * The returned reallocation data can be passed to {@link getReallocations}
   * to compute the `VaultReallocation[]` array for `borrow()` or
   * `supplyCollateralBorrow()`.
   *
   * **Stale data reverts on-chain (fail-safe).**
   *
   * @param params.vaultAddresses - Addresses of MetaMorpho vaults that allocate to this market.
   * @param params.block - The block to fetch data at (number and timestamp).
   * @returns A ReallocationData instance populated with all required data.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   */
  getReallocationData: (params: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }) => Promise<ReallocationData>;

  /**
   * Computes vault reallocations for a borrow or withdraw on this market.
   *
   * Uses the shared-liquidity algorithm to determine which vaults should reallocate liquidity to
   * this market via the PublicAllocator, based on the post-operation utilization target.
   *
   * Pass `{ borrowAmount }` for a borrow (legacy alias, equivalent to `{ operation: "borrow",
   * amount }`) or `{ operation: "withdraw", amount }` for a loan-asset withdraw.
   *
   * @param params.reallocationData - The current on-chain state (from {@link getReallocationData}).
   * @param params.operation - The operation driving the reallocation (`"borrow"` or `"withdraw"`).
   *        Defaults to `"borrow"` when `borrowAmount` is provided.
   * @param params.amount - The borrow or withdraw amount used to compute the post-state utilization.
   * @param params.borrowAmount - {@deprecated} Equivalent to `{ operation: "borrow", amount }`. Use the
   *   `operation` + `amount` form on new code.
   * @param params.options - Optional reallocation computation options
   *        (timestamp, utilization targets, reallocatable vaults filter, etc.).
   *        Pass the fetched block timestamp to compute reallocations at the same block.
   * @returns Array of vault reallocations ready to pass to `borrow()`, `supplyCollateralBorrow()`,
   *          or `withdraw()`. Empty array if no reallocation is needed.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to a different chain than this market.
   * @throws {InsufficientSharedLiquidityError} when shared liquidity cannot cover the operation's absolute shortfall on the target market — preventing fee-bearing reallocations from being attached to a call that would still revert onchain.
   * @throws {MissingPublicAllocatorConfigError} when a selected vault is missing its public allocator config.
   * @throws {UnknownReallocationMarketError} when the target market is absent from the reallocation data.
   */
  getReallocations: (
    params: {
      reallocationData: ReallocationData;
      options?: ReallocationComputeOptions;
    } & (
      | {
          operation: "borrow" | "withdraw";
          amount: bigint;
          borrowAmount?: never;
        }
      | {
          /** @deprecated Pass `{ operation: "borrow", amount }` instead. */
          borrowAmount: bigint;
          operation?: never;
          amount?: never;
        }
    ),
  ) => readonly VaultReallocation[];
}

export class MorphoBlue implements BlueActions {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
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

  supply({
    amount = 0n,
    userAddress,
    nativeAmount,
    marketData,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
  }: {
    userAddress: Address;
    marketData: Market;
    slippageTolerance?: bigint;
  } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (amount < 0n) {
      throw new NegativeSupplyAmountError(this.marketParams.id);
    }

    if (nativeAmount !== undefined && nativeAmount < 0n) {
      throw new NegativeNativeAmountError(nativeAmount);
    }

    const totalAssets = amount + (nativeAmount ?? 0n);
    if (totalAssets === 0n) {
      throw new ZeroSupplyAmountError(this.marketParams.id);
    }

    if (marketData.id !== this.marketParams.id) {
      throw new MarketIdMismatchError(marketData.id, this.marketParams.id);
    }

    validateSlippageTolerance(slippageTolerance);

    if (nativeAmount !== undefined && nativeAmount > 0n) {
      validateNativeAsset(this.chainId, this.marketParams.loanToken);
    }

    const maxSharePrice = computeMaxSupplySharePrice({
      supplyAssets: totalAssets,
      market: marketData,
      slippageTolerance,
    });

    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getRequirements(this.client.viemClient, {
          address: this.marketParams.loanToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: params?.useSimplePermit,
          args: { amount, from: userAddress },
        }),

      buildTx: (requirementSignature?: RequirementSignature) =>
        blueSupply({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            amount,
            nativeAmount,
            onBehalf: userAddress,
            maxSharePrice,
            requirementSignature,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  withdraw(
    params: {
      userAddress: Address;
      receiver?: Address;
      positionData: AccrualPosition;
      slippageTolerance?: bigint;
      reallocations?: readonly VaultReallocation[];
    } & AssetsOrSharesArgs,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const {
      userAddress,
      receiver = userAddress,
      positionData,
      slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
      reallocations,
    } = params;

    // Mode normalization: a missing or undefined `assets`/`shares` key collapses to `0n`
    // so the mutual-exclusion and positivity checks below are pure value comparisons.
    const assets = ("assets" in params ? params.assets : undefined) ?? 0n;
    const shares = ("shares" in params ? params.shares : undefined) ?? 0n;

    // Mode conflict comes first: detect "both values present" (either non-zero)
    // before positivity, so `{ assets: -1n, shares: 5n }` reports the actual
    // mode conflict instead of being misclassified as a positivity error.
    // Mirrors action layer.
    if (assets !== 0n && shares !== 0n) {
      throw new MutuallyExclusiveWithdrawAmountsError(this.marketParams.id);
    }
    if (assets < 0n || shares < 0n || (assets === 0n && shares === 0n)) {
      throw new NonPositiveWithdrawAmountError(this.marketParams.id);
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

    if (shares > 0n) {
      validateWithdrawShares({
        positionData,
        withdrawShares: shares,
        marketId: this.marketParams.id,
      });
    } else {
      validateWithdrawAmount({
        positionData,
        withdrawAssets: assets,
        marketId: this.marketParams.id,
      });
    }

    const minSharePrice = computeMinWithdrawSharePrice({
      withdrawAssets: assets,
      withdrawShares: shares,
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
        blueWithdraw({
          market: { chainId: this.chainId, marketParams: this.marketParams },
          args: {
            assets,
            shares,
            receiver,
            minSharePrice,
            reallocations,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  supplyCollateral({
    amount = 0n,
    userAddress,
    nativeAmount,
  }: { userAddress: Address } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

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
      validateNativeAsset(this.chainId, this.marketParams.collateralToken);
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
        blueSupplyCollateral({
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
        blueBorrow({
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

    const {
      userAddress,
      positionData,
      slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    } = params;

    if ("amount" in params && "shares" in params) {
      throw new MutuallyExclusiveRepayAmountsError(this.marketParams.id);
    }

    const nativeAmount = params.nativeAmount ?? 0n;
    if (nativeAmount < 0n) {
      throw new NegativeNativeAmountError(nativeAmount);
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

    if (nativeAmount > 0n) {
      validateNativeAsset(this.chainId, this.marketParams.loanToken);
    }

    let repayAssets: bigint;
    let repayShares: bigint;
    let transferAmount: bigint;
    let erc20Amount: bigint;
    let marketForRepay: Market;

    if ("shares" in params) {
      const shares = params.shares;
      if (shares <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
      validateRepayShares({
        positionData,
        repayShares: shares,
        marketId: this.marketParams.id,
      });
      repayAssets = 0n;
      repayShares = shares;
      // 2h forward accrual upper-bounds the on-chain repay price; bundle
      // skims residual back to the receiver.
      const accrualTimestamp =
        MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
        Time.s.from.h(2n);
      marketForRepay = positionData.market.accrueInterest(accrualTimestamp);
      transferAmount = marketForRepay.toBorrowAssets(shares, "Up");
      // Native funds part of the transfer; the ERC-20 pulled is the remainder.
      if (nativeAmount > transferAmount) {
        throw new NativeAmountExceedsTransferAmountError({
          nativeAmount,
          transferAmount,
          market: this.marketParams.id,
        });
      }
      erc20Amount = transferAmount - nativeAmount;
    } else {
      // Assets mode is additive, like supply: repaid = amount + nativeAmount.
      const amount = params.amount ?? 0n;
      repayAssets = amount + nativeAmount;
      if (repayAssets <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
      validateRepayAmount({
        positionData,
        repayAssets,
        marketId: this.marketParams.id,
      });
      repayShares = 0n;
      transferAmount = repayAssets;
      erc20Amount = amount;
      marketForRepay = positionData.market;
    }

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets,
      repayShares,
      market: marketForRepay,
      slippageTolerance,
    });

    return {
      getRequirements: (reqParams?: { useSimplePermit?: boolean }) => {
        // Fully native repay pulls no ERC-20, so it needs no approval/permit.
        if (erc20Amount === 0n) return Promise.resolve([]);
        return getRequirements(this.client.viemClient, {
          address: this.marketParams.loanToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          supportDeployless: this.client.options.supportDeployless,
          useSimplePermit: reqParams?.useSimplePermit,
          args: { amount: erc20Amount, from: userAddress },
        });
      },

      buildTx: (requirementSignature?: RequirementSignature) =>
        blueRepay({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args:
            repayShares > 0n
              ? {
                  shares: repayShares,
                  transferAmount,
                  nativeAmount,
                  onBehalf: userAddress,
                  receiver: userAddress,
                  maxSharePrice,
                  requirementSignature,
                }
              : {
                  amount: erc20Amount,
                  nativeAmount,
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
        blueWithdrawCollateral({
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

    const {
      userAddress,
      withdrawAmount,
      positionData,
      slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    } = params;

    if ("amount" in params && "shares" in params) {
      throw new MutuallyExclusiveRepayAmountsError(this.marketParams.id);
    }

    const nativeAmount = params.nativeAmount ?? 0n;
    if (nativeAmount < 0n) {
      throw new NegativeNativeAmountError(nativeAmount);
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

    if (nativeAmount > 0n) {
      validateNativeAsset(this.chainId, this.marketParams.loanToken);
    }

    let repayAssets: bigint;
    let repayShares: bigint;
    let transferAmount: bigint;
    let erc20Amount: bigint;
    let marketForRepay: Market;

    // 2h forward accrual upper-bounds the on-chain repay price (shares
    // mode) and the post-repay health check; bundle skims residual back.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
      Time.s.from.h(2n);

    if ("shares" in params) {
      const shares = params.shares;
      if (shares <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
      validateRepayShares({
        positionData,
        repayShares: shares,
        marketId: this.marketParams.id,
      });
      repayAssets = 0n;
      repayShares = shares;
      marketForRepay = positionData.market.accrueInterest(accrualTimestamp);
      transferAmount = marketForRepay.toBorrowAssets(shares, "Up");
      // Native funds part of the transfer; the ERC-20 pulled is the remainder.
      if (nativeAmount > transferAmount) {
        throw new NativeAmountExceedsTransferAmountError({
          nativeAmount,
          transferAmount,
          market: this.marketParams.id,
        });
      }
      erc20Amount = transferAmount - nativeAmount;
    } else {
      // Assets mode is additive, like supply: repaid = amount + nativeAmount.
      const amount = params.amount ?? 0n;
      repayAssets = amount + nativeAmount;
      if (repayAssets <= 0n) {
        throw new NonPositiveRepayAmountError(this.marketParams.id);
      }
      validateRepayAmount({
        positionData,
        repayAssets,
        marketId: this.marketParams.id,
      });
      repayShares = 0n;
      transferAmount = repayAssets;
      erc20Amount = amount;
      marketForRepay = positionData.market;
    }

    if (withdrawAmount > positionData.collateral) {
      throw new WithdrawExceedsCollateralError({
        withdrawAmount,
        available: positionData.collateral,
        market: positionData.marketId,
      });
    }

    const { position: positionAfterRepay } = positionData.repay(
      repayAssets,
      repayShares,
      accrualTimestamp,
    );
    validatePositionHealthAfterWithdraw({
      positionData: positionAfterRepay,
      withdrawAmount,
      lltv: this.marketParams.lltv,
      marketId: this.marketParams.id,
    });

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets,
      repayShares,
      market: marketForRepay,
      slippageTolerance,
    });

    return {
      getRequirements: async (reqParams?: { useSimplePermit?: boolean }) => {
        const [erc20Requirements, authTx] = await Promise.all([
          // Fully native repay pulls no ERC-20, so it needs no approval/permit.
          erc20Amount === 0n
            ? Promise.resolve([])
            : getRequirements(this.client.viemClient, {
                address: this.marketParams.loanToken,
                chainId: this.chainId,
                supportSignature: this.client.options.supportSignature,
                supportDeployless: this.client.options.supportDeployless,
                useSimplePermit: reqParams?.useSimplePermit,
                args: { amount: erc20Amount, from: userAddress },
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
        blueRepayWithdrawCollateral({
          market: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          args:
            repayShares > 0n
              ? {
                  shares: repayShares,
                  transferAmount,
                  nativeAmount,
                  withdrawAmount,
                  onBehalf: userAddress,
                  receiver: userAddress,
                  maxSharePrice,
                  requirementSignature,
                }
              : {
                  amount: erc20Amount,
                  nativeAmount,
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
      validateNativeAsset(this.chainId, this.marketParams.collateralToken);
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
        blueSupplyCollateralBorrow({
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

  refinance({
    userAddress,
    positionData,
    target,
    collateralAmount,
    borrowAssets,
    borrowShares,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
    targetReallocations,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    target: {
      marketParams: MarketParams;
      positionData: AccrualPosition;
    };
    collateralAmount: bigint;
    borrowAssets?: bigint;
    borrowShares?: bigint;
    slippageTolerance?: bigint;
    targetReallocations?: readonly VaultReallocation[];
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateSlippageTolerance(slippageTolerance);

    if (collateralAmount <= 0n) {
      throw new ZeroCollateralAmountError(this.marketParams.id);
    }

    if (!positionData) {
      throw new MissingAccrualPositionError(this.marketParams.id);
    }

    validateAccrualPosition({
      positionData,
      expectedMarketId: this.marketParams.id,
      expectedUser: userAddress,
    });

    if (this.marketParams.id === target.marketParams.id) {
      throw new RefinanceSameMarketError(this.marketParams.id);
    }

    if (
      !isAddressEqual(
        this.marketParams.collateralToken,
        target.marketParams.collateralToken,
      ) ||
      !isAddressEqual(
        this.marketParams.loanToken,
        target.marketParams.loanToken,
      )
    ) {
      throw new RefinanceTokenMismatchError(
        this.marketParams.id,
        target.marketParams.id,
      );
    }

    validateAccrualPosition({
      positionData: target.positionData,
      expectedMarketId: target.marketParams.id,
      expectedUser: userAddress,
    });

    const requestedAssets = borrowAssets ?? 0n;
    const requestedShares = borrowShares ?? 0n;

    // Reject negative debt up front; otherwise it slips past the `> 0n` mode checks and only fails at buildTx().
    if (requestedAssets < 0n) {
      throw new NonPositiveAssetAmountError(this.marketParams.loanToken);
    }
    if (requestedShares < 0n) {
      throw new NegativeBorrowSharesError(this.marketParams.id);
    }

    if (requestedAssets > 0n && requestedShares > 0n) {
      throw new BorrowAmountAndSharesExclusiveError(this.marketParams.id);
    }

    const sharesMode = requestedShares > 0n;
    const shouldMigrateBorrow = requestedAssets > 0n || sharesMode;

    if (collateralAmount > positionData.collateral) {
      throw new RefinanceExceedsCollateralError({
        market: this.marketParams.id,
        requested: collateralAmount,
        available: positionData.collateral,
      });
    }

    if (requestedShares > positionData.borrowShares) {
      throw new RefinanceExceedsBorrowSharesError({
        market: this.marketParams.id,
        requested: requestedShares,
        available: positionData.borrowShares,
      });
    }

    if (requestedAssets > positionData.borrowAssets) {
      throw new RefinanceExceedsBorrowAssetsError({
        market: this.marketParams.id,
        requested: requestedAssets,
        available: positionData.borrowAssets,
      });
    }

    // Forward-accrue both markets to now (clamped to lastUpdate). Source gets a 2h buffer in
    // shares mode (as in repay()) for repay headroom; target accrues without buffer to avoid
    // tightening minBorrowSharePrice past on-chain reality.
    const sourceAccrualTimestamp =
      MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
      (sharesMode ? Time.s.from.h(2n) : 0n);
    const targetAccrualTimestamp = MathLib.max(
      Time.timestamp(),
      target.positionData.market.lastUpdate,
    );
    const accruedSource = positionData.market.accrueInterest(
      sourceAccrualTimestamp,
    );
    const accruedTarget = target.positionData.market.accrueInterest(
      targetAccrualTimestamp,
    );

    // Shares burned by the source repay: exact in shares mode, else mirror Morpho's toSharesDown.
    const repaidShares = sharesMode
      ? requestedShares
      : accruedSource.toBorrowShares(requestedAssets, "Down");

    // Post-state source health: any remaining debt must stay healthy (accrued market).
    const remainingCollateral = positionData.collateral - collateralAmount;
    const remainingShares = positionData.borrowShares - repaidShares;
    if (remainingShares > 0n) {
      const residualPosition = new AccrualPosition(
        {
          user: positionData.user,
          supplyShares: positionData.supplyShares,
          borrowShares: remainingShares,
          collateral: remainingCollateral,
        },
        accruedSource,
      );
      validatePositionHealth({
        positionData: residualPosition,
        additionalCollateral: 0n,
        borrowAmount: 0n,
        marketId: this.marketParams.id,
        lltv: this.marketParams.lltv,
      });
    }

    const projectedBorrowAssets = sharesMode
      ? accruedSource.toBorrowAssets(requestedShares, "Up")
      : requestedAssets;

    // Shares-mode overshoot covers target drift + accrual on the borrow leg. Computed before the
    // LLTV check so health validates the actual on-chain borrow, not the smaller projected value.
    const borrowAssetsAdjusted = sharesMode
      ? MathLib.wMulUp(projectedBorrowAssets, MathLib.WAD + slippageTolerance)
      : projectedBorrowAssets;

    // Post-state target health: aggregate must respect LLTV − buffer. Skipped for collat-only
    // refinances, which can't degrade target health and would fail on missing-oracle markets.
    if (shouldMigrateBorrow) {
      const accruedTargetPosition = target.positionData.accrueInterest(
        targetAccrualTimestamp,
      );
      validatePositionHealth({
        positionData: accruedTargetPosition,
        additionalCollateral: collateralAmount,
        borrowAmount: borrowAssetsAdjusted,
        marketId: target.marketParams.id,
        lltv: target.marketParams.lltv,
      });
    }

    // Share-price bounds only when a debt leg exists (helpers throw on zero inputs); else 0n.
    // Derived from borrowAssetsAdjusted (the encoded value) so rounding can't push the on-chain
    // ratio below a guard computed from the smaller projected amount.
    const minBorrowSharePrice = shouldMigrateBorrow
      ? computeMinBorrowSharePrice({
          borrowAmount: borrowAssetsAdjusted,
          market: accruedTarget,
          slippageTolerance,
        })
      : 0n;

    const maxRepaySharePrice = shouldMigrateBorrow
      ? computeMaxRepaySharePrice({
          repayAssets: requestedAssets,
          repayShares: requestedShares,
          market: accruedSource,
          slippageTolerance,
        })
      : 0n;

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
        blueRefinance({
          source: {
            chainId: this.chainId,
            marketParams: this.marketParams,
          },
          target: { marketParams: target.marketParams },
          args: {
            user: userAddress,
            collateralAmount,
            borrowAssets: borrowAssetsAdjusted,
            borrowShares: requestedShares,
            minBorrowSharePrice,
            maxRepaySharePrice,
            targetReallocations,
          },
          metadata: this.client.options.metadata,
        }),
    };
  }

  /**
   * Fetches all on-chain inputs needed to compute public allocator reallocations.
   *
   * @param params - Reallocation data fetch parameters.
   * @param params.vaultAddresses - Vaults to inspect for source-market liquidity.
   * @param params.block - Block number and timestamp used for consistent RPC reads.
   * @returns Reallocation data ready for {@link getReallocations}.
   * @throws {ChainIdMismatchError} when the client chain does not match this market.
   */
  async getReallocationData({
    vaultAddresses,
    block,
  }: {
    vaultAddresses: readonly Address[];
    block: {
      readonly number: bigint;
      readonly timestamp: bigint;
    };
  }): Promise<ReallocationData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const client = this.client.viemClient;
    const fetchParams = {
      blockNumber: block.number,
      chainId: this.chainId,
      deployless: this.client.options.supportDeployless,
    };

    const targetMarketId = this.marketParams.id;

    // Phase 1: Fetch the target market and all vaults at `block.number` in
    // parallel so every row of the resulting state comes from the same epoch
    // and the planner never trusts a caller-owned target-market snapshot.
    const [targetMarket, vaults] = await Promise.all([
      fetchMarket(targetMarketId, client, fetchParams),
      Promise.all(
        vaultAddresses.map((addr) => fetchVault(addr, client, fetchParams)),
      ),
    ]);

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

    const [markets, configs, positions] = await Promise.all([
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
    ]);

    // Assemble records for ReallocationData.
    const marketsRecord: Record<MarketId, Market | undefined> = {
      [targetMarketId]: targetMarket,
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

    return new ReallocationData({
      chainId: this.chainId,
      markets: marketsRecord,
      vaults: vaultsRecord,
      vaultMarketConfigs: vaultMarketConfigsRecord,
      positions: positionsRecord,
    });
  }

  /**
   * Computes public allocator reallocations for a borrow or withdraw on this market.
   *
   * Pass `{ borrowAmount }` for a borrow (legacy alias, equivalent to `{ operation: "borrow", amount }`)
   * or `{ operation, amount }` for a borrow or loan-asset withdraw.
   *
   * @param params - Reallocation computation parameters.
   * @param params.reallocationData - State returned by {@link getReallocationData}.
   * @param params.operation - The operation driving the reallocation (`"borrow"` or `"withdraw"`).
   * @param params.amount - The borrow or withdraw amount used to compute the post-state utilization.
   * @param params.borrowAmount - {@deprecated Pass `{ operation: "borrow", amount }` instead.}
   * @param params.options - Optional allocator and utilization options.
   * @returns Vault reallocations ready to pass to `borrow`, `supplyCollateralBorrow`, or `withdraw`.
   * @throws {ChainIdMismatchError} when `reallocationData` belongs to a different chain than this market.
   * @throws {InsufficientSharedLiquidityError} when shared liquidity cannot cover the operation's absolute shortfall on the target market.
   * @throws {ReallocationWithdrawExceedsMarketSupplyError} when `operation === "withdraw"` and `amount` exceeds the target market's `totalSupplyAssets`.
   * @throws {MissingPublicAllocatorConfigError} when a selected vault is missing its public allocator config.
   * @throws {UnknownReallocationMarketError} when the target market is absent from the reallocation data.
   */
  getReallocations(
    params: {
      reallocationData: ReallocationData;
      options?: ReallocationComputeOptions;
    } & (
      | {
          operation: "borrow" | "withdraw";
          amount: bigint;
          borrowAmount?: never;
        }
      | {
          /** @deprecated Pass `{ operation: "borrow", amount }` instead. */
          borrowAmount: bigint;
          operation?: never;
          amount?: never;
        }
    ),
  ): readonly VaultReallocation[] {
    validateChainId(params.reallocationData.chainId, this.chainId);

    const marketId = this.marketParams.id;
    const options = { enabled: true, ...params.options };

    if (params.borrowAmount !== undefined) {
      return computeReallocations({
        reallocationData: params.reallocationData,
        marketId,
        operation: "borrow",
        amount: params.borrowAmount,
        options,
      });
    }

    return computeReallocations({
      reallocationData: params.reallocationData,
      marketId,
      operation: params.operation,
      amount: params.amount,
      options,
    });
  }
}
