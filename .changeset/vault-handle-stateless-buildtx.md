---
"@morpho-org/morpho-sdk": patch
---

VaultV1/VaultV2 `deposit`, `withdraw`, `redeem` and `migrateToV2` handles no longer share state between `getRequirements()` and `buildTx()`: `buildTx()` validates the supplied signature against the handle's immutable spender/amount/deadline and the data carried on the signature, so a requirement prepared on one handle can be finalized on another (or after serialize/resume). The permit2 nonce is no longer cross-checked against the last `getRequirements()` call; Permit2 verifies it onchain.
