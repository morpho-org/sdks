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
  UnknownDataError,
  UnknownTokenError,
  User,
  Vault,
  VaultMarketConfig,
  VaultUser,
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
  UnknownVaultUserError,
  UnknownWrappedTokenError,
} from "./errors.js";

export interface InputSimulationState {
  chainId: ChainId;
  blockNumber: bigint;
  timestamp: bigint;
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
  public blockNumber: bigint;
  public timestamp: bigint;

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
    blockNumber,
    timestamp,
    global = {},
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
    this.blockNumber = blockNumber;
    this.timestamp = timestamp;

    this.global = global;
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
}
