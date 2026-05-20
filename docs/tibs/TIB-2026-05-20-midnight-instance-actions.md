# TIB-2026-05-20: Add Midnight instance actions for MarketV2 to morpho-sdk

| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Status**        | Proposed                                           |
| **Date**          | 2026-05-20                                         |
| **Author**        | @0xbulma                                           |
| **Scope**         | Package: `@morpho-org/morpho-sdk` (+ `@morpho-org/blue-sdk` address/ABI registry) |

---

## Context

`morpho-sdk` exposes action builders and entities for MarketV1 (Morpho Blue), VaultV1 (MetaMorpho), and VaultV2. The next protocol surface to integrate is **Midnight** — the codename for MarketV2, Morpho's fixed-rate, order-driven lending protocol. Midnight is live on Base (`Midnight` at `0xC6a17cd9d1fa17eec23ab9B4F77950e2FD6478F1`, `MidnightMempool` at `0xd25c7512EA5035bef4F18c708C0862E1B6151765`, `TakeBundler` at `0x487e6263188eFD547F6eFD9491AD902b5173ee72`).

A reference UI implementation exists in `morpho-org/morpho-apps`' `markets-v2-app` (action flows at `lib/modules/order/actions/`). Integrators currently re-implement the calldata, EIP-712 typed-data, rate↔tick math, and `Take[]` construction from the app. This duplicates protocol surface logic outside the SDK boundary, where it cannot be audited, fork-tested, or shipped as a versioned contract. Centralizing it in `morpho-sdk` follows the same justification we used for MarketV1 and VaultV2.

## Goals / Non-Goals

**Goals**

- Add a new `midnight/` instance under `packages/morpho-sdk/src/actions/` and `packages/morpho-sdk/src/entities/`, mirroring the layered shape of `marketV1/` and `vaultV2/`.
- Cover four user-facing actions end-to-end: `lendMarket`, `borrowMarket`, `lendLimit`, `borrowLimit`.
- Pin Midnight ABIs and addresses inside `@morpho-org/blue-sdk` (the existing source of truth for `getChainAddresses`), so no runtime ABI fetch is introduced.
- Lift these protocol-specific helpers from the app into the SDK, fully unit-tested: rate↔WAD-price conversion, rate↔tick snapping, `Take[]` builder from offers, `EcrecoverRatifier`/`ApprovalRatifier` calldata encoders, EIP-712 typed-data builder for limit-order roots.
- Model EIP-712 signing for limit orders via the existing `needsSignature` requirement pattern used for Permit2 in MarketV1: the entity's `getRequirements()` returns a `TypedDataSignatureRequirement`; the caller signs externally; `buildTx({ signature })` consumes it. Action builders remain non-async and contain no signing logic (CLAUDE.md §1, §2.3).
- Anvil fork tests on Base at pinned blocks for every action; property-based tests (`fast-check`) on rate/tick encoders and `Take[]` construction; unit tests with `createMockClient` for the typed-data builders and validation logic.
- JSDoc on every exported symbol with one realistic `@example` per action (CLAUDE.md §6).
- Typed error classes per failure mode (`MidnightNoMatchingOffersError`, `MidnightRateBelowMinError`, `MidnightInvalidRatifierError`, …) exported from `src/index.ts` (CLAUDE.md §3).

**Non-Goals**

- No multi-chain support beyond Base in this TIB. Adding a second chain is purely an `@morpho-org/blue-sdk` address-registry change and does not require revisiting this TIB.
- No quoter/offer fetching. `offers` is an input parameter; integrators bring their own quoter. (A typed quoter client may be added in a follow-up TIB.)
- No `wagmi`/`react` adapters in the core package. Framework adapters land later in `morpho-sdk-wagmi` if needed (CLAUDE.md §4).
- No actions for protocol/admin operations (`setIsAuthorized` self-service excepted, since it is a per-user prerequisite — see Implementation Phase 1).
- No changes to `marketV1/`, `vaultV1/`, or `vaultV2/` action shapes. Existing instances are untouched.
- No retroactive "marketV2" rename. The folder, exports, and types are named `midnight*` per the protocol codename.

