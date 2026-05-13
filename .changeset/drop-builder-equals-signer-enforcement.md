---
"@morpho-org/morpho-sdk": minor
---

Stop hard-enforcing `userAddress` matches the connected client account on
transaction builders. `MorphoMarketV1` (`supplyCollateral`, `borrow`, `repay`,
`withdrawCollateral`, `repayWithdrawCollateral`, `supplyCollateralBorrow`) and
`MorphoVaultV1.migrateToV2` no longer call the now-deleted
`validateUserAddress` helper. The signature builders (`encodeErc20Permit`,
`encodeErc20Permit2`) also drop the `AddressMismatchError` upfront check —
when the connected account differs from `userAddress`, `verifyTypedData`
still rejects the signature with `InvalidSignatureError`.

Callers MUST keep `userAddress` aligned with the signing account; see
`BUNDLER3.md` ("Builder must equal signer") for the reasoning. The
`AddressMismatchError` class remains exported for callers that want to keep
their own checks.

The `sign(client, userAddress)` method on `Requirement` and
`ERC20PermitAction` is now typed against viem's `WalletClient` instead of
the more permissive `Client`, surfacing missing wallet capabilities at the
type level rather than at signing time.
