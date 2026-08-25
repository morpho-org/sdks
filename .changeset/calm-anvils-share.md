---
"@morpho-org/test": minor
---

Make unexpected Anvil exits and failed shutdowns surface without poisoning Vitest retries, clean up child processes when startup fails, cover the configured fork retry budget with an overridable startup deadline, and let state dumps finish gracefully by default with a configurable force-kill delay.

This minor release intentionally makes the existing `spawnAnvil()` result fields (`rpcUrl` and `stop`) and `ViemTestContext.client` readonly. This is a source-level breaking change for consumers that assign those fields; keep mutable wrapper objects locally if reassignment is required.
