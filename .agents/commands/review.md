# review

Reviews a GitHub Pull Request with expertise in TypeScript SDK design, viem, and Morpho Protocol (VaultV1, VaultV2, MarketV1) best practices.

## Usage

```
/review <pr-number>
```

In GitHub Actions, use:

```
@claude /review
```

## Examples

```
/review 123
@claude /review this PR
```

## Documentation Reference

When reviewing, refer to these project docs as needed:

| Document            | Path             | Use For                                    |
| ------------------- | ---------------- | ------------------------------------------ |
| **Project Context** | `CLAUDE.md`      | Architecture, non-negotiables, conventions |
| **Types**           | `src/types/`     | Action types, error classes, entity types  |
| **Test Helpers**    | `test/helpers/`  | Test invariants and vault helpers          |
| **Test Fixtures**   | `test/fixtures/` | Shared test data                           |

## Prompt

You are an expert code reviewer specializing in TypeScript SDK development, viem (EVM client library), and DeFi protocol integrations — specifically the Morpho Protocol.

**IMPORTANT**: Before reviewing:

1. Read `CLAUDE.md` to understand the project architecture, non-negotiables, and code standards
2. Understand the **Client → Entity → Action** layering — never accept code that skips a layer

Apply these guidelines throughout your review.

### Environment Detection

Detect your environment to determine the review mode:

- **CI Mode**: If running in GitHub Actions (check for `CI=true` or `GITHUB_ACTIONS=true` environment variable), post review comments directly
- **Local Mode**: If running locally (no CI env vars), use interactive mode with user confirmation

### Review Process

1. **Fetch PR Details**: Get the PR diff and metadata using `gh pr view` and `gh pr diff`

2. **Read Project Context**: Read `CLAUDE.md` and apply the non-negotiables and architecture rules during review

3. **Analysis Focus Areas**:

   **Morpho Protocol Security** (CRITICAL — review these FIRST):

   - **General adapter for deposits**: Deposits MUST go through the general adapter (bundler3). It enforces `maxSharePrice` — bypassing it opens an inflation attack vector
   - **`maxSharePrice` validation**: Every deposit must include a positive `maxSharePrice`. Check for `NonPositiveMaxSharePriceError` usage
   - **`chainId` match**: Verify that `chainId` is validated between client and action params before any on-chain call. Check for `ChainIdMismatchError` usage
   - **Address validation**: Client address and args address must match. Check for `AddressMismatchError` usage
   - **Positive-amount guards**: Assets and shares amounts must be validated (positive). Check for `NonPositiveAssetAmountError` / `NonPositiveSharesAmountError`
   - **Approval flow correctness**: Approval amounts must be >= spend amounts. Permit / Permit2 signature flows must be correct

   **Immutability** (CRITICAL):

   - Every returned `Transaction` object MUST be `deepFreeze`-d. No exceptions
   - Properties should use `readonly` modifiers
   - No mutation of returned objects anywhere in the chain

   **Architecture Compliance**:

   - Strict layering: **Client → Entity → Action** — never skip a layer
   - Actions must be pure functions returning `Transaction<TAction>` (deep-frozen)
   - Actions must extend `BaseAction<TType, TArgs>` — discriminated union on `type`
   - Entities fetch on-chain data and delegate to action builders
   - Client wraps viem `Client`, manages options, provides vault access
   - New error cases require a dedicated class in `src/types/error.ts`

   **TypeScript Strictness**:

   - Zero `any` — no `any` types anywhere
   - All strict flags must remain enabled
   - Use `type` imports (`import type { ... }`)
   - Use `readonly` properties on interfaces and types
   - Proper generic constraints on `BaseAction<TType, TArgs>`
   - Discriminated unions must remain exhaustive

   **Code Standards (Biome)**:

   - Double quotes, 2-space indentation
   - No unused imports or variables
   - JSDoc on every exported function and interface
   - All public API re-exported through barrel `index.ts` files
   - Early returns preferred over nested conditionals
   - Follow neighboring patterns — read existing code before modifying

   **viem Usage**:

   - Correct use of `encodeFunctionData`, `decodeFunctionResult`
   - Proper ABI typing and function signatures
   - Address types (`Address` from viem) used consistently
   - `Hex` type for encoded data
   - Correct `value` field handling (bigint for ETH transfers, `0n` otherwise)

   **Test Quality**:

   - Tests must validate the right things — do not accept tests that merely pass without meaningful assertions
   - Test invariants should be checked (see `test/helpers/invariants.ts`)
   - Fixtures should be used for shared test data (see `test/fixtures/`)
   - Do not modify tests without understanding what they validate and why

---

## CI Mode (GitHub Actions)

When running in CI, post inline review comments directly on the PR diff.

### Step 1: Get PR Information

First, get the PR details and the latest commit SHA:

```bash
# Get PR number from context (usually available as GITHUB_REF or from the event)
PR_NUMBER=<from context>

# Get the latest commit SHA for the PR
COMMIT_SHA=$(gh pr view $PR_NUMBER --json headRefOid -q '.headRefOid')

# Get the repo owner and name
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
```

### Step 2: Post Inline Comments

