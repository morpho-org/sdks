---
"@morpho-org/morpho-sdk": patch
---

Route the referral-fee, deadline, and ECDSA-signature guards shared by the direct BlueBundlesV1 writes and the VaultExitBundlesV1 force withdrawal through single helpers instead of per-call-site copies.

`MissingReferralFeeRecipientError` is now one class carrying the offending `referralFeePct` (both peripheries transfer the fee unconditionally, so the failure mode is identical). `validateReferralFee` owns the `[0, WAD)` bound plus the recipient check, `validateDeadline` owns the positive-`uint256` deadline bound, and `normalizeEcdsaSignature` owns the 64-byte EIP-2098 / 65-byte parse and the `yParity` → `v` widening for every periphery permit and authorization struct. The three remaining hand-rolled `uint256` bounds (`blueSupply`'s `assets`, and `getBlueBundlesV1TokenRequirements`' `amount` and `permit2Nonce`) now call the existing `validateUint256Field` like their siblings.

Beyond the error's constructor arity this is internal maintenance — the thrown error classes, encoded calldata, and requirement shapes are unchanged — with one deliberate behavior addition: `vaultV1InKindRedeem` and `vaultV2InKindRedeem` had no upper bound on `deadline` at all, so routing them through the shared guard means an out-of-`uint256` deadline now throws `InputExceedsMaxError` instead of viem's `IntegerOutOfRangeError` at encode time, matching their `vaultV2ForceWithdraw` sibling on the same periphery.
