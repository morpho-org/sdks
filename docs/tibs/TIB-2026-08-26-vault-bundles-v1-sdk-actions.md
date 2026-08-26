# TIB-2026-08-26: VaultBundlesV1 SDK action flows

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| **Status** | Proposed                                       |
| **Date**   | 2026-08-26                                     |
| **Author** | @foulques                                      |
| **Scope**  | Packages: `morpho-sdk`, `morpho-ts`            |

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
  `VaultExitBundlesV1`, the first fixed-entrypoint bundle contract in `morpho-sdk`. Its file
  layout, `Permit` reshaping, empty-permit sentinel, deadline convention, and
  `getRequirements()`/`buildTx()` split are the precedent this TIB follows.
- **[TIB-2026-08-25](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)** (PR #937) and its
  implementation (PR #945) added `BlueBundlesV1`. `VaultBundlesV1` shares its `TokenLib`
  primitives — `TokenPermit`, `Permit`, `pullOrWrapNative`, `forceApproveMax`, the transient
  `initiator` guard, and the `referralFeePct` / `referralFeeRecipient` / `deadline` tail. Those
  primitives must become **one** shared SDK brick, not two protocol-scoped copies.
- The **Transaction Flow Migration** plan tracks each app-facing action's route, target release,
  breaking-change flag, and expected UX regression. Eleven of its rows resolve to this contract.

This TIB lands on the bundles-migration integration branch (the "master PR"), which accumulates
every bundler3-replacement change and merges as one **major** release. That framing is load-bearing:
it is what allows in-place replacement of existing method routing instead of a parallel surface.

The contract revision reviewed for this proposal is `morpho-org/bundles` commit
`f27e7bcf744310303e24faa522b71d702e696686`. The implementation must pin the ABI from the final
reviewed deployment revision.

## Goals / Non-Goals

**Goals**

- Route Vault V1 and Vault V2 deposit, withdraw, redeem, and migration through `VaultBundlesV1`.
- Extract the `TokenLib` surface shared with `BlueBundlesV1` into one set of SDK bricks.
- Reuse the existing requirement, share-price, deadline, and permit machinery rather than growing a
  parallel one.
- Enumerate every breaking change, UX regression, capability loss, and new failure mode **before**
  implementation, and decide the mitigation for each.
- Keep the app-facing entity method names and shapes stable wherever the contract allows it.

**Non-Goals**

- No `VaultExitBundlesV1` work. In-kind redemption already ships; the pending
  `vaultExitBundlesV1ForceWithdrawVaultV2` migration of `forceWithdraw` / `forceRedeem` is a
  sibling TIB on the same integration branch.
- No Aave V3 → Vault V2 migration. `VaultBundlesV1` has no foreign-protocol entrypoint; that flow
  is tracked separately and still needs a contract.
- No `wrapMorphoLegacy` change. It stays a direct call.
- No generic bundle-call, callback, or multi-vault composition API.
- No automatic routing between Bundler3 and `VaultBundlesV1`.
- No new share-price protection that the contract cannot enforce.

## Current Solution

| App-facing flow | Today's route | Today's SDK shape |
| --------------- | ------------- | ----------------- |
| `vaultV1Deposit` / `vaultV2Deposit` | Bundler3 → GA1 `erc4626Deposit` | `deposit({ userAddress, vaultData, amount?, nativeAmount?, slippageTolerance? })` → `{ buildTx, getRequirements }`; `amount` and `nativeAmount` are **additive**; action takes `recipient`. |
| `vaultV1Withdraw` / `vaultV2Withdraw` | Direct vault call | `withdraw({ amount, userAddress })` → `{ buildTx }` **only**; no requirements, no deadline, no slippage. |
| `vaultV1Redeem` / `vaultV2Redeem` | Direct vault call | `redeem({ shares, userAddress })` → `{ buildTx }` only. |
| `vaultV1MigrateToV2` | Bundler3 → GA1 `erc4626Redeem` + `erc4626Deposit` | `migrateToV2({ userAddress, sourceVault, targetVault, shares, slippageTolerance? })`; action takes `minSharePriceVaultV1`, `maxSharePriceVaultV2`, `recipient`; V1 → V2 only, shares only. |

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
truth), the master PR extracts them once, and PR #945's `BlueBundles*`-prefixed copies are renamed
to the shared names as part of the same change:

| Shared brick | Replaces | Consumers |
| ------------ | -------- | --------- |
| `BundlesPermitKind` (`None` / `ERC2612` / `Permit2`), `BundlesTokenPermit` | `BlueBundlesPermitKind`, `BlueBundlesTokenPermit` | Blue supply/repay/collateral, vault deposit |
| `getBundlesTokenPermit(...)` — reshape a `PermitRequirementSignature` into `TokenPermit{kind,data}` | new (PR #945 accepts an ABI-ready struct and never builds one) | same |
| `getBundlesSharesPermit(...)` — reshape into `Permit{value,nonce,deadline,v,r,s}` + empty sentinel | `getVaultExitBundlesV1PermitStruct` (kept as a deprecated alias for the in-kind paths) | vault withdraw / redeem / migrate, vault-exit |
| `resolveBundlesFunding({ amount, nativeAmount, asset, chainId })` — XOR funding resolver returning `{ assets, value }` | inlined `nativeAmount` handling in PR #945 | Blue + vault deposit paths |
| `getBundlesTokenRequirements(...)` — spender-parameterized approval / ERC-2612 / Permit2-SignatureTransfer resolver | generalizes `getGeneralAdapterRequirements` | all bundles funding paths |
| `encodeErc20Permit2SignatureTransfer(...)` | new — see §4 | all bundles funding paths |
| `computeVaultMaxSharePrice({ vaultData, assets, slippageTolerance })` in `helpers/slippage.ts` | three inline copies in `vaultV1`/`vaultV2` entities | vault deposit, migrate destination leg |
| `bundles.vaultBundlesV1` registry slot + `vaultBundlesV1Abi` + `RequirementSpenderKey` entry | new | — |

`resolveBundlesFunding` also fixes a latent bug in PR #945: `blueBundlesV1Supply` forwards `assets`
and `nativeAmount` independently, so `{ assets: 100n, nativeAmount: 50n }` encodes cleanly and
reverts onchain with `InconsistentAmountAndNative`. Deriving the ABI `assets` from whichever funding
side is set makes `assets == msg.value` structurally true on the native path.

### 2. Surface placement: replace in place

The existing vault entities keep their identity; only their routing changes.

```ts
client.morpho.vaultV1(vault, chainId).deposit({ … })   // now → VaultBundlesV1
client.morpho.vaultV1(vault, chainId).withdraw({ … })  // now → VaultBundlesV1
client.morpho.vaultV1(vault, chainId).redeem({ … })    // now → VaultBundlesV1
client.morpho.vaultV1(vault, chainId).migrate({ … })   // replaces migrateToV2
client.morpho.vaultV2(vault, chainId).…               // same four
```

Rationale: the migration plan lists these exact actions as changing route, not as gaining a second
route; the intent is expressed by the vault the caller already scoped; and a parallel
`client.morpho.vaultBundlesV1(chainId)` entity would duplicate the whole vault surface for an
identical user intent. The Bundler3-backed vault builders are **deleted** in the same major — no
dual maintenance, no silent routing choice.

This diverges from PR #945, which added a parallel chain-scoped `blueBundlesV1(chainId)` entity. The
master PR should converge: `blueBundlesV1(chainId)` stays as the staging surface until the master PR
flips `client.morpho.blue(...)` over to it, then is removed. See Open Questions.

### 3. Action set

New pure builders live in `src/actions/vaultBundlesV1/` and are colocated with their tests (§5).

| SDK builder | Contract entrypoint | Notes |
| ----------- | ------------------- | ----- |
| `vaultBundlesV1Deposit` | `vaultBundlesV1Deposit` | Payable. `value` derived from the funding resolver. |
| `vaultBundlesV1Withdraw` | `vaultBundlesV1Withdraw` | Assets mode. `shares = 0`. |
| `vaultBundlesV1Redeem` | `vaultBundlesV1Withdraw` | Shares mode. `assets = 0`. |
| `vaultBundlesV1Migrate` | `vaultBundlesV1Migrate` | Assets **or** shares on the source leg. |

`withdraw` and `redeem` stay two builders and two entity methods even though they share one
entrypoint: the contract's `(assets == 0) != (shares == 0)` maps exactly onto the existing two-method
split, and merging them would be a gratuitous DevEx break. (The `forceWithdraw` / `forceRedeem`
merge tracked in the migration plan is forced by a different contract —
`vaultExitBundlesV1ForceWithdrawVaultV2` takes `exitAssets` only and cannot express a shares exit.)

### 4. Requirements

**Deposit funding.** The asset is pulled from `msg.sender` by `TokenLib.pullOrWrapNative`, so the
spender is `VaultBundlesV1`. All three funding paths the contract accepts must be reachable from
`getRequirements()`, not just from the ABI:

- classic ERC-20 approval — `encodeErc20Approval` with `vaultBundlesV1` added to the allow-list;
- ERC-2612 — `encodeErc20Permit`, reshaped by `getBundlesTokenPermit` into
  `TokenPermit{kind: ERC2612, data: abi.encode(deadline, v, r, s)}`;
- Permit2 **SignatureTransfer** — new encoder.

The Permit2 point is not optional. `TokenLib.pullToken` calls
`IPermit2.permitTransferFrom(PermitTransferFrom(TokenPermissions(token, amount), nonce, deadline), …)`.
The SDK's existing `encodeErc20Permit2Approve` produces an **AllowanceTransfer** `PermitSingle`
signature with a sequential nonce — a different EIP-712 type and a different nonce space. It is not
consumable by this contract. PR #945 sidestepped this by resolving classic approvals only; carrying
that choice into vault deposits would turn a signature into an extra transaction for every Permit2
user, so `encodeErc20Permit2SignatureTransfer` lands with this work. The one-time ERC-20 approval to
the Permit2 singleton is still returned alongside the signature requirement, as today.

**Share-side approval (withdraw / redeem / migrate).** `IERC4626(vault).withdraw(assets,
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

- redeem / migrate-by-shares: exactly `shares` — deterministic;
- withdraw / migrate-by-assets: shares are previewed, so the bound must survive share-price drift.
  Reuse the `inKindRedeem` rule — accrue the vault forward (which mints pending performance-fee
  shares and therefore *lowers* the share price) before `toShares(assets)` — and, for Vault V2 only,
  widen by the caller's `slippageTolerance`, because a V2 share price can also fall on loss
  realization. A V1 share price cannot fall from accrual, so the accrued preview is already an upper
  bound there.

**Deadlines.** Same convention as `inKindRedeem`: `deadline?` defaults to `Time.timestamp() + 2h`,
validated eagerly at handle creation and again inside `getRequirements()` with `ExpiredDeadlineError`.
The bundle deadline and the permit signature deadline stay independent — `TokenLib.submitPermit`
documents that an unsubmitted permit remains valid until its own deadline.

**Vault V2 gates.** `VaultV2.enter` requires `canSendAssets(msg.sender)` and `VaultV2.exit` requires
`canReceiveAssets(receiver)`; under this contract both are `VaultBundlesV1`. `getRequirements()` for
V2 flows adds those two static reads to its existing multicall and throws a typed
`VaultV2GateRejectsBundlesError` naming the gate and the address to allow. This converts an opaque
revert into an actionable message for permissioned vaults. See §"Breaking changes" row 13.

### 5. Amount semantics

**Referral fee.** `referralFeePct` (WAD, `< WAD`) and `referralFeeRecipient` are optional entity
inputs defaulting to `0n` / `zeroAddress`, exactly as PR #945 models them. The fee is always
deducted from the contract's `assets` parameter:

- deposit: `deposited = assets - floor(assets × pct / WAD)`;
- withdraw / migrate: `net = withdrawn - floor(withdrawn × pct / WAD)`.

`amount` on every SDK method stays the **contract's gross value** — what leaves the wallet on
deposit, what leaves the vault on exit. Rationale: gross is what approvals, balance checks, and
`msg.value` must cover; the pure builder stays a faithful encoder (§1, Action layer); and with the
default `pct = 0` gross and net coincide, so no existing integrator sees a change. The net-target
gross-up the contract documents — `assets = floor(W × WAD / (WAD − pct))` — ships as an exported
pure helper (`grossFromNetAssets`) plus `referralFeeAssets` and `netAssets` in the action args so
simulations and UI can display both. Validation: reject `pct >= WAD` (`PctExceeded`) and
`pct > 0` with a zero recipient (which would revert in `SafeTransferLib`).

**Deposit share price.** The contract enforces
`toDeposit.mulDivUp(1e27, shares) <= maxSharePriceE27` on the **net** amount. `maxSharePriceE27` is
the same RAY-scaled unit as today's `maxSharePrice`, so `computeVaultMaxSharePrice` is a direct
reuse — but it must be fed `toDeposit`, not `assets`. Vault V1 deposit also gains the 2-hour forward
accrual that Vault V2 deposit already does; the current V1 asymmetry is unintentional.

**Exit share price.** `vaultBundlesV1Withdraw` has **no** share-price bound, by design: the contract
documents that a share-price drop is not quickly reversed, so a reverted exit retried later would be
on similar or worse terms. The SDK must not invent a parameter the contract cannot enforce. Today's
withdraw and redeem are unprotected direct calls, so this is not a regression — but `migrate` is
(row 11).

**Migration.** `destMaxSharePriceE27` bounds the destination deposit only. Source and destination
must share the same asset (`InconsistentAssets`); the contract permits any ERC-4626 pair, so V1→V2,
V2→V2, V1→V1, and V2→V1 all become expressible. Exactly one of `assetsWithdrawn` and
`sharesRedeemed` is non-zero; a full-position migration passes the full share balance, which — unlike
Blue's exact-share withdrawal — does not drift with interest accrual.

**Zero and dust.** The contract states that no-ops and zero checks are not systematic. A deposit
minting zero shares makes `toDeposit.mulDivUp(1e27, shares)` divide by zero and panic. The builders
therefore reject non-positive `assets` / `shares` with `NonPositiveInputError`, and the entities
reject a previewed zero share mint, as `deposit` already does today.

### 6. Native funding is exclusive

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

### 7. One call per transaction

`initiator` is a transient address set on entry and never cleared, guarded by
`require(initiator == address(0), AlreadyInitiated())`. Two calls to the same bundle contract in one
transaction revert. Consequences the SDK must document, not paper over:

- no multi-vault batch (deposit into A and B) in one transaction;
- an EIP-5792 `wallet_sendCalls` batch or Safe multisend may contain **at most one**
  `VaultBundlesV1` call; approvals, permits, and calls to *other* contracts (including
  `BlueBundlesV1`, which has its own transient slot) batch normally;
- withdraw-then-deposit across two vaults must use `migrate`.

The SDK adds no batching helper and no runtime detection — this is a documented contract property,
stated in the entity JSDoc and the package glossary.

### 8. Typed errors

Contract reverts map to named, exported classes (§3). Reused: `NonPositiveInputError`,
`NegativeInputError`, `ExpiredDeadlineError`, `VaultAssetMismatchError`,
`VaultAddressMismatchError`, `ChainIdMismatchError`, `ChainWNativeMissingError`,
`NativeAmountOnNonWNativeVaultError`, `UnknownAddressError`. New:

| Error | Guards |
| ----- | ------ |
| `MixedBundlesFundingError` | `amount` and `nativeAmount` both set (contract: `BothNativeAndToken` / `InconsistentAmountAndNative`) |
| `ReferralFeePctExceededError` | `pct >= WAD` (contract: `PctExceeded`) |
| `ReferralFeeRecipientMissingError` | `pct > 0` with a zero recipient |
| `AmountAndSharesExclusiveError` | both or neither set on withdraw / migrate (contract: `NotExactlyOneZero`) |
| `SameVaultMigrationError` | `sourceVault == destVault` |
| `VaultV2GateRejectsBundlesError` | `canSendAssets` / `canReceiveAssets` returns false for the bundler |
| `BundlesPermitMismatchError` | generalizes `VaultExitBundlesV1PermitMismatchError` |

### Implementation Phases

- **Phase 1 — shared bricks.** Extract the §1 table into `src/actions/bundles/`, rename PR #945's
  `BlueBundles*` types, add `encodeErc20Permit2SignatureTransfer`, add
  `computeVaultMaxSharePrice` to `helpers/slippage.ts`, add the `bundles.vaultBundlesV1` registry
  slot, `vaultBundlesV1Abi`, and the `RequirementSpenderKey` entry. Blue bundles paths are migrated
  onto the shared bricks in this phase, with their tests green and unchanged in intent.
- **Phase 2 — pure actions.** `src/actions/vaultBundlesV1/` with the four builders, colocated unit
  tests, inline calldata snapshots, and `fast-check` property tests on the funding resolver, the
  gross-up helper, and the assets/shares XOR.
- **Phase 3 — entity routing.** Re-point `vaultV1` / `vaultV2` `deposit`, `withdraw`, `redeem`, and
  `migrate`; `withdraw` / `redeem` change from `{ buildTx }` to a full `ActionOutput`; delete the
  Bundler3-backed vault builders. Fork tests at pinned blocks per §"Verification".
- **Phase 4 — migration surface.** Migration guide entry, glossary update, `AGENTS.md` routing
  summary rewrite, changesets (major for `morpho-sdk`, minor for `morpho-ts`), and the dependent
  package audit for `wdk-protocol-lending-morpho-evm` and `liquidity-sdk-viem`.

## Breaking changes, regressions, and new failure modes

The question this TIB was asked to answer: wrapping is a breaking change, but it is not the only
one. `Plan` marks whether the migration plan already tracks the row.

**Breaking DevEx changes**

| # | Change | Plan | Mitigation |
| - | ------ | ---- | ---------- |
| 1 | Deposit `amount` + `nativeAmount` stop being additive; ETH and WETH become exclusive | tracked | `BundlesFundingArgs` XOR type surfaces it at compile time; migration guide shows the two-transaction fallback |
| 2 | Deposit `recipient` removed — shares always mint to `msg.sender` | new | Entities already hardcoded `recipient: userAddress`, so only direct action-layer callers break |
| 3 | Withdraw / redeem `recipient` and `onBehalf` removed | new | Same: entity callers unaffected, action-layer callers get a compile error |
| 4 | Withdraw / redeem return `ActionOutput` instead of `{ buildTx }`; `buildTx` takes signatures | new | This is the API face of the share-approval regression; migration guide ships the requirement loop |
| 5 | Withdraw / redeem gain a required-with-default `deadline` and optional referral fields | new | Defaults keep call sites compiling |
| 6 | `migrateToV2` → `migrate`; `minSharePriceVaultV1` and `recipient` removed; `targetVault` → `destVault`; shares-only → assets-or-shares | partially | Rename lands in the major with a codemod-able signature; new capability compensates (V2→V2, V1→V1) |
| 7 | Permit2 AllowanceTransfer signatures are no longer accepted; SignatureTransfer only | new | New encoder ships in Phase 1; the requirement loop hides the difference from apps that use `getRequirements()` |
| 8 | `tx.to` and calldata change for every vault flow; `action.args` shapes change | tracked (Integration/API) | Indexers, Dune queries, and simulation consumers need the new selectors before release; coordinate with the Data and API teams during Phase 4 |

**UX regressions**

| # | Regression | Plan | Mitigation |
| - | ---------- | ---- | ---------- |
| 9 | Every withdraw / redeem needs a share allowance the direct call never needed | tracked | ERC-2612 permit on both V1 and V2 shares reduces it to one signature; only `supportSignature: false` clients pay a transaction |
| 10 | No exit path returns native token, and this contract forecloses adding one | new, low | Already true today — the SDK has no `unwrapNative` bundler action, so no capability is lost, only a future one is closed off |
| 11 | **`migrate` loses the source-leg `minSharePrice`** the Bundler3 route enforced | **new — untracked** | Cannot be compensated onchain. Delete the input, document the loss, keep the simulated proceeds in `action.args` so apps can gate on their own simulation. Needs a product decision (Open Questions) |
| 12 | One `VaultBundlesV1` call per transaction | **new — untracked** | Documented; `migrate` covers the main composite case; multi-vault batching is lost |
| 13 | Gated Vault V2s must allow `VaultBundlesV1` in `sendAssetsGate` (was GA1) **and now also in `receiveAssetsGate`, which exits never needed** because the direct call paid the user | **new — untracked** | Typed pre-flight error (§4); curators of permissioned vaults must update gates **before** the SDK release, or exits break. Highest-risk operational item in this migration |
| 14 | With a referral fee, realized net can differ from a net target by 1 wei (floor rounding) | new | Documented on the gross-up helper; irrelevant at `pct = 0` |
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
| Migration source and destination assets differ | Reject before building (contract: `InconsistentAssets`) |
| Migration source and destination are the same vault | `SameVaultMigrationError` |
| Migration source share price drops | No onchain bound exists; disclose the simulated proceeds and the trade-off |
| Gated Vault V2 rejects the bundler on entry or exit | `VaultV2GateRejectsBundlesError` naming the gate and the address to allow |
| Two bundle calls batched in one transaction | Contract reverts `AlreadyInitiated`; documented, not detected |
| Referral fee with a zero recipient | `ReferralFeeRecipientMissingError` before the onchain transfer would revert |
| `referralFeePct >= WAD` | `ReferralFeePctExceededError` (contract: `PctExceeded`) |
| Value attached to withdraw or migrate | Non-payable entrypoints; builders always encode `value: 0n` |

## Architectural Decisions

- Call `VaultBundlesV1` directly; never reproduce its flows through Bundler3.
- Replace the routing of the existing vault entity methods in place; do not add a parallel vault
  surface. Delete the Bundler3-backed vault builders in the same major.
- Extract the `TokenLib` surface shared with `BlueBundlesV1` once, in the master PR, and migrate the
  Blue paths onto it in the same change.
- Keep `withdraw` and `redeem` as two methods over one entrypoint.
- `amount` is always the contract's gross value; the net-target gross-up is an exported pure helper.
- Native funding is exclusive and expressed in the type system.
- Do not expose a share-price bound the contract cannot enforce; do surface the simulated outcome.
- Resolve every funding path the contract accepts from `getRequirements()`, including Permit2
  SignatureTransfer — an ABI-only permit path is a UX regression, not a feature.
- Size share allowances exactly, upper-bounded for previewed burns; never max-approve by default.
- Turn the Vault V2 gate precondition into a typed pre-flight error.

## Considered Alternatives

### Parallel `client.morpho.vaultBundlesV1(chainId)` entity

Mirrors PR #945 and lets both routes coexist.

**Why rejected:** it duplicates the entire vault surface for an identical user intent, forces every
app to choose a route it has no basis to choose, and leaves the Bundler3 vault paths alive past the
major. The master PR exists precisely so the swap can be breaking. The parallel surface is retained
only as a staging step for Blue.

### Merge `withdraw` and `redeem` into one method

The contract has one entrypoint, so one method would mirror it.

**Why rejected:** the contract's own XOR maps onto the existing two-method split, and both modes
remain expressible. Merging would break every call site for no gain. The `forceWithdraw` /
`forceRedeem` merge elsewhere in the plan is forced by a contract that cannot express a shares exit.

### Keep classic approvals only, as PR #945 does

Smallest requirement surface; the ABI still accepts permits from advanced callers.

**Why rejected:** vault deposits support ERC-2612 and Permit2 today. Shipping approval-only
requirements would convert a signature into a transaction for a large share of users — a regression
introduced by the SDK, not by the contract.

### Interpret `amount` as the user's net proceeds

Matches the "to receive W, pass …" framing in the contract docs.

**Why rejected:** it makes the pure builder do product arithmetic, decouples `amount` from the
approval and `msg.value` the wallet must cover, and is ambiguous for full exits. The gross-up ships
as a helper instead. Reopenable if product prefers net-first inputs (Open Questions).

### Max-approve vault shares once per vault

Removes the per-exit approval entirely for `supportSignature: false` clients.

**Why rejected:** an unbounded share allowance to a periphery contract is a materially larger blast
radius than one signature per exit, and the permit path already removes the transaction for clients
that support signatures.

## Verification

Per §5, and following the `inKindRedeem` test layout:

- **Unit, colocated.** Calldata equality against `IVaultBundlesV1` for all four builders; inline
  snapshots for transaction shape; every typed error asserted by class identity.
- **Property-based** (`fast-check`) on the funding resolver, the referral gross-up, the assets/shares
  XOR, and `computeVaultMaxSharePrice` monotonicity in `slippageTolerance`.
- **Security invariants as tests** — each fails if the guard is removed: exclusive native funding,
  net-based deposit share-price bound, exact-and-upper-bounded share allowance, `chainId` validation,
  gate pre-flight, referral recipient non-zero.
- **Fork, pinned block, per chain.** Vault V1 and Vault V2 × deposit / withdraw / redeem / migrate;
  permit and approval paths; native deposit; referral fee crediting; `AlreadyInitiated` on a double
  call; a gated V2 vault rejecting the bundler; full exit by shares.
- **Regression guard.** Existing `BlueBundlesV1` and `VaultExitBundlesV1` tests stay green through
  the Phase 1 rename, with no assertions weakened.

## Assumptions & Constraints

- `VaultBundlesV1` is deployed on the supported chains and its addresses land in the registry
  through the usual sync, as PR #936 did for `vaultExitBundlesV1`. The TIB hardcodes no address.
- Both Vault V1 and Vault V2 shares implement ERC-2612, so the share-approval regression is always
  mitigable by a signature.
- Vault V2 configurations used with this contract keep to `MorphoMarketV1AdapterV2` or
  `MorphoVaultV1Adapter`, per the contract's own deployment note. The SDK does not enforce it.
- Curators of gated Vault V2s update `sendAssetsGate` and `receiveAssetsGate` before release.
- Referral-fee policy and eligibility stay a product concern outside the core SDK.
- App-side simulation remains the only protection on the migration source leg.

## Dependencies

- `morpho-org/bundles` at the final reviewed deployment revision (audit:
  `2026-08-07-blue-vaults-bundles-blackthorn.pdf`).
- PR #937 / PR #945 (`BlueBundlesV1`) — Phase 1 renames their types.
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
- `TokenLib.forceApproveMax(asset, vault)` leaves a max asset allowance from the bundler to the
  vault by design; the bundler holds no balance between transactions.
- The contract is unusable with tokens that revert on `approve(0)` then `approve(max)`, and inherits
  the token-safety assumptions of the vaults themselves.

## Open Questions

1. **Master PR convergence.** Should Phase 1 also flip `client.morpho.blue(...)` onto
   `BlueBundlesV1` and delete the parallel `blueBundlesV1(chainId)` entity, or does Blue keep its
   parallel surface for one more release?
2. **Migration source-leg protection (row 11).** Accept the loss of `minSharePrice` on the source
   exit, or gate `migrate` behind an app-supplied simulated-proceeds floor that the SDK checks
   off-chain before building?
3. **Gross vs. net inputs (§5).** Confirm `amount` stays the contract's gross value, with the
   gross-up as a helper.
4. **V2 withdraw-by-assets allowance buffer (§4).** Slippage-widened exact bound, or the user's full
   share balance for maximum robustness?
5. **Gate pre-flight cost.** Two extra static calls on every V2 `getRequirements()` — acceptable, or
   opt-in behind a client option?
6. **Aave V3 → Vault V2.** Confirm it stays on Bundler3 past the major, or that the flow is dropped
   until a contract exists.

## References

- [VaultBundlesV1 source at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/VaultBundlesV1.sol)
- [IVaultBundlesV1 interface at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/interfaces/IVaultBundlesV1.sol)
- [TokenLib at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/libraries/TokenLib.sol)
- [Bundles repository README](https://github.com/morpho-org/bundles/blob/main/README.md)
- [Blue and vault bundles audit — Blackthorn, 2026-08-07](https://github.com/morpho-org/bundles/blob/main/audits/2026-08-07-blue-vaults-bundles-blackthorn.pdf)
- [TIB-2026-07-27 — VaultExitBundlesV1 in-kind redemption](./TIB-2026-07-27-vault-exit-in-kind-redemption.md)
- [TIB-2026-08-25 — BlueBundlesV1 SDK action flows](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [Stack base — morpho-org/sdks PR #937](https://github.com/morpho-org/sdks/pull/937)
- [BlueBundlesV1 implementation — morpho-org/sdks PR #945](https://github.com/morpho-org/sdks/pull/945)
- [Transaction Flow Migration plan](https://app.notion.com/p/morpho-labs/Transaction-Flow-Migration-3a4d69939e6d81c69393dc649d2f4d77)
