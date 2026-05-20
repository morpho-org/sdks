# @morpho-org/wdk-protocol-lending-morpho-evm

## 0.0.2

### Patch Changes

- [#680](https://github.com/morpho-org/sdks/pull/680) [`0ff6191`](https://github.com/morpho-org/sdks/commit/0ff619140fcf6c1367662610ac5ebde602be29fe) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Bump pinned `@tetherto/*` runtime dependencies to the latest 1.x betas: `@tetherto/wdk-wallet` `1.0.0-beta.7` → `1.0.0-beta.8`, `@tetherto/wdk-wallet-evm` `1.0.0-beta.11` → `1.0.0-beta.12` (kept on the 1.x track; `2.0.0-rc.1` is the next major and out of scope). Also bumps the `viem` devDependency floor from `^2.49.3` to `^2.50.4` so the lockfile picks up the latest 2.x release; the `^2.0.0` peer range is unchanged. `cross-env@^7.0.3` and `jest@^29.7.0` are already at the latest release on their respective majors.

- [#680](https://github.com/morpho-org/sdks/pull/680) [`0ff6191`](https://github.com/morpho-org/sdks/commit/0ff619140fcf6c1367662610ac5ebde602be29fe) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Migrate `@morpho-org/wdk-protocol-lending-morpho-evm` into the `morpho-org/sdks` monorepo (TIB-2026-05-18). The package keeps its published name and public API unchanged; ownership, releases, and security review now follow the monorepo's Changesets + Cantina cadence. Workspace `@morpho-org/*` dependencies are now resolved via `workspace:^` ranges, and the existing jest unit + Anvil-fork integration suites run in CI on every push.

  **Note for downstream consumers:** `viem` moves from `dependencies` to `peerDependencies` (`^2.0.0`) to align with the rest of the monorepo's framework adapters. Consumers who already pull `@morpho-org/morpho-sdk` are unaffected since it already requires viem as a peer; any consumer that installed this package without viem will now need to add it explicitly. The dead per-package `overrides` block (axios bump for `@gelatonetwork/relay-sdk`) is removed — it had no effect at the sub-package level under pnpm and was already not applied in this monorepo's lockfile.

- [#680](https://github.com/morpho-org/sdks/pull/680) [`0ff6191`](https://github.com/morpho-org/sdks/commit/0ff619140fcf6c1367662610ac5ebde602be29fe) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Address Codex review feedback on the package migration:

  - Reject unsafe number amounts in `supply`/`withdraw`/`borrow`/`repay` inputs. When callers pass `amount` or `nativeAmount` as a `number` above `Number.MAX_SAFE_INTEGER`, JavaScript may already have rounded the value before `BigInt(amount)` ran, so the SDK could build a transaction for a different amount than requested. The normalizer now throws `'<field>' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.` for those inputs.
  - Stop declaring the whole package as side-effect-free. `bare.js` has a top-level `import 'bare-node-runtime/global'` that installs runtime globals, and a blanket `"sideEffects": false` could let bundlers drop that polyfill. The field is now `"sideEffects": ["./bare.js"]`.
  - Pin `bare-node-runtime` to the exact `1.3.1` rather than `^1.1.4`. `bare.js` runs `import 'bare-node-runtime/global'` at module load, so a floating range could pull unreviewed upstream releases into consumers and change runtime behavior without a repo change.
