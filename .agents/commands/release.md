# release

Prepare and open a release PR that, once merged to `main`, triggers npm publish via CI.

## Usage

```
/release
```

## Instructions

You are helping the user prepare a release. The workflow analyzes changes since the last published version, bumps the version in `package.json`, and opens a PR on a `chore/release-v<version>` branch. Merging the PR to `main` triggers CI to publish on npm.

### Step 1: Switch to main and Validate Working Tree

**Hard requirement:** Releases MUST always be based on the latest `main`. Never release from a feature branch or a stale local main.

First, switch to `main` and pull the latest changes. If either command fails, **stop immediately** and report the error to the user:

```bash
git checkout main && git pull origin main
```

Then verify you are on `main`:

```bash
git branch --show-current
```

If the output is not `main`, **abort** and inform the user.

Then check for uncommitted changes:

```bash
git status --porcelain
```

If output is non-empty, warn the user and ask whether to proceed or abort.

### Step 2: Identify the Last Release

Fetch tags from the remote first to ensure the local clone is up to date:

```bash
git fetch --tags
```

Then resolve the latest version tag:

```bash
git tag --sort=-version:refname | head -1
```

Store the result as `$LAST_TAG`. Read the current version from `package.json` → `version` field.

**Bootstrap (no tags exist):** If `git tag` returns nothing, this is the first release.
Set `$LAST_TAG` to empty and continue — Step 3 will use the full commit history.

### Step 3: Collect Commits Since Last Release

If `$LAST_TAG` is set:

```bash
git log $LAST_TAG..HEAD --oneline --no-merges
```

If `$LAST_TAG` is empty (bootstrap / first release), list all commits on the current branch:

```bash
git log HEAD --oneline --no-merges
```

If there are zero commits, inform the user there is nothing to release and stop.

### Step 4: Analyze and Categorize Changes

Read each commit message. Classify using conventional commit prefixes:

| Prefix                              | Category      | Bump     |
| ----------------------------------- | ------------- | -------- |
| `feat`                              | Feature       | minor    |
| `fix`                               | Bug fix       | patch    |
| `perf`                              | Performance   | patch    |
| `refactor`                          | Refactor      | patch    |
| `docs`                              | Documentation | — (skip) |
| `chore`                             | Chore         | — (skip) |
| `test`                              | Test          | — (skip) |
| `BREAKING CHANGE` or `!` after type | Breaking      | major    |

Rules for determining the bump:

- If ANY commit is a breaking change → `major`
- Else if ANY commit is `feat` → `minor`
- Else → `patch`
- If only `docs`/`chore`/`test` commits exist, ask the user if they still want to release (default: no).

Also read the diff for each non-trivial commit to write an accurate summary:

```bash
git diff $LAST_TAG..HEAD --stat       # when $LAST_TAG is set
git diff --stat $(git rev-list --max-parents=0 HEAD)..HEAD  # bootstrap: diff from root commit
```

### Step 5: Present the Release Plan

Before proceeding, present the user with:

1. **Commits included** — list of commits grouped by category
2. **Proposed bump** — patch / minor / major
3. **New version** — computed from current version + bump
4. **Changelog summary** — the description that will go in the PR body

Ask the user to confirm or adjust (e.g., override bump level, edit summary).

### Step 6: Bump Version in package.json

Use `npm version <bump> --no-git-tag-version` to update `package.json` (and `package-lock.json` if present) without creating a git tag or commit:

```bash
npm version <patch|minor|major> --no-git-tag-version
```

Verify the version was updated correctly by reading `package.json`.

### Step 7: Run Validation

```bash
pnpm lint && pnpm build
```

Both must pass. Fix any issues before continuing.

### Step 8: Update CHANGELOG.md

Prepend a new entry to `CHANGELOG.md` following the existing format:

```markdown
## <new-version>

### Minor Changes (if any feat commits)

- <commit-hash>: <Description of the feature>

### Patch Changes (if any fix/perf/refactor commits)

- <commit-hash>: <Description of the fix>
```

Write accurate, detailed descriptions by reading the diffs. Match the style of existing entries.

### Step 9: Create Release Branch and PR

```bash
git checkout -b chore/release-v<new-version>
git add package.json CHANGELOG.md
git commit -m "chore(release): v<new-version>"
git push -u origin chore/release-v<new-version>
```

Then create the PR:

```bash
gh pr create --base main --title "chore(release): v<new-version>" --body "$(cat <<'EOF'
## Release v<new-version>

### Changes since v<old-version> (or "Initial release" if bootstrap)

#### Features
- ...

#### Bug Fixes
- ...

#### Other
- ...

### Bump
`<bump>` — <old-version> → <new-version>
EOF
)"
```

### Step 10: Final Output

Return to the user:

- Link to the created PR
- Summary of what was included
- Reminder: merging this PR to `main` will trigger CI → git tag → npm publish

### Important Notes

- Never force-push or push directly to `main`.
- The release workflow in CI handles creating the git tag and publishing to npm when the release PR is merged.
- Always run `pnpm lint && pnpm build` before committing.
