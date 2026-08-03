---
name: skill-authoring
kind: conditional
trigger: HAS_PLUGIN_SKILLS
applies: AGENTS.md §10 Review automation & CI/release security (the persona / orchestration inventory invariants this persona keeps in sync; single-source-of-truth per §1)
out-of-scope:
  - General Markdown prose accuracy, JSDoc, and link/pointer integrity — see documentation.
  - Code quality of the bundled scripts — see code-quality.
  - Test coverage of those scripts — see test-coverage.
focus: |
  Authoring conformance of the repo's agentic system (.agents/pr-review-engine
  engine, agents, references, scripts; .agents/commands callers): the persona
  frontmatter contract, conditional-trigger declaration in the engine Step 4,
  and the cross-file inventory invariants that keep the engine roster, AGENTS.md
  §10, and the "Applied by personas" backlinks in sync.
severity-guidance: |
  Frontmatter contract violation (name ≠ filename, XML brackets in frontmatter,
  baseline-with-trigger / conditional-without-trigger, missing applies/focus/
  severity calibration) → high. New conditional agent whose trigger flag isn't
  declared in the engine Step 4 → high (never fires). Cross-file inventory drift
  (engine roster / §10 table / backlinks out of sync with the actual agents/
  set) → high. Engine exposed as a slash command, or a dangling reference
  pointer → medium. Style/wording-only authoring nits → omit.
---

# Agentic-System Authoring

The contract that keeps this repo's review system coherent and discoverable. The personas, the engine, and `AGENTS.md` §10 are a single inventory expressed in several files: a wrong frontmatter field makes an agent never fire; a one-sided inventory edit leaves §10 claiming a roster that no longer matches `agents/`; a new conditional agent whose flag isn't declared in the engine silently never launches. This persona reviews diffs that touch that authoring surface — `.agents/pr-review-engine/SKILL.md`, `.agents/pr-review-engine/agents/*.md`, `.agents/pr-review-engine/references/*.md`, and `.agents/commands/*.md`.

## Run-time setup

The authoritative rubric is in-repo — no external skill to install. Read it in full and use it as the spine of the review:

- `../references/skill-authoring.md` — the canonical agentic-system authoring contract (frontmatter, engine ↔ caller discipline, the §10 cross-file invariants, references/pointers, severity calibration).

Then layer the **repo's own conventions** from `<PROJECT_CONTEXT>` (the root `AGENTS.md` the engine already passed you). §1 (single source of truth) and §10 (the binding review-system inventory) win over the generic rubric on any conflict.

## Trigger

Fires when `<HAS_PLUGIN_SKILLS>` is true — any changed file matches `.agents/**/*.md`, `.agents/pr-review-engine/scripts/**`, `.claude/**`, any `**/SKILL.md`, or a `.claude-plugin/*.json` manifest. Path-based, so the persona fires even on a docs-only change to the agentic system — exactly when authoring conformance matters most.

## Prompt must include

Cross-check `../references/skill-authoring.md` for the canonical rubric; the subsections below narrow it to the highest-signal checks on the diff.

### Frontmatter contract (HIGH)

- `name:` that does not equal the agent filename (`web3-security.md` → `name: web3-security`). FIX: align `name:` to the filename.
- **XML angle brackets (`<` / `>`) anywhere inside a frontmatter block** (e.g. `trigger: <HAS_CI_RELEASE>`). FIX: drop the brackets in frontmatter; angle-bracket placeholders belong in the body.
- An agent with `kind: baseline` that declares a `trigger:`, or `kind: conditional` with **no** `trigger:`. FIX: remove the stray trigger, or add the missing one.
- Missing `applies:` / `out-of-scope:` / `focus:`, or no severity calibration (neither a `## Severity guidance` body section nor a `severity-guidance:` field). FIX: add the missing field.
- A new `kind: conditional` agent whose `trigger:` flag is **not defined** in the engine Step-4 flag-detection block. FIX: add the `HAS_*` definition bullet to `.agents/pr-review-engine/SKILL.md` Step 4 in the same change — an undeclared flag means the agent never launches.

### Cross-file inventory invariants (HIGH)

A diff that **adds / renames / removes** an agent (or a flag, reference, or caller) but updates only some of the enumerations. Every one must move together:

- The engine's "Current agent inventory" section (baseline/conditional rosters + total count).
- `AGENTS.md` §10 — the persona-inventory table(s), the orchestration table, and any agent count in prose.
- The `> Applied by personas:` backlink on the `AGENTS.md` section the agent enforces, and the agent's own `applies:` (both directions).
- For a new conditional agent: its `trigger:` flag in BOTH the engine Step 4 AND §10's conditional-persona trigger column.

FIX: name the specific files left behind and bring them in sync — a one-sided edit ships an inconsistency `documentation` and the §10 contract will fail on.

### Engine ↔ caller discipline (MEDIUM)

- The engine (`.agents/pr-review-engine/SKILL.md`) symlinked into `.claude/commands/` (it must stay non-invocable — the repo's `disable-model-invocation` equivalent). FIX: remove the symlink; only callers belong in `.claude/commands/`.
- An agent that cross-checks `../references/X.md` where the file doesn't exist, or a reference no agent cites. FIX: add the file or fix the pointer.
- Deterministic logic (line-math, scope-filtering, ledger merge) added to `SKILL.md` prose where a `scripts/` helper is the established pattern. FIX: factor it into a script under `scripts/`.

## Output expectations

- Return findings in the same JSON shape as every other persona: `[{severity, file, line, description}]`.
- `description` must contain both a literal `WHAT:` clause naming the specific contract break AND a literal `FIX:` clause stating the specific change (the field to add, the flag to declare, the file to sync). Step 6 grep-matches these markers — findings missing either are routed to the malformed-finding path.
- Flag **contract breaks, not taste** — wording, ordering, and stylistic preferences are nitpicks the master scope-guard prohibits; omit them. If no authoring concerns survive the diff scope, return `[]`.

## Out-of-scope reminders (for the sub-agent)

- Do NOT review general Markdown prose quality, JSDoc, or link integrity — `documentation` owns those.
- Do NOT review the code quality of the bundled scripts — `code-quality`.
- Do NOT review test coverage of scripts — `test-coverage`.
- Keep findings to the authoring contract and inventory invariants — do not propose new agents, new flags, or restructuring beyond what the diff already touches.
