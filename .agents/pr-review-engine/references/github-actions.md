# GitHub Actions hardening — canonical rubric

Security hardening for GitHub Actions workflows: untrusted-input injection,
third-party action pinning, `GITHUB_TOKEN` least-privilege, and secret
handling. Single owner for this concern across the agent set; agents
cross-check this file via the pointer line `Cross-check
\`references/github-actions.md\` when this concern applies.`

Distilled from GitHub's official guide — keep this file in sync with it when
the guidance changes:
<https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions>

## What to harden

- **Script / expression injection.** Untrusted context — `${{ github.event.* }}`,
  `${{ github.head_ref }}`, issue/PR titles, comment bodies, branch names —
  interpolated directly into a `run:` block, `shell:` line, or third-party
  action argument is evaluated by the runner shell before the script runs.
  Bind the value to an `env:` variable first, then reference `$VAR` inside the
  script; or pass it as an action input. Never expand untrusted GitHub-context
  expressions inline in `run:`.
- **Third-party action pinning.** A floating ref (`@main`, `@v4`) lets the
  action's owner — or anyone who compromises it — change the code you run.
  Pin to a **full-length commit SHA** with the human-readable tag in a trailing
  comment: `uses: owner/action@<40-char-sha>  # v4.1.7`. First-party
  `actions/*` and `github/*` may use tags **when** a Dependabot policy bumps
  them (`.github/dependabot.yml`).
- **`GITHUB_TOKEN` / `permissions:` least-privilege.** On classic-permissions
  repos a workflow with no `permissions:` block defaults to write-all. Require
  an explicit top-level (or job-level) block scoped to the **narrowest** set
  the steps use: `contents: read` unless a step writes; `id-token: write` only
  for OIDC / provenance jobs; `pull-requests: write` only for bot-comment jobs.
  Flag `secrets: inherit` passed to reusable workflows — require an explicit
  secret list.
- **Secrets.** Mask any sensitive value that isn't a registered secret with
  `::add-mask::VALUE`. Bind secrets via `env:` so GitHub's log redaction
  applies, then reference `$VAR` — never interpolate `${{ secrets.X }}`
  directly into a shell line (it can land in logs via `echo` / `set -x` /
  error paths). Don't pass secrets to actions that aren't pinned to a SHA, and
  don't store secrets as structured data the runner can't fully redact.
- **`pull_request_target` + untrusted checkout.** This trigger runs with a
  read/write token in the base-repo context; checking out the PR head
  (`actions/checkout` with `ref: …head.sha`) and then building/testing it
  executes attacker code with write-scoped credentials. Flag unless the
  workflow demonstrably never runs the checked-out code.
- **OpenID Connect (OIDC).** Prefer short-lived OIDC tokens
  (`id-token: write` + a cloud-provider auth action) over long-lived cloud
  credentials stored as secrets.
- **Self-hosted runners.** Avoid self-hosted runners on public repos (a fork PR
  can run arbitrary code on persistent infrastructure); prefer ephemeral /
  just-in-time runners when self-hosting is required.
- **CODEOWNERS & auditing.** Workflow directories under CODEOWNERS force review
  on workflow changes; the audit log and dependency graph surface secret
  changes and vulnerable actions.

## Where to flag

| Pattern | Severity |
|---|---|
| Untrusted `${{ github.event.* }}` / `head_ref` interpolated into a `run:` / `shell:` line | **Critical** |
| `pull_request_target` that checks out and runs the PR head | **Critical** |
| `issue_comment` / `pull_request_review_comment` acting on comment text without an ACL gate | **High** |
| Third-party `uses:` pinned to a branch or floating tag instead of a full SHA | **High** |
| New workflow with no `permissions:` block (defaults to write-all) | **High** |
| Over-scoped `permissions:` (`contents: write` / `id-token: write` where unneeded) | **High** |
| `secrets.*` interpolated into a `run:` block instead of bound via `env:` | **High** |
| `secrets: inherit` to a reusable workflow without an explicit list | **Medium** |
| New secret name with no entry in `SECURITY.md` (when the repo documents secrets) | **Medium** |
| Self-hosted runner label on a public-repo workflow | **Medium** (note the fork-PR risk) |

## How to fix

1. **Injection**: rewrite `${{ github.event.X }}` → `env: { VAR: ${{ github.event.X }} }`
   + `$VAR` in `run:`; confirm the script doesn't itself echo `$VAR`.
2. **Pinning**: resolve the floating ref to the full commit SHA of the matching
   tag and add a trailing `# <tag>` comment.
3. **Permissions**: add an explicit `permissions:` block at the narrowest scope
   the steps use; flag for human review if any step needs `write`.
4. **Secrets**: bind via `env:` and reference `$VAR`; mask non-secret sensitive
   values with `::add-mask::`.

## Out of scope

- Release / publish flow, provenance, Changesets — see `release-integrity`.
- Lockfile drift, `.npmrc`, dependency hygiene — see `dependencies`.
- Generic application-code injection (XSS, `eval`, SQL) — see `references/injection.md`.
- Hardcoded secrets in source code — see `references/secrets.md`.

## Consumers

Agents that cross-check this rubric:

- `ci-security` — owns this concern; injection / pinning / permissions / secret
  exposure on `.github/workflows/**` and `.github/actions/**`.
