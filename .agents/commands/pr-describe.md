# pr-describe

Generate a PR description for the current branch.

## Usage

```
/pr-describe
```

## Instructions

You are helping the user generate a PR description. Derive all information from the current changes - do not ask the user any questions.

### Step 1: Check Current Branch, Determine Base, and Analyze Changes

First, check what branch the user is on and determine the base branch:

```bash
git rev-parse --abbrev-ref HEAD
gh pr view --json number,title,url,baseRefName 2>/dev/null || echo "No PR exists"
```

Determine the base branch to diff against:

- If a PR already exists, use `baseRefName` from the PR view output.
- If no PR exists, fall back to the repo's default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`

Then diff against the resolved base branch:

```bash
git diff <base-branch> --stat
git diff <base-branch>
```

Analyze the changes to understand:

- What type of change this is (feat, fix, or chore)
- What the change does (for the PR title and description)

### Step 2: Generate PR Content

Derive all PR content from the changes:

- **Title**: Use conventional commits format: `<type>: <short description>` — no emoji in the title.
  - Examples: `feat: add dark mode toggle`, `fix: resolve login redirect issue`, `chore: update dependencies`

**PR Body** — High-level, concise, precise. No file-level details. Every word must earn its place.

````markdown
## Motivation

[WHY in one or two sentences — the problem or need, not the implementation]

## Solution

[WHAT changed at a conceptual level — no file names, no line-by-line commentary]

## What's New (feat PRs only)

[Include ONLY for `feat` PRs that introduce new features.
Do NOT use this section for refactors, fixes, or internal changes.

Use colored circle badges (🟣🔴🟤🟠🟡🔵🟢) ONLY when presenting new features.
Pick a different color per row. Keep descriptions ultra-short.]

|     | Feature  | Description                                            |
| --- | -------- | ------------------------------------------------------ |
| 🟣  | deposit  | Route deposits through bundler3 via general adapter    |
| 🔵  | withdraw | Direct vault withdrawal with share-to-asset conversion |

[Additionally, present each new function with a simple summary table
to give reviewers a quick overview of signatures and purpose:]

| Function            | Parameters                         | Returns       | Purpose                                    |
| ------------------- | ---------------------------------- | ------------- | ------------------------------------------ |
| `vaultV1Deposit()`  | `client, { vault, assets, owner }` | `Transaction` | Build a deposit tx routed through bundler3 |
| `vaultV1Withdraw()` | `client, { vault, assets, owner }` | `Transaction` | Build a direct vault withdrawal tx         |

## Architecture (optional)

[Include ONLY if the change introduces or modifies architectural relationships.

- If the PR adds a **new transaction feature** (deposit, withdraw, redeem, etc.),
  create a **transactional flow** mermaid diagram showing the call chain from
  user entry point to on-chain execution:

```mermaid
graph LR
  User -->|"deposit()"| Client
  Client --> VaultEntity
  VaultEntity --> DepositAction
  DepositAction -->|"bundle"| GeneralAdapter
  GeneralAdapter --> Bundler3
  Bundler3 -->|"tx"| Vault
```

- If the PR adds **non-transactional features or modules**, create a
  **component architecture** mermaid diagram showing how the new pieces
  relate to existing ones:

```mermaid
graph TD
  NewModule --> ExistingLayerA
  NewModule --> ExistingLayerB
  ExistingLayerA --> SharedDependency
```

Pick whichever style best represents the change. Do NOT include both unless
the PR genuinely covers both cases.]

<!--
Always use `graph LR` for transaction flows (left-to-right = temporal order)
and `graph TD` for architecture diagrams (top-down = dependency direction).
````

-->

## DevEx (optional)

[Include ONLY if the change affects developer usage: new APIs, changed signatures,
new CLI flags, migration steps, etc. Present as a short bullet list.]

### Writing Rules

- Stay high-level: describe intent and concepts, not individual file changes.
- Fewer words = better. Cut every word that doesn't add meaning.
- Use the most precise term available — avoid vague fillers.
- Never list modified files in the description.

### Step 3: Output and Offer to Update

Present the description in a format that's easy to copy, then offer to update the PR:

If a PR exists:

- Use `gh pr edit <number> --title "<title>" --body "<body>"` to update it

If no PR exists:

- Offer to create one with `gh pr create`

### Step 4: Confirm Success

After the PR is updated/created, output:

1. The PR URL (clickable)
2. A summary of what was done:
   - Branch name
   - PR title

### Important Notes

- Do NOT ask the user any questions - derive everything from the changes
- Check if a PR exists before deciding whether to create or update
- Always use the PR's actual base branch for diffs (may not be `main`)
