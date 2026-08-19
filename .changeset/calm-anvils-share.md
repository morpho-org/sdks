---
"@morpho-org/test": minor
"@morpho-org/morpho-test": patch
---

Make unexpected Anvil exits fail without poisoning Vitest retries, clean up child processes when startup fails, and redact fork-provider credentials from recorded diagnostics.

This minor release intentionally makes the existing `spawnAnvil()` result fields (`rpcUrl` and `stop`) and `ViemTestContext.client` readonly. This is a source-level breaking change for consumers that assign those fields; keep mutable wrapper objects locally if reassignment is required.

`@morpho-org/morpho-test` now requires `@morpho-org/test` `^2.9.0`.
