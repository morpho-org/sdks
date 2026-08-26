export {
  DEFAULT_SLIPPAGE_TOLERANCE,
  EIP_712_FIELDS,
  isMarketId as isBlueMarketId,
  /** @deprecated Use `isBlueMarketId` or the raw `/blue/constants` subpath. */
  isMarketId,
  LIQUIDATION_CURSOR as BLUE_LIQUIDATION_CURSOR,
  /** @deprecated Use `BLUE_LIQUIDATION_CURSOR` or the raw `/blue/constants` subpath. */
  LIQUIDATION_CURSOR,
  MAX_LIQUIDATION_INCENTIVE_FACTOR as BLUE_MAX_LIQUIDATION_INCENTIVE_FACTOR,
  /** @deprecated Use `BLUE_MAX_LIQUIDATION_INCENTIVE_FACTOR` or the raw `/blue/constants` subpath. */
  MAX_LIQUIDATION_INCENTIVE_FACTOR,
  ORACLE_PRICE_SCALE,
  SECONDS_PER_YEAR,
  TransactionType as BlueTransactionType,
  /** @deprecated Use `BlueTransactionType` or the raw `/blue/constants` subpath. */
  TransactionType,
} from "@morpho-org/blue-sdk";
export {
  CBP as MIDNIGHT_CBP,
  /** @deprecated Use `MIDNIGHT_CBP` or the raw `/midnight/constants` subpath. */
  CBP,
  COLLATERAL_PARAMS_TYPEHASH as MIDNIGHT_COLLATERAL_PARAMS_TYPEHASH,
  /** @deprecated Use `MIDNIGHT_COLLATERAL_PARAMS_TYPEHASH` or the raw `/midnight/constants` subpath. */
  COLLATERAL_PARAMS_TYPEHASH,
  DEFAULT_TICK_SPACING as MIDNIGHT_DEFAULT_TICK_SPACING,
  /** @deprecated Use `MIDNIGHT_DEFAULT_TICK_SPACING` or the raw `/midnight/constants` subpath. */
  DEFAULT_TICK_SPACING,
  EIP712_DOMAIN_TYPEHASH as MIDNIGHT_EIP712_DOMAIN_TYPEHASH,
  /** @deprecated Use `MIDNIGHT_EIP712_DOMAIN_TYPEHASH` or the raw `/midnight/constants` subpath. */
  EIP712_DOMAIN_TYPEHASH,
  MARKET_TYPEHASH as MIDNIGHT_MARKET_TYPEHASH,
  /** @deprecated Use `MIDNIGHT_MARKET_TYPEHASH` or the raw `/midnight/constants` subpath. */
  MARKET_TYPEHASH,
  MAX_COLLATERALS as MIDNIGHT_MAX_COLLATERALS,
  /** @deprecated Use `MIDNIGHT_MAX_COLLATERALS` or the raw `/midnight/constants` subpath. */
  MAX_COLLATERALS,
  MAX_COLLATERALS_PER_BORROWER as MIDNIGHT_MAX_COLLATERALS_PER_BORROWER,
  /** @deprecated Use `MIDNIGHT_MAX_COLLATERALS_PER_BORROWER` or the raw `/midnight/constants` subpath. */
  MAX_COLLATERALS_PER_BORROWER,
  MAX_CONTINUOUS_FEE as MIDNIGHT_MAX_CONTINUOUS_FEE,
  /** @deprecated Use `MIDNIGHT_MAX_CONTINUOUS_FEE` or the raw `/midnight/constants` subpath. */
  MAX_CONTINUOUS_FEE,
  MAX_OFFER_CAP as MIDNIGHT_MAX_OFFER_CAP,
  MAX_SETTLEMENT_FEES as MIDNIGHT_MAX_SETTLEMENT_FEES,
  /** @deprecated Use `MIDNIGHT_MAX_SETTLEMENT_FEES` or the raw `/midnight/constants` subpath. */
  MAX_SETTLEMENT_FEES,
  MAX_TICK as MIDNIGHT_MAX_TICK,
  /** @deprecated Use `MIDNIGHT_MAX_TICK` or the raw `/midnight/constants` subpath. */
  MAX_TICK,
  OFFER_TYPEHASH as MIDNIGHT_OFFER_TYPEHASH,
  /** @deprecated Use `MIDNIGHT_OFFER_TYPEHASH` or the raw `/midnight/constants` subpath. */
  OFFER_TYPEHASH,
  PRICE_ROUNDING_STEP as MIDNIGHT_PRICE_ROUNDING_STEP,
  /** @deprecated Use `MIDNIGHT_PRICE_ROUNDING_STEP` or the raw `/midnight/constants` subpath. */
  PRICE_ROUNDING_STEP,
  SETTLEMENT_FEE_BREAKPOINTS as MIDNIGHT_SETTLEMENT_FEE_BREAKPOINTS,
  /** @deprecated Use `MIDNIGHT_SETTLEMENT_FEE_BREAKPOINTS` or the raw `/midnight/constants` subpath. */
  SETTLEMENT_FEE_BREAKPOINTS,
  TIME_TO_MAX_LIF as MIDNIGHT_TIME_TO_MAX_LIF,
} from "@morpho-org/midnight-sdk";
export {
  BLUE_API_BASE_URL,
  BLUE_API_GRAPHQL_URL,
  CDN_BASE_URL,
  ChainId,
  ChainUtils,
  DOCS_BASE_URL,
  MORPHO_DOMAIN,
  OPTIMIZERS_API_BASE_URL,
  OPTIMIZERS_BASE_URL,
  REWARDS_BASE_URL,
  ZERO_ADDRESS,
} from "@morpho-org/morpho-ts";
export {
  APPROVE_ONLY_ONCE_TOKENS,
  DEFAULT_LLTV_BUFFER,
  DEFAULT_MAX_REALLOCATION_PENALTY,
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
  MAX_ABSOLUTE_SHARE_PRICE,
  MAX_REALLOCATION_PENALTY,
  MAX_SLIPPAGE_TOLERANCE,
  MAX_TOKEN_APPROVALS,
} from "./helpers/constant.js";
