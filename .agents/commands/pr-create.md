# pr-create

Create a draft PR (and a new branch if needed).

## Usage

```
/pr-create
```

## Instructions

You are helping the user create a draft PR quickly. Derive all information from the current changes - do not ask the user any questions.

### Step 1: Check Current Branch and Analyze Changes

First, resolve the repo's default branch (the PR will target it), then check what branch the user is on and gather context:

```bash
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
git rev-parse --abbrev-ref HEAD
git fetch origin "$DEFAULT_BRANCH"
git diff "origin/$DEFAULT_BRANCH" --stat
git diff "origin/$DEFAULT_BRANCH"
```

Analyze the changes to understand:

- What type of change this is (feat, fix, or chore)
- What the change does (for the PR title and description)

### Step 2A: Create New Branch (if on the default branch)

If `HEAD` is on `$DEFAULT_BRANCH`, create a new branch based on the changes:

1. Derive the **branch type** from the nature of the changes (feat/fix/chore)
2. Derive the **branch name** from what the changes do (kebab-case, e.g., `add-dark-mode`, `fix-login-bug`)

Create and push the branch:

```bash
git checkout -b <type>/<branch-name>
git push -u origin <type>/<branch-name>
```

Then proceed to Step 3.

### Step 2B: Use Existing Branch (if not on the default branch)

If not on `$DEFAULT_BRANCH`, use the current branch:

1. Extract the **branch type** from the branch name prefix (feat/, fix/, chore/)
2. If the branch doesn't follow this convention, infer the type from the changes

Push the branch:

```bash
git push -u origin <branch-name>
```

Then proceed to Step 3.

### Step 3: Commit All Changes

Before creating the PR, review the working tree and commit. First print the status so any unexpected files (`.env*`, `*.key`, `*.pem`, scratch files, lockfile noise) are visible:

```bash
git status --short
```

Stop and surface to the user if anything that looks secret-bearing or out of scope is listed. Otherwise stage tracked modifications and any new files that obviously belong to the change, then commit and push:

```bash
git add -u                                      # tracked modifications
# git add <explicit-new-files>                  # only new files that belong to this change
git commit -m "<type>: <short description>"
git push
```

Avoid blanket `git add -A` — it sweeps up untracked scratch files and is the standard way `.env`, key material, or generated artefacts leak into PRs. Use the same type and description that will be used for the PR title.

### Step 4: Create Draft PR

Derive all PR content from the changes:

- **Title**: Use conventional commits format: `<type>: <short description>`
  - Examples: `feat: add dark mode toggle`, `fix: resolve login redirect issue`, `chore: update dependencies`
- **Base branch**: `$DEFAULT_BRANCH` (resolved in Step 1)
- **Draft**: Yes
- **Assignee**: The current user (use `@me`)
- **Labels**: only attach a label if it already exists on the repo. List the available set with `gh label list -L 200 --json name --jq '.[].name'` and pick the closest match (e.g. `bug` for a fix, `enhancement` for a feat, `dependencies` for a dep bump). If no obvious match exists, skip the `--label` flag — `gh pr create` fails outright on unknown labels.

**PR Body** - Generate content based on the actual changes:

```markdown
## Motivation

[Explain WHY this change is needed based on the code changes]

## Solution

[Describe WHAT was changed and HOW it addresses the motivation]
```

Use the `gh` CLI to create the PR (omit `--label` entirely if no existing repo label fits):

```bash
gh pr create \
  --draft \
  --base "$DEFAULT_BRANCH" \
  --title "<type>: <description>" \
  --body "<body content>" \
  --assignee @me
  # --label <existing-repo-label>   # add only if confirmed to exist
```

### Step 5: Confirm Success

After the PR is created, output:

1. The PR URL (clickable)
2. A summary of what was created:
   - Branch name
   - PR title
   - Label (if one was applied)

Example output:

```
PR created: https://github.com/<owner>/<repo>/pull/<number>

- Branch: feat/add-dark-mode
- Title: feat: add dark mode toggle
- Label: enhancement
```

### Important Notes

- Do NOT ask the user any questions — derive everything from the changes (one exception: pause if `git status` shows unexpected files in Step 3).
- Stage tracked modifications and explicit new files; do not run `git add -A`.
- If on the default branch, create a new branch from HEAD before creating the PR.
- If not on the default branch, use the current branch as-is.
- The PR targets the repo's default branch (`$DEFAULT_BRANCH`).
- Always create as draft.
- Always assign to the current user.
