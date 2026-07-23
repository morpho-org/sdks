---
"@morpho-org/morpho-sdk": minor
"@morpho-org/liquidity-sdk-viem": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Default the shared-liquidity target utilization to 90% and deprecate all
customization of it. This is non-breaking: the tuning surface stays in place and
explicit overrides are still honored until the next major.

**`@morpho-org/morpho-sdk`**:

- `DEFAULT_SUPPLY_TARGET_UTILIZATION` and `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION`
  are now both 90% (previously 90.5% and 92%). Callers that pass no explicit
  override now trigger reallocations at 90% and cap phase-1 source-market
  withdrawals at 90%. The aggressive fallback still drains to 100% as a last resort.
- `PublicAllocatorOptions.maxWithdrawalUtilization` /
  `defaultMaxWithdrawalUtilization` and
  `ReallocationComputeOptions.supplyTargetUtilization` /
  `defaultSupplyTargetUtilization` are now `@deprecated`. They remain fully
  functional and will be removed in the next major.

**`@morpho-org/liquidity-sdk-viem`**:

- `LiquidityParameters` and the `LiquidityLoader` `parameters` constructor
  argument are now `@deprecated`. The source-market withdrawal ceiling defaults to
  90% and the Morpho API's `targetWithdrawUtilization` field is no longer
  consulted; explicitly passed `parameters` overrides are still honored until the
  next major.
- The `@morpho-org/morpho-sdk` peer range moves to `^5.4.0`: the 90% default
  ceiling lives in `morpho-sdk`'s `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION`, so an
  older peer would silently fall back to the previous 92% default now that the
  API value is no longer consulted.
