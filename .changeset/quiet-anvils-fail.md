---
"@morpho-org/test": minor
---

Stop retrying failed JSON-RPC requests from Vitest clients to local Anvil processes so transport errors surface without duplicating RPC work.

Support Anvil's Optimism Karst hardfork so Base fork tests can execute Osaka EVM bytecode with Foundry v1.8.0.
