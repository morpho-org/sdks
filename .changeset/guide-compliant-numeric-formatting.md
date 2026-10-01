---
"@morpho-org/morpho-ts": minor
---

Add opt-in numeric formatting options for the Morpho style guide, without changing existing defaults:

- `.rounding("halfUp")` rounds to `.digits(...)` half away from zero instead of truncating (`format.number.digits(2).rounding("halfUp").of(1.005)` → `"1.01"`).
- `.readable("signed")` writes values below the displayable precision as `<0.01` / `>-0.01`, with the unit attached to the smallest unit (`<$0.01`, `<0.01%`, `<0.0001 WETH`).
- `format.short.compactThousands()` abbreviates from 1,000 with an uppercase `K` (`1.23K`).

All three are also available as `rounding`, `readableNotation` and `compactThousands` options in `createFormat`. `min`/`max` caps keep their existing output.
