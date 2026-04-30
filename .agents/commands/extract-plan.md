# extract-plan

Read a technical document (TIB, RFC, design doc, etc.) and generate a Linear project plan
with milestones and implementation issues from it.

## Arguments

- `$ARGUMENTS` should contain: `<doc-file-path> [linear-project-name-or-id]`
- Example: `/extract-plan TIB/TIB-2026-04-30-blue-sdk-observability.md "Blue SDK Observability"`

## Instructions

You are converting a technical document into an actionable Linear project plan with milestones and
issues. The goal is to bridge the gap between a written decision or design and trackable
implementation work.

The input document may be a TIB, RFC, design doc, or any structured technical document that
describes a decision, approach, and/or implementation plan.

---

### Step 1: Parse Arguments

Check `$ARGUMENTS`:

- If **two arguments** are provided, treat the first as the document file path and the second as the
  Linear project name or ID.
- If **one argument** is provided, treat it as the document file path and ask the user for the
  target Linear project.
- If **no arguments** are provided, ask:
  1. _"Which document should I convert? (file path)"_
  2. _"Which Linear project should the issues be created in? (project name or ID, or 'new' to create one)"_

If the user says "new", you will create the project in Step 5.

### Step 2: Read and Parse the Document

Read the document and extract structured information. Adapt to whatever sections and format are
present — the following are common patterns, not requirements:

| Common Section               | What to extract                                                    |
| ---------------------------- | ------------------------------------------------------------------ |
| **Metadata**                 | Status, Date, Author, Scope                                        |
| **Context / Background**     | Problem statement and motivation — becomes project description     |
| **Decision Drivers / Goals** | Constraints and priorities — informs issue prioritization          |
| **Decision / Approach**      | The chosen approach and its subsections — primary source for tasks |
| **Implementation Phases**    | Phase breakdown — maps directly to milestones                      |
| **Consequences / Tradeoffs** | Positive/Negative/Neutral — informs acceptance criteria            |
| **Future Considerations**    | Items explicitly deferred — may become backlog issues              |
| **References**               | Links and prior art — attached to relevant issues                  |

If the document doesn't follow any of these patterns, use your judgment to identify the decision,
approach, and actionable work items.

**Scope detection:** Use the document's scope field (if present) and file path to suggest a target
team:

- `packages/blue-sdk*`, `packages/morpho-sdk`, `packages/simulation-sdk*` → core SDK
- `packages/*-viem` or `packages/*-wagmi` → integration packages
- `scripts/`, root configs, `tsconfig.json`, `pnpm-workspace.yaml`, cross-package → repo-wide

If `CLAUDE.md` contains a Team IDs table, use that to resolve to a Linear team ID. Otherwise ask
the user which Linear team to file under, and offer to record the answer in `CLAUDE.md` for future
runs.

### Step 3: Generate the Plan

Build the following structure from the parsed document:

#### 3a: Milestones

If the document contains explicit phases (e.g., "Implementation Phases", "Rollout Plan",
"Milestones"):

- Each phase becomes a **Linear milestone** within the project.
- Milestone name: `Phase N: <phase title>` (e.g., `Phase 1: Foundation + first SDK package`)
- Milestone description: The phase's description from the document, verbatim or lightly cleaned up.
- Milestones are ordered sequentially.

If the document does **not** have explicit phases, derive logical milestones from the approach
section's subsections or propose a sensible breakdown (e.g., "Foundation", "Core Implementation",
"Migration", "Polish"). Ask the user to confirm derived milestones.

#### 3b: Issues

Break the document into actionable implementation issues. Sources for issues:

1. **Approach/Decision subsections** — Each subsection typically maps to one or more issues.
2. **Implementation Phases** — Tasks described within each phase.
3. **Negative consequences/tradeoffs** — May warrant mitigation issues.
4. **Future Considerations** — Items worth tracking as low-priority issues.

**Granularity principle:** Prefer coarser issues that represent a single PR's worth of work. Don't
split tightly coupled work into separate issues — for example, writing tests for a feature belongs
in the same issue as implementing that feature, not as a separate issue blocked by it. A good
heuristic: if two tasks would naturally be done in the same PR by the same person, they should be
one issue.

For each issue, determine:

- **Title**: Follow the title convention
- **Description**: Use the 3-section template below:

  ```markdown
  ## Context
  [What this task accomplishes and why, referencing the source document]

  ## References
  - Source: <doc-file-path> (Section X.Y)
  - [file paths, related issues, or links from the document's References section]

  ## Possible solution
  > ⚠️ AI-generated — treat as a starting point, not a prescription.

  [Implementation approach derived from the document's details]
  ```

- **Milestone**: Which milestone (phase) this issue belongs to.
- **Dependencies**: Which other issues must be completed first (`blockedBy`) and which issues this
  unblocks (`blocks`). Derive from:
  - Phase ordering (Phase 1 issues block Phase 2 issues where a real dependency exists)
  - Logical dependencies within a phase (e.g., "create package" blocks "add logging module")
  - Explicit dependency mentions in the document
  - Do **not** create artificial cross-milestone blocking for every issue pair — only where a real
    dependency exists.
