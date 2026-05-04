# blue-sdk Conventions

- Keep this package framework-agnostic; do not import `viem`, `wagmi`, React, or test helpers in `src`.
- Model protocol state as `I*` interfaces plus classes, e.g. `interface IMarket` and `class Market`.
- Constructors accept plain inputs and normalize nested classes, e.g. `new MarketParams(params)`.
- Use getters for derived state, e.g. `get utilization()`, and methods for parameterized math.
- Keep all protocol amounts as `bigint`; accept `BigIntish` only at API edges.
- Address registries are immutable and additive; custom addresses must not override existing values.
- Use `MathLib` rounding helpers; spell rounding as `"Up"` or `"Down"`.
- Use `_try(accessor, UnknownError)` for optional domain lookups, not broad `catch`.
- Protocol entity folders (`market/`, `vault/`, `token/`, `position/`, `holding/`, `user/`) own their classes and folder barrels.
- Getters may throw typed `Unknown*Error`; nullable lookup paths should use `_try` or `tryGet*`-style helpers deliberately.

## Continuous Improvement

- Keep this package small, deterministic, dependency-light, and framework-free.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer deleting unclear helpers, dependencies, exports, or duplicated logic before adding abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
