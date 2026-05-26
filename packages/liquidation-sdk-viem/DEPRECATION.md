# Deprecation and Migration

`@morpho-org/liquidation-sdk-viem` is deprecated for application consumers.

Suggested npm deprecation message:

```text
Deprecated: use @morpho-org/morpho-sdk for maintained Morpho protocol primitives. Liquidation bot assembly, swap integrations, Flashbots helpers, and liquidation-specific GraphQL helpers are no longer a supported public SDK surface.
```

## Migration Path

Use `@morpho-org/morpho-sdk` for retained Morpho protocol and pre-liquidation primitives:

- Import fetchers from `@morpho-org/morpho-sdk/fetch`, including market, position, token, vault, pre-liquidation params, and pre-liquidation position fetchers.
- Import entity classes from `@morpho-org/morpho-sdk/entities`, including `Market`, `Position`, `Token`, `PreLiquidationParams`, and `PreLiquidationPosition`.
- Import maintained ABI literals from `@morpho-org/morpho-sdk/abis`, including `blueAbi`, `preLiquidationAbi`, and `preLiquidationFactoryAbi`.
- Import address registries and lookup helpers from `@morpho-org/morpho-sdk/addresses`.
- Import protocol constants from `@morpho-org/morpho-sdk/constants`.
- Import math, formatting, typed-data, parsing, and validation helpers from `@morpho-org/morpho-sdk/utils`.

## Not Retained

Liquidation bot assembly, `LiquidationEncoder`, GraphQL liquidatable-position helpers, Flashbots helpers, swap adapters, token integrations, liquidation thresholds, and non-Morpho liquidation ABIs are not replaced.
