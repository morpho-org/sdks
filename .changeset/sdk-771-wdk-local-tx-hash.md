---
"@morpho-org/wdk-protocol-lending-morpho-evm": minor
---

EOA sends now return `keccak256` of the signed transaction instead of the hash reported by `eth_sendRawTransaction`, and throw the new exported `RawTransactionHashMismatchError` when the RPC reports a different hash. ERC-4337 sends are unchanged.
