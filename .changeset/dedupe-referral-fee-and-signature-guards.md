---
"@morpho-org/morpho-sdk": patch
---

Route the referral-fee, deadline, and ECDSA-signature guards shared by the direct BlueBundlesV1 writes and the VaultExitBundlesV1 force withdrawal through single helpers instead of per-call-site copies.

`MissingReferralFeeRecipientError` is now one class carrying the offending `referralFeePct` (both peripheries transfer the fee unconditionally, so the failure mode is identical). `validateReferralFee` owns the `[0, WAD)` bound plus the recipient check, `validateDeadline` owns the positive-`uint256` deadline bound, and `normalizeEcdsaSignature` owns the 64-byte EIP-2098 / 65-byte parse and the `yParity` → `v` widening for every periphery permit and authorization struct. The three remaining hand-rolled `uint256` bounds (`blueSupply`'s `assets`, and `getBlueBundlesV1TokenRequirements`' `amount` and `permit2Nonce`) now call the existing `validateUint256Field` like their siblings.

Beyond the error's constructor arity this is internal maintenance — the thrown error classes, encoded calldata, and requirement shapes are unchanged — with one deliberate behavior addition: `vaultV1InKindRedeem` and `vaultV2InKindRedeem` had no upper bound on `deadline` at all, so routing them through the shared guard means an out-of-`uint256` deadline now throws `InputExceedsMaxError` instead of viem's `IntegerOutOfRangeError` at encode time, matching their `vaultV2ForceWithdraw` sibling on the same periphery.

`MorphoVaultV1.inKindRedeem`, `MorphoVaultV2.inKindRedeem`, and `MorphoVaultV2.forceWithdraw` apply the same bound at handle creation, and `MorphoVaultV2.forceWithdraw` extends it to `exitAssets` and to the effective `minSharePriceE27` (supplied or derived). Previously each entity checked only that the deadline was in the future, so an out-of-`uint256` override was accepted and could walk a caller through a vault-share approval or an EIP-712 permit before `buildTx()` finally refused to encode it.

That also reclassifies one error on those three methods: a non-positive `deadline` now throws `NonPositiveInputError` where it previously threw `ExpiredDeadlineError`. The contracts read `0` as "unset" rather than "expired", and the underlying actions already classified it this way, so the handles now agree with them. Pattern-match on `NonPositiveInputError` for a zero or negative deadline.

The derived Vault V2 force-withdraw share allowance is saturated at `maxUint256`. A very small accepted price floor scaled it past the ABI slot, and because the approval encoder clamps what it emits, the requirement sat permanently above any allowance a user could grant — so `getRequirements()` returned the same approval forever.
