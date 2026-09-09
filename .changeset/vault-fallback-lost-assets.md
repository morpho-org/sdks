---
"@morpho-org/blue-sdk-viem": patch
---

`fetchVault` multicall fallback no longer silently drops `lostAssets` when the read fails on a MetaMorpho V1.1 vault: the read error is rethrown once the vault is confirmed V1.1. V1.0 vaults keep `lostAssets: undefined`.
