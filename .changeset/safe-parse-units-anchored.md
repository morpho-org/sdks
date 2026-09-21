---
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/morpho-sdk": patch
---

`safeParseUnits` now validates the whole input against an anchored decimal grammar (`/^[-+]?(\d+\.?\d*|\.\d+)$/`) before parsing, so malformed strings such as `"100.00.999"`, `"1e5"`, or `"abc1"` throw `invalid number` instead of being silently truncated to a different amount. Sign handling is normalized before calling `parseUnits`, and fractional truncation to `decimals` is unchanged.
