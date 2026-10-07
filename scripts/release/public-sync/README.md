# Public sync

`sync.ts` turns a verified release artifact into the single open PR on public
[morpho-org/sdks](https://github.com/morpho-org/sdks) (branch `sync/main`), with squash
auto-merge armed so it lands once public CI passes:

```text
Release <pkg@ver, ...>

Source-Commit: <internal release commit>
Public-Tree: <git tree hash of the public tree>
```

It runs in the `sync` job of `.github/workflows/public-snapshot.yml`, on release commits
pushed to internal `main` only. That job installs nothing: it runs Node built-ins and
repository scripts, re-verifies the artifact against git, refuses enabled git hooks, and only
then mints the App token.

- **Ordering.** The release must descend from the `Source-Commit` of public `main` and of an
  open sync PR (`git merge-base --is-ancestor` on full history). There is no override; a root
  commit on `main` with no trailer is the only exception. Public `main` gets its first trailer
  from the bootstrap commit (setup step 1). An open sync PR
  whose head has no trailer fails the sync.
- **Idempotency.** No commit or branch update is made when public `main`, or the open sync PR
  on top of the current `main`, already has the tree hash. The sync only re-arms squash
  auto-merge with the release message when it isn't armed that way. If GitHub can already merge that PR
  (`mergeStateStatus` `CLEAN`, `UNSTABLE` or `HAS_HOOKS`), auto-merge can't be armed, so the sync squash-merges it
  directly (`mergePullRequest`) with the release message.
- **Commits.** Built on scratch branch `sync/build` with `createCommitOnBranch`, which GitHub
  signs, in batches of at most 25 MB of contents. Every commit must show `verified`, and the
  last one must have the expected tree, before `sync/main` moves. Only `100644` files can be
  written; another mode fails the sync.
- **Supersede.** A newer release disarms auto-merge, force-moves `sync/main` and retitles the
  same PR. More than one open sync PR fails the sync.

`alert.ts` pages on a failed sync (`alert` job) and on a sync PR open longer than
`PUBLIC_SYNC_MAX_PR_AGE_MINUTES` (default 60; `public-sync-watch.yml`, every 15 minutes). The
same watch pages while the latest public `release.yml` run on `main` failed, until a run
succeeds, since the merged release may then be missing from npm. It also pages a `watch-failed`
alert when it can't check (bad threshold, missing token, API error).

## Setup (org admin)

1. **Seed public `main` with the bootstrap commit first**, before the App is installed
   (step 3), the rulesets are enabled (step 5) and the first sync runs: once ruleset A and B
   are on, a direct push to `main` is rejected. `sync.ts` fails on a repository with no
   `main`, and accepts a tip without `Source-Commit` only if it is a root commit. Public
   `morpho-org/sdks` keeps its history, so an admin pushes one empty (`--allow-empty`), signed
   commit on top of it with `Source-Commit: <internal commit the public tree was cut from>`:
   after the final mirror, the tip of `main`, the same SHA on both repositories. Full steps:
   [docs/release/public-repo-setup.md](../../../docs/release/public-repo-setup.md) section 10,
   step 3.
2. **Create the GitHub App** (org settings → Developer settings → GitHub Apps → New), owned by
   morpho-org: name e.g. `morpho-sdks-public-sync`, webhook off, "Only on this account".
   Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**,
   **Workflows: Read and write** (Metadata: Read is implied). Nothing else, no organization or
   account permissions. Workflows write is needed because the public tree ships
   `.github/workflows/`, and GitHub rejects an App commit there without it. This App is the only
   holder of it on `morpho-org/sdks`, and a workflow change still lands only through the sync PR,
   which ruleset B's required `ci` check gates like every other merge.
3. **Install it on public `morpho-org/sdks` only** ("Only select repositories").
4. **Generate a private key**, then in internal `morpho-org/sdks-internal` → Settings →
   Environments create `public-sync`: deployment branches "Selected branches" = `main`, and
   environment secrets `PUBLIC_SYNC_APP_ID` (the App ID) and `PUBLIC_SYNC_APP_PRIVATE_KEY`
   (the `.pem` contents). Delete the downloaded key. Never add them as repository secrets.
5. **Rulesets** ([docs/release/public-repo-setup.md](../../../docs/release/public-repo-setup.md)
   sections 2 and 3). The App is the only bypass actor of ruleset A, which just restricts who
   may update `main`. Ruleset B (pull request, squash, `ci` passing on an up-to-date branch)
   has **no bypass actors**, the App included, so the App can't land anything on `main`
   without public CI. No ruleset covers `sync/*`: with Contents write the App creates and
   force-updates `sync/main` and its scratch branch `sync/build`, so don't add a ruleset on
   `sync/*` that blocks force pushes or requires pull requests. Enable auto-merge and squash
   merges on the public repository. Then check that ruleset A lists only the App as bypass
   actor and ruleset B lists none.
6. **Alerts** (TBD: channel and owner): create environment `public-sync-alerts` (branches:
   `main`) with secret `PUBLIC_SYNC_ALERT_WEBHOOK_URL` (incoming webhook of the alert
   channel), and set repository variables `PUBLIC_SYNC_ALERT_OWNER` (mention, e.g.
   `<!subteam^ID>`) and optionally `PUBLIC_SYNC_MAX_PR_AGE_MINUTES`. Until then, alerts only
   fail their job.
