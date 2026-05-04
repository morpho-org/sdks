# create-pr

Create a draft PR (and a new branch if needed).

## Usage

```
/create-pr
```

## Instructions

You are helping the user create a draft PR quickly. Derive all information from the current changes - do not ask the user any questions.

### Step 1: Check Current Branch and Analyze Changes

First, check what branch the user is on and gather context:

```bash
git rev-parse --abbrev-ref HEAD
git diff main --stat
git diff main
```

Analyze the changes to understand:

- What type of change this is (feat, fix, or chore)
- What the change does (for the PR title and description)
- How critical the change is (low, medium, high, or critical)

### Step 2A: Create New Branch (if on main)

If on `main`, create a new branch based on the changes:

1. Derive the **branch type** from the nature of the changes (feat/fix/chore)
2. Derive the **branch name** from what the changes do (kebab-case, e.g., `add-dark-mode`, `fix-login-bug`)

Create and push the branch:

```bash
git checkout -b <type>/<branch-name>
git push -u origin <type>/<branch-name>
```

Then proceed to Step 3.

### Step 2B: Use Existing Branch (if not on main)

If not on `main`, use the current branch:

1. Extract the **branch type** from the branch name prefix (feat/, fix/, chore/)
2. If the branch doesn't follow this convention, infer the type from the changes

Push the branch:

```bash
git push -u origin <branch-name>
```

Then proceed to Step 3.

### Step 3: Commit All Changes

Before creating the PR, commit all uncommitted changes (staged and unstaged):

```bash
git add -A
git commit -m "<type>: <short description>"
git push
```

Use the same type and description that will be used for the PR title.

### Step 4: Create Draft PR

Derive all PR content from the changes:

- **Title**: Use conventional commits format: `<type>: <short description>`
  - Examples: `feat: add dark mode toggle`, `fix: resolve login redirect issue`, `chore: update dependencies`
- **Base branch**: `main`
- **Draft**: Yes
- **Assignee**: The current user (use `@me`)
- **Label**: `criticality:<level>` - derive from the scope and risk of the changes:
  - `low`: Minor changes, cosmetic updates, documentation
  - `medium`: Standard feature work, non-critical bug fixes
  - `high`: Changes affecting core functionality, security-related
  - `critical`: Breaking changes, critical security fixes

**PR Body** - Generate content based on the actual changes:

```markdown
## Motivation

[Explain WHY this change is needed based on the code changes]

## Solution

[Describe WHAT was changed and HOW it addresses the motivation]
```

Use the `gh` CLI to create the PR:

```bash
gh pr create \
  --draft \
  --base main \
  --title "<type>: <description>" \
  --body "<body content>" \
  --assignee @me \
  --label "criticality:<level>"
```

### Step 5: Confirm Success

After the PR is created, output:

1. The PR URL (clickable)
2. A summary of what was created:
   - Branch name
   - PR title
   - Criticality label

Example output:

```
PR created: https://github.com/morpho-org/morpho-sdk/pull/123

- Branch: feat/add-dark-mode
- Title: feat: add dark mode toggle
- Label: criticality:low
```

### Important Notes

- Do NOT ask the user any questions - derive everything from the changes
- Always commit ALL uncommitted changes before creating the PR
- If on `main`, create a new branch from HEAD before creating the PR
- If not on `main`, use the current branch as-is
- The PR always targets `main` as the base branch
- Always create as draft
- Always assign to the current user
