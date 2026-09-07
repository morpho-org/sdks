---
"@morpho-org/morpho-sdk": major
---

Complete the morpho-sdk v6 surface cleanup that landed after `6.0.0-next.0`. Remove the deprecated
PublicAllocator V1 shared-liquidity planners, data classes, inputs, validators, errors, `MorphoBlue`
methods, and `BundlerAction.publicAllocatorReallocateTo` composition surface; use
`MorphoBlue.getVaultV2BlueReallocationData` and
`VaultV2BlueReallocationData.computeVaultV2BlueReallocations` instead. Direct Vault V1 actions and
canonical raw Vault V1 ABI, address, fetch, and config exports remain; stay on v5 for Vault V1
planning or Bundler3 composition. Replace `InvalidReallocationShapeError` with
`InvalidVaultV2ReallocationError`.

Remove the five v5 partial-refinance compatibility errors: `BorrowAmountAndSharesExclusiveError`,
`RefinanceExceedsCollateralError`, `RefinanceExceedsBorrowSharesError`,
`RefinanceExceedsBorrowAssetsError`, and `RefinanceSharesMissingBorrowAssetsError`. This is an
intentional one-time lifecycle deviation because those partial modes no longer exist; consumers
must remove those branches or stay on v5.

Also remove deprecated ambiguous unprefixed Blue and Midnight facade aliases and deprecated ABI,
constant, entity, fetcher, typed-data, utility-type, and operation-specific scalar and native-error
aliases. Use the `Blue*`/`Midnight*`-qualified facade names, canonical replacements, or canonical raw
`/blue/*` and `/midnight/*` subpaths. The canonical raw `getDaiPermitTypedData` and `DaiPermitArgs`
exports remain available under `/blue/utils` and `/blue/types`; only their unprefixed root aliases
are removed.
