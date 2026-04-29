# test Conventions

- This package owns Anvil, viem, Vitest, and Playwright test utilities.
- `createViemTest(chain, parameters)` should set deterministic defaults such as zero gas and timestamp interval.
- Extend viem clients through `createAnvilTestClient`; keep helpers like `balanceOf` and `approve` on the test client.
- BigInts are JSON-serialized in the Vitest setup by adding `BigInt.prototype.toJSON`.
- Export public entrypoints explicitly: `@morpho-org/test/vitest`, `/fixtures`, and `/playwright`.
- Deterministic accounts come from the standard test mnemonic via `testAccount(index)`.
- Use `checksumAddress` for generated addresses, e.g. `randomAddress(chainId)`.
- Trace assertions use `getFunctionCalls` over Anvil `ots_traceTransaction`.

## Continuous Improvement

- Keep runner and fork I/O explicit; test helpers should be deterministic unless a test intentionally controls time or randomness.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer small shared fixtures and typed helpers over broad test abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
