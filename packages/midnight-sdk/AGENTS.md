# midnight-sdk Conventions

- Keep this package framework-free. Source may import `viem` for ABI encoding, typed data, and explicit fetch boundary helpers, but it must not import React, wagmi, Redux, or app code.
- Pure protocol helpers live in `market/`, `offers/`, `math/`, `bundles/`, `calls/`, and `signatures/`. Chain reads live only in `fetch/`; requirement planners stay pure once current state is supplied.
- Model Solidity structs with readonly interfaces plus classes that normalize nested values and expose `toStruct()` for ABI-compatible objects.
- Keep onchain quantities as `bigint`; API edges may accept `BigIntish` for caller ergonomics.
- Public encoders return neutral `{ to, data }` descriptors and never sign, submit, or mutate state.
- Every exported symbol needs JSDoc and an explicit export from `src/index.ts`.
- Midnight deployment addresses are additive. Do not invent or overwrite deployed addresses; add registry entries only when the deployed source is pinned.
