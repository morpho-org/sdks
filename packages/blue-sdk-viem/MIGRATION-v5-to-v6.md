# Migrating from blue-sdk-viem v5 to v6

Version 6 removes deprecated fetch, signature, ABI, and Vault V1 PublicAllocator compatibility
exports. It also follows the blue-sdk v7 removal of Bundler3-specific Holding and User state.

## Fetch parameters

`FetchParameters.chainId` is removed. Configure the viem client's chain and omit the override:

```ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vault = await fetchVault(vaultAddress, client);
```

Replace `fetchAccrualVaultV2Deployless(address, client, parameters)` with:

```ts
fetchAccrualVaultV2(address, client, { ...parameters, deployless: "force" });
```

## Vault V1 PublicAllocator

The following v5 surfaces are removed:

- `fetchVaultMarketPublicAllocatorConfig` and `VaultMarketPublicAllocatorConfig.fetch`;
- Vault V1 `publicAllocatorConfig` hydration in `fetchVault`, `fetchVaultMarketConfig`, and nested
  Vault V1 data returned by `fetchAccrualVaultV2`;
- `vaultV1PublicAllocatorAbi` and `publicAllocatorAbi` re-exports.

Migrate to Vault V2 and use `fetchVaultV2BluePublicAllocatorConfig`,
`fetchVaultV2BlueMarketPublicAllocatorConfig`, and `vaultV2BluePublicAllocatorAbi`. These are Vault
V2 APIs, not drop-in replacements for a Vault V1 flow.

The deprecated `vaultV1AdapterAbi` and `vaultV1AdapterFactoryAbi` aliases are removed; import
`morphoVaultV1AdapterAbi` and `morphoVaultV1AdapterFactoryAbi` instead.

## Permits, holdings, and users

`DaiPermitArgs` and `getDaiPermitTypedData` are removed. Maintained action flows route DAI through
Permit2 or a classic approval.

`fetchHolding` now returns only `blue` and `permit2` ERC-20 allowances; it no longer reads a
GeneralAdapter1 allowance or `permit2BundlerAllowance`. `fetchUser` no longer reads or returns
`isBundlerAuthorized`.

## Deprecation-window exception

The removed Holding and User result fields were stable v5 APIs without a prior published
deprecation. Their removal is an intentional breaking change in v6. Stay on v5 if an integration
still requires Bundler3 allowance or authorization snapshots.
