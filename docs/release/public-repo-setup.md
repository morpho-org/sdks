# Public repository setup (morpho-org/sdks)

Admin runbook for the release split ([SDK-1322](https://linear.app/morpho-labs/issue/SDK-1322)): `morpho-org/sdks-internal` is where development happens, and `morpho-org/sdks` only receives release snapshots and publishes them. This file stays private (it is not in the snapshot allowlist).

**Agents don't apply any of this.** A GitHub org admin and an npm owner of the `@morpho-org` scope apply each step by hand and tick it off.

The payloads in [`scripts/release/public-repo-config/`](../../scripts/release/public-repo-config/) are GitHub REST API bodies. Commands below use `gh api` as an admin; the web UI gives the same result.

```bash
REPO=morpho-org/sdks
CONFIG=scripts/release/public-repo-config
```

## 1. Repository

- Settings → General → Pull Requests: allow **squash merging only** and **auto-merge**. The sync App enables auto-merge on its `sync/main` PR, and the squash message carries `Source-Commit` and `Public-Tree`.
- Settings → General: **automatically delete head branches**.
- Settings → Actions → General:
  - **Allow `morpho-org` actions and reusable workflows, plus these**: `actions/*`, `pnpm/action-setup@*`. Every action is pinned by SHA in the workflows.
  - **Workflow permissions: read repository contents**. Leave "Allow GitHub Actions to create and approve pull requests" off.
  - **Fork pull request workflows: require approval for all external contributors.** `ci.yml` is safe for forks (no secrets, read-only token), but it still runs their code.
- Collaborators and teams: **no human gets `write` or `maintain`**; admins only. A human with `write` could create a `@morpho-org/*` tag before `release.yml` does, and it would then skip it. Contributors open PRs from forks.
- Secrets and variables: **none** at repository level. Check that no org secret or variable is shared with `morpho-org/sdks`.

## 2. `main` ruleset A, "only the bot"

Only the sync App can move `main`. Signed commits are required by ruleset B, which the App can't bypass; squash merges made through GitHub are signed by GitHub.

1. Find the sync App's ID (org Settings → GitHub Apps → the sync App → App ID).
2. Replace `"actor_id": 0` in `ruleset-main-only-the-bot.json` with that ID. It must be the only bypass actor; no team, role or deploy key.
3. Create it:

   ```bash
   gh api -X POST "repos/$REPO/rulesets" --input "$CONFIG/ruleset-main-only-the-bot.json"
   ```

Rules: restrict updates. Signed commits, force pushes and deletions are enforced in ruleset B, which nobody can bypass, so a leaked App key can't rewrite or delete `main`.

## 3. `main` ruleset B, "always checked"

Nobody, including the App and admins, gets to `main` without a pull request on an up-to-date branch with `ci` passing.

```bash
gh api -X POST "repos/$REPO/rulesets" --input "$CONFIG/ruleset-main-always-checked.json"
```

Rules: block force pushes, restrict deletions, require signed commits, pull request required (0 approvals: the content was reviewed in `sdks-internal`, and the App merges), squash only, required status check `ci` from GitHub Actions (integration 15368), **require branches to be up to date** (`strict_required_status_checks_policy`). Bypass list is empty.

The `ci` check is the `ci` job of `.github/workflows/ci.yml`. Don't rename that job without updating this ruleset.

## 4. Tag ruleset for `@morpho-org/*`

Release tags (`@morpho-org/<package>-v<version>`) can't be moved or deleted once `release.yml` pushes them.

**Decision: keep the existing tag format `@morpho-org/<package>-vX.Y.Z`.** Every existing public tag and the `release.yml` tag step use it. Switching to `@morpho-org/<package>@x.y.z` would create a second tag for each version already released. SDK-1322 is being corrected to match.

```bash
gh api -X POST "repos/$REPO/rulesets" --input "$CONFIG/ruleset-package-tags.json"
```

Rules: restrict updates, block force pushes, restrict deletions; no bypass. Creation stays open because `release.yml` creates the tags with `GITHUB_TOKEN`; section 1 keeps humans from creating them.

## 5. Environment `npm`

```bash
gh api -X PUT "repos/$REPO/environments/npm" --input "$CONFIG/environment-npm.json"
gh api -X POST "repos/$REPO/environments/npm/deployment-branch-policies" --input "$CONFIG/environment-npm-branch-policy.json"
```

- Deployment branches: **`main` only** (custom policy, branch `main`). No tags.
- Secrets and variables: **none**. Publishing uses OIDC only.
- Admins can't bypass. The API can't set this and a new environment may allow it, so after the `PUT` open Settings → Environments → `npm`, untick "Allow administrators to bypass configured protection rules" and save. Check it:

  ```bash
  gh api "repos/$REPO/environments/npm" --jq .can_admins_bypass   # must print false
  ```

**Required reviewers: open admin decision, not yet made.** Decide before cutover. `environment-npm.json` has no reviewers; add them before the `PUT` if you choose reviewers.

| | No reviewers (payload default) | Required reviewers |
| --- | --- | --- |
| Release | Automatic once `ci` passes and the App merges | Waits until a reviewer approves the `publish` job |
| Protects against | Relies on the internal gates, the rulesets and the App key | Also a compromised sync App or App key: nothing reaches npm without a human |
| Cost | None | A human per release; a queued release blocks later ones (`concurrency: release`) until approved |

To add reviewers (for example the SDK maintainers team, with `prevent_self_review: false` since the App opens the PR), set `"reviewers": [{ "type": "Team", "id": <team-id> }]` in `environment-npm.json` and rerun the `PUT`.

## 6. Move each package's npm trusted publisher

Today each package trusts `morpho-org/sdks` + `push.yml` (which calls the reusable `publish.yml`) + environment `prod`; `npm trust list` shows the exact entry. It must trust `morpho-org/sdks` + `release.yml` + environment `npm`. npm allows one trusted publisher per package, so this is revoke then create. Between the two, the package can't be published from CI, so do it during the freeze (section 10, step 1).

Requirements: npm CLI 11.15.0 or newer (`npm -v`), logged in (`npm login`) as an owner of each package, with 2FA enabled on the account. Granular tokens that bypass 2FA don't work for `npm trust`.

Published packages (from `node scripts/publish/pack.ts --tags` on `main`; rerun it and add any new package):

```text
@morpho-org/blue-sdk
@morpho-org/blue-sdk-viem
@morpho-org/evm-simulation
@morpho-org/liquidity-sdk-viem
@morpho-org/midnight-sdk
@morpho-org/morpho-sdk
@morpho-org/morpho-test
@morpho-org/morpho-ts
@morpho-org/test
@morpho-org/wdk-protocol-lending-morpho-evm
```

For each package:

```bash
PKG=@morpho-org/blue-sdk
npm trust list "$PKG"                    # note the id of the single entry (push.yml/prod today)
npm trust revoke "$PKG" --id=<id>
npm trust github "$PKG" --repo morpho-org/sdks --file release.yml --env npm --allow-publish --yes
npm trust list "$PKG"                    # exactly one entry: morpho-org/sdks, release.yml, npm
```

The whole list:

```bash
for PKG in \
  @morpho-org/blue-sdk @morpho-org/blue-sdk-viem @morpho-org/evm-simulation \
  @morpho-org/liquidity-sdk-viem @morpho-org/midnight-sdk @morpho-org/morpho-sdk \
  @morpho-org/morpho-test @morpho-org/morpho-ts @morpho-org/test \
  @morpho-org/wdk-protocol-lending-morpho-evm; do
  echo "== $PKG"
  npm trust list "$PKG" --json
done
# Then, per package, revoke the listed id and create the new entry as above.
```

Don't grant `--allow-stage-publish`; `release.yml` doesn't use it.

Check on npmjs.com (package → Settings → Trusted Publisher) that each package shows `morpho-org/sdks`, workflow `release.yml`, environment `npm`.

## 7. Disable token publishing on npm

Once a package has its trusted publisher, set its publishing access so tokens can't publish it:

- npmjs.com → package → Settings → Publishing access → **Require two-factor authentication and disallow tokens** → Update. Trusted publishing keeps working; classic and granular tokens can't publish.
- Revoke any remaining automation or publish tokens for `@morpho-org` (npmjs.com → Access Tokens of each owner account), and delete any `NPM_TOKEN` secret left in either repository or the org.

## 8. GitHub Apps installed on `morpho-org/sdks`

Org Settings → GitHub Apps → Installed GitHub Apps. For each App installed on **all repositories**, decide whether it needs `morpho-org/sdks`:

- Any App with `contents: write`, `pull_requests: write`, `administration`, `workflows` or `actions: write` on the public repository can push a branch, open or merge a PR, or edit workflows. Exclude it from `morpho-org/sdks` (switch it to "Only select repositories") unless it is the sync App.
- Read-only Apps (code scanning, dashboards) can stay.
- The sync App is installed on `morpho-org/sdks` only, with `contents: write` and `pull_requests: write`, and nothing else.

Record what was removed in the SDK-1322 ticket.

## 9. `sdks-internal` can never publish

Target state after cutover (section 10, step 7). Until then `sdks-internal` still has the old `.github/workflows/publish.yml`.

- npm: no trusted publisher names `morpho-org/sdks-internal` (section 6 lists every package's single entry), and no npm token exists in `sdks-internal` secrets, its environments or org secrets shared with it.
- Workflows: `sdks-internal` has no workflow that runs `npm publish`, and its `public/.github/workflows/release.yml` never runs there (GitHub only runs `.github/workflows/`). `release.yml` also checks `github.repository == 'morpho-org/sdks'`.
- To get there, delete `.github/workflows/publish.yml` from `sdks-internal` (its `github-releases` job needs `publish`, so the whole file goes), remove its call from `push.yml`, and delete the `prod` environment (section 10, step 7).
- Check: `gh api repos/morpho-org/sdks-internal/environments --jq '.environments[].name'` lists no publishing environment, and in `sdks-internal` `grep -rnE '(npm|pnpm) publish( |$)' .github/workflows/*.yml | grep -vE '^[^:]*:[0-9]*:\s*#'` (publish commands in workflow YAML, comments excluded) finds nothing. Before cutover it finds only `publish.yml`.

## 10. Cutover order

1. **Freeze development on `morpho-org/sdks`.** No merges to its `main`. Pause the changesets "Version Packages" PR there.
2. **Final sync of `sdks-internal` from `sdks`**: mirror `main`, branches, tags and notes once more, and check `git rev-parse main` matches on both.
3. **Move developers to `sdks-internal`.** Open PRs move or get recreated there; `sdks` stops taking development PRs.
4. **Apply sections 1–8 on `morpho-org/sdks`** (trusted publishers last, right before step 5).
5. **First full snapshot PR replaces the public tree.** The sync job opens `sync/main` with the complete allowlisted tree; `ci` runs, the App merges, and `release.yml` runs. Everything already on npm is skipped; tags and GitHub Releases that already exist are left alone.
6. Watch that first run: `publish` should report every version as already on npm (or publish only new ones), and `release` should create nothing unexpected.
7. **Remove publishing from `sdks-internal`.** Delete `.github/workflows/publish.yml` entirely (its `publish` job with environment `prod`, and the `github-releases` job that needs it) and its call from `push.yml`, delete the `prod` environment, then run the section 9 checks.

The existing git history of `morpho-org/sdks` stays: it is already public. The snapshot PR adds a commit on top of it; don't rewrite or force-push `main`.
