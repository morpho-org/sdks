# Agentic-system authoring rubric

The canonical authoring contract for **this repo's** agentic system — the `.agents/pr-review-engine/` engine, its `agents/*.md` personas, its `references/*.md` rubrics, its `scripts/*`, and the `.agents/commands/*.md` callers that consume them. Distilled from Anthropic's Agent Skills guidance and layered with the repo's own conventions in `AGENTS.md` (especially §1 modularity / single-source-of-truth and §10, which is the binding inventory of the review system).

**Repo rules win.** Where `<PROJECT_CONTEXT>` (the root `AGENTS.md`) documents its own conventions, those are binding and override the generic defaults below. Use this rubric to fill the gaps and to catch the failure modes the repo's docs assume but don't restate on every change.

This system is **not** a published Claude Code plugin — there is no `plugin.json`, `marketplace.json`, README inventory, or bats suite. The cross-file invariants below are the repo's equivalents, anchored on `AGENTS.md` §10.

## 1. Persona / agent frontmatter contract

Every `.agents/pr-review-engine/agents/*.md`:

- **`name`** — required; kebab-case; **MUST equal the file's basename** (`web3-security.md` → `name: web3-security`). A rename that updates one but not the other is a contract break.
- **`kind: baseline | conditional`** — required. **`baseline` must NOT declare a `trigger:`; `conditional` MUST.**
- A conditional agent's **`trigger:` flag must be defined in the engine's Step-4 flag-detection block** (`.agents/pr-review-engine/SKILL.md`) — an undeclared or typo'd flag means the agent silently never launches. FIX: add the `HAS_*` definition bullet to the engine Step 4 in the same change.
- **`applies:`** present and citing a real `AGENTS.md` section; **`out-of-scope:`** and **`focus:`** present; severity calibration present (a `## Severity guidance` body section **or** a `severity-guidance:` frontmatter field — either, but one is required).
- **No XML angle brackets (`<` / `>`) anywhere in the frontmatter block.** Use bare identifiers (`trigger: HAS_CI_RELEASE`, not `trigger: <HAS_CI_RELEASE>`); reserve angle-bracket placeholders for the body. FIX: drop the brackets in frontmatter.

## 2. Engine ↔ caller discipline

- **The engine (`.agents/pr-review-engine/SKILL.md`) must NOT be symlinked into `.claude/commands/`.** It is consumed by the caller commands, never invoked directly — the repo's equivalent of `disable-model-invocation`. A symlink that exposes it as a slash command is a contract break.
- **Caller commands (`.agents/commands/*.md`) are the public command surface**, symlinked into `.claude/commands/`. A new caller needs its symlink; a removed caller needs the symlink cleaned up.
- Deterministic logic (diff line-math, scope-filtering, ledger merge) lives in `scripts/`, not in English prose the engine re-derives each run ("code is deterministic; language interpretation isn't"). A new deterministic rule expressed only in `SKILL.md` prose where a `scripts/` helper is the established pattern is a finding.

## 3. Cross-file inventory invariants (the §10 contract)

Adding / renaming / removing an agent, a flag, a reference, or a caller is **never** a one-file change. Every enumeration must move atomically, or it's drift:

- **The engine's "Current agent inventory" section** (`.agents/pr-review-engine/SKILL.md`) — the baseline/conditional rosters and the total count.
- **`AGENTS.md` §10** — the persona-inventory table(s) (baseline + conditional), the orchestration table, and any agent count in prose.
- **The `> Applied by personas:` backlinks** on the `AGENTS.md` section(s) the agent enforces — and the agent's own `applies:` must cite back. Both directions must agree (this is also `documentation`'s concern; flag the authoring half here).
- **For a new conditional agent:** its `trigger:` flag must appear in BOTH the engine Step 4 flag-detection block AND §10's conditional-persona trigger column.

A one-sided update reads as "covered" but ships an inconsistency. Flag the specific files left behind.

## 4. References & pointers

- A reference cited by an agent (`Cross-check ../references/X.md`) must exist under `.agents/pr-review-engine/references/`.
- The engine's `## References` list and the agents that cite each reference should stay consistent — a reference no agent cites is dead weight; an agent citing a missing reference is a dangling pointer.

## 5. Severity calibration

- **High** — frontmatter contract violation (name ≠ filename, XML brackets in frontmatter, baseline-with-trigger / conditional-without-trigger, missing `applies:`/`focus:`/severity calibration); a new conditional agent whose trigger flag isn't declared in the engine Step 4; cross-file inventory drift (engine roster / §10 table / backlinks out of sync with the actual `agents/` set).
- **Medium** — the engine exposed as a slash command (symlinked into `.claude/commands/`); a reference cited by an agent that doesn't exist (or a one-sided citation); deterministic logic expressed only in prose where a script is the established pattern.
- **Low** — an `applies:`/`focus:` that omits a section it clearly enforces; structure nits that still parse.
- **Omit** — wording/style preferences, reordering, and "you could also" suggestions. Authoring review flags contract breaks, not taste.

## Consumers

- `skill-authoring` (review-engine agent) — this reference IS its rubric; it grades a diff's `.agents/` authoring conformance against it.
