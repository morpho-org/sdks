# simulation-sdk Conventions

- Keep this package framework-agnostic; simulation logic should not depend on `viem` clients or React.
- Define operation names as `as const` arrays, e.g. `BLUE_OPERATIONS`, then derive union types.
- Use mutually exclusive args with `never`, e.g. `{ assets: bigint; shares?: never }`.
- Store state in `SimulationState`; getters throw `Unknown*Error`, while `tryGet*` returns nullish.
- Mutating simulation handlers should operate on drafts; exported APIs return immutable results.
- Keep operation strings protocol-scoped, e.g. `Blue_Borrow` and `MetaMorpho_Deposit`.
- Wrap handler failures in `SimulationErrors.Simulation(error, index, operation)`.
- Use `produceImmutable` for public simulation, and `handleOperation` for in-place draft updates.
- Encode slippage as WAD-scaled `bigint`, e.g. `MathLib.WAD + slippage`.

## Continuous Improvement

- Keep this package deterministic, framework-free, and focused on protocol simulation state transitions.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer deleting unclear helpers, dependencies, exports, or duplicated logic before adding abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
