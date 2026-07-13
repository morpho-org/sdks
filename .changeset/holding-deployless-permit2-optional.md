---
"@morpho-org/blue-sdk-viem": patch
---

fix(blue-sdk-viem): stop the deployless holding query from reverting on chains without Permit2

The deployless `GetHolding` query called `permit2.allowance(...)` unconditionally. On
chains that have no Permit2 deployment, `fetchHolding` passes `address(0)`, so the
external call reverted (an addressless contract), forcing every deployless holding read
to fall back to multicall — and throwing outright under `deployless: "force"`. The query
now skips the Permit2 call when the address is zero and leaves `permit2BundlerAllowance`
at its zero default, matching the multicall fallback.
