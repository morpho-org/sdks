---
"@morpho-org/morpho-sdk": major
---

Rename the `MarketV1` market abstraction to `Blue` (Morpho Blue, Morpho's immutable variable-rate lending primitive). This is a breaking change to the public surface — every `MarketV1` identifier is now `Blue`:

- Client factory: `client.marketV1(marketParams, chainId)` → `client.blue(marketParams, chainId)` (and `client.morpho.blue(...)` on the viem extension).
- Entity: `MorphoMarketV1` → `MorphoBlue`.
- Actions interface: `MarketV1Actions` → `BlueActions`.
- Transaction action types and their `type` discriminants: `MarketV1SupplyAction`/`"marketV1Supply"`, `MarketV1WithdrawAction`/`"marketV1Withdraw"`, `MarketV1SupplyCollateralAction`/`"marketV1SupplyCollateral"`, `MarketV1BorrowAction`/`"marketV1Borrow"`, `MarketV1SupplyCollateralBorrowAction`/`"marketV1SupplyCollateralBorrow"`, `MarketV1RepayAction`/`"marketV1Repay"`, `MarketV1WithdrawCollateralAction`/`"marketV1WithdrawCollateral"`, `MarketV1RepayWithdrawCollateralAction`/`"marketV1RepayWithdrawCollateral"`, `MarketV1RefinanceAction`/`"marketV1Refinance"` → the corresponding `Blue…Action` / `"blue…"` names.

Integrators must update factory calls, type imports, and any `switch`/pattern-matching on action `type` discriminants. The unrelated Vault V2 adapter types that mirror the on-chain `MorphoMarketV1Adapter` contract (`VaultV2MorphoMarketV1Adapter`, `VaultV2MorphoMarketV1AdapterV2`, their `IAccrual…`/`I…` interfaces, and `morphoMarketV1Adapter*Abi`) are unchanged — they keep matching the deployed contract names.
