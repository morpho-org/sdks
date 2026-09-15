---
"@morpho-org/morpho-sdk": patch
---

Add JSDoc to the core public transaction primitives `BaseAction`, `TransactionAction`, `Transaction`, `PermitArgs`, and `Permit2Args`, and correct the `validateUserAddress` helper's JSDoc to name its actual callers (`signAndVerifyTypedData` and `encodeVaultSharesPermit`). Documentation-only; no runtime or type changes.
