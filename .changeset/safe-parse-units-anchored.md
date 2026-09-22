---
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

`safeParseUnits` now validates the whole input against an anchored decimal grammar (`/^[-+]?(\d+\.?\d*|\.\d+)$/`) before parsing, so malformed strings such as `"100.00.999"`, `"1e5"`, or `"abc1"` throw `InvalidNumberError` (exported from `@morpho-org/blue-sdk-viem` and the `morpho-sdk` errors facades) instead of being silently truncated to a different amount. Sign handling is normalized before calling `parseUnits`, and fractional truncation to `decimals` is unchanged.
