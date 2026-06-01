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
  getMorphoAuthorizationRequirement,
  getRequirements,
  marketV1Borrow,
  marketV1Refinance,
  marketV1Repay,
  marketV1RepayWithdrawCollateral,
  marketV1Supply,
  marketV1SupplyCollateral,
  marketV1SupplyCollateralBorrow,
  marketV1Withdraw,
  marketV1WithdrawCollateral,
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
  BorrowAmountAndSharesExclusiveError,
  type DepositAmountArgs,
  type ERC20ApprovalAction,
  MarketIdMismatchError,
  type MarketV1BorrowAction,
  type MarketV1RefinanceAction,
  type MarketV1RepayAction,
  type MarketV1RepayWithdrawCollateralAction,
  type MarketV1SupplyAction,
  type MarketV1SupplyCollateralAction,
  type MarketV1SupplyCollateralBorrowAction,
  type MarketV1WithdrawAction,
  type MarketV1WithdrawCollateralAction,
  MissingAccrualPositionError,
  type MorphoAuthorizationAction,
  type MorphoClientType,
  MutuallyExclusiveRepayAmountsError,
  MutuallyExclusiveWithdrawAmountsError,
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
    ) => Readonly<Transaction<MarketV1SupplyAction>>;
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
    buildTx: () => Readonly<Transaction<MarketV1WithdrawAction>>;
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
   * Prepares an atomic refinance transaction migrating this market's position to another Morpho
   * Blue market that shares the same loan and collateral tokens.
   *
   * Routed through bundler3 via the `onMorphoSupplyCollateral` callback on the **target** market:
   * GA1 deposits the collateral on target (callback fires with the collateral already credited),
   * borrows from target inside the callback, repays the source, then withdraws the source
   * collateral to GA1 to settle the deferred `safeTransferFrom`. See {@link marketV1Refinance}
   * for the full bundle shape.
   *
   * Validates:
   * - Both positions belong to `userAddress` (source = this entity, target via `target.positionData`).
   * - Source and target share both tokens; source and target market ids differ.
   * - `collateralAmount`, `borrowShares`, and `borrowAssets` do not exceed source position amounts.
   * - Resulting source position (after partial migration) stays healthy or fully closes — uses the
   *   accrued source market and accounts for shares burned by assets-mode repay.
   * - Target position aggregate (existing + migrated, including the shares-mode overshoot) respects
   *   LLTV − buffer.
   *
   * Both markets are forward-accrued to `now` before share-price slippage bounds are computed.
   * In shares mode, the target borrow is overshot by `slippageTolerance` to absorb mid-tx
   * accrual; the action's callback sweeps the residual into the target debt.
   *
   * `getRequirements` returns `morpho.setAuthorization(generalAdapter1, true)` when GA1 is not
   * yet authorized on Morpho. A single authorization covers both markets (Morpho's auth is
   * global, not per-market).
   *
   * @param params - Refinance parameters.
   * @param params.userAddress - Position owner on both markets.
   * @param params.positionData - Pre-fetched source-market accrual position.
   * @param params.target.marketParams - Target market params.
   * @param params.target.positionData - Pre-fetched target-market accrual position. Required so
   *   the LLTV check operates on the aggregate (existing + migrated) position. Pass a zero-position
   *   when the user has no prior position on target.
   * @param params.collateralAmount - Amount of collateral to migrate from source to target.
   * @param params.borrowAssets - Loan-asset amount to repay on source (mutually exclusive with
   *   `borrowShares`). Use this for partial debt migration in assets mode.
   * @param params.borrowShares - Borrow shares to repay on source (mutually exclusive with
   *   `borrowAssets`). Use this for full source closure (immune to mid-tx accrual). Optional.
   * @param params.slippageTolerance - WAD slippage tolerance. Defaults to
   *   `DEFAULT_SLIPPAGE_TOLERANCE`.
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
  }) => {
    buildTx: () => Readonly<Transaction<MarketV1RefinanceAction>>;
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

export class MorphoMarketV1 implements MarketV1Actions {
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
        marketV1Supply({
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
        marketV1Withdraw({
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
    let marketForRepay: Market;

    if (isSharesMode) {
      validateRepayShares({
        positionData,
        repayShares: params.shares,
        marketId: this.marketParams.id,
      });
      assets = 0n;
      shares = params.shares;
      // 2h forward accrual upper-bounds the on-chain repay price; bundle
      // skims residual back to the receiver.
      const accrualTimestamp =
        MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
        Time.s.from.h(2n);
      marketForRepay = positionData.market.accrueInterest(accrualTimestamp);
      transferAmount = marketForRepay.toBorrowAssets(shares, "Up");
    } else {
      validateRepayAmount({
        positionData,
        repayAssets: params.assets,
        marketId: this.marketParams.id,
      });
      assets = params.assets;
      shares = 0n;
      transferAmount = params.assets;
      marketForRepay = positionData.market;
    }

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets: assets,
      repayShares: shares,
      market: marketForRepay,
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
    let marketForRepay: Market;

    // 2h forward accrual upper-bounds the on-chain repay price (shares
    // mode) and the post-repay health check; bundle skims residual back.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), positionData.market.lastUpdate) +
      Time.s.from.h(2n);

    if (isSharesMode) {
      validateRepayShares({
        positionData,
        repayShares: params.shares,
        marketId: this.marketParams.id,
      });
      assets = 0n;
      shares = params.shares;
      marketForRepay = positionData.market.accrueInterest(accrualTimestamp);
      transferAmount = marketForRepay.toBorrowAssets(shares, "Up");
    } else {
      validateRepayAmount({
        positionData,
        repayAssets: params.assets,
        marketId: this.marketParams.id,
      });
      assets = params.assets;
      shares = 0n;
      transferAmount = params.assets;
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
      market: marketForRepay,
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

  refinance({
    userAddress,
    positionData,
    target,
    collateralAmount,
    borrowAssets,
    borrowShares,
    slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE,
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

    // Reject negative debt amounts up front — otherwise they fall through the `> 0n` mode
    // checks as if no debt were migrated, and the failure only surfaces at `buildTx()` time
    // (after `getRequirements()` already prompted the user for GA1 authorization).
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

    // Forward-accrue both markets:
    //   - source projects assets-from-shares fidelity; in shares mode we add a 2h buffer
    //     (same pattern as `repay()` / `repayWithdrawCollateral()`) so an exact-share repay
    //     under low slippage or delayed execution still has enough borrow + slippage headroom.
    //     The buffer inflates both `projectedBorrowAssets` and `maxRepaySharePrice` together.
    //   - target's LLTV check uses the existing-debt accrued to "now" (no 2h buffer — that
    //     would tighten `minBorrowSharePrice` past on-chain reality and risk false reverts).
    //   - source residual check uses the accrued market so the projected residual debt
    //     reflects what the on-chain repay actually consumes.
    // `Market.accrueInterest` requires `timestamp >= lastUpdate`; clamp via `MathLib.max` so
    // a stale clock or simulated future position never produces a negative elapsed interval.
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

    // Shares actually burned on-chain by the source repay:
    //   - shares mode: exactly `requestedShares` (immune to mid-tx accrual)
    //   - assets mode: Morpho computes `shares = assets.toSharesDown(assets, shares)` —
    //     mirror that conversion using the accrued source market.
    const repaidShares = sharesMode
      ? requestedShares
      : accruedSource.toBorrowShares(requestedAssets, "Down");

    // Post-state SOURCE health: if any debt remains, the residual position must stay healthy.
    // Covers both `remainingCollateral > 0` (LTV check) and `remainingCollateral === 0`
    // (validatePositionHealth fails — liquidable). Uses the accrued source market so the
    // residual `borrowAssets` getter reflects accrual rather than reading stale state.
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

    // Shares-mode overshoot covers (a) target share-price drift between signature and exec,
    // and (b) mempool accrual between read and exec on the target's borrow leg. Computed
    // before the target LLTV check so the health validation tests the *actual* on-chain
    // borrow amount (a near-LLTV target could otherwise pass against `projectedBorrowAssets`
    // and revert against the overshot value).
    const borrowAssetsAdjusted = sharesMode
      ? MathLib.wMulUp(projectedBorrowAssets, MathLib.WAD + slippageTolerance)
      : projectedBorrowAssets;

    // Post-state TARGET health: aggregate (existing + migrated) must respect LLTV − buffer.
    // Skipped for collat-only refinances — the encoded tx only supplies target collateral and
    // withdraws source collateral, neither of which can degrade target health, and running the
    // helper here would otherwise reject markets whose oracle is unavailable or whose collateral
    // value is below the helper's `+1` rounding guard.
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

    // Share-price bounds — only computed when a debt leg exists; the slippage helpers throw
    // ShareDivideByZeroError on zero inputs, so in collat-only refinance we leave the bounds
    // at 0n (the action layer accepts non-negative bounds).
    //
    // The guard must be derived from `borrowAssetsAdjusted` — the value actually encoded into
    // `morphoBorrow` — and not `projectedBorrowAssets`. Otherwise, in shares-mode with a low
    // positive slippage on dust positions, `toBorrowShares("Up")` rounding can make the
    // encoded borrow's on-chain asset/share ratio fall below the guard computed from the
    // smaller projected value, reverting a bundle that passed preflight.
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
        marketV1Refinance({
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
