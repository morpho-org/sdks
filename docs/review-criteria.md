# SDK review criteria for Lupin

The SDK review criteria in [`.review/`](../.review/manifest.json) prepare the replacement of the existing AI review orchestration with Lupin. The initial review uses independent Claude and Codex reviewers sharing the same SDK catalog, followed by synthesis. Devin is deferred.

This configuration is staged: adding criteria does not enable automatic reviews, remove the existing review commands or change a merge gate. The current engine and workflow remain documented in [AGENTS.md §10](../AGENTS.md#10-review-automation--cirelease-security) until the coordinated cutover.

## Ownership and applicability

[Root engineering rules](../AGENTS.md), package/nested instructions, pinned protocol sources and public contracts remain authoritative. [Review guidance](../.review/review.md) tells each reviewer how to find that context and account for the applicable criteria. Lupin supplies reviewer execution, the structured output contract, synthesis and delivery; SDK skills supply repository-specific judgment.

The ten criterion identities preserve the specialist knowledge from the existing engine without retaining its ten-agent dispatch. Each independent reviewer is responsible for the whole change and loads the relevant catalog entries. Loading a skill alone does not establish coverage: the review records which mechanisms it checked and the evidence read.

| Existing specialist | Lupin criterion | SDK-specific concerns |
| --- | --- | --- |
| code-quality | [sdk-code-quality](../.review/skills/sdk-code-quality/SKILL.md) | Type safety, typed errors, immutability, units, callers and code-level security |
| module-api-architecture | [sdk-module-api-architecture](../.review/skills/sdk-module-api-architecture/SKILL.md) | Client/Entity/Action ownership, stateless signatures, public facades, packaging and deprecation |
| morpho-protocol | [sdk-morpho-protocol](../.review/skills/sdk-morpho-protocol/SKILL.md) | Canonical ABIs/addresses, routing, rounding/accrual, LLTV, shares, native wrapping and allocator fees/penalties |
| web3-security | [sdk-web3-security](../.review/skills/sdk-web3-security/SKILL.md) | Chain/account/domain checks, approvals, permits, replay and transaction lifecycle |
| silent-failure-hunter | [sdk-silent-failure-hunter](../.review/skills/sdk-silent-failure-hunter/SKILL.md) | Error propagation, optional lookups, discarded outcomes and backend fallback |
| style-conventions | [sdk-style-conventions](../.review/skills/sdk-style-conventions/SKILL.md) | Import/helper conventions, generated inputs, semver and maintained runtime/peer dependents |
| documentation | [sdk-documentation](../.review/skills/sdk-documentation/SKILL.md) | Public JSDoc, accurate examples/contracts, links, inventories and historical TIBs |
| test-coverage | [sdk-test-coverage](../.review/skills/sdk-test-coverage/SKILL.md) | Discriminating behavior evidence, transport mocks, pinned forks and Vitest routing |
| ci-release-security | [sdk-ci-release-security](../.review/skills/sdk-ci-release-security/SKILL.md) | Workflow trust, tested scripts, signing/hardening, publication and dependencies |
| skill-authoring | [sdk-review-system-integrity](../.review/skills/sdk-review-system-integrity/SKILL.md) | Current manifest/discovery contracts, criteria references and review authority |

Keep the owning rule and affected criteria consistent when behavior changes. During staging, the existing personas remain active too. After cutover, update the active criterion references rather than preserving obsolete engine inventories.

## Adaptation from the existing engine

The starting criteria were audited against SDK revision `468422d90019029b3d18ac239bf6fbb19748c22e`. They retain package refinements rather than flattening them into generic rules: async requirement resolvers are allowed alongside pure action encoders, signer identity is checked at its documented boundary, and permitted transport-mock tests remain distinct from required real-state fork evidence.

The migration corrects unsupported heuristics while retaining the engineering obligations. A returned transaction hash does not always require the returning API to wait for a receipt; primitive address strings do not get a new object identity on every render. A security finding needs the actual path and consequence. Written dependency or install-setting restrictions remain enforceable without describing every violation as proven compromise.

Lupin owns severity/confidence/verdict, causal scope, supported finding anchors and synthesis. The criteria do not carry the old critical/high/medium/low output schema, WHAT/FIX parser, ±15-line filter, token-overlap deduplication, agent-error sentinel, fixed persona count or automatic severity defaults. Review investigation can cross files; a retained finding still needs a changed cause or newly exposed consequence.

The skills also grant no fixing, publication, credential or delegation authority. Legacy local ledgers, five-iteration repair loops and watchers are author-workflow concerns to resolve at cutover, not instructions for a read-only reviewer.

## Runtime selection and verification

The repository manifest inherits Lupin's shared runtime configuration. A repository `multiModel.reviewers` override merges with shared bindings; it is not an allowlist. The initial production and evaluation invocations therefore require explicit selection:

```text
--lenses claude-review,codex-review
```

Use this selection with the supported Lupin multi-model entrypoint and inspect the saved invocation for exactly those reviewer IDs. The manifest's skill `agents` labels support the grouped mode; multi-model mode provides the full shared catalog to both selected reviewers. The criteria manifest alone does not exclude Devin or enable a production route.

The current shared method requests changes for retained `critical` or `warning` findings at minimum `medium` confidence. This differs from the existing SDK CI engine's critical/high-only approval threshold and its separate local medium-clear rule. Apply the configured Lupin policy to supported findings rather than convert old labels mechanically.

Static schema/reference validation establishes that the criteria can compose with the checked Lupin method. It does not establish model invocation, skill use, review recall, latency or reliable publication. A migration evaluation must retain exact reviewed revisions, selected runtimes and candidate identity, inspect mechanism-level coverage, and distinguish review-quality evidence from bootstrap or delivery failures.

## Cutover completion

Enablement is a separate change. It must provide the verified invocation/bootstrap route, select only Claude and Codex, and remove competing automatic reviewer triggers. Reconcile the root review prose and §10, persona backlinks, command symlinks, old engine/scripts/tests and workflow references together. Any retained local author command needs a supported replacement route.

Verify the actual review and published result for the intended revision, including failure and follow-up behavior, before calling the replacement operational. Preserve existing engineering/security checks and human merge gates; their success is separate from the review recommendation.
