---
"@morpho-org/morpho-test": minor
---

Let tests exercise `VaultExitBundlesV1` before it is deployed on any live chain.

`@morpho-org/morpho-test` gains `deployVaultExitBundlesV1`, which deploys the contract onto an Anvil
fork and returns its address, alongside `getVaultExitBundlesV1Address` to precompute that address
without spending a transaction, and `vaultExitBundlesV1Abi` to encode calls against it. The
deployment goes through the canonical CREATE2 deterministic deployment proxy, so the address is a
pure function of the bound Morpho Blue address rather than of the deployer's nonce. That keeps it
stable across forks and test runs, lets a test resolve it before the contract exists, and makes the
deploy idempotent: deploying twice returns the existing address instead of reverting.
