---
"@morpho-org/morpho-sdk": minor
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Unify entity lazy-builder return types around `ActionOutput`, adding an optional requirement-array generic and the `BuilderOnlyActionOutput` type. Preserve transaction metadata, signature and options inputs, narrow requirement results, existing generic defaults, Midnight maker metadata, and builder-only runtime shapes.

The maintained WDK runtime dependent receives a patch release. The liquidity-sdk-viem peer range (`^5.4.0`) already accepts this compatible addition and needs no update or release.
