---
"@morpho-org/test": minor
---

Make unexpected Anvil exits and failed shutdowns surface without poisoning Vitest retries, clean up child processes when startup fails, cover the configured fork retry budget with an overridable startup deadline, let state dumps finish gracefully by default with a configurable force-kill delay, and redact exact fork URLs and header values from Anvil diagnostics in CI unless explicitly disabled.

Require Vitest 2.1.2 or newer so per-attempt cleanup failures participate in Vitest retries.

This minor release intentionally makes the existing `spawnAnvil()` result fields (`rpcUrl` and `stop`) and `ViemTestContext.client` readonly. This is a source-level breaking change for consumers that assign those fields; keep mutable wrapper objects locally if reassignment is required.
