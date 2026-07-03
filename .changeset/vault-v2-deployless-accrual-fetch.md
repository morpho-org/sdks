---
"@morpho-org/blue-sdk-viem": minor
---

Add `fetchAccrualVaultV2Deployless`, a deployless-only reader that fetches the full VaultV2 accrual tree in a single `eth_call`.

`fetchAccrualVaultV2` chains sequential reads dictated by the VaultV2 architecture — the vault, then each adapter (resolving its type), then each adapter's Morpho Blue markets or wrapped MetaMorpho V1 vault. The new `fetchAccrualVaultV2Deployless` traverses the entire tree on-chain through a new deployless `GetAccrualVaultV2` query and returns the hydrated `AccrualVaultV2` from one round-trip. It has no multicall fallback (equivalent to `deployless: "force"`) and requires every configured adapter factory to be deployed at the queried block.

The returned entity is behaviourally identical to `fetchAccrualVaultV2` — same `maxDeposit`, `maxWithdraw`, `accrueInterest`, and per-adapter `realAssets`. For query-size reasons, the nested MetaMorpho V1 vault of a `MorphoVaultV1Adapter` omits two capacity-irrelevant optional fields: its EIP-5267 domain (`eip5267Domain`) and PublicAllocator config (`publicAllocatorConfig`, both vault-level and per-market).

`fetchAccrualVaultV2` now uses this single deployless call by default and only falls back to its previous sequential multicall reads when the call fails (or when `deployless` is `false`). Its signature and results are unchanged; it just issues far fewer RPC round-trips.
