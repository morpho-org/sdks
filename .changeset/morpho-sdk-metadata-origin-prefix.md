---
"@morpho-org/morpho-sdk": patch
---

`addTransactionMetadata` now strips a leading `"0x"` from `metadata.origin` before validating and appending it. Previously, passing `"0xcafe"` and `"cafe"` produced different calldata: `"0xcafe"` was rejected by the upstream `isHex` check (which receives the raw fragment) while `"cafe"` was accepted. With this change, both inputs produce the same 4-byte origin appended to `tx.data`. Length validation (max 8 hex chars) is applied to the raw fragment, so `"0xdeadbeef00"` (10 raw hex chars) is still rejected.
