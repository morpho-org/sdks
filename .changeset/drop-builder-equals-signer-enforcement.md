---
"@morpho-org/morpho-sdk": minor
---

Stop hard-enforcing `userAddress` matches the connected client account on
transaction builders. `MorphoMarketV1` (`supplyCollateral`, `borrow`,
`repay`, `withdrawCollateral`, `repayWithdrawCollateral`,
`supplyCollateralBorrow`) and `MorphoVaultV1.migrateToV2` no longer call the
now-deleted `validateUserAddress` helper — callers may now build a tx for any
`userAddress` regardless of the client's connected account.

The signature builders (`encodeErc20Permit`, `encodeErc20Permit2`) keep the
upfront `MissingClientPropertyError` / `AddressMismatchError` checks: signing
on behalf of a different address is a real security concern, and rejecting
the call eagerly is more legible than waiting for `verifyTypedData` to fail.

The `sign(client, userAddress)` method on `Requirement` and
`ERC20PermitAction` is now typed against viem's `WalletClient` instead of
the more permissive `Client`, surfacing missing wallet capabilities at the
type level rather than at signing time.
