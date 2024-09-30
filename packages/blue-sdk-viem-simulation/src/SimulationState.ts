import {
  AccrualPosition,
  AccrualVault,
  Address,
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
  Holding,
  Market,
  MarketId,
  MathLib,
  Position,
  Token,
  UnknownDataError,
  UnknownTokenError,
  User,
  Vault,
  VaultMarketConfig,
  VaultUser,
  WrappedToken,
  _try,
  getChainAddresses,
} from "@morpho-org/blue-sdk";

import { bigIntComparator, keys } from "@morpho-org/morpho-ts";
import { Block, zeroAddress } from "viem";
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
  MaybeDraft,
  produceImmutable,
  simulateOperation,
  simulateOperations,
} from "./handlers/index.js";
import { Operation } from "./operations.js";

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

export interface InputSimulationState {
  chainId: ChainId;
  block: Pick<Block<bigint, false, "latest">, "number" | "timestamp">;
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
  public block: Pick<Block<bigint, false, "latest">, "number" | "timestamp">;

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
        vaultMarketConfig.publicAllocatorConfig != null &&
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
            const { maxIn } = publicAllocatorConfig!;

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

                  const maxOut =
                    data.getVaultMarketConfig(vault, srcMarketId)
                      .publicAllocatorConfig?.maxOut ?? 0n;

                  return {
                    id: srcMarketId,
                    assets: MathLib.min(
                      srcPosition.supplyAssets, // Cannot reallocate more than what the vault supplied on the source market.
                      targetUtilizationLiquidity, // Cannot reallocate more than the liquidity directly available on the source market under target utilization.
                      suppliable, // Cannot supply over the destination market's configured cap.
                      maxIn, // Cannot supply over the destination market's configured maxIn.
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
          sender: zeroAddress, // Bypass fee balance check.
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
