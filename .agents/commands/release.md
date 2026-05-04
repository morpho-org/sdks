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

### Step 1: Identify Changed Packages

Resolve the PR's base branch first — this repo releases from both `main` and `next`, so always diff against the actual target, not a hardcoded `main`:

```bash
BASE_BRANCH=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null \
  || gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
git fetch origin "$BASE_BRANCH"
```

Determine which packages under `packages/*` have source changes vs. that base:

```bash
git diff --name-only "origin/$BASE_BRANCH...HEAD" -- 'packages/*' | awk -F/ '{print $2}' | sort -u
```

For each candidate package, ignore changes that don't affect published output (tests, fixtures, internal docs). Skim the diff to confirm whether the change is publishable:

```bash
git diff "origin/$BASE_BRANCH...HEAD" -- packages/<name>
```

If no package has publishable changes, this is a docs/chore PR — go to Step 4 (empty changeset).

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

Stage the changeset alongside the source diff and commit. Do **not** create a release branch, do **not** edit `package.json`, do **not** add `CHANGELOG.md` entries (the repo is configured with `"changelog": false`).

```bash
git add .changeset/<filename>.md <source files>
git commit -m "<conventional-commit message matching the change>"
```

If the user already has a PR open, just push the new commit. If not, follow up with `/pr-create`.

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
