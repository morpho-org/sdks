---
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-test": minor
"@morpho-org/morpho-sdk": patch
---

Let tests exercise `VaultExitBundlesV1` before it is deployed on any live chain.

`@morpho-org/morpho-test` gains `deployVaultExitBundlesV1`, which deploys the contract onto an Anvil
fork and returns its address, alongside `getVaultExitBundlesV1Address` to precompute that address
without spending a transaction, and `vaultExitBundlesV1Abi` to encode calls against it. The
deployment goes through the canonical CREATE2 deterministic deployment proxy, so the address is a
pure function of the bound Morpho Blue address rather than of the deployer's nonce — which keeps it
stable across forks and makes registering it with `registerCustomAddresses` idempotent. Deploying
twice returns the existing address instead of reverting.

`@morpho-org/morpho-ts` adds the optional `vaultExitBundles` key to `ChainAddresses` so that address
can be registered and then resolved through `getChainAddress(chainId, "vaultExitBundles")`. No chain
declares it yet: the contract is not deployed anywhere, and this only opens the slot.

`@morpho-org/morpho-test` raises its `@morpho-org/morpho-ts` peer floor to `^2.9.0` accordingly.
Registering the deployed address is the point of the new helper, and on morpho-ts 2.7 or 2.8 that
call does not type-check because `ChainAddresses` and `AddressLabel` have no `vaultExitBundles` key.
The package is only ever a dev dependency, so this narrowing cascades nowhere.
