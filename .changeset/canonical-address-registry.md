---
"@morpho-org/morpho-ts": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/blue-sdk": minor
---

Add EIP-55 helpers `getChecksumAddress`, `isChecksumAddress`, `isAddress` and `InvalidAddressError`, backed by `@noble/hashes` (now a runtime dependency of `@morpho-org/morpho-ts`). `registerCustomAddresses` now stores every custom address and unwrapped-token entry in EIP-55 form and throws `InvalidAddressError` for malformed or mis-checksummed inputs, so registry lookups compare canonical strings regardless of caller casing.

**Behavior change:** `registerCustomAddresses` now throws `InvalidAddressError` for malformed or mis-checksummed mixed-case addresses, and lowercase registrations are returned in EIP-55 casing from registry lookups. Pass valid EIP-55 checksummed or single-case (all-lowercase/all-uppercase) addresses. `InvalidAddressError` is re-exported from `@morpho-org/blue-sdk` and `@morpho-org/morpho-sdk`, and `@morpho-org/blue-sdk` now requires `@morpho-org/morpho-ts@^3.1.0` as a peer dependency.
