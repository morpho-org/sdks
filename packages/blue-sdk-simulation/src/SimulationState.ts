import {
  AccrualPosition,
  AccrualVault,
  Address,
  ChainId,
  MarketId,
  UnknownMarketConfigError,
  UnknownTokenError,
  UnknownVaultConfigError,
  WrappedToken,
  _try,
} from "@morpho-org/blue-sdk";
import {} from "@morpho-org/morpho-ts";

import {
  UnknownHoldingError,
  UnknownMarketError,
  UnknownPositionError,
  UnknownUserError,
  UnknownVaultError,
  UnknownVaultMarketConfigError,
  UnknownVaultUserDataError,
  UnknownWrappedTokenError,
  UnknownWstEthExchangeRateError,
} from "./errors";

export class SimulationState {
  constructor(
    public readonly blue: BlueSimulationState,
    public readonly metamorpho: MetaMorphoSimulationState,
    public readonly chainId: ChainId,
    public blockNumber: bigint,
    public timestamp: bigint,
  ) {}

  getStEthPerWstEth() {
    const { stEthPerWstEth } = this.blue.globalData;

    if (stEthPerWstEth == null) throw new UnknownWstEthExchangeRateError();

    return stEthPerWstEth;
  }

  getMarketConfig(marketId: MarketId) {
    const marketConfig = this.blue.marketsConfig[marketId];

    if (marketConfig == null) throw new UnknownMarketConfigError(marketId);

    return marketConfig;
  }

  getMarket(marketId: MarketId) {
    const marketData = this.blue.marketsData[marketId];

    if (marketData == null) throw new UnknownMarketError(marketId);

    return marketData;
  }

  getUser(user: Address) {
    const userData = this.blue.usersData[user];

    if (userData == null) throw new UnknownUserError(user);

    return userData;
  }

  getTokenData(token: Address) {
    const tokenData = this.blue.tokensData[token];

    if (tokenData == null) throw new UnknownTokenError(token);

    return tokenData;
  }

  getVaultConfig(vault: Address) {
    const vaultConfig = this.metamorpho.vaultsConfig[vault];

    if (vaultConfig == null) throw new UnknownVaultConfigError(vault);

    return vaultConfig;
  }

  getVault(vault: Address) {
    const vaultData = this.metamorpho.vaultsData[vault];

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
    const position = this.blue.positionByMarketByUser[user]?.[market];

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
    const userTokenData = this.blue.userTokenHoldings[user]?.[token];

    if (userTokenData == null) throw new UnknownHoldingError(user, token);

    return userTokenData;
  }

  getVaultUserData(vault: Address, user: Address) {
    const vaultUserData = this.metamorpho.vaultsUsersData[vault]?.[user];

    if (vaultUserData == null) throw new UnknownVaultUserDataError(vault, user);

    return vaultUserData;
  }

  getVaultMarketConfig(vault: Address, market: MarketId) {
    const vaultMarketConfig =
      this.metamorpho.vaultsMarketsConfig[vault]?.[market];

    if (vaultMarketConfig == null)
      throw new UnknownVaultMarketConfigError(vault, market);

    return vaultMarketConfig;
  }

  getWrappedToken(address: Address) {
    const token = this.getTokenData(address);

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
