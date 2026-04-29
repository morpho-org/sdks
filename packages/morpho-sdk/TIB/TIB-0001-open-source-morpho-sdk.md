# TIB-0001: Open-Source consumer-sdk as @morpho-org/morpho-sdk v1.0.0

| Field             | Value                          |
| ----------------- | ------------------------------ |
| **Status**        | In Progress                    |
| **Date**          | 2026-04-14 (last updated 2026-04-20) |
| **Author**        | @Benjamin                      |
| **Scope**         | Repo-wide                      |
| **Supersedes**    | N/A                            |
| **Superseded by** | N/A                            |

> **Execution note (2026-04-20):** Phase 1 items 2, 3, 5, 6, 7, 8, 9 and Phase 2 items 12, 13 have landed in the open-source prep PR. Completed items are struck through below. Item 4 (version bump to 1.0.0) was temporarily reverted to `0.5.1` to ship the rename as a non-breaking release first; the 1.0.0 bump will follow. Items 1, 10, 11, 14, 15 remain admin/pre-publish tasks.

---

## Context

The Tether WDK launch is blocked on the consumer-sdk being publicly available on npm. The SDK is currently published as `@morpho-org/consumer-sdk@0.5.0` with experimental markers; the changeset config is marked `restricted` while `publishConfig.access` is `public`, which is inconsistent and will be fixed in Phase 1.

Aseem identified the core checklist for a public release (Slack, 2026-04-14):

> Rename consumer-sdk -> morpho-sdk, README.md (proper intro, quick start, remove experimental), add a license file, update version to 1.0.0, clean internal tests/fixtures, open-source repo.

Tarik flagged the need for a security scan (Cantina AI) before going public, and noted that Foulques (primary maintainer) is OOO this week, putting realistic timing at ~2 weeks. Aseem confirmed the target is **April 27, 2026**.

A thorough codebase audit was performed to identify all gaps between the current state and a production-ready public v1.0.0 release.

## Goals / Non-Goals

**Goals**

- Ship `@morpho-org/morpho-sdk@1.0.0` as a public npm package
- Unblock Tether WDK integration
- Ensure the public repo contains no secrets, internal references, or private infrastructure details
- Provide adequate documentation for external developers (README, CONTRIBUTING, SECURITY)
- Complete a Cantina AI security scan before release
- Harden CI/CD for a public repository (branch protection, action pinning, provenance)

**Non-Goals**

- Restructuring SDK architecture (the 3-layer Client -> Entity -> Action pattern is sound)
- Moving heavy Morpho SDKs to peerDependencies (they are core, not optional)
- Adding ESM + CJS dual exports map (NodeNext module resolution already works for consumers)
- Tree-shaking hints or bundle size optimization
- Full API reference documentation (README examples are sufficient for v1.0.0)

## Current Solution

The SDK exists as `@morpho-org/consumer-sdk@0.5.0`:

- Published to npm with `access: "public"` in publishConfig, but changeset config has `access: "restricted"`
- README carries a beta badge and experimental warning
- No LICENSE file (MIT declared in package.json only)
- No CONTRIBUTING.md or SECURITY.md
- `viem` is a required runtime dependency but only listed in devDependencies, not peerDependencies
- MarketV1 repay, withdrawCollateral, and repayWithdrawCollateral actions are implemented but absent from README
- GitHub repo is named `consumer-sdk`
- Git history contains a hardcoded Sentry DSN in a since-deleted `src/telemetry/sentry.ts` (commit `ac9aa9f`)
- 50+ refs under `refs/conductor-checkpoints/` expose internal Conductor session metadata
- All GitHub Actions use mutable tag references (`@v4`, `@v1`) — not pinned to SHAs
- CI triggers on all pushes with no branch filter — secrets exposed on non-main branches
- Release workflow uses both OIDC (`id-token: write`) and a static `NPM_TOKEN` secret (contradictory)
- No branch protection rules configured
- No npm provenance attestation on published packages

**Audit findings (positive):**
- Zero hardcoded secrets, API keys, or internal references in the **current working tree**
- All dependencies point to public npm registry
- Test fixtures use only public Ethereum mainnet contract addresses
- TypeScript strict mode with zero `any` types
- 45 typed error classes with descriptive messages
- Good JSDoc coverage on public API
- Professional changelog (Changesets format)
- CI/CD fully configured (lint, build, test, automated release with OIDC npm publish)

## Proposed Solution

