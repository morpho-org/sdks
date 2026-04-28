# simulation-sdk Conventions

- Keep this package framework-agnostic; simulation logic should not depend on `viem` clients or React.
- Define operation names as `as const` arrays, e.g. `BLUE_OPERATIONS`, then derive union types.
- Use mutually exclusive args with `never`, e.g. `{ assets: bigint; shares?: never }`.
- Store state in `SimulationState`; getters throw `Unknown*Error`, while `tryGet*` returns nullish.
- Mutating simulation handlers should operate on drafts; exported APIs return immutable results.
- Keep operation strings protocol-scoped, e.g. `Blue_Borrow` and `MetaMorpho_Deposit`.
