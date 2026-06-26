---
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/morpho-sdk": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Fix the deployless `GetVault` query reverting on all MetaMorpho vaults.

`fetchVault` (and `fetchAccrualVault`) silently fell back to multicall because the deployless query reverted while decoding the EIP-5267 domain: reading the high-level `eip712Domain()` struct return hits a Solidity via-IR decoding regression that reverts on valid domains. The query now decodes the raw `eip712Domain()` returndata as a tuple, the same workaround already used by `GetToken`. `deployless: "force"` no longer throws and the deployless fast path is restored (one RPC round-trip instead of a full multicall).

The deployless query now also reads `lostAssets` (MetaMorpho V1.1), so the deployless and multicall paths return identical `Vault` state.
