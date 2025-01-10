export enum MarketWarningType {
  BadDebtRealized = "bad_debt_realized",
  BadDebtUnrealized = "bad_debt_unrealized",
  HardcodedOracle = "hardcoded_oracle",
  UnrecognizedCollateralAsset = "unrecognized_collateral_asset",
  UnrecognizedLender = "unrecognized_lender",
  UnrecognizedLoanAsset = "unrecognized_loan_asset",
  UnrecognizedOracle = "unrecognized_oracle",
  UnrecognizedOracleFeed = "unrecognized_oracle_feed",
  LowLiquidity = "low_liquidity",
  UnsafeVaultAsCollateralAsset = "unsafe_vault_as_collateral_asset",
  IncompatibleOracleFeeds = "incompatible_oracle_feeds",
  IncorrectCollateralExchangeRate = "incorrect_collateral_exchange_rate",
  IncorrectLoanExchangeRate = "incorrect_loan_exchange_rate",
  NonWhitelisted = "not_whitelisted",
  OracleNotFromFactory = "oracle_not_from_factory",
  MisconfiguredOracleDecimals = "misconfigured_oracle_decimals",
}

export enum VaultWarningType {
  UnrecognizedDepositAsset = "unrecognized_deposit_asset",
  UnrecognizedVaultCurator = "unrecognized_vault_curator",
  UnrecognizedMarket = "unrecognized_market",
  NonWhitelisted = "not_whitelisted",
}
