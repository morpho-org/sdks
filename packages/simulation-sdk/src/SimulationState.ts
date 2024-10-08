import {
  AccrualPosition,
  AccrualVault,
  type Address,
  AssetBalances,
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
  type Holding,
  type Market,
  type MarketId,
  MathLib,
  type MaxBorrowOptions,
  type MaxWithdrawCollateralOptions,
  NATIVE_ADDRESS,
  type PeripheralBalanceType,
  type Position,
  type Token,
  UnknownDataError,
  UnknownTokenError,
  type User,
  type Vault,
  type VaultMarketConfig,
  VaultToken,
  type VaultUser,
  WrappedToken,
  _try,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import {
  ZERO_ADDRESS,
  bigIntComparator,
  isDefined,
  keys,
  values,
} from "@morpho-org/morpho-ts";
import {
  UnknownHoldingError,
  UnknownMarketError,
  UnknownPositionError,
  UnknownUserError,
  UnknownVaultError,
  UnknownVaultMarketConfigError,
  UnknownVaultUserError,
  UnknownWrappedTokenError,
} from "./errors.js";
import {
  type MaybeDraft,
  produceImmutable,
  simulateOperation,
  simulateOperations,
} from "./handlers/index.js";
import type { Operation } from "./operations.js";

export interface PublicAllocatorOptions {
  /* The array of vaults to reallocate. Must all have enabled the PublicAllocator. Defaults to all the vaults that have enabled the PublicAllocator. */
  reallocatableVaults?: Address[];

  /* Fallback maximum utilization allowed from withdrawn markets. */
  defaultMaxWithdrawalUtilization?: bigint;

  /* Market-specific maximum utilization allowed for each corresponding withdrawn market. */
  maxWithdrawalUtilization?: Record<MarketId, bigint | undefined>;
}

export interface PublicReallocation {
  id: MarketId;
  vault: Address;
  assets: bigint;
}

export interface MinimalBlock {
  number: bigint;
  timestamp: bigint;
}

export interface InputSimulationState {
  chainId: ChainId;
  block: MinimalBlock;
  global?: { feeRecipient?: Address };
  markets?: Record<MarketId, Market>;
  users?: Record<Address, User>;
  tokens?: Record<Address, Token>;
  vaults?: Record<Address, Vault>;
  /**
   * Positions indexed by user then by market.
   */
  positions?: Record<Address, Record<MarketId, Position>>;
  /**
   * Holdings indexed by user then by token.
   */
  holdings?: Record<Address, Record<Address, Holding>>;
  /**
   * VaultMarketConfigs indexed by vault then by market.
   */
  vaultMarketConfigs?: Record<Address, Record<MarketId, VaultMarketConfig>>;
  /**
   * VaultUsers indexed by vault then by user.
   */
  vaultUsers?: Record<Address, Record<Address, VaultUser>>;
}

export class SimulationState implements InputSimulationState {
  public readonly chainId: ChainId;
  public block: MinimalBlock;

  public readonly global: { feeRecipient?: Address };
  public readonly markets: Record<MarketId, Market>;
  public readonly users: Record<Address, User>;
  public readonly tokens: Record<Address, Token>;
  public readonly vaults: Record<Address, Vault>;
  /**
   * Positions indexed by user then by market.
   */
  public readonly positions: Record<Address, Record<MarketId, Position>>;
  /**
   * Holdings indexed by user then by token.
   */
  public readonly holdings: Record<Address, Record<Address, Holding>>;
  /**
   * VaultMarketConfigs indexed by vault then by market.
   */
  public readonly vaultMarketConfigs: Record<
    Address,
    Record<MarketId, VaultMarketConfig>
  >;
  /**
   * VaultUsers indexed by vault then by user.
   */
  public readonly vaultUsers: Record<Address, Record<Address, VaultUser>>;

  constructor({
    chainId,
    block: { number, timestamp },
    global: { feeRecipient } = {},
    markets = {},
    users = {},
    tokens = {},
    vaults = {},
    positions = {},
    holdings = {},
    vaultMarketConfigs = {},
    vaultUsers = {},
  }: InputSimulationState) {
    this.chainId = chainId;
    this.block = { number, timestamp };

    this.global = { feeRecipient };
    this.markets = markets;
    this.users = users;
    this.tokens = tokens;
    this.vaults = vaults;
    this.positions = positions;
    this.holdings = holdings;
    this.vaultMarketConfigs = vaultMarketConfigs;
    this.vaultUsers = vaultUsers;
  }

  public getMarket(marketId: MarketId) {
    const market = this.markets[marketId];

    if (market == null) throw new UnknownMarketError(marketId);

    return market;
  }

  public tryGetMarket(marketId: MarketId) {
    return _try(this.getMarket.bind(this, marketId), UnknownMarketError);
  }

  public getUser(address: Address) {
    const user = this.users[address];

    if (user == null) throw new UnknownUserError(address);

    return user;
  }

  public tryGetUser(address: Address) {
    return _try(this.getUser.bind(this, address), UnknownUserError);
  }

  public getToken(address: Address) {
    const token = this.tokens[address];

    if (token == null) throw new UnknownTokenError(address);

    return token;
  }

  public tryGetToken(address: Address) {
    return _try(this.getToken.bind(this, address), UnknownTokenError);
  }

  public getVault(address: Address) {
    const vault = this.vaults[address];

    if (vault == null) throw new UnknownVaultError(address);

    return vault;
  }

  public tryGetVault(address: Address) {
    return _try(this.getVault.bind(this, address), UnknownVaultError);
  }

  public getAccrualVault(address: Address) {
    const vault = this.getVault(address);

    return new AccrualVault(
      vault,
      vault.withdrawQueue.map((id) => ({
        config: this.getVaultMarketConfig(address, id),
        position: this.getAccrualPosition(address, id),
      })),
    );
  }

  public tryGetAccrualVault(address: Address) {
    return _try(this.getAccrualVault.bind(this, address), UnknownDataError);
  }

  public getPosition(user: Address, market: MarketId) {
    const position = this.positions[user]?.[market];

    if (position == null) throw new UnknownPositionError(user, market);

    return position;
  }

  public tryGetPosition(user: Address, market: MarketId) {
    return _try(
      this.getPosition.bind(this, user, market),
      UnknownPositionError,
    );
  }

  public getAccrualPosition(user: Address, marketId: MarketId) {
    return new AccrualPosition(
      this.getPosition(user, marketId),
      this.getMarket(marketId),
    );
  }

  public tryGetAccrualPosition(user: Address, marketId: MarketId) {
    return _try(
      this.getAccrualPosition.bind(this, user, marketId),
      UnknownDataError,
    );
  }

  public getHolding(user: Address, token: Address) {
    const holding = this.holdings[user]?.[token];

    if (holding == null) throw new UnknownHoldingError(user, token);

    return holding;
  }

  public tryGetHolding(user: Address, token: Address) {
    return _try(this.getHolding.bind(this, user, token), UnknownHoldingError);
  }

  public getVaultMarketConfig(vault: Address, market: MarketId) {
    const vaultMarketConfig = this.vaultMarketConfigs[vault]?.[market];

    if (vaultMarketConfig == null)
      throw new UnknownVaultMarketConfigError(vault, market);

    return vaultMarketConfig;
  }

  public tryGetVaultMarketConfig(vault: Address, market: MarketId) {
    return _try(
      this.getVaultMarketConfig.bind(this, vault, market),
      UnknownVaultMarketConfigError,
    );
  }

  public getVaultUser(vault: Address, user: Address) {
    const vaultUser = this.vaultUsers[vault]?.[user];

    if (vaultUser == null) throw new UnknownVaultUserError(vault, user);

    return vaultUser;
  }

  public tryGetVaultUser(vault: Address, user: Address) {
    return _try(
      this.getVaultUser.bind(this, vault, user),
      UnknownVaultUserError,
    );
  }

  public getWrappedToken(address: Address) {
    const token = this.getToken(address);

    if (!(token instanceof WrappedToken)) {
      const vault = this.tryGetAccrualVault(token.address);

      if (vault == null) throw new UnknownWrappedTokenError(address);

      return vault;
    }

    return token;
  }

  public tryGetWrappedToken(address: Address) {
    return _try(this.getWrappedToken.bind(this, address), UnknownDataError);
  }

  public getBundleBalance(
    user: Address,
    token: Address,
    accountBundlerBalance = true,
  ) {
    return _try(() => {
      let { balance } = this.getHolding(user, token);

      if (!accountBundlerBalance) return balance;

      const { bundler } = getChainAddresses(this.chainId);
      _try(() => {
        balance += this.getHolding(bundler, token).balance;
      }, UnknownDataError);

      return balance;
    }, UnknownDataError);
  }

  public getBundleMaxBalance(
    user: Address,
    token: Address,
    slippage?: bigint,
    disabledPeripheralTokens = new Set<PeripheralBalanceType>(),
  ) {
    const maxBalances = this.getBundleAssetBalances(user, token, slippage);

    if (!maxBalances) return maxBalances;

    return values(maxBalances.allocations)
      .filter(isDefined)
      .filter(({ type }) => !disabledPeripheralTokens.has(type))
      .reduce((acc, { dstAmount }) => acc + dstAmount, 0n);
  }

  public getBundleMaxCapacities(
    user: Address,
    marketId: MarketId,
    slippage?: bigint,
    reallocationOptions?: PublicAllocatorOptions,
    disabledPeripheralTokens = new Set<PeripheralBalanceType>(),
    maxCapacitiesOptions?: {
      borrow?: MaxBorrowOptions;
      withdrawCollateral?: MaxWithdrawCollateralOptions;
    },
  ) {
    return _try(() => {
      const { loanToken, collateralToken } = this.getMarket(marketId).config;

      const loanBalance = this.getBundleMaxBalance(
        user,
        loanToken,
        slippage,
        disabledPeripheralTokens,
      );
      const collateralBalance = this.getBundleMaxBalance(
        user,
        collateralToken,
        slippage,
        disabledPeripheralTokens,
      );
      if (loanBalance == null || collateralBalance == null) return;

      return this.getMarketPublicReallocations(marketId, reallocationOptions)
        .data.getAccrualPosition(user, marketId)
        .getMaxCapacities(loanBalance, collateralBalance, maxCapacitiesOptions);
    }, UnknownDataError);
  }

  public getBundleAssetBalances(
    user: Address,
    token: Address,
    slippage?: bigint,
    accountBundlerBalance = true,
  ): AssetBalances | undefined {
    return _try(() => {
      const balance = this.getBundleBalance(user, token, accountBundlerBalance);

      if (balance == null) return;

      const balances = new AssetBalances({
        srcToken: this.getToken(token),
        srcAmount: balance,
        dstAmount: balance,
      });

      const wrappedToken = _try(
        () => this.getWrappedToken(token),
        UnknownWrappedTokenError,
      );

      if (!wrappedToken) return balances;

      _try(() => {
        if (wrappedToken instanceof VaultToken) return;

        const unwrappedBalance = this.getBundleBalance(
          user,
          wrappedToken.underlying,
        );

        if (unwrappedBalance != null) {
          const wrappedBalance = wrappedToken.toWrappedExactAmountIn(
            unwrappedBalance,
            slippage,
          );

          balances.add({
            type: "wrapped",
            srcToken: this.getToken(wrappedToken.underlying),
            srcAmount: unwrappedBalance,
            dstAmount: wrappedBalance,
          });
        }
      }, UnknownDataError);

      const { wstEth, stEth, wNative } = getChainAddresses(this.chainId);

      // staking is only available on mainnet for now
      if (this.chainId === ChainId.EthMainnet && token === wstEth && stEth) {
        _try(() => {
          const wEthBalance = this.getBundleBalance(user, wNative);

          if (wEthBalance != null) {
            const stEthToken = this.getWrappedToken(stEth);
            const stEthBalance = stEthToken.toWrappedExactAmountIn(
              wEthBalance,
              slippage,
            );
            const wrappedBalance = wrappedToken.toWrappedExactAmountIn(
              stEthBalance,
              slippage,
            );

            balances.add({
              type: "unwrapped-staked-wrapped",
              srcToken: this.getToken(wNative),
              srcAmount: wEthBalance,
              dstAmount: wrappedBalance,
            });
          }
        }, UnknownDataError);

        _try(() => {
          const ethBalance = this.getBundleBalance(user, NATIVE_ADDRESS);

          if (ethBalance != null) {
            const stEthToken = this.getWrappedToken(stEth);
            const stEthBalance = stEthToken.toWrappedExactAmountIn(
              ethBalance,
              slippage,
            );
            const wrappedBalance = wrappedToken.toWrappedExactAmountIn(
              stEthBalance,
              slippage,
            );

            balances.add({
              type: "staked-wrapped",
              srcToken: this.getToken(NATIVE_ADDRESS),
              srcAmount: ethBalance,
              dstAmount: wrappedBalance,
            });
          }
        }, UnknownDataError);
      }

      _try(() => {
        if (!(wrappedToken instanceof VaultToken)) return;

        const vaultBalances = this.getBundleAssetBalances(
          user,
          wrappedToken.underlying,
          slippage,
        );

        if (vaultBalances) {
          for (const { type, srcToken, srcAmount, dstAmount } of values(
            vaultBalances.allocations,
          ).filter(isDefined)) {
            const newType = (
              {
                base: "vault",
                wrapped: "wrapped-vault",
              } as Partial<Record<PeripheralBalanceType, PeripheralBalanceType>>
            )[type];

            if (newType) {
              const depositedBalance = wrappedToken.toWrappedExactAmountIn(
                dstAmount,
                slippage,
              );

              balances.add({
                type: newType,
                srcToken,
                srcAmount,
                dstAmount: depositedBalance,
              });
            }
          }
        }
      });

      return balances;
    }, UnknownDataError);
  }

  /**
   * Calculates the public reallocations required to reach the maximum liquidity available according to some reallocation algorithm.
   * @param marketId The market on which to calculate the shared liquidity.
   * @param options The options for the reallocation.
   * @returns The array of withdrawals to perform and the end simulation data.
   * @warning The end SimulationData may have incorrectly accrued some fee from public reallocations multiple times.
   */
  public getMarketPublicReallocations(
    marketId: MarketId,
    {
      reallocatableVaults = keys(this.vaultMarketConfigs),
      defaultMaxWithdrawalUtilization = DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
      maxWithdrawalUtilization = {},
    }: PublicAllocatorOptions = {},
  ) {
    // Filter the vaults that have the market enabled and configured on the PublicAllocator.
    reallocatableVaults = reallocatableVaults.filter((vault) => {
      const vaultMarketConfig = this.vaultMarketConfigs[vault]?.[marketId];

      return (
        !!vaultMarketConfig?.enabled &&
        this.vaults[vault]?.publicAllocatorConfig != null
      );
    });

    let data: MaybeDraft<SimulationState> = this;
    const withdrawals: PublicReallocation[] = [];

    const _getMarketPublicReallocations = () => {
      const vaultWithdrawals = reallocatableVaults
        .map((vault) =>
          _try(() => {
            const dstAssets = data
              .getAccrualPosition(vault, marketId)
              .accrueInterest(this.block.timestamp).supplyAssets;
            const { cap, publicAllocatorConfig } = data.getVaultMarketConfig(
              vault,
              marketId,
            );

            const suppliable =
              cap -
              // There is slippage in the expected vault's supply on the destination market.
              MathLib.wMulDown(
                dstAssets,
                MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
              );

            const marketWithdrawals = data
              .getVault(vault)
              .withdrawQueue.filter((srcMarketId) => srcMarketId !== marketId)
              .map((srcMarketId) => {
                try {
                  const srcPosition = data
                    .getAccrualPosition(vault, srcMarketId)
                    .accrueInterest(this.block.timestamp);

                  const targetUtilizationLiquidity =
                    srcPosition.market.getWithdrawToUtilization(
                      maxWithdrawalUtilization[srcMarketId] ??
                        defaultMaxWithdrawalUtilization,
                    );

                  const maxOut = data.getVaultMarketConfig(vault, srcMarketId)
                    .publicAllocatorConfig.maxOut;

                  return {
                    id: srcMarketId,
                    assets: MathLib.min(
                      srcPosition.supplyAssets, // Cannot reallocate more than what the vault supplied on the source market.
                      targetUtilizationLiquidity, // Cannot reallocate more than the liquidity directly available on the source market under target utilization.
                      suppliable, // Cannot supply over the destination market's configured cap.
                      publicAllocatorConfig.maxIn, // Cannot supply over the destination market's configured maxIn.
                      maxOut, // Cannot reallocate more than the source market's configured maxOut.
                    ),
                  };
                } catch {
                  return { id: srcMarketId, assets: 0n };
                }
              })
              .filter(({ assets }) => assets > 0n)
              // Sort by decreasing reallocatable liquidity.
              .sort(bigIntComparator(({ assets }) => assets, "desc"));

            return {
              vault,
              largestWithdrawal: marketWithdrawals[0],
            };
          }, UnknownDataError),
        )
        .filter(
          (vaultWithdrawals) =>
            vaultWithdrawals?.largestWithdrawal != null &&
            vaultWithdrawals.largestWithdrawal.assets > 0n,
        )
        // Sort by decreasing reallocatable liquidity.
        .sort(
          bigIntComparator(
            (vaultWithdrawals) => vaultWithdrawals!.largestWithdrawal!.assets,
            "desc",
          ),
        );

      const largestVaultWithdrawal = vaultWithdrawals[0];
      if (
        largestVaultWithdrawal == null ||
        largestVaultWithdrawal.largestWithdrawal == null
      )
        return { withdrawals, data };

      const { vault, largestWithdrawal } = largestVaultWithdrawal;

      withdrawals.push({ ...largestWithdrawal, vault });

      data = simulateOperation(
        {
          type: "MetaMorpho_PublicReallocate",
          address: vault,
          sender: ZERO_ADDRESS, // Bypass fee balance check.
          args: {
            withdrawals: [largestWithdrawal],
            supplyMarketId: marketId,
          },
        },
        data,
      );

      return _getMarketPublicReallocations();
    };

    return _getMarketPublicReallocations();
  }

  public simulateRequiredTokenAmounts(operations: Operation[]) {
    const { bundler } = getChainAddresses(this.chainId);

    const virtualBundlerData = produceImmutable(this, (draft) => {
      Object.values(draft.holdings[bundler] ?? {}).forEach(
        (bundlerTokenData) => {
          // Virtual balance to calculate the amount required.
          bundlerTokenData.balance += MathLib.MAX_UINT_160;
        },
      );
    });

    const steps = simulateOperations(operations, virtualBundlerData);

    const bundlerTokenDiffs = keys(virtualBundlerData.holdings[bundler]).map(
      (token) => ({
        token,
        required: steps
          .map(
            (step) =>
              // When recursively simulated, this will cause tokens to be required at the highest recursion level.
              // For example: supplyCollateral(x, supplyCollateral(y, borrow(z)))   [provided x, y, z < MAX_UINT_160]
              //              |                   |                   |=> MAX_UINT_160 - (3 * MAX_UINT_160 + z) < 0
              //              |                   |=> MAX_UINT_160 - (2 * MAX_UINT_160 - y) < 0
              //              |=> MAX_UINT_160 - (MAX_UINT_160 - y - x) > 0
              MathLib.MAX_UINT_160 -
              (step.holdings[bundler]?.[token]?.balance ?? 0n),
          )
          .sort(
            bigIntComparator(
              (required) => required,
              // Take the highest required amount among all operations.
              "desc",
            ),
          )[0]!,
      }),
    );

    return bundlerTokenDiffs.filter(({ required }) => required > 0n);
  }
}
