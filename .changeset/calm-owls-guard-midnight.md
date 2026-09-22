---
"@morpho-org/evm-simulation": patch
---

Guard `MidnightBundlesV1` with the simulation retention check so bundles that leave token value on the transient router fail closed with `BlacklistViolationError`.
