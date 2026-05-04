---
"@morpho-org/morpho-sdk": major
---

`MorphoVaultV1.migrateToV2().getRequirements()` no longer accepts a `useSimplePermit` parameter. The migration permit is always issued against the V1 vault shares, which implement EIP-2612, so the Permit2 fallback path was unreachable in practice. Callers passing `{ useSimplePermit: true | false }` should drop the argument.
