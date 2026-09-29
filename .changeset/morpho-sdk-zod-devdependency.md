---
"@morpho-org/morpho-sdk": patch
---

Move `zod` from runtime `dependencies` to `devDependencies`; it is only used by the test environment loader, so consumers no longer install it.
