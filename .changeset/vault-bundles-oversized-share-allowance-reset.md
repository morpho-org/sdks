---
"@morpho-org/morpho-sdk": patch
---

Reset an oversized vault-share allowance for VaultBundlesV1 with an onchain `erc20Approval` even
when `supportSignature` is enabled. `MorphoVaultV1`/`MorphoVaultV2` `withdraw()`, `redeem()`, and
`migrateToV2()` previously returned an ERC-2612 permit lowering the allowance to the computed cap;
VaultBundlesV1 skips a permit whose nonce was already consumed, so a stale permit submission left
the oversized allowance as the effective share-burn cap. A permit is now only requested when the
current allowance is below the cap, matching the in-kind redemption handles.
