---
"@morpho-org/morpho-sdk": patch
---

Harden vault reads and the vault-shares permit encoder:

- `MorphoVaultV1.getData()` and `MorphoVaultV2.getData()` now use strict `validateChainId`, so a
  client constructed without a `chain` (or connected to another chain) throws
  `ChainIdMismatchError` before any onchain read instead of silently fetching from whatever chain
  the transport targets.
- `encodeVaultSharesPermit` validates its explicit `deadline` like its sibling permit encoders:
  `NonPositiveInputError` on a non-positive value, `InputExceedsMaxError` above uint256, and
  `ExpiredDeadlineError` when it is not in the future.
