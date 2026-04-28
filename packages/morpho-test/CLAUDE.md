# morpho-test Conventions

- Keep fixtures framework-agnostic; test runners should consume them, not live here.
- Export fixture groups from `src/fixtures/index.ts` through `src/index.ts`.
- Use concrete chain keys, e.g. `markets[ChainId.EthMainnet]`.
- Keep fixture data typed with `blue-sdk` models and IDs.
