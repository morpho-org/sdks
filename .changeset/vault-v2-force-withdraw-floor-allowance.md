---
"@morpho-org/morpho-sdk": patch
---

Fix `VaultV2.forceWithdraw` deriving a `minSharePriceE27` floor above the vault's realized share price and coupling the share allowance exactly to it.

- The floor is now priced off the larger of the raw snapshot burn and the burn accrued to `now` net of the fee shares minted to the user at `now` (each endpoint netted before the max, so a fee-recipient exit is not credited a `now` fee mint against the raw burn), so it never exceeds either the un-projected share price or the projected one (after `slippageTolerance`). Previously a long elapsed window on a fee-bearing vault projected the price up while the chain realized a lower price, and the resulting floor sat above the realized price.
- The approved / permitted share allowance now covers a burn at least one `slippageTolerance` step below the floor whenever the floor exceeds one RAY unit and, in any case, at least one share above the burn at the floor, so a price within that headroom below the floor reverts on the bundle's `minSharePriceE27` check rather than underflowing `_spendAllowance` (`panic 0x11`) on the final `withdraw` leg; a deeper drop can still surface as an ERC-20 allowance underflow. Still saturated at `maxUint256`.
- `previewVaultV2ForceWithdraw` mirrors the new denominator for its zero-floor screen.