Rename, document, and release the SDK publicly as `@morpho-org/morpho-sdk@1.0.0` after passing a Cantina AI security scan and hardening the repo for public access.

### Implementation Phases

- **Phase 1 -- Blockers (must complete before open-sourcing):**
  - **Target:** April 18, 2026
  - **Owner per item noted inline**

  1. **Clean git history artifacts** _(Owner: Benjamin)_
     - Commit `ac9aa9f` contains a hardcoded Sentry DSN in `src/telemetry/sentry.ts` (since deleted from working tree). This will be publicly visible in git history.
     - **Decision: rotate the Sentry DSN.** The old DSN will remain in history but will be invalidated. This avoids a destructive `git filter-repo` / force push. Rotation must happen before the repo goes public.
     - Delete all Conductor checkpoint refs before pushing to public repo:
       ```
       git for-each-ref --format='delete %(refname)' refs/conductor-checkpoints/ | git update-ref --stdin
       ```

  2. ~~**Rename package** `@morpho-org/consumer-sdk` -> `@morpho-org/morpho-sdk`~~ ✅ _(Owner: Benjamin)_
     - Run `grep -rn "consumer-sdk" . --include='*.md' --include='*.ts' --include='*.mdc' --include='*.json'` and update **all** hits. Known files:
       - `package.json`: update `name`, `repository` (`github:morpho-org/morpho-sdk`), `homepage`, `bugs.url`
       - `README.md`: title and all import paths
       - `CHANGELOG.md`: header on line 1 (`# @morpho-org/consumer-sdk` -> `# @morpho-org/morpho-sdk`). Note: Changesets auto-generates this from package.json `name`, so the changeset for 1.0.0 must be generated **after** the rename.
       - `ARCHITECTURE.md`: dependency tree diagram (line 196)
       - `src/client/morphoViemExtension.ts`: JSDoc `@example` import on line 18 — **this ships in the npm package** and appears in IDE hints for consumers
       - `.agents/commands/create-pr.md`: example GitHub URL (line 126)
       - `.cursor/rules/code-style.mdc`: frontmatter description (line 2)
     - Note: `CLAUDE.md` does **not** contain `consumer-sdk` despite earlier assumption — no update needed there.
     - GitHub: rename repository from `consumer-sdk` to `morpho-sdk` (admin action). GitHub creates automatic redirects; do not create a new repo named `consumer-sdk` or the redirect breaks.

  3. ~~**Add LICENSE file** at repo root~~ ✅ _(Owner: Benjamin)_
     - Standard MIT license text, copyright `Morpho Association`
     - `package.json` already declares `"license": "MIT"` -- file makes it enforceable and GitHub-detectable

  4. **Bump version to 1.0.0** _(Owner: Benjamin)_
     - Update `package.json` version
     - Create changeset entry for the major version bump (must happen **after** the rename so Changesets uses the new name)
     - Update CHANGELOG.md

  5. ~~**Remove experimental/beta markers from README**~~ ✅ _(Owner: Benjamin)_
     - Remove `![Beta](https://img.shields.io/badge/status-beta-orange)` badge (line 3)
     - Remove `> ⚠️ **Experimental package**` warning (line 5)

  6. ~~**Update README for external developers**~~ ✅ _(Owner: Benjamin)_
     - Add installation section: `pnpm add @morpho-org/morpho-sdk viem`
     - Add missing MarketV1 documentation: `repay`, `withdrawCollateral`, `repayWithdrawCollateral`
     - Add brief section explaining `getRequirements()` flow (approvals, permits, authorizations)
     - Note `viem ^2.x` as a required peer dependency
     - Add "Migration from @morpho-org/consumer-sdk" section (the package rename is itself a breaking change — consumers must update all import paths)

  7. ~~**Add `viem` to peerDependencies**~~ ✅ _(Owner: Benjamin)_
     - Currently only in `devDependencies`; consumers must install it themselves but npm/pnpm won't warn them
     - Add `"viem": "^2.0.0"` to `peerDependencies`
     - Shipping v1.0.0 without this guarantees broken installs for new users

  8. ~~**Fix changeset config**~~ ✅ _(Owner: Benjamin)_
     - `.changeset/config.json`: change `"access": "restricted"` to `"access": "public"`

  9. ~~**Harden CI/CD for public repo**~~ ✅ _(Owner: Benjamin / Foulques)_ — SHAs pinned, CI triggers restricted to `main` + PRs, `--provenance` added, static `NPM_TOKEN` removed in favor of OIDC, workflow permissions scoped per-job.
     - **Pin all GitHub Actions to commit SHAs** — mutable tags (`@v4`, `@v1`) are a supply chain risk for a DeFi SDK with npm publish credentials. Pin `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, `changesets/action`, `actions/create-github-app-token`, `foundry-rs/foundry-toolchain` to full SHAs.
     - **Restrict CI triggers** — change `ci.yml` from `on: push` (no branch filter) to `push: branches: [main]` + `pull_request`. Currently, test workflow receives `secrets.MAINNET_RPC_URL` on all pushes — external collaborators could leak it.
     - **Add npm provenance** — add `--provenance` flag to `pnpm release` in `release.yml`. OIDC `id-token: write` is already configured. Cryptographically links the published package to its source commit via Sigstore.
     - **Audit NPM_TOKEN vs OIDC** — release workflow uses both `id-token: write` (OIDC) and a static `NPM_TOKEN` secret. Determine which is actually used by changesets/action and remove the other.
     - **Scope workflow permissions** — `contents: write` + `pull-requests: write` are available to all steps including third-party actions. Consider restricting per-step where possible.

  10. **Configure branch protection on main** _(Owner: admin / Foulques)_
      - Required pull request reviews before merging
      - Required status checks (CI must pass)
      - No force pushes
      - No branch deletion
      - Without this, CODEOWNERS has no enforcement mechanism — anyone with write access can push directly to main and trigger the release workflow.
      - Consider requiring signed commits.

  11. **Verify npm pack output** _(Owner: Benjamin)_
      - Run `pnpm build && pnpm pack` and inspect the tarball to confirm only `lib/` files are included
      - Verify `prepublish` script (`$npm_execpath build`) works correctly across package managers
      - Verify the package installs and imports correctly in a fresh project

- **Phase 2 -- Important (should complete before open-sourcing):**
  - **Target:** April 22, 2026

  12. ~~**Add CONTRIBUTING.md**~~ ✅ _(Owner: Benjamin)_
      - Development setup: pnpm, Node version (`.nvmrc` -> Node 24)
      - Code style: Biome, double quotes, 2-space indent, no unused imports
      - Running tests: requires `MAINNET_RPC_URL` environment variable — recommend a free-tier RPC provider (e.g., Alchemy free tier) or note that CI runs tests and contributors can rely on it for test validation
      - PR process: changesets required, CI must pass
      - Reference to code of conduct

  13. ~~**Add SECURITY.md**~~ ✅ _(Owner: Foulques)_
      - Responsible disclosure process for vulnerabilities
      - Contact information (security@morpho.org or similar)
      - Critical for a DeFi protocol SDK handling real financial transactions

  14. **Deprecate old npm package** _(Owner: Benjamin)_
      - After publishing `@morpho-org/morpho-sdk@1.0.0`, run:
        ```
        npm deprecate @morpho-org/consumer-sdk "Renamed to @morpho-org/morpho-sdk. See https://github.com/morpho-org/morpho-sdk"
        ```
      - Existing consumers (including Tether WDK) need to update import paths

  15. **Verify GitHub App and CI secrets** _(Owner: admin)_
      - `APP_ID`, `APP_PRIVATE_KEY`, `NPM_TOKEN` are repository-scoped GitHub secrets
      - If the repo is renamed (not recreated), secrets persist. If recreated, they need reconfiguring.
      - Verify the GitHub App's repository access is updated if the repo name changes
      - Confirm the App's permissions are minimally scoped

- **Phase 3 -- Polish (nice-to-have, not blocking release):**
  - **Target:** April 25, 2026

  16. **GitHub issue/PR templates**
      - `.github/ISSUE_TEMPLATE/bug_report.md`
      - `.github/ISSUE_TEMPLATE/feature_request.md`
      - `.github/pull_request_template.md`

  17. **Add CODE_OF_CONDUCT.md** (Contributor Covenant v2.1)

  18. **Add npm keywords** for discoverability
      - `["morpho", "defi", "ethereum", "sdk", "viem", "erc4626", "lending", "borrowing"]`

  19. **Add README badges**: npm version, TypeScript, license, CI status

## Cantina AI Security Scan

- **Target:** April 18-24, 2026 (after Phase 1 code changes, before go-live)
- **Blocks:** Public release
- **Scope:** Smart contract interaction vulnerabilities, dependency issues, open-source readiness
- **Notable items for Cantina to review:**
  - Borrow action accepts `minSharePrice: 0n` as valid (only rejects negative). A consumer calling the action layer directly could disable slippage protection entirely. Should the action-layer API enforce a minimum non-zero share price?
  - All `@morpho-org/*` runtime dependencies use caret ranges (`^`). A compromised patch/minor release auto-propagates to all SDK consumers. Should these be pinned?
  - `zod` dependency also uses caret range — processes user input for validation.

## Rename & Publish Sequence

Concrete order of operations for the atomic rename + publish:

1. Complete all Phase 1 code changes on a branch (rename in all files, LICENSE, README, CI hardening)
2. Merge to `main`
3. Admin renames GitHub repo `consumer-sdk` -> `morpho-sdk` (redirects created automatically)
4. Admin configures branch protection rules on `main`
5. Admin verifies GitHub App secrets and CI secrets still work
6. CI runs on `main`, Changesets creates a release PR for v1.0.0
7. Merge the release PR — CI publishes `@morpho-org/morpho-sdk@1.0.0` to npm (with `--provenance`)
8. Run `npm deprecate @morpho-org/consumer-sdk "Renamed to @morpho-org/morpho-sdk"`
9. Toggle repo visibility to public

## Contingency Plan

- **If Cantina scan finds critical vulnerabilities:** April 27 date slips. Remediation takes priority. Communicate delay to Tether WDK team immediately.
- **If npm publish fails (name conflict, scope permissions):** Verify `@morpho-org/morpho-sdk` name is available on npm **before** starting Phase 1. Reserve it with a placeholder publish if needed.
- **If GitHub App secrets break after rename:** Fall back to manual npm publish with a scoped automation token while debugging.
- **If a security issue is discovered shortly after going public:** Use `npm unpublish` within 72h window if critical, otherwise publish a patch. SECURITY.md provides the disclosure path.

## Considered Alternatives

### Alternative 1: Release as v0.5.0 (keep pre-1.0)

Release publicly at the current version without bumping to 1.0.0.

**Why rejected:** Signals instability to external integrators. Tether WDK needs a stable dependency. The SDK has been through multiple minor releases and the API surface is mature.

### Alternative 2: Rename to @morpho-org/core-sdk

Use "core-sdk" instead of "morpho-sdk" as the package name.

**Why rejected:** "morpho-sdk" is more discoverable, directly identifies the protocol, and aligns with standard naming conventions (e.g., `@uniswap/sdk`). Aseem listed it as the primary option.

### Alternative 3: Strip all AI/agent files before open-sourcing

Remove CLAUDE.md, AGENTS.md, .agents/, .cursor/ from the public repo.

**Why rejected:** These files contain zero secrets -- only development guidelines. They're already excluded from the npm package by `files: ["lib"]`. Keeping them is transparent about development tooling.

### Alternative 4: Scrub entire git history (fresh init)

Start with a clean git history to eliminate the Sentry DSN and conductor refs.

**Why rejected (tentatively):** Loses valuable commit history, blame annotations, and changelog traceability. Targeted `git filter-repo` on the specific commit + ref cleanup is less destructive. However, if more sensitive items are found during Cantina scan, a fresh init may be reconsidered.

## Assumptions & Constraints

- Foulques (primary maintainer) is OOO week of 2026-04-14; he should review/approve the TIB before execution
- GitHub repo rename (`consumer-sdk` -> `morpho-sdk`) requires admin access and should happen atomically with the npm package rename. GitHub creates automatic redirects — do not create a new repo named `consumer-sdk` or the redirect breaks.
- Cantina AI security scan must complete and pass before the repo is made public
- Target date for public release: **2026-04-27**
- Tether WDK team is the immediate downstream consumer and primary motivator
- `@morpho-org/morpho-sdk` npm package name must be verified as available before starting Phase 1
- If the repo is renamed (not recreated), GitHub secrets persist automatically
- All `@morpho-org/*` runtime dependencies use caret ranges — a compromised patch release would propagate to SDK consumers. Dependency pinning strategy should be discussed as part of Cantina review.

## Dependencies

- **Cantina AI security scan** -- must complete before repo goes public
- **GitHub admin access** -- for repo rename, visibility toggle, and branch protection setup
- **npm access** -- for publishing `@morpho-org/morpho-sdk` (existing OIDC-based release pipeline handles this) and deprecating `@morpho-org/consumer-sdk`
- **Foulques review** -- as primary maintainer, should sign off on the TIB and final PR
- **npm name availability** -- verify `@morpho-org/morpho-sdk` is not taken before starting work

## Security

- **Codebase audit result (working tree):** No hardcoded secrets, API keys, private URLs, or internal references found in current source code, tests, or configuration
- **Git history:** Commit `ac9aa9f` contains a Sentry DSN in a since-deleted file. Decision: rotate the DSN before going public (non-destructive, no history rewrite).
- **Conductor refs:** 50+ `refs/conductor-checkpoints/` refs expose internal session metadata. Must be deleted before pushing to public repo.
- **Test data:** All test fixtures use public Ethereum mainnet contract addresses only
- **Environment variables:** Only `MAINNET_RPC_URL` required for tests, properly managed via GitHub Secrets in CI. CI triggers must be restricted to prevent secret leakage on non-main branches.
- **Cantina AI scan:** Blocks release. Will scan for smart contract interaction vulnerabilities, dependency issues, and open-source readiness gotchas
- **SECURITY.md:** Must be added before release to provide responsible disclosure path for vulnerabilities (critical for DeFi code handling real financial transactions)
- **CODEOWNERS:** Already guards `.github/CODEOWNERS` and `.github/workflows/release.yml` via `@morpho-org/security` team. Only effective when branch protection requires reviews.
- **GitHub Actions supply chain:** All actions must be pinned to commit SHAs. Mutable tags allow upstream compromise to inject code into CI with npm publish credentials.
- **npm provenance:** Must be enabled (`--provenance` flag) to cryptographically link published packages to source commits via Sigstore.
- **Branch protection:** Required for CODEOWNERS enforcement and to prevent direct pushes to main that could trigger unreviewed releases.
- **Dependency ranges:** All `@morpho-org/*` deps use caret ranges. Consider pinning or tightening for supply chain safety.
- **Slippage protection:** Borrow action accepts `minSharePrice: 0n` at the action layer, effectively disabling slippage protection. Document this risk and flag for Cantina review.

## Observability

Post-release monitoring:

- npm weekly download counts for `@morpho-org/morpho-sdk`
- GitHub issues/PRs velocity and response time
- npm unpacked size tracking across versions
- Error reports from downstream consumers (Tether WDK)
- Deprecation warning effectiveness on `@morpho-org/consumer-sdk`

## Future Considerations

- Full API reference documentation (generated from JSDoc or a docs site) -- deferred to post-1.0
- Move to a monorepo structure if additional SDK packages are created
- Bundle size optimization and tree-shaking hints for frontend consumers
- Consider adding `exports` map in package.json for more granular imports
- Deprecation strategy for old `@morpho-org/consumer-sdk` npm package (publish final version pointing to new name)
- Dependency pinning policy for `@morpho-org/*` packages (exact vs caret vs tilde)
- GitHub App token rotation policy and minimal permission scoping

## Open Questions

1. ~~**Sentry DSN disposition:**~~ **Resolved — rotate the DSN.** Old DSN stays in history but is invalidated before going public. Non-destructive, no force push needed.
2. **npm name reservation:** Is `@morpho-org/morpho-sdk` available on npm? Should we reserve it with a placeholder publish before starting work?
3. **Cantina scan failure scenario:** If critical vulnerabilities are found, what is the maximum acceptable delay past April 27? Does the Tether WDK team have a hard deadline or is there flexibility?
4. **Dependency pinning:** Should `@morpho-org/*` production dependencies use exact versions instead of caret ranges for supply chain safety? This trades automatic patch updates for manual version bumps.
5. **GitHub App scope:** Is the GitHub App used in `release.yml` restricted to this repository only? Does its private key have a rotation schedule?
6. **Signed commits:** Should the public repo require signed commits via branch protection? This adds friction for external contributors.

## References

- [Slack discussion: Aseem/Tarik/Tom, 2026-04-14](https://morpho-org.slack.com/archives/) _(update with actual deep link)_
- [GitHub repo: morpho-org/consumer-sdk](https://github.com/morpho-org/consumer-sdk)
- [npm: @morpho-org/consumer-sdk](https://www.npmjs.com/package/@morpho-org/consumer-sdk)
- Linear epic: _(add link when created)_
- Cantina AI scan dashboard: _(add link when initiated)_
- Tether WDK integration ticket: _(add link)_
