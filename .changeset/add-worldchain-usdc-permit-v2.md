---
"@morpho-org/morpho-ts": patch
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/evm-simulation": patch
"@morpho-org/morpho-sdk": patch
---

Add World Chain USDC with permit version 2 support to the shared address registry.

Normalize fallback Circle permit token address checks so known USDC/EURC addresses use permit domain version `"2"` regardless of caller-provided address casing.

Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.
