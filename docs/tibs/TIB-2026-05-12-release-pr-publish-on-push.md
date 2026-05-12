# TIB-2026-05-12: Release PR publish on push

| Field      | Value     |
| ---------- | --------- |
| **Status** | Proposed  |
| **Date**   | 2026-05-12 |
| **Author** | @rubilmax |
| **Scope**  | Repo-wide |

---

## Context

Package releases are driven by Changesets, but branch pushes need a deterministic two-step lifecycle: feature PRs merged to `main` or `next` should create or refresh a release PR, and merging that release PR should publish npm packages and GitHub Releases immediately.

## Goals / Non-Goals

**Goals**

- On every push to `main` or `next`, run lint, build, and tests before release work.
- If pending changesets exist, open a release PR for that base branch or update the existing one.
- If no pending changesets exist, publish unpublished package versions, push package tags, and create one GitHub Release per published package.
- Serialize release work per branch without cancelling in-flight publishes.

**Non-Goals**

- Releasing from branches other than `main` or `next`.
- Publishing before the generated release PR is merged.
- Replacing Changesets or npm trusted publishing.

## Proposed Solution

Use `.github/workflows/push.yml` as the only release entrypoint. All pushes run the normal checks. For `main` and `next`, the workflow then calls `version-pr.yml` and `publish.yml`.

`version-pr.yml` detects pending `.changeset/*.md` files. If any exist, it enters prerelease mode for `next` when needed, refuses prerelease mode on `main`, runs `pnpm run version`, force-pushes `changeset-release/<base>` with lease protection, and opens or updates the `chore: version packages (<base>)` PR for that release branch.

`publish.yml` intentionally skips while pending changesets still exist. After the release PR is merged, the next push has consumed changesets and generated package versions/changelogs, so publish runs `pnpm release --tag latest` for `main` or `pnpm release --tag next` for `next`. It records tags created by Changesets, pushes them atomically, and creates or updates one GitHub Release per published package from the generated package changelog section. `next` GitHub Releases are marked prerelease.

Concurrency is branch-scoped. Feature-branch push runs can be cancelled by newer pushes. `main` and `next` runs are not cancelled, because interrupting a publish after npm succeeds but before tags or GitHub Releases are written would leave a partial release. The reusable `version-pr` and `publish` workflows serialize per branch, so rapid merges produce ordered runs: newer feature merges refresh the same release PR, while release-PR merge publishes remain isolated.

## Considered Alternatives

### Close and Reopen Release PRs

Close any open release PR and open a new one every time `main` or `next` receives new changesets.

**Why rejected:** it creates avoidable PR churn, loses review/comment continuity, and makes release automation noisier. Updating the single branch-scoped release PR still refreshes the diff to include newer changesets.

### Scheduled Release Sweeper

Create or publish releases from a cron workflow.

**Why rejected:** it delays both release PR creation and publishing after a release PR merge. Push-triggered release work gives deterministic feedback at the event that matters.

### Cancel Older `main` / `next` Runs

Use `cancel-in-progress: true` for all push workflows.

**Why rejected:** cancellation is safe before publish, but unsafe once npm publishing may have started. Serial non-cancelled branch runs trade extra CI minutes for recoverable release state.

## Security

The version job uses a GitHub App token scoped to contents and pull-request writes. The publish job keeps npm trusted publishing through `id-token: write`. Versioning commits are allowlisted to package manifests, generated package changelogs, consumed changesets, and `.changeset/pre.json`; unexpected generated files fail the job.
