---
"@morpho-org/morpho-sdk": minor
---

Add native-wrapping support to `blueRepay`. The action now accepts an optional `args.nativeAmount` that funds part or all of `transferAmount` by wrapping native into wNative via `GeneralAdapter1.wrapNative()` (the remainder is pulled via the ERC-20 path), mirroring the native-wrapping flow already available on `blueSupply` / `blueSupplyCollateral`. Requires the market's loan token to be the chain's wNative. The new `BlueRepayAction.args.nativeAmount` field and the `NativeAmountExceedsTransferAmountError` class are exported as public API.
