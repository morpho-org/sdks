---
name: architecture-simplicity-reuse
description: Assess integrator compatibility and SDK architecture for public behavior, defaults, signatures, exports, state transport, dependencies, package boundaries or deprecation changes.
---

# Integrator compatibility and architecture

Read root `AGENTS.md` §1–4 and §7, affected package/nested contracts, public barrels and package metadata. Establish the intended change, then follow an existing integrator through success, failure and relevant resumption paths. Search existing owners before proposing a new abstraction.

## Consumer behavior

- Compare existing inputs with changed outputs, defaults, errors, sync/async behavior, transaction descriptors and state assumptions. An unchanged TypeScript signature can still break integration. Distinguish an authorized intentional change from an overlooked consumer consequence.
- Public symbols use established barrels/subpaths. Inspect ESM/CJS/types, publishConfig.exports, TS mappings and side-effect declarations when packaging changes. Cross-package deep imports violate the contract; NodeNext relative imports use `.js` and type-only imports avoid runtime coupling.
- Blue/Midnight consumer-facing changes require the matching `morpho-sdk` facade audit. Preserve raw `/blue/<category>` and `/midnight/<category>` surfaces, qualified protocol-specific unprefixed names and unqualified shared names. Deprecate ambiguous legacy names before removal; parity alone does not justify a new facade category.
- Public fields remain readonly; errors are named/exported and tagged unions coherent. Absorb fragile upstream types where required. `morpho-sdk` retains its documented viem-only peer contract. Runtime workspace ranges and explicit published internal-peer ranges serve different consumers.
- Apply successor introduction, deprecation/minor coexistence and next-major removal. The exact BlueBundlesV1 TIB exception preserves method/action names; Vault V1 reallocations still need a published deprecation minor. Unrelated breaks inherit no exception. Release/migration/dependent obligations use `developer-workflow`.

## Ownership and state

- Client factories own readonly configuration; entities read state and return lazy handles; transaction actions encode synchronously; helpers own pure validation/math/encoding. Follow semantic ownership: `actions/requirements` contains documented async resolvers.
- Everything buildTx needs travels through arguments, including RequirementSignature.args. Signing/requirements must not populate hidden mutable closure state required by building; prepare on instance A and finalize on B or serialize/resume must work.
- Preserve immutable inputs and documented output identity. Helpers may return an input unless freshness is promised. Freeze immutable transaction/signature descriptors, not class instances. Classes have meaningful behavior or typed errors; static class factories and pure object-compatible *Utils retain their documented roles.
- Domain interfaces and identical ABI structs share one shape; ABIs, deployments and errors keep canonical owners. Respect the local-helper extraction rule without demanding generic abstraction.
- Frameworks live in named adapters. `blue-sdk` excludes viem; `midnight-sdk` permits documented viem encoding, fetch boundaries and API-backed conveniences. Shared primitives belong to the documented `morpho-ts` owner.
- Judge an architecture finding by the broken contract or structural cost. Name a grounded alternative, what it replaces and its tradeoff; an unfamiliar pattern or personal preference alone is insufficient.

Finish with evidence about the consuming API and its ownership/state boundaries. Record unavailable packed-artifact/runtime checks separately from inspected source.
