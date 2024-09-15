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
  UnknownTokenError,
  User,
  Vault,
  VaultMarketConfig,
  WrappedToken,
  _try,
} from "@morpho-org/blue-sdk";

import {
  UnknownHoldingError,
  UnknownMarketError,
  UnknownPositionError,
  UnknownUserError,
  UnknownVaultError,
  UnknownVaultMarketConfigError,
  UnknownWrappedTokenError,
  UnknownWstEthExchangeRateError,
} from "./errors.js";

export class SimulationState {
  constructor(
    public readonly global: { stEthPerWstEth?: bigint; feeRecipient: Address },
    public readonly markets: Record<MarketId, Market>,
    public readonly users: Record<Address, User>,
    public readonly tokens: Record<Address, Token>,
    public readonly vaults: Record<Address, Vault>,
    /**
     * Positions indexed by user then by market.
     */
    public readonly positions: Record<Address, Record<MarketId, Position>>,
    /**
     * Holdings indexed by user then by token.
     */
    public readonly holdings: Record<Address, Record<Address, Holding>>,
    /**
     * VaultMarketConfigs indexed by vault then by market.
     */
    public readonly vaultMarketConfigs: Record<
      Address,
      Record<MarketId, VaultMarketConfig>
    >,
    public readonly chainId: ChainId,
    public blockNumber: bigint,
    public timestamp: bigint,
  ) {}

  getStEthPerWstEth() {
    const { stEthPerWstEth } = this.global;

    if (stEthPerWstEth == null) throw new UnknownWstEthExchangeRateError();

    return stEthPerWstEth;
  }

  getMarket(marketId: MarketId) {
    const marketData = this.markets[marketId];

    if (marketData == null) throw new UnknownMarketError(marketId);

    return marketData;
  }

  getUser(user: Address) {
    const userData = this.users[user];

    if (userData == null) throw new UnknownUserError(user);

    return userData;
  }

  getToken(token: Address) {
    const tokenData = this.tokens[token];

    if (tokenData == null) throw new UnknownTokenError(token);

    return tokenData;
  }

  getVault(vault: Address) {
    const vaultData = this.vaults[vault];

    if (vaultData == null) throw new UnknownVaultError(vault);

    return vaultData;
  }

  getAccrualVault(address: Address) {
    const vault = this.getVault(address);

    return new AccrualVault(
      vault,
      vault.withdrawQueue.map((id) => ({
        config: this.getVaultMarketConfig(address, id),
        position: this.getAccrualPosition(address, id),
      })),
    );
  }

  getPosition(user: Address, market: MarketId) {
    const position = this.positions[user]?.[market];

    if (position == null) throw new UnknownPositionError(user, market);

    return position;
  }

  getAccrualPosition(user: Address, market: MarketId) {
    return new AccrualPosition(
      this.getPosition(user, market),
      this.getMarket(market),
    );
  }

  getHolding(user: Address, token: Address) {
    const userTokenData = this.holdings[user]?.[token];

    if (userTokenData == null) throw new UnknownHoldingError(user, token);

    return userTokenData;
  }

  getVaultMarketConfig(vault: Address, market: MarketId) {
    const vaultMarketConfig = this.vaultMarketConfigs[vault]?.[market];

    if (vaultMarketConfig == null)
      throw new UnknownVaultMarketConfigError(vault, market);

    return vaultMarketConfig;
  }

  getWrappedToken(address: Address) {
    const token = this.getToken(address);

    if (!(token instanceof WrappedToken)) {
      const vault = _try(
        () => this.getAccrualVault(token.address),
        UnknownVaultError,
      );

      if (vault == null) throw new UnknownWrappedTokenError(address);

      return vault;
    }

    return token;
  }
}
