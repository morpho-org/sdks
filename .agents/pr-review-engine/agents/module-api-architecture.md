---
name: module-api-architecture
kind: baseline
applies: AGENTS.md §1 Architecture (layering, modularity), §2 Forbidden patterns (rule 5 — deep cross-package imports), §3 Type discipline (at the boundary), §4 Public API & packaging, §7 Releases & versioning (deprecation lifecycle)
out-of-scope:
  - Lint mechanics (2-space indent, organize-imports) — see style-conventions.
  - Type-safety inside a function body — see code-quality.
  - JSDoc on the exported symbols — see documentation.
focus: Package boundaries, public surface and deprecation lifecycle, type/import discipline, NodeNext compatibility.
---

# Module & API Architecture

Focus: package boundaries, public surface and deprecation lifecycle, type/import discipline, NodeNext compatibility. The authoritative rules live in [`AGENTS.md`](../../../AGENTS.md) §1 (Architecture), §2 (Forbidden patterns — rule 5: deep cross-package imports), §3 (Type discipline), §4 (Public API & packaging), and §7 (Releases & versioning) — read those first; the bullets below are the application points.

## What to flag

Per AGENTS.md §1, §2 (rule 5), and §4 — package boundaries, forbidden deep imports, and the public surface:

- A new deep import across packages — e.g. `from "@morpho-org/foo/src/internal/..."` instead of going through `@morpho-org/foo`'s `src/index.ts`. The receiving package's `src/index.ts` is the only public entry point.
- A new export from `src/index.ts` (or removal/rename of an existing one) — flag for cross-file impact on consumers; check that downstream code in the monorepo and the JSDoc still match.
- A consumer-facing export added or changed in `blue-sdk`, `blue-sdk-viem`, or `midnight-sdk` without a same-PR audit of the matching `morpho-sdk` facade subpath. Flag drift between an established raw `/blue/<category>` or `/midnight/<category>` surface and its unprefixed facade, protocol-specific unprefixed names without `Blue`/`Midnight` qualification, qualified names for genuinely shared symbols, legacy ambiguous names removed without deprecation, and facade expansion into a new upstream surface solely for parity.
- A layering reversal — entity reading state when it should be lazy, action encoding calldata that should belong to a helper, helper depending on an entity, etc. (See the §1 Layering table.)
- An entity flow that shares in-memory state between `getRequirements()`/`sign()` and `buildTx()` — e.g. an `ActionOutput` closing over a `Map`/`Set`/array/object that signing mutates and `buildTx` later reads. Everything `buildTx` needs must come from its arguments, including data carried on the `RequirementSignature` objects (`signature.args`); a side cache breaks `prepare-on-instance-A → finalize-on-instance-B` and serialize-then-resume flows. Also flag a `let` binding or memoized promise that `buildTx` awaits or reads: the only permitted mutable binding is an in-flight `getRequirements()` promise shared between concurrent callers and cleared on settlement. Run the acceptance checklist of [`ADR-2026-09-23-stateless-entity-flows`](../../../docs/adrs/ADR-2026-09-23-stateless-entity-flows.md) on every new or changed flow. This is a hard gate: flag as **critical** (merge-blocking), never downgrade it for a flow that "works" on a single handle.
- A helper that mutates inputs or violates an explicit fresh-object return contract. Returning an input unchanged or reusing an existing object is not itself a violation; require fresh objects only when the function's documented contract promises them.
- A public `*Utils` factory whose main job is returning a public class instance. Prefer a static method on the class (`Offer.create`, `Group.create`, `Tree.create`) and keep the `*Utils` namespace for pure object-compatible implementation.
- A class-specific getter or method that reimplements domain logic instead of delegating to a pure `*Utils` function that accepts readonly plain objects compatible with the class shape.
- A local, non-exported helper introduced with fewer than three call sites. Inline one-off and two-use helpers.
- Duplicate public TypeScript shapes for the same concept. If a domain interface and ABI struct are identical, expect one exported interface reused by both paths; a separate `*Struct` type needs a real shape difference.
- A new framework import (`react`, `wagmi`, `redux`, `ethers`) in a core SDK package. Framework adapters live in explicitly named packages (`*-wagmi`, `*-viem`); core packages stay framework-free.
- Internal workspace dependencies that do not use `workspace:` ranges, except `peerDependencies`: internal peers intentionally use explicit published semver ranges so Changesets does not auto-bump peer dependents. When a package is bumped, check all packages that declare it as a peer dependency; flag missing peer range updates or missing explicit dependent changesets.

