---
"@morpho-org/test": minor
---

Bound concurrent Anvil forks to a shared CI RPC budget, clean up child processes when startup fails, and redact fork-provider credentials from recorded diagnostics.

This minor release intentionally makes the existing `spawnAnvil()` result fields (`rpcUrl` and `stop`) and `ViemTestContext.client` readonly. This is a source-level breaking change for consumers that assign those fields; keep mutable wrapper objects locally if reassignment is required.
