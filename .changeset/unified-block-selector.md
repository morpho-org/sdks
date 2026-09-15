---
"@morpho-org/morpho-ts": minor
"@morpho-org/blue-sdk-viem": major
"@morpho-org/midnight-sdk": major
"@morpho-org/morpho-sdk": major
"@morpho-org/evm-simulation": major
"@morpho-org/liquidity-sdk-viem": major
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Replace SDK fetch `blockNumber`/`blockTag` options with one optional `block: BlockNumberOrTag`, a readonly discriminated union of `{ type: "number", value: bigint }` and `{ type: "tag", value: BlockTag }`. Simulation uses the same `block` selector in place of its former `blockNumber` union. The shared type and pure `toBlockParameters` conversion live in morpho-ts; morpho-sdk exposes the types at its root and `/types`, and the conversion at `/utils`.

Direct, deployless, fallback, nested, balance, and bytecode reads preserve the selected block. Omission retains client defaults. Immutable Blue market-parameter lookup continues to read latest. Liquidity snapshots remain pinned to the fetched block number.

Require morpho-ts ^2.13.0 in Blue and Midnight fetch packages. Require blue-sdk-viem ^6.0.0 and morpho-sdk ^6.0.0 in liquidity-sdk-viem, whose major bump reflects the changed peer compatibility. Patch WDK to resolve its updated direct dependencies. See `docs/migrations/block-number-or-tag.md` for migration examples and the complete dependency/peer audit.
