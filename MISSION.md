# Mission

`@morpho-org/morpho-sdk` is the canonical TypeScript SDK for Morpho. It does one thing perfectly: **build ready-to-send Morpho transactions** — security-first, viem-only, and equally legible to humans and AI agents.

The SDK is a product. It has users (integrators, internal and external, human _and_ AI), a roadmap driven by user outcomes, and quality bars (security, tests, docs, DX, reliability, AI-friendliness) we measure and invest behind.

## Scope

- **In:** transaction builders for Morpho — VaultV1, VaultV2, Blue; entity fetchers for the data those builders need; framework adapters in opt-in `*-wagmi` / `*-viem` packages.
- **Out:** framework wrappers (React/Redux/ethers), simulation engines, indexers, hosted infrastructure. Any work that doesn't make Morpho integrations faster or safer is out of scope by design.
- **One peer dep:** `viem`. Integrators install `morpho-sdk + viem` and they're done.

## Values (how the team operates)

The SDK team operates under Morpho's Core Values (see internal team handbook). In daily practice:

- **Laser-focused.** One product, one job. Non-goals are load-bearing.
- **First principles.** Anyone may challenge any design or review. We document _why_, not just _what_. We push for real alignment over "disagree and commit".
- **Simplicity.** Well-thought layered modules and pure functions. Simplicity is the goal that unlocks safe code: fewer moving parts, fewer places a bug can hide, fewer surfaces an audit has to cover. Delete before adding — constants, types, helpers, exports, fixtures. When unsure a helper is useful, remove it and see what breaks.
- **Obsessed with critical feedback.** Integrator friction becomes a ticket the same day it's reported. Watered-down feedback is a failure to invest in someone.
- **Bias for action.** Triage and patch on report. Partner-blocking issues don't wait for a sprint. No task too low.

## Specific goals

1. **Build & maintain.** Grow the SDK within the non-negotiable principles. Say no to scope that violates one — write a new TIB if a principle needs to evolve. Absorb rather than re-export types at risk of upstream churn. Patch releases on demand; minors on a rolling cadence; majors with migration guides. Deprecations follow the 4-step flow. `main` is always releasable.
2. **Secure, tested & audited.** Security is the posture; tests and audits are the evidence. We codify invariants as tests, pin ABIs and addresses in-package, audit every major release, and treat threat-model review as routine when new protocol surface lands. (Test/audit specifics: see [`AGENTS.md`](./AGENTS.md) §5 and §7.)
3. **Document & make AI-legible.** Docs are a feature, not an afterthought, and humans and AI agents are equal users. We invest in JSDoc on every exported symbol, runnable single-file recipes as few-shot examples, identical signatures across protocol overlaps, and error messages that read like instructions. (Doc rules: see [`AGENTS.md`](./AGENTS.md) §6.)
4. **Engage users, drive adoption.** Protocol team in the SDK design loop before any contract change ships. Internal app teams (Vault, Curator, MCP, write/sim APIs) are the SDK's first and hardest users — their friction is our backlog. External integrators get visible roadmap, regular touchpoints, and active support. AI agents are a first-class user class; agent failures feed docs and API-shape backlog the same way human failures do.
