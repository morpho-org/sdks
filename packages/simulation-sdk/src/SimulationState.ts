import {
  AccrualPosition,
  AccrualVault,
  type Address,
  AssetBalances,
  ChainId,
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
  Time,
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
import { type MaybeDraft, simulateOperation } from "./handlers/index.js";

/**
 * The default maximum utilization allowed to reach to find shared liquidity (scaled by WAD).
 */
export const DEFAULT_WITHDRAWAL_TARGET_UTILIZATION = 92_0000000000000000n;

export interface PublicAllocatorOptions {
  enabled?: boolean;

  /* The array of vaults to reallocate. Must all have enabled the PublicAllocator. Defaults to all the vaults that have enabled the PublicAllocator. */
  reallocatableVaults?: Address[];

  /**
   * The maximum utilization of each market allowed to reach to find shared liquidity (scaled by WAD).
   */
  maxWithdrawalUtilization?: Record<MarketId, bigint | undefined>;

  /**
   * The default maximum utilization allowed to reach to find shared liquidity (scaled by WAD).
   * @default 92%
   */
  defaultMaxWithdrawalUtilization?: bigint;

  /* The delay to consider between the moment reallocations are calculated and the moment they are committed onchain. Defaults to 1h. */
  delay?: bigint;
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
  chainId: number;
  block: MinimalBlock;
  global?: { feeRecipient?: Address };
  markets?: Record<MarketId, Market | undefined>;
  users?: Record<Address, User | undefined>;
  tokens?: Record<Address, Token | undefined>;
  vaults?: Record<Address, Vault | undefined>;
  /**
   * Positions indexed by user then by market.
   */
  positions?: Record<Address, Record<MarketId, Position | undefined>>;
  /**
   * Holdings indexed by user then by token.
   */
  holdings?: Record<Address, Record<Address, Holding | undefined>>;
  /**
   * VaultMarketConfigs indexed by vault then by market.
   */
  vaultMarketConfigs?: Record<
    Address,
    Record<MarketId, VaultMarketConfig | undefined>
  >;
  /**
   * VaultUsers indexed by vault then by user.
   */
  vaultUsers?: Record<Address, Record<Address, VaultUser | undefined>>;
}

export class SimulationState implements InputSimulationState {
  public readonly chainId: number;
  public block: MinimalBlock;

  public readonly global: { feeRecipient?: Address };
  public readonly markets: Record<MarketId, Market | undefined>;
  public readonly users: Record<Address, User | undefined>;
  public readonly tokens: Record<Address, Token | undefined>;
  public readonly vaults: Record<Address, Vault | undefined>;
  /**
   * Positions indexed by user then by market.
   */
  public readonly positions: Record<
    Address,
    Record<MarketId, Position | undefined>
  >;
  /**
   * Holdings indexed by user then by token.
   */
  public readonly holdings: Record<
    Address,
    Record<Address, Holding | undefined>
  >;
  /**
   * VaultMarketConfigs indexed by vault then by market.
   */
  public readonly vaultMarketConfigs: Record<
    Address,
    Record<MarketId, VaultMarketConfig | undefined>
  >;
  /**
   * VaultUsers indexed by vault then by user.
   */
  public readonly vaultUsers: Record<
    Address,
    Record<Address, VaultUser | undefined>
  >;

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

      const {
        bundler3: { generalAdapter1 },
      } = getChainAddresses(this.chainId);
      _try(() => {
        balance += this.getHolding(generalAdapter1, token).balance;
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
    publicAllocatorOptions?: PublicAllocatorOptions,
    disabledPeripheralTokens = new Set<PeripheralBalanceType>(),
    maxCapacitiesOptions?: {
      borrow?: MaxBorrowOptions;
      withdrawCollateral?: MaxWithdrawCollateralOptions;
    },
  ) {
    return _try(() => {
      const { loanToken, collateralToken } = this.getMarket(marketId).params;

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

      return this.getMarketPublicReallocations(marketId, publicAllocatorOptions)
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
      if (
        this.chainId === ChainId.EthMainnet &&
        token === wstEth &&
        wNative != null &&
        stEth != null
      ) {
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
      enabled = true,
      reallocatableVaults = keys(this.vaultMarketConfigs),
      defaultMaxWithdrawalUtilization = DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
      maxWithdrawalUtilization = {},
      delay = Time.s.from.h(1n),
    }: PublicAllocatorOptions = {},
  ) {
    if (!enabled) return { withdrawals: [], data: this };

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
            const { cap, pendingCap, publicAllocatorConfig } =
              data.getVaultMarketConfig(vault, marketId);

            // If a pending cap is known to be valid, consider worst-case scenario
            // where it is accepted before the reallocation is committed.
            const validCap =
              pendingCap.validAt >= data.block.timestamp
                ? MathLib.min(pendingCap.value, cap)
                : cap;

            const suppliable = MathLib.zeroFloorSub(
              validCap,
              data
                .getAccrualPosition(vault, marketId)
                .accrueInterest(this.block.timestamp + delay).supplyAssets,
            );

            const marketWithdrawals = data
              .getVault(vault)
              .withdrawQueue.filter(
                (srcMarketId) =>
                  srcMarketId !== marketId &&
                  !withdrawals.some(
                    (withdrawal) =>
                      withdrawal.id === srcMarketId &&
                      withdrawal.vault === vault,
                  ),
              )
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

                  const srcPublicAllocatorConfig = data.getVaultMarketConfig(
                    vault,
                    srcMarketId,
                  ).publicAllocatorConfig;

                  return {
                    id: srcMarketId,
                    assets: MathLib.min(
                      srcPosition.supplyAssets, // Cannot reallocate more than what the vault supplied on the source market.
                      targetUtilizationLiquidity, // Cannot reallocate more than the liquidity directly available on the source market under target utilization.
                      suppliable, // Cannot supply over the destination market's configured cap.
                      publicAllocatorConfig?.maxIn ?? 0n, // Cannot supply over the destination market's configured maxIn.
                      srcPublicAllocatorConfig?.maxOut ?? 0n, // Cannot reallocate more than the source market's configured maxOut.
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
}
