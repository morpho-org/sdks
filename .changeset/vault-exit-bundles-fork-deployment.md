---
"@morpho-org/morpho-test": minor
---

Let tests exercise `VaultExitBundlesV1` before it is deployed on any live chain.

`@morpho-org/morpho-test` gains `deployVaultExitBundlesV1`, which deploys the contract onto an Anvil
fork from the test account and returns the deployed address, plus `vaultExitBundlesV1Abi` to encode
calls against it. `blue` defaults to the address registered for the client's chain and can be
overridden to bind a different Morpho Blue core.