## Current Solution

Today integrators who want Midnight functionality copy `markets-v2-app/lib/modules/order/actions/build*OrderActionFlow.ts` and its utility files into their app. They reimplement the EIP-712 root signing, ratifier calldata, and `Take[]` construction. There is no SDK-versioned, fork-tested, JSDoc'd interface, and there is no single place to pin Midnight's ABI or address.

## Proposed Solution

Add a `midnight/` instance to `morpho-sdk` that follows the established three-layer shape (Client → Entity → Action; CLAUDE.md §1):

```
packages/morpho-sdk/src/
├── actions/midnight/
│   ├── lendMarket.ts             # pure calldata builder, returns deep-frozen Transaction
│   ├── borrowMarket.ts
│   ├── lendLimit.ts              # consumes pre-signed EIP-712 root
│   ├── borrowLimit.ts            # consumes pre-signed EIP-712 root
│   ├── helpers/
│   │   ├── buildTakes.ts         # offers → on-chain Take[]
│   │   ├── ratifier.ts           # (v,r,s) ↔ EcrecoverRatifier calldata; ApprovalRatifier path
│   │   ├── rateTick.ts           # rate↔tick snapping, rate↔WAD-price
│   │   └── typedData.ts          # OFFER_ROOT_SIGNATURE_TYPES + buildOfferRootTypedData
│   ├── errors.ts                 # MidnightNoMatchingOffersError, …
│   └── index.ts                  # barrel
└── entities/midnight/
    ├── midnight.ts               # Midnight entity: lendMarket(), borrowMarket(), lendLimit(), borrowLimit()
    └── index.ts
```

Public surface lifts through `packages/morpho-sdk/src/actions/index.ts` and `packages/morpho-sdk/src/entities/index.ts`, then through `packages/morpho-sdk/src/index.ts`. No deep imports (CLAUDE.md §2.5).

**Action layer (pure, sync, no I/O).** Each action takes the resolved inputs (`obligation`, `accountAddress`, amounts, rate, `offers`, optional `signature` for limit orders) and returns a deep-frozen `Transaction<MidnightXxxAction>` with `{ to, value, data, action }`. The bundler routing matches the app:

- Market orders → `TakeBundler.bundleTake{Buyer,Seller}Assets`
- Limit orders → `MidnightMempool.submit`
- Authorization (one-time per user) → `Midnight.setIsAuthorized`

Validation errors are typed classes, never `throw new Error(…)` (CLAUDE.md §2.2, §3).

**Entity layer (reads on-chain state, returns `{ buildTx, getRequirements }`).** Mirrors `MarketV1` entity. `getRequirements()` returns the existing requirement union, extended with a `TypedDataSignatureRequirement { domain, types, primaryType, message }` variant for limit orders. The caller signs (via viem `walletClient.signTypedData`, wagmi `useSignTypedData`, or any EIP-712 signer), then calls `buildTx({ signature })`. For contract wallets, the entity instead returns an `ApprovalRatifierRequirement` describing the on-chain `approve(root)` call.

**Addresses & ABIs.** Add to `@morpho-org/blue-sdk`'s chain-addresses module (the existing source of truth used by `getChainAddresses(chainId)`): `midnight`, `midnightMempool`, `takeBundler`, `ecrecoverRatifier`, `approvalRatifier` for Base. Pin ABIs in `@morpho-org/blue-sdk` next to existing bundler3 ABIs.

**Helpers to lift from the app.** Copy semantics from `markets-v2-app` and re-implement as pure SDK helpers (no React, no quoter calls):

| App file                                                                                          | SDK destination                              |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `lib/modules/order/actions/market-order.utils.ts → buildTakesFromOffers`                          | `actions/midnight/helpers/buildTakes.ts`     |
| `lib/modules/order/actions/limit-order.utils.ts → encodeRatifierDataFromSignature, getRatifierInfo` | `actions/midnight/helpers/ratifier.ts`     |
| `lib/modules/offer/offer.utils.ts → rateToPrice, priceToRate`                                     | `actions/midnight/helpers/rateTick.ts`       |
| `lib/modules/offer/tick.utils.ts → snapRateToTick, tickToRate`                                    | `actions/midnight/helpers/rateTick.ts`       |
| `lib/modules/order/order.constants.ts → OFFER_ROOT_SIGNATURE_TYPES`                               | `actions/midnight/helpers/typedData.ts`      |

