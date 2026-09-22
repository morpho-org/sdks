---
name: sdk-documentation
description: Use for public exports, JSDoc, changed behavior described by docs, Markdown links, renamed files/symbols, repository rules, or TIB changes.
---

# SDK API and repository documentation

Read root `AGENTS.md` §6 and `docs/jsdoc-style.md` from the reviewed checkout. Follow affected exports through their public barrels/subpaths, and locate existing docs that describe the changed behavior.

- Apply the canonical JSDoc checklist to new/modified public classes, functions, types and constants. Check descriptions, parameters, return shape, typed throws and runnable examples against actual implementation. Internal locals/test helpers follow their documented exemption.
- Public type names convey domain meaning. Examples include resolvable imports, client setup and realistic calls/outputs where the style guide requires them. Distinguish static inspection from a compilation run.
- Reconcile changed behavior with existing README, root/package/nested AGENTS, MISSION, CONTRIBUTING, SECURITY and relevant docs. CLAUDE symlinks contain the same instructions and need no duplicated prose. Check inventories of packages, chains, commands and criteria when the diff changes them.
- Resolve touched internal Markdown links/anchors and prose path/symbol references. On renames/removals, inspect tracked references to the old owner and distinguish active instructions from intentional historical records.
- A TIB already on the target branch preserves implementation-time names/examples. Changed decisions get a superseding TIB; operational clarifications get a dated addendum. A TIB introduced by the current implementation can evolve before it lands.
- For rule or criterion changes, follow the rule's owning AGENTS section to the criterion that applies it and back. During the Lupin migration, evaluate the replacement manifest/skills and revised guidance as one coherent change; the retired persona roster is not a permanent invariant.

Report inaccurate contracts, broken actionable pointers and required public documentation gaps with their affected caller or discovery path. Optional expansion, cosmetic prose and additional docs unrelated to the change are not findings. Complete when implicated docs and references agree or their limits are explicit; documentation existence alone does not prove behavior.
