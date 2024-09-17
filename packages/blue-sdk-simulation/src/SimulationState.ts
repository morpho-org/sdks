import {
  AccrualPosition,
  AccrualVault,
  Address,
  ChainId,
  Holding,
  Market,
  MarketId,
  Position,
  Token,
  User,
  Vault,
  VaultMarketConfig,
  VaultUser,
  WrappedToken,
} from "@morpho-org/blue-sdk";

export class SimulationState {
  constructor(
    protected readonly global: { feeRecipient: Address },
    protected readonly markets: Record<MarketId, Market>,
    protected readonly users: Record<Address, User>,
    protected readonly tokens: Record<Address, Token>,
    protected readonly vaults: Record<Address, Vault>,
    /**
     * Positions indexed by user then by market.
     */
    protected readonly positions: Record<Address, Record<MarketId, Position>>,
    /**
     * Holdings indexed by user then by token.
     */
    protected readonly holdings: Record<Address, Record<Address, Holding>>,
    /**
     * VaultMarketConfigs indexed by vault then by market.
     */
    protected readonly vaultMarketConfigs: Record<
      Address,
      Record<MarketId, VaultMarketConfig>
    >,
    /**
     * VaultUsers indexed by vault then by user.
     */
    protected readonly vaultUsers: Record<Address, Record<Address, VaultUser>>,
    public readonly chainId: ChainId,
    public blockNumber: bigint,
    public timestamp: bigint,
  ) {}

  getMarket(marketId: MarketId) {
    return this.markets[marketId];
  }

  getUser(user: Address) {
    return this.users[user];
  }

  getToken(token: Address) {
    return this.tokens[token];
  }

  getVault(vault: Address) {
    return this.vaults[vault];
  }

  getAccrualVault(address: Address) {
    const vault = this.getVault(address);
    if (vault == null) return;

    return new AccrualVault(
      vault,
      vault.withdrawQueue.map((id) => ({
        config: this.getVaultMarketConfig(address, id),
        position: this.getAccrualPosition(address, id),
      })),
    );
  }

  getPosition(user: Address, market: MarketId) {
    return this.positions[user]?.[market];
  }

  getAccrualPosition(user: Address, marketId: MarketId) {
    const position = this.getPosition(user, marketId);
    const market = this.getMarket(marketId);

    if (position == null || market == null) return;

    return new AccrualPosition(position, market);
  }

  getHolding(user: Address, token: Address) {
    return this.holdings[user]?.[token];
  }

  getVaultMarketConfig(vault: Address, market: MarketId) {
    return this.vaultMarketConfigs[vault]?.[market];
  }

  getVaultUser(vault: Address, user: Address) {
    return this.vaultUsers[vault]?.[user];
  }

  getWrappedToken(address: Address) {
    const token = this.getToken(address);

    if (token && !(token instanceof WrappedToken)) {
      const vault = this.getAccrualVault(token.address);

      if (vault != null) return vault;
    }

    return token;
  }
}