### Implementation Phases

- **Phase 1 — Foundations.** Pin Midnight + ratifier + mempool + TakeBundler ABIs and Base addresses in `@morpho-org/blue-sdk`. Add `actions/midnight/helpers/{rateTick,buildTakes,typedData,ratifier}.ts` with full unit and property-based tests. Add `actions/midnight/errors.ts` with all typed error classes. Add the one-time `setIsAuthorized` action + entity requirement. Land helpers and errors before any user-facing action so each later PR is small.
- **Phase 2 — Market orders.** Implement `lendMarket` and `borrowMarket` action builders + entity methods. Anvil fork tests on Base at a pinned block: place sample offers, execute, assert balances and emitted events.
- **Phase 3 — Limit orders.** Implement `lendLimit` and `borrowLimit` action builders + the `TypedDataSignatureRequirement` / `ApprovalRatifierRequirement` flow in the entity. Fork tests cover both the EOA (ecrecover) and contract-wallet (approve) paths.
- **Phase 4 — Polish & release.** JSDoc + `@example` audit, TypeDoc generation, JSDoc coverage report, semver-minor changeset (`@morpho-org/morpho-sdk`), migration note ("new instance, no existing API changed").

## Considered Alternatives

### Alternative 1: Folder named `marketV2/` (version-based, matches `marketV1`)

Use the existing version-based naming convention so the folder layout reads as `marketV1`, `marketV2`, `vaultV1`, `vaultV2`.

**Why rejected:** the protocol contracts and the markets-v2-app use the codename `Midnight` consistently (`Midnight`, `MidnightMempool`, `EcrecoverRatifier`). Mixing the version label `MarketV2` in SDK exports while the contracts read `Midnight` adds a translation step every integrator has to perform. Documentation cross-references the version label ("Midnight, formerly MarketV2") for searchability.

### Alternative 2: Wrap EIP-712 signing inside the action builder

Have the action call `walletClient.signTypedData` internally so callers don't have to thread a signature.

**Why rejected:** violates CLAUDE.md §1 (actions are sync, no I/O) and §2.3 (no signing in transaction builders). It also forces every integrator's transport choice (viem `WalletClient`, wagmi connector, raw EIP-1193, server-side signer) into the SDK surface — exactly the kind of coupling the layered architecture exists to prevent. The `needsSignature` requirement pattern already used for Permit2 is the precedent.

### Alternative 3: Phase the TIB — market orders first, limit orders later

Scope this TIB to `lendMarket` and `borrowMarket` only; defer limit orders to a follow-up TIB so the EIP-712 surface is designed separately.

**Why rejected:** the `needsSignature` requirement pattern already exists in `marketV1` for Permit2, so limit orders are not novel architecture — they are a second consumer of the same pattern. Splitting the TIB would force a second design discussion for what is, structurally, an additional `buildTx` path on the same entity.

## Assumptions & Constraints

- Midnight stays on Base only for the duration of this TIB. New chain deployments are an address-registry edit in `@morpho-org/blue-sdk`, not a TIB revision.
- The Midnight ABI is stable at the audited revision currently deployed at `0xC6a17cd9d1fa17eec23ab9B4F77950e2FD6478F1`. Any ABI bump before the SDK ships requires re-pinning before merge.
- The `OFFER_ROOT_SIGNATURE_TYPES` EIP-712 schema matches the on-chain `EcrecoverRatifier` verification (verified by Anvil fork tests; mismatch fails the fork test, not production).
- Integrators sign EIP-712 messages externally (viem `walletClient`, wagmi, ethers, etc.). The SDK never calls a wallet method.
- `viem` remains the only peer dep of `morpho-sdk` (CLAUDE.md §4). No new runtime dependencies.

