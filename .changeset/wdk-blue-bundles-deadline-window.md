---
"@morpho-org/wdk-protocol-lending-morpho-evm": minor
---

Reject caller-supplied `requirementSignature` deadlines beyond the adapter's bounded execution
window. When `signature.args.deadline` exceeds `now + BLUE_BUNDLES_V1_DEADLINE_WINDOW_SECONDS`
(2h) plus a 300-second clock-skew allowance (`now + 2h + 300s`), borrow, repay, collateral-supply,
and collateral-withdraw flows (and their `quote*` / `get*Requirements` counterparts) now throw the
exported `BlueBundlesV1DeadlineExceedsWindowError` instead of building a bundle with an effectively
unbounded onchain execution window.
