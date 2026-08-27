---
"@morpho-org/test": patch
---

Stop retrying failed JSON-RPC requests from Vitest clients to local Anvil processes so transport errors surface without duplicating RPC work.
