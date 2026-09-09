---
"@morpho-org/morpho-ts": patch
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/blue-sdk": patch
"@morpho-org/morpho-sdk": patch
---

Compare token addresses case-insensitively: `getUnwrappedToken` resolves lowercased wrapped-token addresses against the checksummed registry (and re-registering the same mapping under a different casing no longer creates a duplicate key), while `fetchHolding`/`fetchToken` now detect permissioned Backed/wrapper tokens, wstETH, and the native token regardless of the caller's address casing.
