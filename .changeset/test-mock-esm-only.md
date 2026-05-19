---
"@morpho-org/test": patch
---

`@morpho-org/test/mock` is now ESM-only. The previously-advertised `require` condition pointed at `lib/cjs/mock.js`, which would `require("vitest")` at load — and vitest rejects `require()` with "Vitest cannot be imported in a CommonJS module using require()". The CJS condition for `./mock` is removed from `publishConfig.exports` and `mock.ts` is excluded from the CJS build. The ESM entry (`./lib/esm/mock.js`) is unchanged, and vitest projects (which is the only supported consumer of this subpath) resolve to ESM already. No source change is needed in consumer projects.

Additionally, `mockRead` now ABI-encodes the supplied `result` **per overload** of the target function name rather than once against the ambiguous `functionName`. For ABIs where overloads share a return type the behaviour is unchanged (the same bytes are stored under every selector). For ABIs where overloads have **different** return types — e.g. `counter(uint256) returns (uint256)` and `counter(address) returns (bool)` — the encoded bytes now match each overload's declared output shape, so an `eth_call` to the bool overload no longer receives uint256-shaped bytes. If the supplied `result` does not match the return shape of any overload, `mockRead` now throws a clear `Error` instead of silently registering bytes that decode incorrectly.
