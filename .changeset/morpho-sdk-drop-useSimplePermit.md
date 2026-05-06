---
"@morpho-org/morpho-sdk": major
---

`vaultV1.migrateToV2().getRequirements()` no longer accepts `useSimplePermit`. V1 vault shares always implement EIP-2612, so the Permit2 fallback was unreachable on this path; the entity always uses simple permit now.
