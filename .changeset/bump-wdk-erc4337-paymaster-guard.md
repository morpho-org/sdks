---
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Bump the pinned Tether WDK ERC-4337 stack to the release that validates the token-paymaster
address (`@tetherto/wdk-wallet-evm-erc-4337` `1.0.0-beta.14` → `1.0.0-beta.17`, and its siblings
`@tetherto/wdk-wallet` `1.0.0-beta.15` → `1.0.0-beta.17` and `@tetherto/wdk-wallet-evm`
`1.0.0-beta.16` → `1.0.0-beta.18` to keep the tree on a single WDK version). beta.17 rejects any
token-mode paymaster whose on-chain address returned by the paymaster RPC does not match the
configured `paymasterAddress`, so the auto-generated ERC-20 approval can no longer target an
unexpected spender when the paymaster endpoint is misrouted or compromised. This package is a
pass-through and carries none of that logic itself; the fix lives entirely in the pinned
dependency.
