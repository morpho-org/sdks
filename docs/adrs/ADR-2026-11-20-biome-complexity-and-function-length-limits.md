# ADR-2026-11-20: Biome limits on complexity and function length in package source

| Field      | Value     |
| ---------- | --------- |
| **Date**   | 2026-11-20 |
| **Author** | @jinmel   |
| **Scope**  | Repo-wide |

_Frozen after merge; only superseded-by entries in References change._

## Context

The engineering rules asked for early returns over deep nesting and banned
`any`, `@ts-ignore` and non-null escape hatches, but only reviewers enforced
them. Agent-written SDK code drifted toward deep `if`/`else` chains, nested
ternaries, long functions and type escape hatches, so the same review findings
came back PR after PR. Agents fix a failing `lint` far more reliably than they
follow prose, and the public source of every package reaches integrators.

The decision needed to optimize three qualities: the rule fails CI rather than
waiting for review; it uses tooling the repository already runs, so it adds no
code of its own to maintain; and each limit is strict enough to block the
patterns reviewers rejected while loose enough that the existing source can be
brought under it by refactoring, without suppressions or a baseline file.

## Decision

Non-test source in every package must fail lint on nine Biome built-in rules,
at error level. Each package reaches this when its own gate lands; until then
its non-test source gets the same rules as warnings.

| Rule | Setting |
| ---- | ------- |
| `noExcessiveCognitiveComplexity` | maximum 50 |
| `noExcessiveLinesPerFunction` | maximum 120 lines, blank lines not counted |
| `noNestedTernary` | on |
| `useCollapsedElseIf` | on |
| `noNegationElse` | on |
| `useBlockStatements` | on |
| `noNonNullAssertion` | on |
| `noExplicitAny` | on |
| `noTsIgnore` | on |

- **Non-test source** is everything under a package's `src/` except
  `*.test.ts` files and `test/` directories inside that `src/`. The `test`
  workspace package is not excluded: its `src/` is non-test source. Test files
  and integration tests are not bound by these rules.
- **Limits.** Cognitive complexity already charges for nesting, so there is no
  separate nesting-depth limit. Both limits are set above Biome's defaults
  (15 and 50 lines) so that they flag the outliers reviewers rejected, not
  every function with ordinary branching. When the limits were set, Biome's
  default complexity limit flagged five times as many `morpho-sdk` functions
  as 50 did, and its default length limit flagged dozens of linear
  transaction builders that read well, where 120 flagged only a few
  genuinely multi-phase functions.
- **Fix, then error.** A package's existing violations are fixed in the change
  that turns the rules on for it. No new suppression comment, ignore list or
  committed baseline stands in for a fix. A reason written beside a
  suppression comment is not a waiver: a waiver of these rules needs its own
  scoped entry in `docs/EXCEPTIONS.md`.
- **Built-in rules only.** Code shape Biome cannot express (purity, layering,
  `throw new Error`, JSDoc coverage) stays a review-time convention. Custom
  lint scripts and Biome plugins that enforce code shape are not part of this
  standard.
- **Changing a limit.** Raising either limit, lowering a rule below error, or
  narrowing which source the rules cover is a weakening of review control and
  needs a new ADR that supersedes this one.
  Lowering a limit, or adding another built-in rule at error, tightens the
  standard and also gets a new ADR, because every package must be brought
  under the new value in the same change.

## Invariants

- Each of the nine rules errors in a gated package's non-test source →
  `lint` in CI fails on a violating fixture placed in that package's `src/`,
  and passes on the same fixture in a `*.test.ts` file. Once every package is
  gated, the check holds for any package.
- No suppression replaces a fix → review rejects a change that adds a
  `biome-ignore` comment for one of these rules in non-test source unless
  `docs/EXCEPTIONS.md` already waives that exact scope.
- The limits are 50 and 120 non-blank lines → the Biome configuration's
  options for the two rules; reviewers treat any other value as a change to
  this decision.
- Revisit if Biome changes how it scores cognitive complexity or counts
  function lines, if it adds a built-in rule that covers a convention now left
  to review, or if a package's domain logic cannot meet a limit without
  splitting a function in a way that hides its meaning.

## Rejected alternatives

- **ESLint with syntax-restriction selectors.** Rejected because it adds a
  second lint toolchain to configure, upgrade and review.
- **A ratchet with a committed baseline of existing violations.** Rejected
  because the baseline is itself review-control surface that drifts, and a gate
  with exemptions does not mean the same thing in every file.
- **Custom scripts or Biome plugins for purity, layering, JSDoc and throws
  checks.** Rejected because each is code the repository must maintain and
  review as a control; those conventions stay with reviewers.

## References

- None.
