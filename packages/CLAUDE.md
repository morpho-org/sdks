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
- Declare package-specific errors in one centralized error module for that package.
- Quote interpolated error parameter values in messages, e.g. `expected "${expected}", got "${actual}"`.
- Each package should own one responsibility; split framework adapters from protocol/core logic.
- Framework coupling belongs in explicitly named adapter packages such as `*-wagmi`, never in core SDK packages.
- Change generated inputs, not generated files; keep generated artifacts out of hand-written design decisions.
- New runtime dependencies need a package-level reason and should not replace a small local type or helper.
- Treat package-local folder names as ownership boundaries; keep generated/API clients, adapters, hooks, fixtures, and protocol logic in their established folders.
- Keep external I/O at package boundary modules; normalize API/RPC/client data before passing it into core domain logic.
- Package tests should cover package-owned invariants and keep shared test helpers out of published runtime paths.

## Continuous Improvement

- Existing packages may predate these conventions; do not widen divergence when touching them.
- Prefer deleting unclear helpers, dependencies, exports, or duplicated logic before adding abstractions.
- If a package cannot yet meet an applicable convention, keep the exception local and make the touched surface closer to the target design.
