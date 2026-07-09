# @morpho-org/wdk-protocol-lending-morpho-evm

## 1.0.1

### Patch Changes

- [#840](https://github.com/morpho-org/sdks/pull/840) [`878a5bc`](https://github.com/morpho-org/sdks/commit/878a5bc4a442d677637497f30378f28fa32ac38c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add native (wNative) wrapping to the Blue repay flows and reshape their amount args, matching the `blueSupply` devex.

  `MorphoBlue.repay` / `repayWithdrawCollateral` (entity) now take:

  - **assets mode** — `{ amount, nativeAmount? }`. Additive like `blueSupply`: the repaid assets are `amount + nativeAmount`, the ERC-20 pulled is `amount`, and `nativeAmount` is wrapped into wNative.
  - **shares mode** — `{ shares, nativeAmount? }`. Repays exact shares; the entity derives the ERC-20 pulled as `toBorrowAssets(shares) − nativeAmount` from live market state, wraps `nativeAmount`, and skims residual loan tokens back to `receiver`.

  `blueRepay` / `blueRepayWithdrawCollateral` (action) take a **flat, pre-resolved** shape `{ amount?, shares?, nativeAmount?, transferAmount }` — the action does no amount arithmetic. Assets mode repays `transferAmount` (= `amount + nativeAmount`) and pulls `amount`; shares mode repays `shares` and pulls `transferAmount` ERC-20 (already net of native).

  `nativeAmount` requires the market's loan token to be the chain's wNative. A fully-native repay pulls no ERC-20 and emits no approval requirement.

  **Breaking changes (migration):**

  - Assets mode renames `assets` → `amount`: replace `repay({ assets })` with `repay({ amount })`.
  - The action args of `blueRepay` / `blueRepayWithdrawCollateral` are now the flat `RepayActionAmountArgs` (`{ amount?, shares?, nativeAmount?, transferAmount }`) instead of `{ assets, shares, transferAmount }`. Assets mode: pass `{ amount, transferAmount: amount + nativeAmount }`. Shares mode: pass `{ shares, transferAmount }` where `transferAmount` is the ERC-20 to pull (net of native).
  - `RepayAmountArgs` is no longer a deprecated alias of `AssetsOrSharesArgs`; it is now the native-aware repay union (entity surface, `DepositAmountArgs | { shares }`). A new `RepayActionAmountArgs` is the flat action-layer shape. `AssetsOrSharesArgs` is unchanged and still used by `withdraw`.
  - The `validateRepayParams` helper is removed; amount resolution now lives in the entity, and the action validates only its cheap invariants. Negative repay amounts are rejected consistently: a negative `amount` (assets mode) or a negative shares-mode `transferAmount` now throws `NonPositiveRepayAmountError` from both `getRequirements` and `buildTx`, instead of the entity leaking a negative approval.
  - New exported error `NativeAmountExceedsTransferAmountError`, thrown when a shares-mode `nativeAmount` exceeds the loan assets to repay. The action layer validates its pre-resolved funding: assets mode requires `transferAmount === amount + nativeAmount` (`TransferAmountNotEqualToAssetsError`), shares mode requires positive funding (`transferAmount + nativeAmount > 0n`). `NonPositiveTransferAmountError` is retained as exported API but no longer thrown (deprecated, slated for removal in a future major).

  `@morpho-org/wdk-protocol-lending-morpho-evm` is updated to the renamed `amount` field for its Morpho repay path.

  `@morpho-org/liquidity-sdk-viem` bumps its `@morpho-org/morpho-sdk` peer dependency range to `^5.0.0` to track the new major.

- Updated dependencies [[`878a5bc`](https://github.com/morpho-org/sdks/commit/878a5bc4a442d677637497f30378f28fa32ac38c)]:
  - @morpho-org/morpho-sdk@5.1.0

## 1.0.0

### Major Changes

- [#829](https://github.com/morpho-org/sdks/pull/829) [`4d85d35`](https://github.com/morpho-org/sdks/commit/4d85d3579ce03669ddd6d40b02c6490c907b9b77) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Rename Blue requirement entrypoints and isolate Blue-specific requirement modules.

  The public GeneralAdapter requirement entrypoint is now `getGeneralAdapterRequirements`, and `getMorphoAuthorizationRequirement` is now `getBlueAuthorizationRequirement`. GeneralAdapter token permit requirement entrypoints are exported as `getGeneralAdapterRequirementsPermit` and `getGeneralAdapterRequirementsPermit2`, and the Permit2 approval encoder is exported as `encodeErc20Permit2Approve`. Protocol-agnostic approval and EIP-2612 encoding utilities remain exported from the common requirements barrel.

  Token signature requirement callers now pass the supported spender explicitly to `encodeErc20Permit`, while ERC-20 permit and approval encoding reject spenders outside the supported chain registry entries for the target chain.

  Token-pull builders now preserve Permit2 transfer routing even when the existing Permit2-managed allowance is already sufficient and no fresh Permit2 signature requirement is returned.

  High-level `buildTx` flows that pull tokens now reject unsigned transfers until `getRequirements()` has resolved whether to route through ERC-20 allowance or Permit2 allowance.

  Blue authorization requirement metadata is now protocol-prefixed as `BlueAuthorizationAction` with `action.type === "blueAuthorization"`. The previous `MorphoAuthorizationAction` type, `"morphoAuthorization"` discriminator, and `isRequirementAuthorization` guard are removed in favor of `isRequirementBlueAuthorization`.

  DAI-specific permit support is removed from maintained Morpho SDK action-flow surfaces. DAI now follows the same token-pull policy as other tokens that are incompatible with the SDK's standard ERC-2612 encoder: Blue requirement flows route DAI to Permit2, or to classic approval when Permit2 is unavailable, even when `useSimplePermit` is enabled and `nonces(owner)` is readable. The `getDaiPermitTypedData` re-export is removed from `@morpho-org/morpho-sdk/utils`.

  Update the WDK Morpho lending adapter to consume the renamed Blue authorization action metadata.

  Update `@morpho-org/liquidity-sdk-viem` to accept the new `@morpho-org/morpho-sdk` peer major used for reallocation data helpers.

### Minor Changes

- [#833](https://github.com/morpho-org/sdks/pull/833) [`e99bd39`](https://github.com/morpho-org/sdks/commit/e99bd39c760ead2779bf72ffa39ef3d93ae258f4) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add offchain `setAuthorizationWithSig` support for Morpho Blue bundled paths and switch entity `buildTx` to accept an array of signatures.

  When the client opts into offchain signatures (`supportSignature: true`), `getRequirements()` on the authorization-bearing Blue paths (`borrow`, `withdraw`, `supplyCollateralBorrow`, `repayWithdrawCollateral`, `refinance`) now returns a signable `Requirement` instead of a standalone `setAuthorization` transaction. Signing it yields an `AuthorizationRequirementSignature` that `buildTx` folds into the bundle as a `setAuthorizationWithSig` call, so GeneralAdapter1 is authorized in-bundle with no separate onchain transaction.

  **Breaking:** every entity `buildTx` now accepts an array of signatures (`buildTx(signatures?: readonly RequirementSignature[])`) instead of a single optional signature. Pass `buildTx([permitSignature])` where you previously passed `buildTx(permitSignature)`; combine the permit and authorization signatures in the same array for paths that need both (e.g. `supplyCollateralBorrow`). The array is split internally via the new `selectRequirementSignatures` helper (built on the `isPermitSignature` / `isAuthorizationSignature` type guards). `RequirementSignature` is now the discriminated union `PermitRequirementSignature | AuthorizationRequirementSignature`, and `Requirement<T>` is generic over the signature it produces.

  **Hardening of the signature array:** `buildTx` now rejects a `signatures` array that carries more than one signature of the same kind, or a signature kind the path does not consume, instead of silently keeping only the first — surfaced as the new `AmbiguousRequirementSignaturesError` / `UnexpectedRequirementSignatureError`. The authorization path is also pinned to the chain's GeneralAdapter1: `getBlueAuthorizationAction(chainId, signature)` now takes the `chainId` and throws `BundlerErrors.UnexpectedSignature` unless `authorized` is exactly GeneralAdapter1, so a bundle can never grant Morpho operator rights to an unintended address.

  New public surface: `AuthorizationAction`, `AuthorizationSignatureArgs`, `AuthorizationRequirementSignature`, `PermitRequirementSignature`, `isPermitSignature`, `isAuthorizationSignature`, `selectRequirementSignatures`, `SelectedRequirementSignatures`, `encodeBlueSignatureAuthorization`, `getBlueAuthorizationAction` (now `(chainId, signature)`), the `morphoSetAuthorizationWithSig` bundler action, `BundlerErrors.UnexpectedSignature`, `AmbiguousRequirementSignaturesError`, and `UnexpectedRequirementSignatureError`. `getBlueAuthorizationRequirement` gains a `supportSignature` option.

  **Breaking rename:** the previously-exported `getRequirementsAction` helper is renamed to `getTokenRequirementActions` and exported from the signature action surface. Its return type is `Action[]`; the new name reflects that it encodes the token permit / permit2 requirement into a list of bundler actions. Update imports of `getRequirementsAction` to `getTokenRequirementActions`.

  `@morpho-org/wdk-protocol-lending-morpho-evm` is updated to pass single signatures as arrays to `buildTx` and widens `getBorrowRequirements` to surface the new signable authorization requirement. `MorphoBorrowOptions` gains a `requirementSignature` field, plumbed through `borrow` / `quoteBorrow`, so a signed authorization fetched via `getBorrowRequirements` (when `supportSignature: true`) can be folded into the bundle as `setAuthorizationWithSig` instead of requiring a separate `setAuthorization` transaction.

  `@morpho-org/liquidity-sdk-viem` bumps its `@morpho-org/morpho-sdk` peer-dependency range to `^5.0.0` to track the new major (the previous `^3.0.0` range no longer matched the published version).

### Patch Changes

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, `assertNonNegative`, and `_try`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, `_try`, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

- [#823](https://github.com/morpho-org/sdks/pull/823) [`e0208c2`](https://github.com/morpho-org/sdks/commit/e0208c299fa68552cc2b93adbd93b5d30ecaff5c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix the deployless `GetVault` query reverting on all MetaMorpho vaults.

  `fetchVault` (and `fetchAccrualVault`) silently fell back to multicall because the deployless query reverted while decoding the EIP-5267 domain: reading the high-level `eip712Domain()` struct return hits a Solidity via-IR decoding regression that reverts on valid domains. The query now decodes the raw `eip712Domain()` returndata as a tuple, the same workaround already used by `GetToken`. `deployless: "force"` no longer throws and the deployless fast path is restored (one RPC round-trip instead of a full multicall).

  The deployless query now also reads `lostAssets` (MetaMorpho V1.1), so the deployless and multicall paths return identical `Vault` state.

- [#846](https://github.com/morpho-org/sdks/pull/846) [`6cac91f`](https://github.com/morpho-org/sdks/commit/6cac91f546db8cfe42bb1e9c103028db59c41429) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh the WDK runtime dependency pins to the latest age-eligible 1.x beta releases as part of the weekly non-deprecated SDK dependency update.

  No peer range widening or source compatibility changes were required for this package.

- [#808](https://github.com/morpho-org/sdks/pull/808) [`c5b2752`](https://github.com/morpho-org/sdks/commit/c5b2752c69f1af6e0e087abc3e9e0f68c8f1f383) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh non-deprecated SDK dependencies.

  - Update runtime dependencies in `@morpho-org/wdk-protocol-lending-morpho-evm`.

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`4d85d35`](https://github.com/morpho-org/sdks/commit/4d85d3579ce03669ddd6d40b02c6490c907b9b77), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`e0208c2`](https://github.com/morpho-org/sdks/commit/e0208c299fa68552cc2b93adbd93b5d30ecaff5c), [`e99bd39`](https://github.com/morpho-org/sdks/commit/e99bd39c760ead2779bf72ffa39ef3d93ae258f4), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb), [`cdff8c4`](https://github.com/morpho-org/sdks/commit/cdff8c458445d4ad7ff596ec316a5a8e8c0a12f3)]:
  - @morpho-org/morpho-sdk@5.0.0
  - @morpho-org/blue-sdk-viem@5.1.2
  - @morpho-org/blue-sdk@6.3.0

## 0.0.6

### Patch Changes

- [#752](https://github.com/morpho-org/sdks/pull/752) [`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Morph and MegaETH chain metadata, deployment addresses, deployment block lower bounds, and wrapped-native mappings.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- [#767](https://github.com/morpho-org/sdks/pull/767) [`ce4f5dc`](https://github.com/morpho-org/sdks/commit/ce4f5dc855b3d28d5d5f4f9857e6a7b0670fdb59) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Track the `morpho-sdk` `MarketV1` → `Blue` rename: the internal Morpho market entity is now obtained via `client.blue(...)` instead of `client.marketV1(...)`. No public API change.

- [#763](https://github.com/morpho-org/sdks/pull/763) [`d79a788`](https://github.com/morpho-org/sdks/commit/d79a7884bdf7a7eed7c38efa4e8456b859e2bc4f) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Consume `@morpho-org/morpho-sdk` through the viem extension (`client.extend(morphoViemExtension(...)).morpho`) instead of the removed `MorphoClient` class. No change to the protocol adapter's public behavior.

- [#782](https://github.com/morpho-org/sdks/pull/782) [`bb82f64`](https://github.com/morpho-org/sdks/commit/bb82f6488986e91b228469dca12444a962922c84) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh direct runtime dependencies as part of the weekly SDK dependency update.

  Updated the WDK wallet/runtime dependencies for `@morpho-org/wdk-protocol-lending-morpho-evm`. Peer dependency ranges did not require widening for the updated devDependencies. Deprecated packages stayed frozen. The Biome schema was synchronized with the updated Biome devDependency, and checksum-address lint refreshed `@morpho-org/blue-sdk-viem` source examples for the updated `viem` checksum output.

- Updated dependencies [[`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c), [`ce4f5dc`](https://github.com/morpho-org/sdks/commit/ce4f5dc855b3d28d5d5f4f9857e6a7b0670fdb59), [`d79a788`](https://github.com/morpho-org/sdks/commit/d79a7884bdf7a7eed7c38efa4e8456b859e2bc4f), [`fab0186`](https://github.com/morpho-org/sdks/commit/fab018666faef372a7f695edcd4b54e658f73118), [`bb82f64`](https://github.com/morpho-org/sdks/commit/bb82f6488986e91b228469dca12444a962922c84)]:
  - @morpho-org/blue-sdk@6.2.0
  - @morpho-org/morpho-sdk@4.0.0
  - @morpho-org/blue-sdk-viem@5.1.1

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
