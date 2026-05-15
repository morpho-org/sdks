---
"@morpho-org/morpho-sdk": major
---

Stop hard-enforcing `userAddress` matches the connected client account on
transaction builders. `MorphoMarketV1` (`supplyCollateral`, `borrow`,
`repay`, `withdrawCollateral`, `repayWithdrawCollateral`,
`supplyCollateralBorrow`) and `MorphoVaultV1.migrateToV2` no longer call
`validateUserAddress` at the builder layer — callers may now build a tx
for any `userAddress` regardless of the client's connected account (or
with a public client that has no account at all).

The builder = signer invariant is now enforced exclusively at `sign()`
time on the signature requirements. `Requirement.sign` and
`ERC20PermitAction.sign` are typed against viem's `WalletClient` instead
of the more permissive `Client` — **this is a TypeScript-breaking
surface change** and is the reason this release is marked `major`.
Downstream code that previously passed a value typed as `Client` to
`sign()` will no longer compile and must switch to a `WalletClient`
(e.g. `createWalletClient(...)` or `publicClient.extend(walletActions)`).
Runtime behavior is unchanged for callers already passing a wallet
client with the matching account.

`encodeErc20Permit` / `encodeErc20Permit2` call `validateUserAddress`
internally to reject any `sign(client, userAddress)` where the client
account is missing or differs from `userAddress` with
`MissingClientPropertyError` / `AddressMismatchError`. Signing on behalf
of a different address is the only path where the divergence is a real
security concern, so the check stays exactly there.

`validateUserAddress` remains exported from `@morpho-org/morpho-sdk` and
is no longer dead code — it is the canonical check used by the signature
requirements above.
