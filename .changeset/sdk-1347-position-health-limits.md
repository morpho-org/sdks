---
"@morpho-org/evm-simulation": minor
---

Add optional `limits.positions` health checks. Each entry names a Blue `marketId` and an optional `account` (defaults to the sender) and `maxLtv` (WAD). After the bundle, with interest accrued, the position must be healthy at the market LLTV and, when `maxLtv` is set, have an LTV no higher than it. A failed check throws `ConsumerLimitViolationError`. Results report `verification.positions` with each position's `lltv` and `ltv`. Without `limits.positions`, nothing extra is read.
