---
"@morpho-org/evm-simulation": patch
---

`parseTransfers` now lowercases log `topics` and `data` before signature dispatch and WETH9 pair matching, so mixed-case hex from a backend can no longer drop a transfer from the parsed output or the retention check.