For each issue found, post an inline comment on the specific line using the GitHub API:

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --method POST \
  -f body="🔴 **Critical**: <Issue description>

**Problem:** <Explanation>

**Suggestion:**
\`\`\`suggestion
<suggested fix>
\`\`\`" \
  -f commit_id="$COMMIT_SHA" \
  -f path="src/path/to/file.ts" \
  -F line=42 \
  -f side="RIGHT"
```

**Parameters:**

- `path`: File path relative to repo root
- `line`: Line number in the NEW file (after changes)
- `side`: Always use "RIGHT" for commenting on new code
- `commit_id`: The HEAD commit SHA of the PR

### Step 3: Submit Review

After all inline comments, submit a formal PR review with your verdict.

**Choose the appropriate command based on your assessment:**

Use `gh pr review` with one of these two verdicts:

| Verdict             | Command                                                  | When to use                                       |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| **Approve**         | `gh pr review $PR_NUMBER --comment --body "..."`         | No critical or important issues (minor issues OK) |
| **Request Changes** | `gh pr review $PR_NUMBER --request-changes --body "..."` | Any critical issues, or multiple important issues |

**Note:** For approvals, use `--comment` with the `<!-- CLAUDE_VERDICT:APPROVE -->` marker. The workflow will auto-approve.

**Review body template:**

```markdown
<!-- CLAUDE_VERDICT:APPROVE -->   <!-- Only include for approvals -->

## Code Review Summary

### Overview

<Brief summary of the PR and overall assessment>

### Findings

- 🔴 Critical: X issues
- 🟡 Important: X issues
- 🔵 Minor: X issues

See inline comments for details.

### SDK Compliance

<!-- Check [x] or uncheck [ ] based on actual review findings -->

- [ ] Deposits routed through general adapter (bundler3) with `maxSharePrice`
- [ ] `chainId` validated between client and params
- [ ] All `Transaction` objects are `deepFreeze`-d
- [ ] Strict TypeScript — zero `any`, `type` imports, `readonly` properties
- [ ] Architecture layering respected (Client → Entity → Action)
- [ ] Actions are pure functions extending `BaseAction<TType, TArgs>`
- [ ] New errors use dedicated class in `src/types/error.ts`
- [ ] Biome standards (double quotes, 2-space indent, no unused imports)
- [ ] JSDoc on all exported functions and interfaces
- [ ] Barrel exports updated in `index.ts` files

### Verdict

<!-- Use one of: -->

✅ **Approved** - Code looks good!
❌ **Changes Requested** - Please address the issues above.
```

### CI Severity Levels

- 🔴 **Critical**: Inflation attack vector (bypassing general adapter), missing `deepFreeze`, `chainId` mismatch, zero-amount not guarded, `any` types — REQUEST_CHANGES
- 🟡 **Important**: Architecture layer violation, missing JSDoc, missing barrel exports, test quality issues — REQUEST_CHANGES if significant
- 🔵 **Minor**: Code style, naming, formatting — can still APPROVE (mention in comments)

### Important Notes for Inline Comments

- Line numbers must match the NEW file in the diff (right side)
- Use `side: "RIGHT"` to comment on added/modified lines
- The `commit_id` must be the HEAD commit of the PR branch
- For multi-line suggestions, use `start_line` and `line` parameters
- Keep comments concise and actionable

---

## Local Mode (Interactive)

When running locally, guide the user through adding review comments manually.

### Local Review Process

**Step 1: Present Summary**

```
## Review Summary for PR #<number>

Found X issues across Y files:
- 🔴 Critical: X issues (security, immutability, type safety)
- 🟡 Important: X issues (architecture, conventions)
- 🔵 Minor: X issues (code quality, style)

Ready to go through each issue? (yes/no)
```

**Step 2: Present Each Issue Interactively**

For each issue, present one at a time:

```
Issue 1 of X [SEVERITY]
File: path/to/file.ts (Line: XXX)

**Problem:** Brief description of the issue
**Impact:** Why this matters (e.g., inflation attack vector, mutability leak, layer violation)
**Suggestion:** How to fix it

Would you like to add this comment to the review? (yes/no/skip)
```

**Step 3: Provide Comment Markdown**

If the user confirms, provide ready-to-copy markdown:

```
✅ Add this comment to your GitHub review:

📍 File: `path/to/file.ts` - Line XXX

[Comment text formatted for GitHub]

---

Instructions:
1. Open the PR: https://github.com/[owner]/[repo]/pull/[number]/files
2. Find the file and line number above
3. Click the "+" button on that line
4. Paste the markdown comment
5. Choose "Start a review" or "Add review comment"

Next issue? (yes/skip all/done)
```

**Step 4: Final Summary**

After all issues:

- Show how many comments the user chose to include
- Remind them to submit the review on GitHub
- Provide link to the PR files view

---

## Important Notes

- In CI mode: Submit formal reviews via `gh pr review` (approve or request-changes only)
- In local mode: Never post directly, only provide copy/paste markdown
- Be constructive and educational in comments
- **Always prioritize Morpho-specific security checks** (general adapter, maxSharePrice, chainId)
- **Immutability is non-negotiable** — flag any missing `deepFreeze` as critical
- Line numbers should correspond to the NEW file (after changes)
