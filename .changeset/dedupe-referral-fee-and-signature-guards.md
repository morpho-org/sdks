---
"@morpho-org/morpho-sdk": patch
---

Route the referral-fee, deadline, and ECDSA-signature guards shared by the direct BlueBundlesV1 writes and the VaultExitBundlesV1 force withdrawal through single helpers instead of per-call-site copies.

`MissingReferralFeeRecipientError` is now one class carrying the offending `referralFeePct` (both peripheries transfer the fee unconditionally, so the failure mode is identical). `validateReferralFee` owns the `[0, WAD)` bound plus the recipient check, `validateDeadline` owns the positive-`uint256` deadline bound, and `normalizeEcdsaSignature` owns the 64-byte EIP-2098 / 65-byte parse and the `yParity` → `v` widening for every periphery permit and authorization struct. Pure internal maintenance beyond the error's constructor arity: the thrown error classes, encoded calldata, and requirement shapes are unchanged.