## Dependencies

- `@morpho-org/blue-sdk` (workspace) — must accept the new address/ABI entries for Midnight on Base before `morpho-sdk` PRs land.
- `viem ≥ 2.x` (existing peer) — for `signTypedData` typing and `Address` / `Hex` types. No version bump.
- `@morpho-org/test` — Anvil harness (`createViemTest`, `createAnvilTestClient`) at a pinned Base block.
- `fast-check` (existing devDep) — property-based tests for rate/tick math.

## Security

- **Audit dependency.** Phase 2 and Phase 3 fork tests must encode the same `Take[]` and EIP-712 root that the live contracts validate; any divergence is a release-blocker. Audit re-verification of the calldata path is included in the next Cantina audit cycle (CLAUDE.md §7).
- **Signature handling.** The SDK accepts a pre-signed `(v, r, s)` and never holds the wallet. No private keys, no signers, no clipboard. Signatures are validated for shape (65 bytes, canonical `s`) before encoding.
- **`setIsAuthorized` is a one-time blanket authorization** of the bundler/mempool on the user's behalf. The entity surfaces it as an explicit requirement with a clear message; it is not granted implicitly inside a market-order or limit-order action.
- **Match-rate invariants.** `lendMarket` / `borrowMarket` enforce `minRate` / `maxRate` bounds against the matched offer set; a test fails if the bound is removed (CLAUDE.md §5 — security invariants as tests).
- **Ratifier mismatch.** EcrecoverRatifier vs. ApprovalRatifier selection is driven by EOA-vs-contract-wallet detection done in the entity. Wrong ratifier on chain reverts — verified by an explicit fork test with a contract wallet (Safe-like) fixture.

## Future Considerations

- A typed quoter client (akin to the existing GraphQL `api/sdk.ts`) for fetching `offers` from Morpho's off-chain orderbook. Out of scope here.
- A `morpho-sdk-wagmi` extension exposing React hooks for the `TypedDataSignatureRequirement` path. Out of scope here.
- Multi-chain Midnight: once a second deployment exists, add the address entries to `@morpho-org/blue-sdk`; no SDK action code changes expected. If a second deployment introduces ABI deltas, supersede this TIB.
- Liquidation paths and oracle-dependent flows on Midnight (separate TIB).

## Open Questions

_None blocking acceptance._ Quoter integration and wagmi adapter are deferred; multi-chain support is an address-registry edit when needed.

## References

- Markets V2 reference app: `morpho-org/morpho-apps/*/apps/markets-v2-app/lib/modules/order/actions/`
- MarketV1 layered pattern (template): `packages/morpho-sdk/src/actions/marketV1/borrow.ts`, `packages/morpho-sdk/src/entities/marketV1/marketV1.ts`
- VaultV2 (most recent comparable instance addition): `packages/morpho-sdk/src/actions/vaultV2/`, `packages/morpho-sdk/src/entities/vaultV2/`
- CLAUDE.md §1 (layering), §2 (forbidden patterns), §3 (type discipline), §5 (testing), §6 (JSDoc)
- [TIB-2026-04-27](./TIB-2026-04-27-maximize-unit-test-coverage.md) (mock-transport unit-test boundary) — applies to helper unit tests here
- [TIB-2026-05-04](./TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md) (JSDoc coverage on exported symbols) — applies to all new exports here

<!--
TIB conventions:
- Once accepted, do not substantively edit this TIB. If the decision needs to change,
  create a new TIB that supersedes this one and update the Status/Superseded by fields.
- Addenda may be appended to record operational updates that affect
  how the TIB is applied without changing the decision itself.
- TIB identifiers use CalVer (YYYY-MM-DD) based on the date the TIB was first drafted.
- A TIB is a *proposal* until its Status becomes Accepted. Once accepted, the rule the
  TIB decides on is codified in the relevant section of your project's central
  conventions doc (e.g., AGENTS.md or CLAUDE.md); the TIB stays as the dated record
  of how the decision was reached. TIBs feed the conventions doc — they do not
  override it.
-->
