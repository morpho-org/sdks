# test Conventions

- This package owns Anvil, viem, Vitest, and Playwright test utilities.
- Keep unit tests beside their `src/` modules as `*.test.ts`; keep process/fork integration tests under `test/` as `*.integration.test.ts`.
- `anvil.ts` owns each spawned Anvil lifecycle; `client.ts` owns viem client extensions.
- `createViemTest(chain, parameters)` should set deterministic defaults such as zero gas and timestamp interval.
- Extend viem clients through `createAnvilTestClient`; keep helpers like `balanceOf` and `approve` on the test client.
- BigInts are JSON-serialized in the Vitest setup by adding `BigInt.prototype.toJSON`.
- Export public entrypoints explicitly: `@morpho-org/test/vitest`, `/fixtures`, `/midnight`, `/mock`, `/chaos`, and `/playwright`.
- `chaos.ts` owns the JSON-RPC fault proxy and `classifyError`; add new SDK error class names to its `ERROR_CATEGORY_RULES` table.
- Deterministic fixtures and account helpers stay in `fixtures.ts`.
- The Vault V2 Midnight adapter fixture is exposed only through `@morpho-org/test/midnight` (`midnight.ts` → `vaultV2MidnightFixture.ts`), which needs the optional `@morpho-org/morpho-ts` peer at 4.3 or later; keep the root barrel and `fixtures.ts` free of morpho-ts imports so they load with any morpho-ts version the package-level peer range accepts.
- Deterministic accounts come from the standard test mnemonic via `testAccount(index)`.
- Use `checksumAddress` for generated addresses, e.g. `randomAddress(chainId)`.
- Trace assertions use `getFunctionCalls` over Anvil `ots_traceTransaction`.

## Continuous Improvement

- Keep runner and fork I/O explicit; test helpers should be deterministic unless a test intentionally controls time or randomness.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer small shared fixtures and typed helpers over broad test abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
