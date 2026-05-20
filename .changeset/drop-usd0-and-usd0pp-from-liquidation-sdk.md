---
"@morpho-org/liquidation-sdk-viem": major
---

Remove USD0 / USD0++ liquidation support. These collateral assets are no longer
used on Morpho. Dropped:

- `Usual` namespace and `src/tokens/usual.ts`.
- `usd0`, `usd0++`, `usd0usd0++` entries on the `ChainAddresses` augmentation
  and the matching custom-address registrations on Ethereum mainnet.
- `curvePools` constant (only consumed by the removed swap helpers).
- `LiquidationEncoder.curveSwapUsd0Usd0PPForUsdc`,
  `LiquidationEncoder.swapUSD0PPToUSDC`, and the now-unused curve helpers
  `getCurveWithdrawalAmount`, `getCurveSwapOutputAmountFromInput`,
  `getCurveSwapInputAmountFromOutput`, `removeLiquidityFromCurvePool`, and
  `curveSwap`.

`getCurveSwapIndex0Token` and the Spectra-driven `spectraCurveSwap` are kept
since they remain in use by the Spectra integration.
