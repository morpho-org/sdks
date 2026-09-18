---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk": minor
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
---

Register the Robinhood Chain (chain 4663) Midnight deployments from morpho-org/deployments
address-book.json: `midnight`, `midnightBundles`, `midnightBlueBuyCallbackFactory`, `midnightMempool`,
`ecrecoverRatifier`, `ecrecoverAuthorizer`, `setterRatifier`, each with its deployment block in the
registry. `getChainAddress(ChainId.RobinhoodMainnet, ...)` now resolves these labels, so the Midnight
SDK works on Robinhood Chain. Addresses are sourced byte-for-byte from the canonical deployment
registry; deployment blocks were derived from the deployer contract creation receipts on Robinhood
Chain.
