# morpho-ts Conventions

- Keep this package framework-free; export generic time, format, URL, and object helpers only.
- Preserve nullability through helpers, e.g. `transformValue(value, fn)` returns nullish input unchanged.
- Use type guards for filtering, e.g. `array.filter(isDefined)`.
- Prefer typed wrappers over raw object helpers, e.g. `entries(obj)` instead of `Object.entries(obj)`.
- Export new utilities from `src/index.ts` through the nearest folder index.
- Preserve numeric input kind in time converters, e.g. `Time.s.from.h(2n)` returns `bigint`.
- Match fixed time assumptions: `mo` is 31 days and `y` is 365 days.
- Formatters stay chainable and end with `.of(...)` or `.createOf()`.
