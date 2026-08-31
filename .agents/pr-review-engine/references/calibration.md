# ±15 line-tolerance calibration

Reference for Step 6 (line-level scope filter) of `SKILL.md`.

## The constant

The engine keeps a finding when `finding.line` is within ±15 lines of any line in the file's `CHANGED_LINES` set. Findings outside the window are dropped as pre-existing.

## Why ±15

The number is a calibration choice, not a derivation. Observed in practice:

- A renamed function's remaining callers are usually within ~5–10 lines of the rename site, inside the same module section.
- A new code path that exposes an existing bug (e.g. a new caller of a previously-unused helper) tends to sit within ~10–15 lines of the new code.
- Beyond ~20 lines, findings start to be about unchanged code an agent happened to find interesting while scanning the file — the scope-creep failure mode.

±15 sits at the edge of "adjacent" without becoming "anything in the file". Smaller (±5) would drop legitimate adjacent findings; larger (±30) would let through too much pre-existing noise.

## Audit signal: `distance_to_nearest_changed_line`

Every finding dropped by the line-level filter is tagged with `distance_to_nearest_changed_line` — the integer line-distance from `finding.line` to the closest entry in `CHANGED_LINES` for that file.

This is exposed in `DROPPED_FINDINGS` so reviewers can spot a window mis-tuned for their codebase. A consistent pattern of drops with `distance_to_nearest_changed_line` in 16–25 suggests ±15 is too tight; a pattern of kept findings with high distance suggests it's too loose.

## Short-circuit on empty sets

If a file's `CHANGED_LINES` set is empty (pure rename — see `references/changed-lines.md`), the line-level filter is skipped entirely for that file. The file-level filter already kept the file in scope; double-dropping every finding on a rename-only diff would defeat the purpose of even running an agent against it.
