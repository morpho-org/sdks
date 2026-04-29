# Package Conventions

- Packages are ESM at source (`"type": "module"`) and publish dual builds from `lib/esm` and `lib/cjs`.
- Keep `main` pointed at source for local work, e.g. `"main": "src/index.ts"`.
- Internal dependencies use workspace ranges, e.g. `"@morpho-org/blue-sdk": "workspace:^"`.
- Build scripts follow `tsc --noEmit && pnpm build:cjs && pnpm build:esm`; keep new packages aligned.
- Add tests in the owning package, e.g. `packages/blue-sdk/test/unit/Market.test.ts`.
- Fork or Wagmi tests import their fixture setup: `import { test } from "./setup.js";`.
- Keep publish exports in `publishConfig.exports`; mirror `types`, `import`, and `require`.
- Put host libraries in `peerDependencies`, with local test versions in `devDependencies`.
- Subpath exports need both package exports and TS path support, e.g. `./vitest`.
- Each package should own one responsibility; split framework adapters from protocol/core logic.
- Framework coupling belongs in explicitly named adapter packages such as `*-wagmi`, never in core SDK packages.
- Change generated inputs, not generated files; keep generated artifacts out of hand-written design decisions.
- New runtime dependencies need a package-level reason and should not replace a small local type or helper.

## Continuous Improvement

- Existing packages may predate these conventions; do not widen divergence when touching them.
- Prefer deleting unclear helpers, dependencies, exports, or duplicated logic before adding abstractions.
- If a package cannot yet meet an applicable convention, keep the exception local and make the touched surface closer to the target design.
