# @morpho-org/wdk-protocol-lending-morpho-evm

## 0.0.5

### Patch Changes

- [#746](https://github.com/morpho-org/sdks/pull/746) [`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Arc chain metadata, deployment addresses, deployment block lower bounds, and native-token mapping.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- Updated dependencies [[`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad), [`738421e`](https://github.com/morpho-org/sdks/commit/738421e4a428ce361d2fe551746b0c406a0fe31f), [`95b07ef`](https://github.com/morpho-org/sdks/commit/95b07ef56b8146f1084a35834243df4a7399a51d), [`43e6cfc`](https://github.com/morpho-org/sdks/commit/43e6cfcf7eaab0355dccbe3f9f55c59cdac72f0a), [`797928c`](https://github.com/morpho-org/sdks/commit/797928cd09234c98ac3259f7a07e7961eb670755)]:
  - @morpho-org/blue-sdk@6.1.0
  - @morpho-org/morpho-sdk@3.1.1
  - @morpho-org/blue-sdk-viem@5.1.0

## 0.0.4

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- [#717](https://github.com/morpho-org/sdks/pull/717) [`3035fb0`](https://github.com/morpho-org/sdks/commit/3035fb0864857db8434805eeb0076acc8e6eae90) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Align the package on the monorepo conventions: migrate sources and tests from JavaScript + JSDoc to TypeScript (`src/index.ts`, `src/morpho-presets.ts`, `src/morpho-protocol-evm.ts`, colocated `src/morpho-protocol-evm.test.ts`, `tests/integration/module.test.ts`), drop the hand-written `types/` declaration directory, replace the legacy `tsconfig.json` with the standard root-extending pair plus dual ESM/CJS `tsconfig.build.{esm,cjs}.json`, restructure `package.json` to use `main: src/index.ts` and `publishConfig.exports` for dual publish, and re-enable Biome on the package (`biome.json` no longer skips it). The published surface and runtime behaviour are unchanged: `default` and named `MorphoProtocolEvm` exports, the `bare` runtime entry, the `MORPHO_VAULT_PRESETS`/`MORPHO_MARKET_PRESETS` tables, and every method signature stay byte-compatible — only the source language and build pipeline change.

- Updated dependencies [[`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83), [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7), [`49b24e7`](https://github.com/morpho-org/sdks/commit/49b24e7e8ffc9e1ff6ea1381b81873de7cccdd83)]:
  - @morpho-org/morpho-sdk@3.1.0
  - @morpho-org/blue-sdk@6.0.1
  - @morpho-org/blue-sdk-viem@5.0.1

## 0.0.3

### Patch Changes

- Updated dependencies [[`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0), [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0), [`42c27ae`](https://github.com/morpho-org/sdks/commit/42c27ae6cdc6c58426b1d08e6646fd91886a46c0)]:
  - @morpho-org/morpho-sdk@3.0.0

## 0.0.2

### Patch Changes

- [#680](https://github.com/morpho-org/sdks/pull/680) [`0ff6191`](https://github.com/morpho-org/sdks/commit/0ff619140fcf6c1367662610ac5ebde602be29fe) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Bump pinned `@tetherto/*` runtime dependencies to the latest 1.x betas: `@tetherto/wdk-wallet` `1.0.0-beta.7` → `1.0.0-beta.8`, `@tetherto/wdk-wallet-evm` `1.0.0-beta.11` → `1.0.0-beta.12` (kept on the 1.x track; `2.0.0-rc.1` is the next major and out of scope). Also bumps the `viem` devDependency floor from `^2.49.3` to `^2.50.4` so the lockfile picks up the latest 2.x release; the `^2.0.0` peer range is unchanged. `cross-env@^7.0.3` and `jest@^29.7.0` are already at the latest release on their respective majors.

- [#680](https://github.com/morpho-org/sdks/pull/680) [`0ff6191`](https://github.com/morpho-org/sdks/commit/0ff619140fcf6c1367662610ac5ebde602be29fe) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Migrate `@morpho-org/wdk-protocol-lending-morpho-evm` into the `morpho-org/sdks` monorepo (TIB-2026-05-18). The package keeps its published name and public API unchanged; ownership, releases, and security review now follow the monorepo's Changesets + Cantina cadence. Workspace `@morpho-org/*` dependencies are now resolved via `workspace:^` ranges, and the existing jest unit + Anvil-fork integration suites run in CI on every push.

  **Note for downstream consumers:** `viem` moves from `dependencies` to `peerDependencies` (`^2.0.0`) to align with the rest of the monorepo's framework adapters. Consumers who already pull `@morpho-org/morpho-sdk` are unaffected since it already requires viem as a peer; any consumer that installed this package without viem will now need to add it explicitly. The dead per-package `overrides` block (axios bump for `@gelatonetwork/relay-sdk`) is removed — it had no effect at the sub-package level under pnpm and was already not applied in this monorepo's lockfile.

- [#680](https://github.com/morpho-org/sdks/pull/680) [`0ff6191`](https://github.com/morpho-org/sdks/commit/0ff619140fcf6c1367662610ac5ebde602be29fe) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Address Codex review feedback on the package migration:

  - Reject unsafe number amounts in `supply`/`withdraw`/`borrow`/`repay` inputs. When callers pass `amount` or `nativeAmount` as a `number` above `Number.MAX_SAFE_INTEGER`, JavaScript may already have rounded the value before `BigInt(amount)` ran, so the SDK could build a transaction for a different amount than requested. The normalizer now throws `'<field>' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.` for those inputs.
  - Stop declaring the whole package as side-effect-free. `bare.js` has a top-level `import 'bare-node-runtime/global'` that installs runtime globals, and a blanket `"sideEffects": false` could let bundlers drop that polyfill. The field is now `"sideEffects": ["./bare.js"]`.
  - Pin `bare-node-runtime` to the exact `1.3.1` rather than `^1.1.4`. `bare.js` runs `import 'bare-node-runtime/global'` at module load, so a floating range could pull unreviewed upstream releases into consumers and change runtime behavior without a repo change.
