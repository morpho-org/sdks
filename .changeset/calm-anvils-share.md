---
"@morpho-org/test": minor
---

Add opt-in per-RPC Anvil fork limits for shared runners, make unexpected exits fail teardown, clean up child processes when startup fails, and redact fork-provider credentials from recorded diagnostics.

This minor release intentionally makes the existing `spawnAnvil()` result fields (`rpcUrl` and `stop`) and `ViemTestContext.client` readonly. This is a source-level breaking change for consumers that assign those fields; keep mutable wrapper objects locally if reassignment is required.
