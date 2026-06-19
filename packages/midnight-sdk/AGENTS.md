# midnight-sdk Conventions

- Keep this package framework-free. Source may import `viem` for ABI encoding, typed data, and explicit fetch boundary helpers, but it must not import React, wagmi, Redux, or app code.
- Pure protocol helpers live in `market/`, `offers/`, `math/`, and `signatures/`. Chain reads live only in `fetch/`; public API HTTP calls live only in `api/`.
- Model data as readonly interfaces/types by default. Use classes only for typed errors or domain objects with meaningful behavior; do not create classes that only copy fields, normalize `BigIntish`, or expose a trivial `toStruct()`.
- Reuse one exported interface when a domain value and its ABI tuple shape are identical; add a separate `*Struct` type only when the ABI shape differs.
- Never deep-freeze class instances. Only use `deepFreeze` for function outputs that are intended as immutable onchain or signature descriptors immediately after construction.
- Keep onchain quantities as `bigint`; API edges may accept `BigIntish` for caller ergonomics.
- Never concatenate hex strings with template strings, manual `slice(2)` joins, or string `+`; use viem's `concat` for byte concatenation.
- Public encoders return neutral `{ to, data }` descriptors and never sign, submit, or mutate state.
- Every exported symbol needs JSDoc and an explicit export from the appropriate public barrel: `src/index.ts` for the root package API or `src/api/index.ts` for the public `./api` subpath.
- Shared primitives and Midnight deployment address helpers live in `@morpho-org/morpho-ts`. Do not re-export them from this package; import them directly from `morpho-ts` in source and tests. If a reusable non-protocol symbol is missing from `morpho-ts`, add it there before Midnight consumes it.
