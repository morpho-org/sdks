# Migrating from blue-sdk v6 to v7

Version 7 removes deprecated Vault V1 PublicAllocator and compatibility APIs. It also removes the
Bundler3-specific state that was previously carried by `Holding` and `User`.

The re-exported address registry follows morpho-ts v3: replace its `morpho` key with `blue`, and use
the applicable `bundles` entry instead of the removed `bundler3` tree. See
[`morpho-ts`'s v2-to-v3 guide](../morpho-ts/MIGRATION-v2-to-v3.md) for the registry changes.

## Vault APIs

| Removed | Replacement |
| --- | --- |
| `VaultPublicAllocatorConfig`, `Vault.publicAllocatorConfig` | Migrate to Vault V2 and use `VaultV2BluePublicAllocatorConfig`. |
| `VaultMarketPublicAllocatorConfig`, `IVaultMarketPublicAllocatorConfig`, `VaultMarketConfig.publicAllocatorConfig` | Migrate to Vault V2 and use `VaultV2BlueMarketPublicAllocatorConfig`. |
| `CollateralAllocation.proportion` | Sum `vault.getAllocationProportion(marketId)` over `CollateralAllocation.markets`. |
| `AccrualVault.getDepositCapacityLimit(assets)` | `AccrualVault.maxDeposit(assets)` |
| `AccrualVault.getWithdrawCapacityLimit(shares)` | `AccrualVault.maxWithdraw(shares)` |

The deprecated Vault V2 adapter helper aliases are also removed:

- Replace `adapterId(...)` with `adapterCapId(...)`.
- Replace `collateralId(...)` with `collateralCapId(...)`.
- Replace `marketParamsId(...)` with `adapterMarketCapId(...)`.

`AccrualVaultV2MorphoVaultV1Adapter` no longer accepts `parentAllocation` as a fourth constructor
argument. Put it on the adapter input instead:

```ts
new AccrualVaultV2MorphoVaultV1Adapter(
  { ...adapter, parentAllocation },
  accrualVaultV1,
  shares,
);
```

## Holding and user state

`ERC20_ALLOWANCE_RECIPIENTS` now uses the canonical `blue` key instead of `morpho` and no longer
includes `bundler3.generalAdapter1`. Update holding inputs and reads accordingly:

```ts
const blueAllowance = holding.erc20Allowances.blue;
```

`Permit2Allowance`, `IPermit2Allowance`, `Holding.permit2BundlerAllowance`, and
`User.isBundlerAuthorized` are removed. Fixed standalone bundle flows derive their own requirements;
they do not consume these Bundler3-specific snapshots.

## Deprecation-window exception

The Holding and User fields above, and the `ERC20_ALLOWANCE_RECIPIENTS` key change, were stable v6
APIs without a prior published deprecation. Their removal is an intentional breaking change in v7.
Stay on v6 if an integration still reads Bundler3 allowance or authorization state.
