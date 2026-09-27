---
"@morpho-org/morpho-ts": minor
---

Add EIP-55 helpers `getChecksumAddress`, `isChecksumAddress`, `isAddress` and `InvalidAddressError`, backed by `@noble/hashes` (now a runtime dependency of `@morpho-org/morpho-ts`). `registerCustomAddresses` now stores every custom address and unwrapped-token entry in EIP-55 form and throws `InvalidAddressError` for malformed or mis-checksummed inputs, so registry lookups compare canonical strings regardless of caller casing.
