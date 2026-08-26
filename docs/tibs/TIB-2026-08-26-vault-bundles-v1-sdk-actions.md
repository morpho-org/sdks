# TIB-2026-08-26: VaultBundlesV1 SDK action flows

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| **Status** | Proposed                                       |
| **Date**   | 2026-08-26                                     |
| **Author** | @foulques                                      |
| **Scope**  | Packages: `morpho-sdk`, `morpho-ts`, `wdk-protocol-lending-morpho-evm` |

---

## Context

The protocol team is replacing Bundler3 / GeneralAdapter1 with `morpho-org/bundles`: a family of
non-modular contracts whose call order, token routing, permit handling, fee accounting, and refund
behavior are fixed and audited onchain. `VaultBundlesV1` is the vault member of that family and
covers every ERC-4626 flow the SDK exposes today for Vault V1 (MetaMorpho V1 / V1.1) and Vault V2:

| Entrypoint | Purpose |
| ---------- | ------- |
| `vaultBundlesV1Deposit` | Pull (or wrap) assets and deposit them into a vault for `msg.sender`. |
| `vaultBundlesV1Withdraw` | Withdraw by assets **or** redeem by shares, and pay the proceeds to `msg.sender`. |
| `vaultBundlesV1Migrate` | Exit a source vault and deposit the proceeds into a same-asset destination vault. |

Three prior decisions constrain this one:

- **[TIB-2026-07-27](./TIB-2026-07-27-vault-exit-in-kind-redemption.md)** shipped
  `VaultExitBundlesV1`, the first fixed-entrypoint bundle contract in `morpho-sdk`. Its `Permit`
  reshaping, empty-permit sentinel, deadline convention, `getRequirements()`/`buildTx()` split, and
  **deliberate refusal to pre-check vault gates** are the precedent this TIB follows.
