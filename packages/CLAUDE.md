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
