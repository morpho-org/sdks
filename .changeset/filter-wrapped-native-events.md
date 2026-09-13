---
"@morpho-org/evm-simulation": patch
---

Use chain registry metadata when parsing WETH9 `Deposit` and `Withdrawal` logs: accept only the registered wrapped-native token, reject them on known tokenless chains, and retain legacy signature-based parsing on unknown custom chains.