- **Priority**: Infer from the document:
  - Critical path / blockers → 1 (Urgent)
  - Core decision items / Phase 1 → 2 (High)
  - Later phases → 3 (Normal)
  - Future considerations → 4 (Low)
- **Estimate** (optional, in points):
  - 1 = Small (single file, straightforward)
  - 2 = Medium (multiple files, some complexity)
  - 3 = Large (cross-cutting, new abstractions)
  - 5 = XL (major effort, consider breaking down further)
- **Labels**: Infer from issue type (label names as an array, e.g. `["Feature"]`)

#### 3c: Dependency Graph

Build an explicit ordering of issues. Within a milestone, issues should be ordered by their
dependency chain. Across milestones, only set blocking relationships where a real dependency exists.

### Step 4: Present the Plan for Review

Before creating anything in Linear, present the full plan to the user:

```
## Document → Linear Plan

**Source**: <doc-file-path>
**Project**: <project-name> (existing | new)
**Team**: <team-name> (<team-key>)
**Total milestones**: N
**Total issues**: N

---

### Milestone 1: <name>
| #  | Title                                              | Priority | Estimate | Blocked By | Blocks |
| -- | -------------------------------------------------- | -------- | -------- | ---------- | ------ |
| 1  | feat(blue-sdk): scaffold observability hooks       | High     | 2        | —          | #2, #3 |
| 2  | feat(blue-sdk): implement logger factory           | High     | 2        | #1         | #4     |

### Milestone 2: <name>
| #  | Title                                              | Priority | Estimate | Blocked By | Blocks |
| -- | -------------------------------------------------- | -------- | -------- | ---------- | ------ |
| 5  | feat(simulation-sdk): adopt @morpho-org/observability | Normal   | 2        | #4         | #6     |

### Dependency Graph
#1 → #2 → #4 → #5 → ...
#1 → #3 ─┐
          └→ #6
```

Then ask:

> **Does this plan look good?** You can:
>
> - Say **"create all"** to create the project, milestones, and all issues
> - Say **"create milestones 1-2 only"** to create a subset
> - **Edit** any item (e.g., "change #3 title to ...", "move #5 to milestone 1", "remove #8")
> - **Add** items (e.g., "add an issue for writing migration docs")
> - Say **"skip"** to cancel without creating anything

### Step 5: Create in Linear

Once the user approves, create items in this order:

#### 5a: Project (if new)

If the user said "new" or no existing project was specified, create the project using
`mcp__linear__create_project`:

- `name`: Project name
- `description`: Include Vision (from document context), Motivation (from decision drivers/goals),
  Scope, and a link to the source document path
- `addTeams`: `[<team-id>]`

If the document status is "Proposed" or "Draft", note in the description that the underlying
decision may still change.

#### 5b: Milestones

Create milestones in order using `mcp__linear__create_milestone`:

- `name`: `Phase N: <title>`
- `description`: Phase description from the document
- `project`: The project ID

#### 5c: Issues (two-pass)

**Pass 1 — Create issues** in dependency order (issues with no `blockedBy` first) using
`mcp__linear__create_issue`:

- `title`: Title following the title convention
- `description`: 3-section template (Context / References / Possible solution)
- `team`: Team ID (from scope detection)
- `project`: Project ID
- `milestone`: Milestone name or ID
- `priority`: 1-4
- `estimate`: 1, 2, 3, or 5
- `labels`: Label names as an array, e.g. `["Feature"]`
- `state`: Default all issues to **Backlog** state unless explicitly overridden by the user

Store each returned issue ID.

**Pass 2 — Set dependencies** by updating each issue that has relationships:

- `id`: The created issue identifier
- `blockedBy`: Array of blocking issue identifiers
- `blocks`: Array of blocked issue identifiers

This two-pass approach avoids forward-reference problems where issue B depends on issue C that
hasn't been created yet.

### Step 6: Confirm Completion

Present a summary:

```
## Created from <doc-file-name>

**Project**: <project-name>
<project-linear-url>

### Milestones
1. Phase 1: <title> — N issues
2. Phase 2: <title> — N issues

### Issues Created (N total)
| ID            | Title                                            | Milestone | Blocked By  |
| ------------- | ------------------------------------------------ | --------- | ----------- |
| <TEAM>-101    | feat(blue-sdk): scaffold observability hooks     | Phase 1   | —           |
| <TEAM>-102    | feat(blue-sdk): implement logger factory         | Phase 1   | <TEAM>-101  |

### Dependency Chain
<TEAM>-101 → <TEAM>-102 → <TEAM>-104 → <TEAM>-105 → ...
```

---

## Notes

- Always resolve project names to IDs before creating artifacts — use `mcp__linear__list_projects`
  to find the ID if only a name is provided
- Issue descriptions must follow the 3-section template (Context / References / Possible solution)
- Issue titles must follow the title convention
- If team IDs are not listed in `CLAUDE.md`, ask the user which Linear team to use and offer to
  record the answer in `CLAUDE.md` for future runs
- Create issues in dependency order so that `blockedBy` references are valid
- If the document has no explicit phases, derive milestones from logical groupings and confirm with
  the user
- Do NOT create a git branch — this command creates Linear artifacts only

$ARGUMENTS
