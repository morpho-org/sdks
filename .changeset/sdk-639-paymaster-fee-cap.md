---
"@morpho-org/wdk-protocol-lending-morpho-evm": minor
---

Require `transactionMaxFee` on ERC-4337 token-paymaster sends. When the wallet config merged with
the per-call config selects token-paymaster mode (`paymasterToken` set, `isSponsored` and
`useNativeCoins` not `true`) and has no `transactionMaxFee`, every send method now throws the new
exported `MissingPaymasterFeeCapError` before WDK signs the UserOperation. WDK approves the paymaster
for twice the token cost quoted by the paymaster endpoint and only bounds that quote when
`transactionMaxFee` is set, so an uncapped config let a compromised endpoint obtain an arbitrary
fee-token approval. Set `transactionMaxFee` in paymaster-token units on the wallet or per-call config.
Sponsored, native-gas, and EOA sends are unchanged.