Per AGENTS.md §7 — public deprecation lifecycle:

- A removed, renamed, or retyped public symbol that skips the default deprecation flow without an explicitly codified exception. The `BlueBundlesV1` exception applies only to the route-specific input and output changes listed in its linked ADR, preserves the established method and action names, and does not waive that exception's release duties. It does not cover Vault V1 reallocation inputs: those high-level Blue and WDK flows require a published deprecation minor before becoming Vault V2-only in the next majors. A parallel `Vault V2 forceWithdraw` route exception (its linked ADR's rejected Alternative 2 documents the fund-safety reason a coexistence minor is unsafe) covers the `forceWithdraw` method/action retype to `VaultExitBundlesV1` while preserving the names; like the `BlueBundlesV1` one it is route-scoped and does not waive the major changeset, migration guide, or maintained-dependent duties. A third Bundler3-primitive removal exception ([`ADR-2026-09-17-remove-bundler3-primitives-without-deprecation`](../../../docs/adrs/ADR-2026-09-17-remove-bundler3-primitives-without-deprecation.md)) covers the never-deprecated low-level Bundler3 and migration-adapter removals across `morpho-sdk`, `wdk-protocol-lending-morpho-evm`, `morpho-ts`, `blue-sdk`, and `blue-sdk-viem` — the `./bundler` subpath and `BundlerAction`, Bundler3 executor/adapter ABIs, addresses, and registry trees, `getGeneralAdapterRequirements*`, `Holding.permit2BundlerAllowance`, `User.isBundlerAuthorized`, the five v5 partial-refinance error classes, and the compatibility symbols first deprecated only during the prereleases. Like the route exceptions it does not waive major changesets, migration guides, or the maintained-dependent audit and bumps; no break outside that record's listed scope inherits it. The EVM simulation v5 retirement exception ([`ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation`](../../../docs/adrs/ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation.md)) covers `evm-simulation` 5.0.0 removing `TenderlyRpcConfig`, `ChainSimulationConfig.tenderlyRpc`, and the Tenderly/provider-fallback behavior (SDK-1291), and, under [`ADR-2026-10-02-evm-simulation-remove-legacy-authorization-variants-without-deprecation`](../../../docs/adrs/ADR-2026-10-02-evm-simulation-remove-legacy-authorization-variants-without-deprecation.md), the two legacy `{ type: "approval" }` / `{ type: "signature" }` variants of `SimulateParams.authorizations` and `"pending"` as a `SimulateParams.blockNumber` value (SDK-1293); it does not waive the major changeset, migration notes, the maintained-dependent audit, or continued availability of the previous major, and no other removal inherits it. A fifth `MidnightBundlesV2` route exception ([`ADR-2026-10-02-midnight-bundles-v2-sdk-actions`](../../../docs/adrs/ADR-2026-10-02-midnight-bundles-v2-sdk-actions.md)) covers the `morpho-sdk` 7.0.0 retype of `takeLend`, `takeBorrow`, `supplyCollateralTakeBorrow`, `repayWithdrawCollateral` and `supplyCollateralMakeBorrow` to `MidnightBundlesV2`, including the removal or retype of the route-specific inputs, action `args`, requirements and authorization targets listed in that record (among them `PermitKind` and `MidnightTokenPermit`), while preserving the method names, and the action names of the four V1 flows; `supplyCollateralMakeBorrow` moves from `mempoolSubmitOffers` to `midnightCancelAndMake`, returning the retyped `MakeOffersOutput`. The maker methods `makeLend`, `makeBorrow` and `supplyCollateralMakeBorrow` keep their v6 names and are retyped in place onto `MidnightBundlesV2`, and `MakeOffersOutput` is retyped in place as well. The parent record's `cancelAndMakeLend` and `cancelAndMakeBorrow` ship as `makeLend` and `makeBorrow`, so no `cancelAndMake*` entity methods are added. [`ADR-2026-10-02-remove-midnight-mempool-maker-route`](../../../docs/adrs/ADR-2026-10-02-remove-midnight-mempool-maker-route.md) extends it: 7.0.0 also retypes `makeLend`, `makeBorrow` and `supplyCollateralMakeBorrow` in place onto MidnightBundlesV2 under their v6 names (the record's `cancelAndMakeLend`/`cancelAndMakeBorrow` ship as `makeLend`/`makeBorrow`), retypes `MakeOffersOutput`, and removes `mempoolSubmitOffers`, `setterRatifierRatifyRoot` and the offer-root signature types and errors listed in that record, with no deprecation window. It also covers removing the V1 contract symbols in the same transition: `midnightBundlesAbi` from `midnight-sdk` 2.0.0 and its `morpho-sdk` 7.0.0 re-exports, the `midnightBundles` address and deployment-block keys from `morpho-ts` 4.0.0 and the address and deployment registries `blue-sdk` 8.0.0 re-exports, with the next `evm-simulation` major's bundle-retention guard restricting `midnightBundlesV2` in place of `midnightBundles` (V1 coverage is dropped deliberately). Like the others it does not waive the major changesets, migration guides, maintained-dependent audit and peer-range bumps, or continued availability of the previous majors.

Per AGENTS.md §3 — type discipline at the boundary:

- A public field that should be `readonly` but isn't.
- A new error path that throws a generic `Error` instead of a named, exported error class.
- An options-bag where a discriminated union with a `type` tag would be clearer.
- Re-export of an upstream type that should have been absorbed locally (when the upstream type is at risk of churn).

Per AGENTS.md §8 — NodeNext compatibility on imports (mechanical compliance lives in `style-conventions`; this persona flags it only when it affects module resolution at the boundary):

- A relative import without the `.js` suffix that breaks NodeNext resolution at consumer sites.
- A type that should be `import type { ... }` to avoid pulling runtime code into the bundle.

## Severity guidance

- **Critical** — an entity flow whose `buildTx` reads state written by `getRequirements()`/`sign()` (hard gate, see `ADR-2026-09-23-stateless-entity-flows`).
- **High** — public-surface break (changed/removed export without the default deprecation flow or an applicable explicit §7 exception), framework import in a core package, deep cross-package import.
- **Medium** — layering reversal that compiles but violates §1; public `*Utils` factory returning a class instance instead of a static class constructor; class-specific logic duplicated instead of delegating to object-compatible utils; missing `readonly` on a public field; generic `Error` thrown from an exported path.
- **Low** — internal-only suggestions about how a private helper could be reshaped (often out of scope — defer to `code-quality`).

## Out-of-scope reminders (for the sub-agent)

- Do NOT flag style/lint mechanics — that's `style-conventions`'s job. The `.js` suffix is shared between the two only when it actually breaks module resolution at the boundary; mechanical compliance is `style-conventions`.
- Do NOT review JSDoc on exported symbols — that's `documentation`'s job.
- Do NOT review type-safety inside a function body — that's `code-quality`'s job. This persona reviews the *shape* at the boundary, not implementation details.
- Reference the root [`AGENTS.md`](../../../AGENTS.md), the package's `AGENTS.md` (and any nested `AGENTS.md`), and the package's own `package.json` `exports` field as `<PROJECT_CONTEXT>`.
