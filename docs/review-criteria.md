# SDK review criteria for Lupin

[The SDK policy](../.review/manifest.json) prepares Lupin to replace the existing AI review orchestration. It prioritizes business logic, integrator safety and CI/release integrity, with supported, non-obvious findings over optional style comments. Both independent reviewers receive the same [five-area brief](../.review/review.md); synthesis receives it too.

The initial reviewers are Claude and OpenAI through Pi/Vercel, using the existing Claude/Codex lens IDs. The [Lupin workflow](#hosted-workflow) runs them on request and changes no merge gate. The current engine remains active under [AGENTS.md §10](../AGENTS.md#10-review-automation--cirelease-security) until coordinated cutover.

## Ownership

- **SDK contracts:** root/package/nested instructions, pinned protocol sources and public contracts own the rules. Review criteria apply those rules, their exceptions and the evidence needed to assess them.
- **Lupin:** captures revisions and policy, composes instructions, executes configured models, preserves claim history, validates structured output, reconciles evidence and publishes with granted authority. Its common investigation/follow-up/writing methods remain inherited.
- **Reviewers:** investigate relevant callers and dependencies, assess applicability, challenge findings and record concrete evidence. Identical criteria do not require identical investigative paths or prove identical results.
- **Author automation:** owns code edits, validation and resubmission. Replacing the review engine need not replace a Devin author/fixer. Deferring Devin as a Lupin reviewer is a separate choice; review skills grant no fixing, credential or publication capabilities.

## Five SDK areas

| Area and detailed criteria | Source material retained |
| --- | --- |
| [Protocol and transaction safety](../.review/skills/security-investigation/SKILL.md) | Morpho protocol + Web3 security: ABIs/addresses, decimal/accounting/accrual invariants, routing, chain/account authority, approvals, signatures and composed transaction flows |
| [Integrator compatibility and architecture](../.review/skills/architecture-simplicity-reuse/SKILL.md) | Module/API architecture + boundary conventions: subtle behavior/default/error changes, stateless transport, public facades, ownership and deprecation |
| [Implementation and failure behavior](../.review/skills/sdk-correctness/SKILL.md) | Code quality + silent failures + implementation conventions: types/units, mutation, typed errors/causes, fallback, generated inputs, secrets and injection |
| [Tests and documentation](../.review/skills/sdk-evidence/SKILL.md) | Test coverage + documentation: meaningful regression/security assertions, transport/fork boundaries, JSDoc/examples, active references and historical TIBs |
| [CI, release and automation integrity](../.review/skills/developer-workflow/SKILL.md) | CI/release security + release conventions + instruction integrity: dependencies, changesets, maintained consumers, trusted CI/publication and review configuration |

These are five areas, not five agents. The brief is an inline method for both review and synthesis; its critical obligations do not depend on optional skill discovery. Reviewers load detailed criteria for implicated areas and account for concrete mechanisms, inapplicability or unavailable evidence. Reading a file does not prove a check was completed. Documentation changes can implicate protocol/security criteria through their claims.

The manifest explicitly replaces three shared skill entry points (`security-investigation`, `architecture-simplicity-reuse`, `developer-workflow`) with SDK-owned criteria, adds `sdk-correctness` and `sdk-evidence`, and disables the other optional shared catalog entries. The retained IDs keep Lupin's common method references valid. With the checked shared bundle this resolves to exactly five catalog entries, rather than appending five to the old catalog. The separate inherited writing instruction is not another SDK review area. Recheck resolved composition when upgrading Lupin: new defaults are not an implicit allowlist exclusion.

The `sdk-protocol-authority` rule establishes a security/high-risk/thorough floor across morpho-sdk, blue-sdk, blue-sdk-viem, midnight-sdk, wdk-protocol-lending-morpho-evm and morpho-ts source. Including all morpho-ts source covers canonical math/constants as well as ABIs/addresses. Other relevant source remains reviewable: paths establish a floor, not domain boundaries or limits on investigation.

## Preservation and reconciliation

The original source inventory was audited at SDK revision `468422d90019029b3d18ac239bf6fbb19748c22e`, then reconciled with current owning contracts. The criteria preserve substantive obligations and exceptions rather than the old persona dispatch boundaries:

- Async requirement resolvers coexist with pure synchronous actions. Entities and signing validate identity at their documented boundaries; pure encoders need no new RPC/client dependency.
- Helpers may reuse input identity; domain classes are not deep-frozen. Package-specific viem/API conveniences retain their own contracts.
- Supported transport mocks establish shape/pure behavior; real-state and contract behavior still requires pinned-fork evidence.
- Compatible dev-only lockfile drift, internal peer ranges, optional JSDoc release notes and all documented changeset exemptions remain valid. Canonical JSDoc exemptions include @internal/non-barrel symbols, test support and generated API outputs.
- The exact BlueBundlesV1 deprecation exception preserves its Vault V1 exclusion. Major audit and minor dogfood evidence apply at the release boundary.
- Root §9 applies rules to touched/refactored surfaces. Optional style preferences are omitted; explicit written obligations remain binding even without a lint rule.

Unsupported heuristics are not preserved: primitive addresses do not acquire object identity per render, five-minute deadlines are not automatically defective, a deliberately returned hash need not promise mining, and always-auth is not itself a credential. Findings require a changed cause/applicable contract and evidence; security impact follows reachable consequences.

Lupin supplies the assigned severity/confidence/verdict policy and supported anchors. The old critical/high/medium/low JSON, WHAT/FIX parser, ±15-line filter, token-overlap deduplication, fixed agent counts and automatic severity defaults do not carry over. Keep rule/criterion references aligned while the legacy engine remains active; reconcile obsolete inventories at cutover.

## Invocation and verification

The manifest inherits runtime bindings; binding overrides merge rather than form an allowlist. Initial production/evaluation commands explicitly select:

```text
--router vercel --lenses claude-review,codex-review
```

Use the supported multi-model entrypoint. Inspect the saved invocation for exactly those reviewers and the shared SDK brief in review/synthesis, the five resolved skills and independent shared/repository policy identities. Grouped-mode skill labels expose all five areas to every lens as well. This configuration does not itself enable production or exclude a deliberately selected additional runtime.

The checked shared policy requests changes for retained critical/warning findings at minimum medium confidence. Apply that configured policy rather than mechanically convert legacy labels; it differs from the old CI critical/high threshold and local medium-clear convention.

Preparation and preview establish supplied inputs, not review accuracy. Evaluate fixed revisions/context/model settings against earlier defects and clean counterparts, including business logic, compatibility and CI/release cases. Inspect supported findings, false alarms, missed obligations, repeated findings and coverage honesty. Measure total review-plus-fix cost and author rounds separately from isolated review latency; fewer skills or comments alone proves no improvement.

## Hosted workflow

[`lupin.yml`](../.github/workflows/lupin.yml) runs the reviewers above. A maintainer requests a review of the current revision with a PR comment whose first line is `/lupin review`, optionally followed by guidance, or dispatches the workflow with a PR number. Lupin also requires write, maintain or admin permission from the commenter. Fork PRs are never reviewed.

- **Admission** (`start`) freezes the exact head/base, supersedes older runs of the PR and acknowledges the request.
- **Review** has read-only credentials. It fetches the PR as Git objects, supplies the previous completed review of the PR when its artifact and revisions are still available, and runs both reviewers and synthesis in a read-only sandbox. There is no job timeout; elapsed time is diagnostic.
- **Publication** (`comment`) is the only write-scoped job. It posts one overview plus inline findings (`--delivery comment`) and submits no formal approval or change request; human approval remains the merge gate. A run without a result records a failed or cancelled status rather than looking clean.

Every job checks out the default branch, so the install action and CI scripts never come from the PR or its target branch. [`scripts/ci/lupin-review.ts`](../scripts/ci/lupin-review.ts) owns the workflow's data-driven choices (history, result, publication), per §10. Every job installs the standalone Lupin release pinned in [`install-lupin`](../.github/actions/install-lupin/action.yml) and verifies its checksum; upgrade the version and checksum together, then recheck the resolved composition. The executable comes from the private `morpho-org/internal-tools` release and is never uploaded as an artifact here. Review artifacts keep 30 days of evidence and history.

Repository administration supplies:

| Setting | Purpose |
| --- | --- |
| `AI_GATEWAY_API_KEY` secret | Vercel AI Gateway key billed for the review models |
| `LUPIN_RELEASE_APP_ID`, `LUPIN_RELEASE_APP_PRIVATE_KEY` secrets | GitHub App installed on `morpho-org/internal-tools` with read-only Contents, used for a short-lived release download token |
| `LUPIN_AUTO_REVIEW` variable | Unset until cutover. `true` also reviews eligible non-draft, same-repository, non-Dependabot PR updates on every target branch |
| `LUPIN_AUTOMATIC_LINE_LIMIT` variable | Optional exclusive additions-plus-deletions limit for automatic review; larger PRs need an explicit request |

## Cutover

Enablement remains separate: verify distribution/bootstrap and invocation on a requested review, then enable `LUPIN_AUTO_REVIEW` when the change removing competing automatic review triggers lands, and reconcile root §10/backlinks, command symlinks, old scripts/tests and workflow references. Preserve engineering/security checks and human merge gates.

Verify the author/fixer can consume Lupin feedback and resubmit, including failed reviews, rejected findings and repeated claims. Its coordination owns edit permissions, retry/stop conditions and escalation. Verify review publication and history-aware reassessment on the intended revision before calling the replacement operational.
