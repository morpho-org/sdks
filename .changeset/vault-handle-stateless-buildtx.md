---
"@morpho-org/morpho-sdk": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

VaultV1/VaultV2 `deposit`, `withdraw`, `redeem` and `migrateToV2` handles no longer share state between `getRequirements()` and `buildTx()`: `buildTx()` validates the supplied signature against the handle's immutable spender/amount/deadline and the data carried on the signature, so a requirement prepared on one handle can be finalized on another (or after serialize/resume). The permit2 nonce is no longer cross-checked against the last `getRequirements()` call; Permit2 verifies it onchain. `withdraw()` now requires a `vaultData` snapshot (like `deposit()`), from which the share cap is derived at handle creation and enforced in `buildTx()`. A signature whose nonce was consumed no longer fails to encode — the spender skips the permit onchain and proceeds under the live allowance, so callers must execute every requirement returned by the latest `getRequirements()` (including allowance resets) before submitting. The WDK adapter now forwards its fetched vault snapshot as `vaultData` to Vault V1/V2 withdrawals so the share cap is fixed at handle creation.
