# Workflow security — secret scoping & invariants

> Refines the root [`AGENTS.md`](../../AGENTS.md) for `.github/workflows/`. It **adds detail and must not contradict** the root; [§10](../../AGENTS.md#10-review-automation--cirelease-security) (Review automation & CI/release security) stays the source of truth. This file records the *intended* secret-exposure posture of these workflows so reviewers — human and agentic — enforce the invariants below instead of re-deriving (and re-mis-rating) the threat model on every audit.
>
> This is an inventory of **invariants to enforce**, not an exemption to wave through. A diff that widens a secret's reach is a finding even though the *baseline* posture it departs from is accepted.

## Threat model (read first)

- The repo is **public** and the release pipeline (`push.yml`) triggers on `push` to every branch (`branches: ['**']`, minus the two `changeset-release/*-api-commit-*` staging branches the release helper pushes). GitHub does **not** expose repository secrets to workflow runs from **fork** pull requests, and a fork cannot trigger a `push` on the base repo — so every secret below is reachable only by actors with **write access** (humans + trusted bots). Fork and Dependabot PRs receive no secrets (`claude.yml` gates its secret-bearing run to same-repo, non-fork, non-Dependabot heads).
- Consequently, "a repo-level secret is readable on a branch push" is **not, by itself, a finding**: for a low-sensitivity secret reachable only by write-access actors that is the accepted baseline. What matters is (a) the **sensitivity** of each secret and (b) whether the **scope-narrowing invariants** below still hold.

## Secret inventory & intended scope

| Secret | Reached by | Intended scope | Sensitivity |
|---|---|---|---|
| `MAINNET_RPC_URL`, `BASE_RPC_URL`, `ARBITRUM_RPC_URL` | `test` job (`push.yml` → `test.yml`) | repo-level, **every branch** — no `if` gate | **Low** — provider endpoints, at worst a metered key; no write capability, trivially rotatable |
| `VERSION_APP_ID`, `VERSION_APP_PRIVATE_KEY` | `version-pr` job (`push.yml` → `version-pr.yml`) | **`main`/`next` only**, via `if: github.ref_name == 'main' \|\| github.ref_name == 'next'` | **High** — GitHub App key; `create-github-app-token` mints a `contents: write` / `pull-requests: write` installation token |
| npm publish auth | `publish` job (`publish.yml`) | OIDC trusted publishing — **no stored token**; privileged job carries `environment: prod` | **Critical** — publishes packages under the org identity |
| `ANTHROPIC_SDK_API_KEY` | `claude` job (`claude.yml`) — passed to the SHA-pinned Claude action and to the failure-only log scrubber | repo-level, gated by the job `if`: same-repo, non-draft, non-Dependabot `pull_request` heads, or `@claude` mentions from `OWNER`/`MEMBER`/`COLLABORATOR` (bots fall through to the action's `allowed_bots`); **never fork-exposed** | **Medium** — metered Anthropic API key; no repo write capability, rotatable |

## Invariants — breaking any of these is a finding, not a waiver

- The `version-pr` **and** `publish` jobs keep the `if: github.ref_name == 'main' || github.ref_name == 'next'` gate. Removing or loosening it forwards the write-capable App key (or reaches the publish path) on arbitrary branches → **critical**.
- `VERSION_APP_PRIVATE_KEY` is forwarded only to `version-pr.yml`. Its write-scoped token is minted only after the hook-poisoning precondition checks, and the version commit is created via `createCommitOnBranch` (GitHub-signed). See §10 "Release-commit signing & write-token hardening".
- The `publish` job keeps `environment: prod`, `id-token: write` isolated to that job, and `npm publish --provenance`. Replacing OIDC with a stored `NPM_TOKEN`/PAT, or dropping `--provenance` or `environment: prod`, is a downgrade → **high/critical** (see §10 "Publish-flow integrity").
- The `claude` job keeps its same-repo / non-Dependabot `pull_request` gate and the `OWNER`/`MEMBER`/`COLLABORATOR` author-association gate on comment, review, and issue events. Loosening either widens who can spend `ANTHROPIC_SDK_API_KEY` → **medium**.
- No secret with write, publish, or signing capability is moved into the ungated `test` job — or into any job reachable from a fork-accessible trigger.
- RPC URLs stay `env:`-bound and are never interpolated into a `run:` string. Their every-branch scope is accepted **only** because they are low-sensitivity and write-access-only; a secret that gains write capability must not inherit this posture.
- A new secret name added to any workflow gains a row in the inventory above **in the same PR**.

## Not a finding (de-noise)

- "Repo-level secrets (`*_RPC_URL`) are exposed to every branch push, not environment-gated." Known and accepted: low sensitivity, write-access-only, forks excluded, trivially rotatable. Do not re-file as high/medium — flag only a *regression* of the invariants above. Optional hardening (a GitHub Environment `ci` with a deployment-branch policy for the RPC URLs) is welcome but not required.
