---
"@morpho-org/morpho-sdk": patch
---

Document on `BundlerCall.skipRevert` that `true` is only safe for fund-neutral calls (idempotent approvals / permits) and is dangerous on any call meant to consume funds already routed into Bundler3: an on-chain revert a simulation did not reproduce (e.g. a fee-sensitive external route, Cantina finding 1631) leaves those funds in the permissionless bundler. Guidance only; no behavior change.
