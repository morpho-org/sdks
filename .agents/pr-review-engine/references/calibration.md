# Calibration — ±15 tolerance window + kept/dropped examples

Consumed by [`.agents/pr-review-engine/SKILL.md`](../SKILL.md) Step 5 (sub-agent prompt envelope, slot 8). Persona authors must copy the kept/dropped examples below **verbatim** when invoking the engine — paraphrased examples train agents off the schema.

## Why ±15 lines

The line-level scope filter (sub-step 3 in [`scope-filter.md`](./scope-filter.md)) keeps a finding only when its cited `line` is within ±15 lines of some line the diff actually changed. This is a fixed engine constant — neither agents nor callers may pass an override.

**Rationale for 15, not 0 and not 50:**

- **0 (strict)** would drop legitimate "adjacent code" findings — e.g. an agent flags a missing null-check on line 42 because the new code on line 38 introduced a path where the variable can be null. The "adjacent code is materially worsened by the diff" exemption in Step 5's per-agent contract requires *some* tolerance.
- **50 (loose)** lets pre-existing findings drift in. Agents writing about untyped functions / missing JSDoc / TODO-style cleanups in unchanged regions of changed files start escaping the filter, and the audit-trail ratio (`DROPPED_FINDINGS / FINDINGS`) drops below the engine's target.
- **15** is the empirical midpoint: it covers most legitimate "I see what they did and the function 12 lines down now misbehaves" findings, while reliably catching the "this file has untyped errors throughout" sweep. Agents that genuinely want to flag something 30 lines away are explicitly off-rule per the per-agent contract — the contract says "issues introduced by the diff, plus adjacent code only when the diff materially worsens it."

The threshold ships in the constant `TOLERANCE` at the top of [`validate-findings.ts`](../scripts/validate-findings.ts). Changing it is an engine-level decision and requires a TIB.

## Kept finding (good shape — agent example)

```json
{
  "severity": "high",
  "file": "packages/morpho-sdk/src/actions/borrow.ts",
  "line": 87,
  "description": "WHAT: borrow path computes maxBorrowable via floor-division but the LLTV buffer is applied to the numerator BEFORE the division — the buffer rounds away part of itself and the safe-LTV check becomes ≥ rather than > at the boundary. FIX: apply the LLTV buffer to the result of the division (postscale), not to the numerator. Mirror the established pattern from `computeSafeBorrow` in packages/blue-sdk/src/helpers/lltv.ts:42-58."
}
```

Why this is kept:

- `WHAT:` names a specific, observable bug — not "this could be clearer."
- `FIX:` names a specific code change with a reference to an existing pattern.
- `line: 87` is inside `CHANGED_LINES["packages/morpho-sdk/src/actions/borrow.ts"]` (or within ±15 of a changed line).
- Severity matches the persona's `severity-guidance:` (accounting math drift that affects safe-LTV → high under the morpho-protocol persona).

## Dropped finding (bad shape — agent example)

```json
{
  "severity": "medium",
  "file": "packages/morpho-sdk/src/actions/borrow.ts",
  "line": 87,
  "description": "Consider extracting this into a helper for readability."
}
```

Why this is dropped (routed to `failed[]` in Step 6.2):

- No `WHAT:` clause — the description does not identify a specific problem at all, just a stylistic preference.
- No `FIX:` clause — "consider extracting" is not actionable; the agent is not stating what to extract or why.
- The underlying suggestion is a textbook nitpick the per-agent contract prohibits ("Polish, wording, naming preferences, stylistic alternatives, and 'you could also' suggestions are not findings — omit them regardless of severity label").

A reviewer reading the dropped audit trail and seeing this finding learns nothing actionable — which is exactly why the schema check exists.

## How callers use these

The two examples above (one kept, one dropped, with the rationale prose) are copied verbatim into each sub-agent's prompt envelope (Step 5, slot 8) so every persona writes against the same shape. Paraphrasing them — even a synonym swap — has been observed to drift agent output back toward stylistic suggestions. The verbatim-copy rule in Step 5 is the engine's defence against that drift.
