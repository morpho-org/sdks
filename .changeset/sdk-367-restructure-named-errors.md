---
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

`restructure` and `readContractRestructured` now throw named errors instead of a bare `Error`: `UnknownAbiFunctionError` when the ABI has no function with the requested name, `UnnamedAbiOutputsError` when the function's outputs are not all named, and `NonTupleReturnValueError` when the read returns a single value. Each extends `Error` and exposes `functionName`, so existing `catch` blocks keep working; only the message text changes. `morpho-sdk` re-exports the three errors under the same names from `/blue/errors` and `/errors`.
