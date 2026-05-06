# release

Add a changeset to the current branch so that, when the PR merges to `main` (or `next`), CI versions and publishes the affected packages.

## Usage

```
/release
```

## Background

This monorepo releases via [Changesets](https://github.com/changesets/changesets). Releases are automated; contributors only author changesets:

- A PR with package changes adds one or more `.changeset/*.md` files describing the bump per package.
- After merge to `main` or `next`, `.github/workflows/version-pr.yml` runs `pnpm run version` and opens a `changeset-release/<branch>` PR with the version bumps.
- Merging that release PR triggers `.github/workflows/publish.yml`, which runs `pnpm release` to publish each newly-versioned package to npm (`latest` from `main`, `next` from `next`).

You never bump `package.json`, tag, or push directly. The changeset is the only artifact you produce.

See `CONTRIBUTING.md` ("Changesets" section) for the source of truth.

## Instructions

You are helping the user add a changeset for the changes on their current branch.

There are two situations to handle:

- **Branch mode** — the user is on a feature branch with package changes that haven't merged yet. Diff vs. the PR's base branch.
- **Retroactive mode** — the user is on `main`/`next` (or a fresh branch from it) because earlier PRs merged without changesets, and now they want to publish the accumulated changes. Diff each package vs. its last release tag.

### Step 1: Identify Changed Packages

Resolve the PR's base branch first — this repo releases from both `main` and `next`, so always diff against the actual target, not a hardcoded `main`:

```bash
BASE_BRANCH=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null \
  || gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
git fetch origin "$BASE_BRANCH"
```

Determine whether the current branch carries any commits ahead of the base:

```bash
ahead=$(git rev-list --count "origin/$BASE_BRANCH..HEAD")
```

#### Step 1a: Branch mode (`ahead > 0`)

List packages under `packages/*` whose source changed vs. the base:

```bash
git diff --name-only "origin/$BASE_BRANCH...HEAD" -- 'packages/*' | awk -F/ '{print $2}' | sort -u
```

For each candidate, ignore changes that don't affect published output (tests, fixtures, internal docs). Skim the diff:

```bash
git diff "origin/$BASE_BRANCH...HEAD" -- packages/<name>
```

If no package has publishable changes, this is a docs/chore PR — go to Step 4 (empty changeset).

#### Step 1b: Retroactive mode (`ahead == 0`)

The branch has no source diff vs. the base, so the publishable changes already merged. List packages with unreleased source commits since their last release tag:

```bash
for dir in packages/*/; do
  pkg=$(basename "$dir")
  [ -d "${dir}src" ] || continue
  private=$(node -p "require('./${dir}package.json').private || false" 2>/dev/null)
  [ "$private" = "true" ] && continue
  last_tag=$(git tag --list "@morpho-org/${pkg}-v*" --sort=-v:refname | head -1)
  range="origin/$BASE_BRANCH"
  [ -n "$last_tag" ] && range="${last_tag}..origin/$BASE_BRANCH"
  count=$(git log --oneline "$range" -- "${dir}src" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" != "0" ]; then
    echo "$pkg ($count commits since ${last_tag:-import})"
  fi
done
```

For each candidate, inspect the unreleased commits to pick the smallest applicable bump (Step 2):

```bash
git log --oneline "${last_tag}..origin/$BASE_BRANCH" -- packages/<name>/src
```

A `!` in a commit's conventional-commit type (e.g. `refactor(foo)!:`) signals a breaking change → `major`. Any `feat:` → at least `minor`. Otherwise `patch`.

If no package has unreleased commits, there's nothing to release — stop and tell the user.

For retroactive mode you'll also need a working branch — `/release` on `main` itself can't open a PR. Create one before Step 5:

```bash
git switch -c release/<short-slug>
```

### Step 2: Choose the Bump Per Package

For each affected package, pick the smallest semver bump that describes the public impact:

| Bump    | When to use                                                        |
| ------- | ------------------------------------------------------------------ |
| `patch` | Bug fixes, perf improvements, internal refactors, dep bumps        |
| `minor` | New backwards-compatible APIs, exports, or behavior                |
| `major` | Breaking changes to types or runtime behavior of the public API    |

Rules of thumb specific to this repo:

- Type-only narrowing of an exported signature is breaking → `major`.
- Adding a new export or a new optional parameter → `minor`.
- Loosening an internal guard or fixing accounting → `patch`.
- A change that only touches `test/`, `examples/`, or non-published files → no changeset needed for that package; if no package needs a release, use an empty changeset.

If multiple packages are affected, list every one with its own bump (changesets supports this in a single file).

### Step 3: Present the Plan

Before writing the file, show the user:

1. **Affected packages** — `@morpho-org/<name>` for each
2. **Proposed bump per package**
3. **Summary line** — one or two sentences describing the user-facing impact (this becomes the changelog entry consumed by Changesets)

Ask the user to confirm or adjust bumps and wording.

### Step 4: Write the Changeset

Use `pnpm changeset` (interactive) when the user prefers the prompt, or write the file directly when running non-interactively.

**Direct file form** (write to `.changeset/<short-kebab-name>.md`):

```markdown
---
"@morpho-org/<package-a>": <patch|minor|major>
"@morpho-org/<package-b>": <patch|minor|major>
---

<One-or-two-sentence summary of the user-facing change. Imperative mood,
no trailing period required, mirror the style of merged changesets.>
```

For docs/chore-only PRs, write an empty changeset:

```markdown
---
---

<Short summary of the change for traceability, even though no package is bumped.>
```

(Equivalent to `pnpm changeset --empty`.)

The filename should be a short kebab-case slug derived from the change (e.g. `fix-permit-domain-validation.md`). Avoid auto-generated random names — they make `git log` harder to read.

### Step 5: Commit With the Source Change

Stage the changeset alongside the source diff and commit. Do **not** edit `package.json`, do **not** add `CHANGELOG.md` entries (the repo is configured with `"changelog": false`), and do **not** push to the `changeset-release/*` branch — that's CI's job.

```bash
git add .changeset/<filename>.md <source files>
git commit -m "<conventional-commit message matching the change>"
```

In branch mode, push the new commit on the existing branch (or follow up with `/pr-create` if no PR is open). In retroactive mode, push the working branch you created in Step 1b and open a PR back to the base.

### Step 6: Final Output

Tell the user:

- The changeset file written and the bump per package
- That CI will open a `changeset-release/<base>` PR after merge, and that merging that PR is what triggers publish
- A reminder to verify the bump is correct on the version PR before merging it

### Important Notes

- **Never** bump `version` in any `package.json` manually; `pnpm run version` does this on the release PR.
- **Never** add or edit `CHANGELOG.md` files inside packages; this repo doesn't track them.
- If the branch targets `next`, the same flow applies — Changesets handles prerelease mode automatically as long as `.changeset/pre.json` is present on `next`.
- If you see `.changeset/pre.json` while working from `main`, stop and surface it to the user; CI will refuse to publish until `pnpm changeset pre exit` is committed.
- Internal-dependency bumps (one package depends on another) are propagated automatically as `patch` (`updateInternalDependencies: "patch"` in `.changeset/config.json`); you don't need to list downstream packages explicitly.
