---
"@morpho-org/bundler-sdk-viem": patch
---

Fix off-by-one in `finalizeBundle`'s input-transfer rewrite optimization for
`MetaMorpho_Withdraw` and `Blue_Repay`: the matching `Erc20_Transfer` was
silently skipped when it happened to be the first operation in the bundle,
because the `<= 0` guard conflated `findIndex`'s `-1` "not found" sentinel
with a legitimate `0` index. The bundle still produced correct (just less
optimal) calldata; this patch removes the redundant input-transfer step in
the affected case.
