---
"@morpho-org/morpho-ts": minor
---

Add dependency-free EIP-55 helpers `getChecksumAddress`, `isChecksumAddress`, `isAddress` and `InvalidAddressError`. `registerCustomAddresses` now stores every custom address and unwrapped-token entry in EIP-55 form and throws `InvalidAddressError` for malformed or mis-checksummed inputs, so registry lookups compare canonical strings regardless of caller casing.
