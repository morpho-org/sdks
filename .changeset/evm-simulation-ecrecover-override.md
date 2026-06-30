---
"@morpho-org/evm-simulation": minor
---

Add `SimulateParams.ecrecoverOverride` to simulate signature-gated calls (e.g. EIP-2612 `permit`) without a real signature. When set, both backends install an `ecrecover` shim at the `0x…0001` precompile via a `code` state-override so signature recovery resolves to the given address; the Tenderly backend also relocates the genuine precompile via `movePrecompileToAddress`, while the `eth_simulateV1` fallback installs the shim only (viem's state-override serializer drops the relocation field — behaviourally identical for standard contracts that call `0x…0001` directly). Also exports `buildEcrecoverShimCode`, `ECRECOVER_PRECOMPILE_ADDRESS`, and `ECRECOVER_RELOCATED_ADDRESS`.
