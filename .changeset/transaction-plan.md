---
"@morpho-org/morpho-sdk": major
---

Replace entity action outputs' `{ buildTx, getRequirements }` shape with `TransactionPlan`, exposing semantic transaction/signature steps, ordered executable txs, and intent-based helpers for app labels and flow branching. Derive each prepared plan's accepted signature array from its requirement type so unrelated signature kinds are rejected at compile time.
