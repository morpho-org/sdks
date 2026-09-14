---
"@morpho-org/morpho-ts": minor
"@morpho-org/evm-simulation": patch
"@morpho-org/morpho-sdk": patch
---

Add the canonical Permit2 contract address (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) to the Monad (chain id 143) and Stable (chain id 988) entries in the shared address registry, enabling Permit2 approval flows (Bundler3 and Midnight periphery) on both chains.

Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entries.
