# Deprecation and Migration

`@morpho-org/simulation-sdk` is deprecated for application consumers once maintained workspace consumers have migrated away from it.

Npm deprecation message:

```text
Deprecated: use @morpho-org/morpho-sdk for supported reallocation helpers. The broad simulation engine has no replacement package.
```

## Migration Path

Use `@morpho-org/morpho-sdk` for the narrow reallocation and constant surface kept by the consolidated SDK:

- Import `ReallocationData` and `InputReallocationData` from `@morpho-org/morpho-sdk/entities`.
- Import public allocator and reallocation types from `@morpho-org/morpho-sdk` or `@morpho-org/morpho-sdk/types`, including `PublicAllocatorOptions`, `PublicReallocation`, `ReallocationComputeOptions`, `ReallocationWithdrawal`, and `VaultReallocation`.
- Import approval and reallocation constants from `@morpho-org/morpho-sdk/constants`, including `APPROVE_ONLY_ONCE_TOKENS`, `MAX_TOKEN_APPROVALS`, `DEFAULT_SUPPLY_TARGET_UTILIZATION`, and `DEFAULT_WITHDRAWAL_TARGET_UTILIZATION`.

## Not Retained

The broad operation vocabulary, simulation handlers, mutable simulation engine, Paraswap helpers, mutative helper surface, and full simulation error namespaces are not replaced. `morpho-sdk` keeps only the state and helpers required for supported public allocator reallocation planning.