- **[TIB-2026-08-25](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)** (PR #937) and its
  implementation (PR #945) added `BlueBundlesV1`. `VaultBundlesV1` shares its `TokenLib`
  primitives — `TokenPermit`, `Permit`, `pullOrWrapNative`, `forceApproveMax`, the transient
  `initiator` guard, and the `referralFeePct` / `referralFeeRecipient` / `deadline` tail. Those
  primitives must become **one** shared SDK brick, not two protocol-scoped copies.
- The **Transaction Flow Migration** plan tracks each app-facing action's route, target release,
  breaking-change flag, and expected UX regression. Eleven of its rows resolve to this contract.

This TIB lands on the bundles-migration integration branch (the "master PR"), which accumulates
every bundler3-replacement change and merges as one **major** release. That framing is load-bearing:
it is what allows the existing builders to change route without a parallel surface.

The contract revision reviewed for this proposal is `morpho-org/bundles` commit
`f27e7bcf744310303e24faa522b71d702e696686`. The implementation must pin the ABI from the final
reviewed deployment revision.

## Goals / Non-Goals

**Goals**

- Route Vault V1 and Vault V2 deposit, withdraw, redeem, and V1→V2 migration through
  `VaultBundlesV1`, **keeping every existing exported builder and entity method name**.
- Extract the `TokenLib` surface shared with `BlueBundlesV1` into one set of SDK bricks.
- Reuse the existing requirement, share-price, deadline, and permit machinery rather than growing a
  parallel one.
- Enumerate every breaking change, UX regression, capability loss, and new failure mode **before**
  implementation, and decide the mitigation for each.

**Non-Goals**

- **No new `vaultBundlesV1*` action namespace.** The contract is an implementation detail of
  `vaultV1Deposit`, `vaultV2Withdraw`, and their siblings — not a second public vocabulary.
- No version-agnostic migration surface. The contract accepts any same-asset ERC-4626 pair, but
  only V1→V2 is in the migration plan; widening it is a Future Consideration, not this change.
- No `VaultExitBundlesV1` work. In-kind redemption already ships; the pending
  `vaultExitBundlesV1ForceWithdrawVaultV2` migration of `forceWithdraw` / `forceRedeem` is a
  sibling TIB on the same integration branch.
- No Aave V3 → Vault V2 migration. `VaultBundlesV1` has no foreign-protocol entrypoint; that flow
  is tracked separately and still needs a contract.
- No `wrapMorphoLegacy` change. It stays a direct call.
- No generic bundle-call, callback, or multi-vault composition API.
- No automatic routing between Bundler3 and `VaultBundlesV1`.
- No new share-price protection that the contract cannot enforce, and no gate pre-flight the
  contract's execution context makes unreliable.

## Current Solution

| App-facing flow | Today's route | Today's SDK shape |
| --------------- | ------------- | ----------------- |
| `vaultV1Deposit` / `vaultV2Deposit` | Bundler3 → GA1 `erc4626Deposit` | `deposit({ userAddress, vaultData, amount?, nativeAmount?, slippageTolerance? })` → `{ buildTx, getRequirements }`; `amount` and `nativeAmount` are **additive**; action takes `recipient`. |
| `vaultV1Withdraw` / `vaultV2Withdraw` | Direct vault call | `withdraw({ amount, userAddress })` → `{ buildTx }` **only**; no requirements, no deadline, no slippage. |
| `vaultV1Redeem` / `vaultV2Redeem` | Direct vault call | `redeem({ shares, userAddress })` → `{ buildTx }` only. |
| `vaultV1MigrateToV2` | Bundler3 → GA1 `erc4626Redeem` + `erc4626Deposit` | `migrateToV2({ userAddress, sourceVault, targetVault, shares, slippageTolerance? })`; action takes `minSharePriceVaultV1`, `maxSharePriceVaultV2`, `recipient`; shares only. |

Relevant existing bricks: `encodeVaultSharesPermit` (ERC-2612 on shares, V1/V2 domain split),
`getVaultExitBundlesV1PermitStruct` (`Permit` tuple + empty sentinel),
`getGeneralAdapterRequirements` (approval / ERC-2612 / Permit2 dispatch, GA1-locked),
`getRequirementsApproval` (spender-agnostic, classic approval only), `encodeErc20Approval`,
`validateRequirementSpender`, `selectRequirementSignatures`, `MathLib.wToRay`,
`MAX_ABSOLUTE_SHARE_PRICE`, `DEFAULT_SLIPPAGE_TOLERANCE`, `validateSlippageTolerance`,
`ExpiredDeadlineError`, and the 2-hour default deadline from `inKindRedeem`.

## Proposed Solution

### 1. Shared `bundles` bricks come first

`BlueBundlesV1` and `VaultBundlesV1` consume the same `TokenLib` types. Per §1 (single source of
truth), the master PR extracts them once into `src/actions/bundles/`, and PR #945's
`BlueBundles*`-prefixed copies are renamed to the shared names as part of the same change:

| Shared brick | Replaces | Consumers |
| ------------ | -------- | --------- |
| `BundlesPermitKind` (`None` / `ERC2612` / `Permit2`), `BundlesTokenPermit` | `BlueBundlesPermitKind`, `BlueBundlesTokenPermit` | Blue supply/repay/collateral, vault deposit |
| `getBundlesTokenPermit(...)` — reshape a `PermitRequirementSignature` into `TokenPermit{kind,data}` | new (PR #945 accepts an ABI-ready struct and never builds one) | same |
| `getBundlesSharesPermit(...)` — reshape into `Permit{value,nonce,deadline,v,r,s}` + empty sentinel | `getVaultExitBundlesV1PermitStruct` (kept as a deprecated alias for the in-kind paths) | vault withdraw / redeem / migrate, vault-exit |
| `resolveBundlesFunding({ amount, nativeAmount, asset, chainId })` — XOR funding resolver returning `{ assets, value }` | inlined `nativeAmount` handling in PR #945 | Blue + vault deposit paths |
| `getBundlesTokenRequirements(...)` — spender-parameterized approval / ERC-2612 / Permit2-SignatureTransfer resolver | generalizes `getGeneralAdapterRequirements` | all bundles funding paths |
| `encodeErc20Permit2SignatureTransfer(...)` | new — see §4 | all bundles funding paths |
| `computeVaultMaxSharePrice({ vaultData, assets, slippageTolerance })` in `helpers/slippage.ts` | three inline copies in `vaultV1`/`vaultV2` entities | vault deposit, migration destination leg |
| `grossFromNetAssets({ netAssets, referralFeePct })` | new | referral-fee call sites |
| `bundles.vaultBundlesV1` registry slot + `vaultBundlesV1Abi` + `RequirementSpenderKey` entry | new | — |

`resolveBundlesFunding` also fixes a latent bug in PR #945: `blueBundlesV1Supply` forwards `assets`
and `nativeAmount` independently, so `{ assets: 100n, nativeAmount: 50n }` encodes cleanly and
reverts onchain with `InconsistentAmountAndNative`. Deriving the ABI `assets` from whichever funding
side is set makes `assets == msg.value` structurally true on the native path.

### 2. Surface placement: re-route the existing builders in place

There is **no new action namespace and no new file tree**. The existing modules change what they
encode:

| Existing export — name unchanged | File | New route |
| -------------------------------- | ---- | --------- |
| `vaultV1Deposit`, `vaultV2Deposit` | `actions/vaultV1/deposit.ts`, `actions/vaultV2/deposit.ts` | `vaultBundlesV1Deposit` (payable) |
| `vaultV1Withdraw`, `vaultV2Withdraw` | `actions/*/withdraw.ts` | `vaultBundlesV1Withdraw`, assets mode (`shares = 0`) |
| `vaultV1Redeem`, `vaultV2Redeem` | `actions/*/redeem.ts` | `vaultBundlesV1Withdraw`, shares mode (`assets = 0`) |
| `vaultV1MigrateToV2` | `actions/vaultV1/migrateToV2.ts` | `vaultBundlesV1Migrate` |

Entity methods keep their names too: `client.morpho.vaultV1(vault, chainId).deposit(...)`,
`.withdraw(...)`, `.redeem(...)`, `.migrateToV2(...)`, and the `vaultV2` equivalents.

Rationale: the migration plan lists these exact actions as changing route, not as gaining a second
route. The contract is a routing detail — the caller already expressed intent by scoping a vault and
naming an operation, and a `vaultBundlesV1Deposit` export next to `vaultV1Deposit` would force every
integrator to choose a route they have no basis to choose. Nothing is deleted and nothing is
renamed, so §7's deprecation flow has no removal to cover: `withdraw` and `redeem` stay two methods
over the contract's one XOR entrypoint, and `migrateToV2` keeps its name and its V1→V2 scope.

Symbols are **retyped**, not removed — that is a major-release change and the reason this work sits
behind the master PR. Where a parameter disappears (`recipient`, `onBehalf`,
`minSharePriceVaultV1`), it is a hard compile error rather than a silently-ignored field: quietly
accepting a `recipient` the contract cannot honor would misroute funds.

This diverges from PR #945, which added a parallel chain-scoped `blueBundlesV1(chainId)` entity with
a `blueBundlesV1*` action vocabulary. The master PR should converge Blue on the same rule. See Open
Questions.

### 3. Requirements

**Deposit funding.** The asset is pulled from `msg.sender` by `TokenLib.pullOrWrapNative`, so the
spender is `VaultBundlesV1`. All three funding paths the contract accepts must be reachable from
`getRequirements()`, not just from the ABI:

- classic ERC-20 approval — `encodeErc20Approval` with `vaultBundlesV1` added to the allow-list;
- ERC-2612 — `encodeErc20Permit`, reshaped by `getBundlesTokenPermit` into
  `TokenPermit{kind: ERC2612, data: abi.encode(deadline, v, r, s)}`;
- Permit2 **SignatureTransfer** — new encoder, see below.

The Permit2 point is not optional. `TokenLib.pullToken` calls
`IPermit2.permitTransferFrom(PermitTransferFrom(TokenPermissions(token, amount), nonce, deadline), …)`.
The SDK's existing `encodeErc20Permit2Approve` produces an **AllowanceTransfer** `PermitSingle`
signature; it is a different EIP-712 type and is not consumable by this contract. PR #945 sidestepped
this by resolving classic approvals only; carrying that choice into vault deposits would turn a
signature into an extra transaction for every Permit2 user.

**SignatureTransfer nonces are unordered**, not sequential: Permit2 tracks them in
`nonceBitmap(owner, wordPos)` — already present in `packages/morpho-ts/src/abis.ts`. A signature
whose bit is already flipped reverts, and an unsubmitted signature leaves its bit free forever, so
reusing "the next nonce" is not a strategy. `getBundlesTokenRequirements` therefore reads
`nonceBitmap` and picks the **lowest free bit deterministically**: scan `wordPos` from `0` upward,
take the first word with a zero bit, and use `wordPos × 256 + bitPos`. Deterministic selection keeps
the requirement idempotent across retries of the same unsubmitted intent, and the word scan is
bounded in practice because a user's flipped bits stay dense at the low end. This path must be
tested with a pre-consumed nonce and with a fully-consumed first word.

**Share-side approval (withdraw / redeem / migration).** `IERC4626(vault).withdraw(assets,
address(this), msg.sender)` and `redeem(shares, address(this), msg.sender)` spend the caller's
shares, so the bundler needs a share allowance. This is the plan's "approval before each withdraw"
regression. Mitigation, in order:

1. `supportSignature: true` → `encodeVaultSharesPermit({ spender: vaultBundlesV1, version })`, one
   EIP-712 signature, no extra transaction. Both Vault V1 (OZ `ERC20Permit`) and Vault V2 (native
   ERC-2612, `nonces` + `DOMAIN_SEPARATOR`) support this, so **no vault is forced onto an approval
   transaction**;
2. otherwise `encodeErc20Approval` on the vault share token;
3. sufficient existing allowance → no requirement.

Allowance sizing is exact, never max, and must **upper-bound** the shares burned at execution:

- redeem / migration-by-shares: exactly `shares` — deterministic;
- withdraw / migration-by-assets: shares are previewed, so the bound must survive share-price drift.
  Reuse the `inKindRedeem` rule — accrue the vault forward (which mints pending performance-fee
  shares and therefore *lowers* the share price) before `toShares(assets)` — and, for Vault V2 only,
  widen by the caller's `slippageTolerance`, because a V2 share price can also fall on loss
  realization. A V1 share price cannot fall from accrual, so the accrued preview is already an upper
  bound there.

**Deadlines.** Same convention as `inKindRedeem`: `deadline?` defaults to `Time.timestamp() + 2h`,
validated eagerly at handle creation and again inside `getRequirements()` with `ExpiredDeadlineError`.
The bundle deadline and the permit signature deadline stay independent — `TokenLib.submitPermit`
documents that an unsubmitted permit remains valid until its own deadline.

**Vault V2 gates are not pre-checked.** `VaultV2.enter` requires `canSendAssets(msg.sender)` and
`VaultV2.exit` requires `canReceiveAssets(receiver)`; under this contract both are `VaultBundlesV1`.
The SDK does **not** read those gates from `getRequirements()`, following the decision already
documented at `packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:601-606`: a gate is arbitrary
external code, and the contract explicitly invites it to inspect the periphery's transient
`initiator`, which is zero outside the bundle call. A standalone `canReceiveAssets(vaultBundlesV1)`
read is therefore not execution-equivalent — it would reject exactly the permissioned vaults that
gate on `initiator` and would otherwise succeed. Blocking a working transaction is worse than an
opaque revert. Gate compatibility is verified by simulating the finalized transaction after
authorization, which is where the periphery's context exists. The operational consequence for
curators is real and unchanged — see §"Breaking changes" row 13.

### 4. Amount semantics

**Referral fee.** `referralFeePct` (WAD, `< WAD`) and `referralFeeRecipient` are optional entity
inputs defaulting to `0n` / `zeroAddress`, exactly as PR #945 models them. The fee is always
deducted from the contract's `assets` parameter:

- deposit: `deposited = assets - floor(assets × pct / WAD)`;
- withdraw / migration: `net = withdrawn - floor(withdrawn × pct / WAD)`.

`amount` on every SDK method stays the **contract's gross value** — what leaves the wallet on
deposit, what leaves the vault on exit. Rationale: gross is what approvals, balance checks, and
`msg.value` must cover; the pure builder stays a faithful encoder (§1, Action layer); and with the
default `pct = 0` gross and net coincide, so no existing integrator sees a change.

The net-target gross-up the contract documents ships as the exported pure helper
`grossFromNetAssets`: `assets = floor(W × WAD / (WAD − pct))`. This inverse is **exact**, not
approximate — `assets − floor(assets × pct / WAD) = ceil(assets × (WAD − pct) / WAD) = W` for every
integer `W` and every `0 ≤ pct < WAD`. An off-by-one net result is a defect, not tolerable rounding,
and the property test asserts exact round-tripping rather than a ±1 window. The action args also
carry `referralFeeAssets` and `netAssets` so simulations and UI can display both. Validation: reject
`pct >= WAD` (`PctExceeded`) and `pct > 0` with a zero recipient (which would revert in
`SafeTransferLib`).

**Deposit share price.** The contract enforces
`toDeposit.mulDivUp(1e27, shares) <= maxSharePriceE27` on the **net** amount. `maxSharePriceE27` is
the same RAY-scaled unit as today's `maxSharePrice`, so `computeVaultMaxSharePrice` is a direct
reuse — but it must be fed `toDeposit`, not `assets`. Vault V1 deposit also gains the 2-hour forward
accrual that Vault V2 deposit already does; the current V1 asymmetry is unintentional.

**Exit share price.** `vaultBundlesV1Withdraw` has **no** share-price bound, by design: the contract
documents that a share-price drop is not quickly reversed, so a reverted exit retried later would be
on similar or worse terms. The SDK must not invent a parameter the contract cannot enforce. Today's
withdraw and redeem are unprotected direct calls, so this is not a regression — but migration is
(row 11).

**Migration.** `destMaxSharePriceE27` bounds the destination deposit only; the source exit is
unbounded. Source and destination must share the same asset (`InconsistentAssets`). `migrateToV2`
keeps its V1→V2 scope and its `shares` input, and **additively** gains an assets mode, since the
entrypoint accepts exactly one of `assetsWithdrawn` and `sharesRedeemed`. A full-position migration
passes the full share balance, which — unlike Blue's exact-share withdrawal — does not drift with
interest accrual.

**Zero and dust.** The contract states that no-ops and zero checks are not systematic. A deposit
minting zero shares makes `toDeposit.mulDivUp(1e27, shares)` divide by zero and panic. The builders
therefore reject non-positive `assets` / `shares` with `NonPositiveInputError`, and the entities
reject a previewed zero share mint, as `deposit` already does today.

### 5. Native funding is exclusive

`TokenLib.pullOrWrapNative` requires `permit.kind == None` (`BothNativeAndToken`) and
`amount == msg.value` (`InconsistentAmountAndNative`) whenever value is attached. `DepositAmountArgs`
is therefore replaced on bundles paths by an exclusive union:

```ts
export type BundlesFundingArgs =
  | { readonly amount: bigint; readonly nativeAmount?: never }
  | { readonly nativeAmount: bigint; readonly amount?: never };
```

The type makes the breaking change visible at compile time rather than at simulation time, and
`resolveBundlesFunding` derives `{ assets, value }` from whichever side is present. Native funding
keeps the existing `wNative` guards (`ChainWNativeMissingError`,
`NativeAmountOnNonWNativeVaultError`). Note that with a referral fee the native amount must cover the
**gross**, fee included. No exit path unwraps to native — see row 10.

### 6. One call per transaction

`initiator` is a transient address set on entry and never cleared, guarded by
`require(initiator == address(0), AlreadyInitiated())`. Two calls to the same bundle contract in one
transaction revert. Consequences the SDK must document, not paper over:

- no multi-vault batch (deposit into A and B) in one transaction;
- an EIP-5792 `wallet_sendCalls` batch or Safe multisend may contain **at most one**
  `VaultBundlesV1` call; approvals, permits, and calls to *other* contracts (including
  `BlueBundlesV1`, which has its own transient slot) batch normally;
- withdraw-then-deposit across two vaults must use `migrateToV2`.

The SDK adds no batching helper and no runtime detection — this is a documented contract property,
stated in the entity JSDoc and the package glossary.

### 7. Typed errors

Contract reverts map to named, exported classes (§3). Reused: `NonPositiveInputError`,
`NegativeInputError`, `ExpiredDeadlineError`, `VaultAssetMismatchError`,
`VaultAddressMismatchError`, `ChainIdMismatchError`, `ChainWNativeMissingError`,
`NativeAmountOnNonWNativeVaultError`, `UnknownAddressError`. New:

| Error | Guards |
| ----- | ------ |
| `MixedBundlesFundingError` | `amount` and `nativeAmount` both set (contract: `BothNativeAndToken` / `InconsistentAmountAndNative`) |
| `ReferralFeePctExceededError` | `pct >= WAD` (contract: `PctExceeded`) |
| `ReferralFeeRecipientMissingError` | `pct > 0` with a zero recipient |
| `AmountAndSharesExclusiveError` | both or neither set on withdraw / migration (contract: `NotExactlyOneZero`) |
| `SameVaultMigrationError` | source and destination are the same address |
| `BundlesPermitMismatchError` | generalizes `VaultExitBundlesV1PermitMismatchError` |

No gate error class: gate compatibility is a simulation concern, per §3.

### Implementation Phases

- **Phase 1 — shared bricks.** Extract the §1 table into `src/actions/bundles/`, rename PR #945's
  `BlueBundles*` types, add `encodeErc20Permit2SignatureTransfer` with the `nonceBitmap` selection
  rule, add `computeVaultMaxSharePrice` and `grossFromNetAssets`, add the `bundles.vaultBundlesV1`
  registry slot, `vaultBundlesV1Abi`, and the `RequirementSpenderKey` entry. Blue bundles paths are
  migrated onto the shared bricks in this phase, with their tests green and unchanged in intent.
- **Phase 2 — re-route the pure builders.** Rewrite the bodies of `actions/vaultV1/{deposit,
  withdraw,redeem,migrateToV2}.ts` and `actions/vaultV2/{deposit,withdraw,redeem}.ts` to encode
  `VaultBundlesV1` calls. Names, files, and barrel exports are untouched. Property-based coverage
  per §"Verification".
- **Phase 3 — entity requirements.** `withdraw` / `redeem` change from `{ buildTx }` to a full
  `ActionOutput` with share-permit / approval requirements; `deposit` moves onto
  `getBundlesTokenRequirements`; `migrateToV2` drops `minSharePriceVaultV1`. Fork tests at pinned
  blocks.
- **Phase 4 — dependents.** `wdk-protocol-lending-morpho-evm` `withdraw` currently calls
  `vault.entity.withdraw({...}).buildTx()` directly at `src/morpho-protocol-evm.ts:650-656` and
  exposes no withdrawal-requirements method, so first-time withdrawals would revert for insufficient
  share allowance. This phase adds `getWithdrawRequirements` / `getRedeemRequirements` to the WDK
  protocol surface — mirroring the existing `getBorrowRequirements` shape — and threads the resolved
  signature into `buildTx`. This is an API addition to WDK, not a version bump.
- **Phase 5 — release surface.** Migration guide entry, glossary update, `AGENTS.md` routing summary
  rewrite, changesets (major for `morpho-sdk`, minor for `morpho-ts`, minor for the WDK API
  addition), and the dependent audit for `liquidity-sdk-viem`.

## Breaking changes, regressions, and new failure modes

The question this TIB was asked to answer: wrapping is a breaking change, but it is not the only
one. `Plan` marks whether the migration plan already tracks the row.

**Breaking DevEx changes**

| # | Change | Plan | Mitigation |
| - | ------ | ---- | ---------- |
| 1 | Deposit `amount` + `nativeAmount` stop being additive; ETH and WETH become exclusive | tracked | `BundlesFundingArgs` XOR type surfaces it at compile time; migration guide shows the two-transaction fallback |
| 2 | Deposit `recipient` removed — shares always mint to `msg.sender` | new | Entities already hardcoded `recipient: userAddress`, so only direct action-layer callers break |
| 3 | Withdraw / redeem `recipient` and `onBehalf` removed | new | Same: entity callers unaffected, action-layer callers get a compile error rather than a misrouted transfer |
| 4 | Withdraw / redeem return `ActionOutput` instead of `{ buildTx }`; `buildTx` takes signatures | new | This is the API face of the share-approval regression; migration guide ships the requirement loop; WDK is updated in Phase 4 |
| 5 | Withdraw / redeem gain a required-with-default `deadline` and optional referral fields | new | Defaults keep call sites compiling |
| 6 | `migrateToV2` loses `minSharePriceVaultV1` and `recipient`, and gains an additive assets mode | partially | Name and V1→V2 scope preserved, so no removal and no deprecation window needed; the lost slippage bound is row 11 |
| 7 | Permit2 AllowanceTransfer signatures are no longer accepted; SignatureTransfer only | new | New encoder ships in Phase 1; the requirement loop hides the difference from apps that use `getRequirements()` |
| 8 | `tx.to` and calldata change for every vault flow; `action.args` shapes change | tracked (Integration/API) | Indexers, Dune queries, and simulation consumers need the new selectors before release; coordinate with the Data and API teams in Phase 5 |

**UX regressions**

| # | Regression | Plan | Mitigation |
| - | ---------- | ---- | ---------- |
| 9 | Every withdraw / redeem needs a share allowance the direct call never needed | tracked | ERC-2612 permit on both V1 and V2 shares reduces it to one signature; only `supportSignature: false` clients pay a transaction |
| 10 | No exit path returns native token, and this contract forecloses adding one | new, low | Already true today — the SDK has no `unwrapNative` bundler action, so no capability is lost, only a future one is closed off |
| 11 | **Migration loses the source-leg `minSharePrice`** the Bundler3 route enforced | **new — untracked** | Cannot be compensated onchain. Delete the input, document the loss, keep the simulated proceeds in `action.args` so apps can gate on their own simulation. Needs a product decision (Open Questions) |
| 12 | One `VaultBundlesV1` call per transaction | **new — untracked** | Documented; `migrateToV2` covers the main composite case; multi-vault batching is lost |
| 13 | Gated Vault V2s must allow `VaultBundlesV1` in `sendAssetsGate` (was GA1) **and now also in `receiveAssetsGate`, which exits never needed** because the direct call paid the user | **new — untracked** | Curators of permissioned vaults must update gates **before** the SDK release, or exits break. The SDK cannot pre-check this reliably (§3), so detection is by finalized-transaction simulation. Highest-risk operational item in this migration |
| 14 | With a referral fee, gross and net diverge and every displayed amount must say which it is | new | Exact gross-up helper (§4); irrelevant at `pct = 0` |
| 15 | A dust deposit minting zero shares panics onchain instead of reverting typed | new | Entity rejects a previewed zero mint before building |

**Capability losses**

| # | Loss | Plan | Mitigation |
| - | ---- | ---- | ---------- |
| 16 | No deposit-for-another-address and no withdraw-to-another-address | new | None available in this contract. Integrations relying on it must keep a direct vault call |
| 17 | No composition with other actions in one transaction (Bundler3's core value) | implied | The fixed entrypoints cover the known composite flows; anything else is two transactions |

Row 13 and row 11 are the two findings that most warrant a product decision before implementation.

## Edge-Behavior Acceptance Matrix

Only `VaultBundlesV1`-specific behavior. Existing action validations are inherited.

| Situation | Required behavior |
| --------- | ----------------- |
| Deposit funded with both ETH and ERC-20 | Reject at the type level; `MixedBundlesFundingError` for untyped callers |
| Deposit with `nativeAmount != assets` | Structurally impossible — `assets` is derived from the funding side |
| Deposit into a non-wNative vault with native funding | `NativeAmountOnNonWNativeVaultError`, unchanged from today |
| Deposit whose net amount mints zero shares | Reject before building; never emit calldata that divides by zero |
| Deposit share price moves past the bound | Contract reverts `SlippageExceeded`; bound is computed from the **net** amount |
| Withdraw with both `assets` and `shares`, or neither | `AmountAndSharesExclusiveError` (contract: `NotExactlyOneZero`) |
| Withdraw-by-assets after a V2 share-price drop | Allowance must still cover the burn: exact bound plus the caller's slippage tolerance on V2 |
| Share balance shrinks between quote and inclusion (full exit by shares) | Contract reverts; do not describe a shares exit as saturated |
| Share balance grows between quote and inclusion | Residual shares remain; the exit is partial by design |
| Permit already consumed by a third party | `submitPermit` skips it; the existing allowance path must still cover the burn |
| Permit2 nonce bit already flipped | Requirement selects the lowest free bit from `nonceBitmap`; a repeated deposit never reuses a consumed bit |
| Migration source and destination assets differ | Reject before building (contract: `InconsistentAssets`) |
| Migration source and destination are the same vault | `SameVaultMigrationError` |
| Migration source share price drops | No onchain bound exists; disclose the simulated proceeds and the trade-off |
| Gated Vault V2 rejects the bundler on entry or exit | Contract reverts; the SDK does **not** pre-check, because a gate reading the transient `initiator` would reject a standalone read that the real call passes |
| Two bundle calls batched in one transaction | Contract reverts `AlreadyInitiated`; documented, not detected |
| Net-target gross-up round trip | Exactly the requested net for every input; an off-by-one is a defect |
| Referral fee with a zero recipient | `ReferralFeeRecipientMissingError` before the onchain transfer would revert |
| `referralFeePct >= WAD` | `ReferralFeePctExceededError` (contract: `PctExceeded`) |
| Value attached to withdraw or migration | Non-payable entrypoints; builders always encode `value: 0n` |

## Architectural Decisions

- Call `VaultBundlesV1` directly; never reproduce its flows through Bundler3.
- Re-route the existing `vaultV1*` / `vaultV2*` builders and entity methods in place. No
  `vaultBundlesV1*` action namespace, no new files, no parallel entity, nothing renamed or removed.
- Retype rather than silently ignore: a parameter the contract cannot honor becomes a compile error.
- Extract the `TokenLib` surface shared with `BlueBundlesV1` once, in the master PR, and migrate the
  Blue paths onto it in the same change.
- Keep `withdraw` and `redeem` as two methods over one entrypoint, and keep `migrateToV2` scoped to
  V1→V2.
- `amount` is always the contract's gross value; the net-target gross-up is an exported pure helper
  whose inverse is exact.
- Native funding is exclusive and expressed in the type system.
- Do not expose a share-price bound the contract cannot enforce; do surface the simulated outcome.
- Resolve every funding path the contract accepts from `getRequirements()`, including Permit2
  SignatureTransfer with deterministic free-bit nonce selection.
- Size share allowances exactly, upper-bounded for previewed burns; never max-approve by default.
- Do not pre-check Vault V2 gates. Gate compatibility is a finalized-transaction simulation concern.

## Considered Alternatives

### A separate `vaultBundlesV1*` action namespace and entity

Mirrors PR #945's `blueBundlesV1*` shape and lets both routes coexist.

**Why rejected:** it duplicates the entire vault surface for an identical user intent, forces every
app to choose a route it has no basis to choose, and leaves the Bundler3 vault paths alive past the
major. The contract is a routing detail of `vaultV1Deposit`, not a second public vocabulary. The
master PR exists precisely so the swap can be breaking without a parallel surface.

### Merge `withdraw` and `redeem` into one method

The contract has one entrypoint, so one method would mirror it.

**Why rejected:** the contract's own XOR maps onto the existing two-method split, and both modes
remain expressible. Merging would break every call site for no gain. The `forceWithdraw` /
`forceRedeem` merge elsewhere in the plan is forced by a contract that cannot express a shares exit.

### Rename `migrateToV2` to a version-agnostic `migrate`

The contract accepts any same-asset ERC-4626 pair, so V2→V2 and V1→V1 become possible.

**Why rejected:** it introduces a name the user's flows do not ask for, and a rename would owe §7's
full deprecation window (successor → `@deprecated` → one minor → removal next major) for a
capability the migration plan does not list. Keeping `migrateToV2` costs nothing and keeps the major
free of removals. Revisit as a Future Consideration when product wants the wider pairs.

### Pre-check Vault V2 gates in `getRequirements()`

A typed error naming the gate and the address to allow would beat an opaque revert.

**Why rejected:** the contract explicitly invites gates to read its transient `initiator`, which is
zero outside the bundle call, so a standalone `canReceiveAssets` read is not execution-equivalent. It
would reject exactly the permissioned vaults that gate on `initiator` and would otherwise succeed.
`entities/vaultV2/vaultV2.ts:601-606` already records this decision for `VaultExitBundlesV1`;
diverging here would be inconsistent as well as wrong.

### Keep classic approvals only, as PR #945 does

Smallest requirement surface; the ABI still accepts permits from advanced callers.

**Why rejected:** vault deposits support ERC-2612 and Permit2 today. Shipping approval-only
requirements would convert a signature into a transaction for a large share of users — a regression
introduced by the SDK, not by the contract.

### Interpret `amount` as the user's net proceeds

Matches the "to receive W, pass …" framing in the contract docs.

**Why rejected:** it makes the pure builder do product arithmetic and decouples `amount` from the
approval and `msg.value` the wallet must cover. The exact gross-up ships as a helper instead.
Reopenable if product prefers net-first inputs (Open Questions).

### Max-approve vault shares once per vault

Removes the per-exit approval entirely for `supportSignature: false` clients.

**Why rejected:** an unbounded share allowance to a periphery contract is a materially larger blast
radius than one signature per exit, and the permit path already removes the transaction for clients
that support signatures.

## Verification

Per §5, and following the `inKindRedeem` test layout:

- **Unit, colocated.** Calldata equality against `IVaultBundlesV1` for all seven re-routed builders;
  inline snapshots for transaction shape; every typed error asserted by class identity.
- **Property-based** (`fast-check`) on **every re-routed calldata builder** — all seven take inputs
  enumerable from primitives (addresses, bigints, tagged amount modes), so §5 requires generated
  ABI-equality properties for each, not only example tests. Also on `resolveBundlesFunding`, the
  assets/shares XOR, `computeVaultMaxSharePrice` monotonicity in `slippageTolerance`, and exact
  round-tripping of `grossFromNetAssets` against the contract's floor-fee rule.
- **Security invariants as tests** — each fails if the guard is removed: exclusive native funding,
  net-based deposit share-price bound, exact-and-upper-bounded share allowance, `chainId` validation,
  referral recipient non-zero, Permit2 free-bit selection after a consumed nonce.
- **Fork, pinned block, per chain.** Vault V1 and Vault V2 × deposit / withdraw / redeem /
  migration; permit and approval paths; native deposit; referral fee crediting; `AlreadyInitiated`
  on a double call; full exit by shares.
- **Regression guard.** Existing `BlueBundlesV1` and `VaultExitBundlesV1` tests stay green through
  the Phase 1 rename, with no assertions weakened. WDK withdrawal tests cover the new requirements
  path end to end.

## Assumptions & Constraints

- `VaultBundlesV1` is deployed on the supported chains and its addresses land in the registry
  through the usual sync, as PR #936 did for `vaultExitBundlesV1`. The TIB hardcodes no address.
- Both Vault V1 and Vault V2 shares implement ERC-2612, so the share-approval regression is always
  mitigable by a signature.
- Vault V2 configurations used with this contract keep to `MorphoMarketV1AdapterV2` or
  `MorphoVaultV1Adapter`, per the contract's own deployment note. The SDK does not enforce it.
- Curators of gated Vault V2s update `sendAssetsGate` and `receiveAssetsGate` before release. The
  SDK cannot detect a stale gate ahead of submission.
- Referral-fee policy and eligibility stay a product concern outside the core SDK.
- App-side simulation remains the only protection on the migration source leg, and the only reliable
  gate pre-flight.

## Dependencies

- `morpho-org/bundles` at the final reviewed deployment revision (audit:
  `2026-08-07-blue-vaults-bundles-blackthorn.pdf`).
- PR #937 / PR #945 (`BlueBundlesV1`) — Phase 1 renames their types and folds their action
  vocabulary into the existing Blue builders if Open Question 1 resolves that way.
- The bundles-migration master PR, which owns the major bump and the migration guide.
- Registry sync PR for `bundles.vaultBundlesV1`.

## Security

- The share allowance granted to `VaultBundlesV1` is the new trust delegation on the exit paths.
  Exact, upper-bounded sizing keeps residual allowance to preview rounding; max-approval is
  rejected.
- `validateUserAddress` inside `encodeVaultSharesPermit.sign` must keep holding for the new spender:
  a third party must not be able to authorize someone else's exit.
- `validateRequirementSpender` must gain the `vaultBundlesV1` key; without it, approvals to the new
  contract are rejected — and with a wrong key, approvals could be directed at an unintended
  spender.
- Permit2 free-bit selection must never reuse a flipped bit, and the signed `TokenPermissions.token`
  and `amount` must equal the pulled asset and gross amount exactly.
- `TokenLib.forceApproveMax(asset, vault)` leaves a max asset allowance from the bundler to the
  vault by design; the bundler holds no balance between transactions.
- The contract is unusable with tokens that revert on `approve(0)` then `approve(max)`, and inherits
  the token-safety assumptions of the vaults themselves.

## Future Considerations

- A version-agnostic migration successor (V2→V2, V1→V1, V2→V1) following §7's deprecation flow, if
  product asks for the wider pairs the contract already supports.
- A simulation-backed gate pre-flight helper, which would be execution-equivalent where a standalone
  gate read is not.
- Retiring `bundles.vaultExitBundlesV1`'s dedicated permit reshaper once every caller uses the
  shared `getBundlesSharesPermit`.

## Open Questions

1. **Master PR convergence.** Should Phase 1 also fold `BlueBundlesV1` into the existing `blue*`
   builders and delete the parallel `blueBundlesV1(chainId)` entity and `blueBundlesV1*` action
   vocabulary, applying the same rule this TIB adopts for vaults?
2. **Migration source-leg protection (row 11).** Accept the loss of `minSharePrice` on the source
   exit, or gate migration behind an app-supplied simulated-proceeds floor that the SDK checks
   off-chain before building?
3. **Gross vs. net inputs (§4).** Confirm `amount` stays the contract's gross value, with the exact
   gross-up as a helper.
4. **V2 withdraw-by-assets allowance buffer (§3).** Slippage-widened exact bound, or the user's full
   share balance for maximum robustness?
5. **Gate readiness (row 13).** Who owns confirming that every gated Vault V2 has whitelisted
   `VaultBundlesV1` on both gates before the major ships?
6. **Aave V3 → Vault V2.** Confirm it stays on Bundler3 past the major, or that the flow is dropped
   until a contract exists.

## References

- [VaultBundlesV1 source at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/VaultBundlesV1.sol)
- [IVaultBundlesV1 interface at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/interfaces/IVaultBundlesV1.sol)
- [TokenLib at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/libraries/TokenLib.sol)
- [Bundles repository README](https://github.com/morpho-org/bundles/blob/main/README.md)
- [Blue and vault bundles audit — Blackthorn, 2026-08-07](https://github.com/morpho-org/bundles/blob/main/audits/2026-08-07-blue-vaults-bundles-blackthorn.pdf)
- [Permit2 SignatureTransfer](https://docs.uniswap.org/contracts/permit2/reference/signature-transfer)
- [TIB-2026-07-27 — VaultExitBundlesV1 in-kind redemption](./TIB-2026-07-27-vault-exit-in-kind-redemption.md)
- [TIB-2026-08-25 — BlueBundlesV1 SDK action flows](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [Stack base — morpho-org/sdks PR #937](https://github.com/morpho-org/sdks/pull/937)
- [BlueBundlesV1 implementation — morpho-org/sdks PR #945](https://github.com/morpho-org/sdks/pull/945)
- [Transaction Flow Migration plan](https://app.notion.com/p/morpho-labs/Transaction-Flow-Migration-3a4d69939e6d81c69393dc649d2f4d77)
