# blue-sdk Conventions

- Keep this package framework-agnostic; do not import `viem`, `wagmi`, React, or test helpers in `src`.
- Model protocol state as `I*` interfaces plus classes, e.g. `interface IMarket` and `class Market`.
- Constructors accept plain inputs and normalize nested classes, e.g. `new MarketParams(params)`.
- Use getters for derived state, e.g. `get utilization()`, and methods for parameterized math.
- Keep all protocol amounts as `bigint`; accept `BigIntish` only at API edges.
- Address registries are immutable and additive; custom addresses must not override existing values.
