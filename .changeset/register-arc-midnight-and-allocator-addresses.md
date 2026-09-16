---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
---

Register the remaining Arc (chain 5042) deployments from morpho-org/deployments address-book.json:
the Vault V2 `BluePublicAllocator` (`vaultV2BluePublicAllocator`) and the full Midnight stack
(`midnight`, `midnightBundles`, `midnightBlueBuyCallbackFactory`, `midnightMempool`,
`ecrecoverRatifier`, `ecrecoverAuthorizer`, `setterRatifier`), each with its deployment block in the
registry. `getChainAddress(ChainId.ArcMainnet, ...)` now resolves these labels, so Blue public
allocations and the Midnight SDK work on Arc. Addresses are sourced byte-for-byte from the canonical
deployment registry; deployment blocks were derived from the Arc archive node.
