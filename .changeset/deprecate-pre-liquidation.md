---
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/morpho-ts": minor
---

Deprecate all pre-liquidation logic. Every pre-liquidation export is now marked `@deprecated` and will be removed in the next major; there is no successor.

- `blue-sdk`: `PreLiquidationParams`, `IPreLiquidationParams`, `PreLiquidationPosition`, `IPreLiquidationPosition`, `defaultPreLiquidationParamsRegistry`, `getDefaultPreLiquidationParams`, and `UnsupportedPreLiquidationParamsError`.
- `blue-sdk-viem`: `fetchPreLiquidationParams`, `fetchPreLiquidationPosition`, `AccrualPosition.fetchPreLiquidation`, `preLiquidationAbi`, and `preLiquidationFactoryAbi`.
- `morpho-sdk`: the matching `/blue/*` raw re-exports and the `Blue`-qualified facade aliases (`BluePreLiquidationParams`, `BluePreLiquidationPosition`, `fetchBluePreLiquidationParams`, `fetchBluePreLiquidationPosition`, `UnsupportedBluePreLiquidationParamsError`, `bluePreLiquidationAbi`, `bluePreLiquidationFactoryAbi`, `blueDefaultPreLiquidationParamsRegistry`, `getBlueDefaultPreLiquidationParams`, and `BlueAccrualPosition.fetchPreLiquidation`).
- `morpho-ts`: the `preLiquidationFactory` chain-address field.

Runtime behavior is unchanged; this only adds `@deprecated` JSDoc.
