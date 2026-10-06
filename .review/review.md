# SDK review brief

Prioritize business-logic correctness, integration safety and CI/release integrity. Find consequential, non-obvious defects with evidence. Written SDK obligations remain binding; optional style preferences are not findings.

## Establish the contract

Read root AGENTS.md, MISSION.md and affected package/nested instructions in the reviewed checkout. Root rules govern conflicting persona advice; package instructions refine them. CLAUDE.md symlinks are the same source. Pinned ABI/address/math definitions, public barrels and actual callers establish the affected contract. Follow implementation owners through re-exports; source paths are starting points, not investigation limits.

The legacy review engine (root §10, `.agents/pr-review-engine/`) stays authoritative while both run; these criteria mirror it.

## Five areas to account for

1. **Protocol and transaction safety — sdk-protocol-safety.** Assess decimal/unit and rounding/accounting invariants; pinned ABI/address/domain agreement; chain/account/spender/recipient authority; approvals, signatures, nonces and replay; routing, native funding, ordering and attacks across a complete transaction flow. Validate at the owning boundary: pure builders remain pure; entities/signing own their documented checks.
2. **Integrator compatibility and architecture — sdk-compatibility.** Trace existing consumers through changed outputs, defaults, errors and state assumptions, including changes invisible to TypeScript signatures. Preserve package/layer ownership, public facades, stateless prepare/sign/build transport, immutability and applicable deprecation/migration duties.
3. **Implementation and failure behavior — sdk-correctness.** Trace correct results, types/units, input identity, typed errors/causes, promises, optional lookups, fallback and caller-visible failures. Respect written conventions and generated-source ownership; investigate reachable injection/secrets rather than cosmetic alternatives.
4. **Tests and documentation — sdk-evidence.** Check that assertions distinguish realistic regressions and protect changed public/security contracts. Use the correct pure, transport-mock or pinned-fork boundary. Verify required JSDoc/examples and active docs against actual behavior; preserve historical TIBs.
5. **CI, release and automation integrity — sdk-release-integrity.** Trace dependency/install trust, workflow inputs/permissions, trusted execution and publication. Check semver/changesets, maintained dependents and applicable release evidence. Review criteria and agent instructions must match their actual consumer.

Load an area's detailed criteria when the change implicates it, including protocol/security claims in documentation-only changes. Accounting for an area does not require a finding or exhaustive investigation of unrelated code.

## Preserve exceptions and signal

Read the owning exception with its rule: async requirement resolvers coexist with synchronous encoders; helpers may reuse input identity; class instances are not deep-frozen; transport mocks are valid for shape/pure boundaries while real-state behavior needs pinned forks. Compatible dev-only lockfile drift, internal peer ranges, optional JSDoc release notes and documented changeset/deprecation exemptions remain valid.

Retain findings with a changed cause or newly exposed consequence and an applicable contract, after inspecting guards, intent and counterevidence. Root §9 governs touched/refactored surfaces; unrelated inherited debt is not a new issue. A reverting transaction, exploitable loss and written standards violation have different consequences. Distinguish static inspection from executed validation and unavailable evidence from a defect.
