---
"@morpho-org/test": minor
---

Add `./mock` sub-export providing `createMockClient`, `mockRead`, and `expectReadCall` for transport-level viem mocking in unit tests. The mock installs a `vi.fn`-backed `custom()` transport on a real viem `Client`, so SDK code that uses `viem/actions` named imports (e.g. `readContract(client, …)`) resolves through it just as it would against a live RPC. `mockRead` matches every overload of a function name, so reads against contracts with overloaded `view`/`pure` methods don't silently miss.
