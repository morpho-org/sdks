---
"@morpho-org/test": patch
---

`mockRead` (from `@morpho-org/test/mock`) now ABI-encodes the supplied `result` **per overload** of the target function name rather than once against the ambiguous `functionName`. For ABIs where overloads share a return type the behaviour is unchanged (the same bytes are stored under every selector). For ABIs where overloads have **different** return types — e.g. `counter(uint256) returns (uint256)` and `counter(address) returns (bool)` — the encoded bytes now match each overload's declared output shape, so an `eth_call` to the bool overload no longer receives uint256-shaped bytes. If the supplied `result` does not match the return shape of **any** overload, `mockRead` now throws a clear `Error` (`"[mockRead] options.result does not match any return-type shape of overloads of <name>"`) instead of silently registering bytes that decode incorrectly.

(Drive-by packaging cleanup: the previously-advertised CJS `require` condition for `./mock` is removed from `publishConfig.exports` and `mock.ts` is excluded from the CJS build. The entry was crash-on-load — `mock.ts` imports vitest, which rejects `require()` — so no working consumer is affected; only the unusable metadata is gone.)
