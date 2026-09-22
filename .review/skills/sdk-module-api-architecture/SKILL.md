---
name: sdk-module-api-architecture
description: Use for exports, package boundaries, Client/Entity/Action ownership, stateless requirements, public types, packaging, dependencies, or deprecation.
---

# SDK public API and package architecture

Read root `AGENTS.md` §1–4 and §7, the nearest package/nested instructions, relevant public barrels and package export metadata. Follow an integrator's call through the changed boundary and one important failure/resumption path.

## Ownership and state

- Client factories hold readonly configuration. Entities read state and return lazy action handles. Transaction actions encode synchronously; helpers own pure validation/math/encoding. Follow the semantic responsibility, not just the directory name: `actions/requirements` contains documented async resolvers.
- `getRequirements()` or `sign()` must not populate closure state that `buildTx()` later needs. Payloads travel through arguments, including `RequirementSignature.args`, so prepare/sign on instance A and build on instance B or serialize/resume remains possible.
- Input mutation is forbidden; fresh helper output identity is required only by an explicit contract. Freeze transaction/signature descriptors, not domain class instances. Use classes for meaningful behavior or typed errors rather than value bags.
- Class factories are static class methods; class methods delegate to pure object-compatible `*Utils`. Domain interfaces and identical ABI structs share one exported shape. Enforce the local-helper extraction rule without inventing a global abstraction requirement.
- Keep frameworks in named adapters. Read package refinements: `blue-sdk` excludes viem; `midnight-sdk` permits viem encoding and explicit fetch boundaries plus documented API-backed conveniences. Shared ABI/deployment primitives belong to their documented `morpho-ts` owner.

## Consumer contract

- Public symbols flow through established barrels and supported package subpaths; cross-package deep imports violate the root contract. Check `publishConfig.exports`, ESM/CJS/types paths, TS path mappings and side-effect declarations when packaging changes. Relative `.js` paths and type-only imports must work for consumers.
- Changes to consumer-facing Blue/Midnight exports require the matching `morpho-sdk` facade audit. Preserve established raw `/blue/<category>` and `/midnight/<category>` surfaces and qualified protocol-specific unprefixed names. Shared names stay unqualified; legacy ambiguity is deprecated before removal. Parity alone does not justify adding a new facade category.
- Public fields remain readonly, errors named/exported, tagged unions coherent and fragile upstream types absorbed where required. `morpho-sdk` retains its documented viem-only peer contract.
- Runtime workspace dependencies use workspace ranges; internal peers deliberately use explicit published ranges. Audit all affected maintained direct runtime and peer dependents with `sdk-style-conventions`.
- Apply successor → deprecated minor coexistence → next-major removal, migration guide and release duties. Read the exact BlueBundlesV1 TIB exception before accepting a route-specific break: established method/action names remain; Vault V1 reallocations still need their published deprecation minor; unrelated breaks inherit no exception.

Finish with evidence about the real consuming surface and state transport, including any unavailable packed-artifact or runtime check. A documented intentional change still needs coherent consumers and its applicable migration obligations.
