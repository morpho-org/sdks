---
"@morpho-org/morpho-sdk": minor
---

Stop hard-enforcing `userAddress` matches the connected client account on
transaction builders. `MorphoMarketV1` (`supplyCollateral`, `borrow`,
`repay`, `withdrawCollateral`, `repayWithdrawCollateral`,
`supplyCollateralBorrow`) and `MorphoVaultV1.migrateToV2` no longer call
`validateUserAddress` — callers may now build a tx for any `userAddress`
regardless of the client's connected account (or with a public client that
has no account at all).

The signature builders (`encodeErc20Permit`, `encodeErc20Permit2`) keep the
upfront `MissingClientPropertyError` / `AddressMismatchError` checks at
`sign()` time: signing on behalf of a different address is a real security
concern, and rejecting the call eagerly is more legible than waiting for
`verifyTypedData` to fail.

`validateUserAddress` is now exported with `@deprecated` JSDoc and will be
removed in the next major release. The public `sign(client, userAddress)`
signature on `Requirement` and `ERC20PermitAction` remains typed against
viem's `Client` to preserve TypeScript compatibility for existing
integrators; missing wallet capabilities (account, signing) are surfaced at
`sign()` time as before.
