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
truth), the master PR extracts the **pure encoding and reshaping** pieces once into
`src/actions/bundles/`, and PR #945's `BlueBundles*`-prefixed copies are renamed to the shared names
as part of the same change:

| Shared brick | Replaces | Consumers |
| ------------ | -------- | --------- |
| `BundlesPermitKind` (`None` / `ERC2612` / `Permit2`), `BundlesTokenPermit` | `BlueBundlesPermitKind`, `BlueBundlesTokenPermit` | Blue supply/repay/collateral, vault deposit |
| `BundlesTokenRequirementsOptions` — public readonly `getRequirements()` options shared by every token-funded bundles handle | `BlueTokenRequirementsParams` and the vault entities' inline `{ useSimplePermit? }` shapes | Blue supply/repay/collateral, vault deposit |
| `getBundlesTokenPermit(...)` — reshape a `PermitRequirementSignature` into `TokenPermit{kind,data}` | new (PR #945 accepts an ABI-ready struct and never builds one) | same |
| `getBundlesSharesPermit(...)` — reshape into `Permit{value,nonce,deadline,v,r,s}` + empty sentinel | `getVaultExitBundlesV1PermitStruct` (kept as a deprecated alias for the in-kind paths) | vault withdraw / redeem / migrate, vault-exit |
| `resolveBundlesFunding({ amount, nativeAmount, asset, chainId })` — XOR funding resolver returning `{ assets, value }` | inlined `nativeAmount` handling in PR #945 | Blue + vault deposit paths |
| `resolveBundlesTokenRequirements(...)` — synchronous, spender-parameterized approval / ERC-2612 / Permit2-SignatureTransfer resolver over plain allowance, permit-metadata, and selected-nonce state, including the ERC-20 approval **to Permit2** that a SignatureTransfer signature presupposes | pure successor to the resolution half of `getGeneralAdapterRequirements` | all bundles funding paths |
| `encodeErc20Permit2SignatureTransfer(...)` | new — see §3 | all bundles funding paths |
| `Permit2SignatureTransferAction` + args — a **distinct** `RequirementSignature` union member | new; reusing `action.type: "permit2"` would collide with AllowanceTransfer (§3) | all bundles funding paths |
| `computeVaultMaxSharePrice({ vaultData, assets, slippageTolerance })` in `helpers/slippage.ts` | three inline copies in `vaultV1`/`vaultV2` entities | vault deposit, migration destination leg |
| `grossFromNetAssets({ netAssets, referralFeePct })` | new | referral-fee call sites |
| `bundles.vaultBundlesV1` registry slot + `vaultBundlesV1Abi` + `RequirementSpenderKey` entry | new | — |

The public entity-handle option follows the `BlueBundlesV1` implementation's caller-owned nonce
model and is exported from the package barrel:

```ts
export interface BundlesTokenRequirementsOptions {
  /** Prefer ERC-2612 when the funded token exposes a compatible nonce. */
  readonly useSimplePermit?: boolean;
  /** Explicit unused Permit2 SignatureTransfer unordered nonce. */
  readonly permit2Nonce?: bigint;
}
```

Every Blue or vault `ActionOutput` whose `getRequirements()` can select a token permit uses
`BundlesTokenRequirementsOptions` as its requirements-parameter type and forwards both fields to
the shared coordinator:
`ActionOutput<TAction, readonly RequirementSignature[], BundlesTokenRequirementsOptions>`.
Share-only outputs keep their existing requirements type. `permit2Nonce` is optional in the
TypeScript shape because ERC-2612, classic-approval, and native-funding paths do not consume one; it
is required at runtime when dispatch reaches Permit2 SignatureTransfer.

`getBundlesTokenRequirements(...)` is deliberately **not** an Action-layer brick. It lives under
`src/entities/requirements/` and owns the asynchronous boundary: chain validation; direct and
Permit2 ERC-20 allowance reads; ERC-2612 nonce / domain-metadata reads; and the Permit2
`nonceBitmap` read for the caller-selected word. It passes those results as readonly plain state into
`resolveBundlesTokenRequirements`, which performs no RPC and returns the encoded requirement
descriptors. The shared entity module has multiple Blue and vault entity call sites, so it centralizes
the reads without letting an Action module depend on a viem client. The pure resolver is also the
unit/property-test boundary; transport and fork tests cover the entity reader.

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
behind the master PR. Where a parameter disappears, the relevant exported action-parameter type
retains it as a readonly forbidden key: deposit keeps `recipient?: never`; withdraw / redeem keep
`recipient?: never` and `onBehalf?: never`; migration keeps `recipient?: never` and
`minSharePriceVaultV1?: never`. TypeScript only performs excess-property checking on fresh object
literals; without these `never` fields, a legacy typed variable or wrapper result remains
structurally assignable and its routing fields would be silently ignored. Compile-time tests pass
named legacy values—not only fresh literals—to every retyped builder and assert rejection. Quietly
accepting a `recipient` the contract cannot honor would misroute funds.

**`userAddress` changes meaning, and the compiler cannot catch it.** This is the one breaking change
in this migration that is silent at compile time *and* at build time. `VaultBundlesV1` hardcodes the
depositor, the share owner, and the payee to `msg.sender`. Today's actions take `recipient`
(ERC-4626 `receiver`) and `onBehalf` (ERC-4626 `owner`) as independent addresses, and the entities
collapse both to `userAddress` (`entities/vaultV1/vaultV1.ts:378-382`,
`entities/vaultV2/vaultV2.ts:418-422`). Crucially, the SDK **deliberately does not require
`userAddress` to be the submitting account**: `validateUserAddress` is called on no vault build path,
`packages/morpho-sdk/src/entities/AGENTS.md:9` states the invariant ("Entities do not enforce
builder = signer at build time — callers MUST keep `userAddress` aligned with the signing account"),
and `entities/vaultV1/vaultV1.test.ts:737-741` regression-tests that a public client with a
divergent `userAddress` still produces a valid transaction.

The same `AGENTS.md` line notes that the invariant *is* enforced at `sign()` time on the signature
requirements, via `validateUserAddress`. That existing enforcement point does not cover this
migration: it fires only when a signature requirement exists, and the two cases that misroute funds
have none — a withdraw whose share allowance is already sufficient returns no requirement at all, and
the classic-approval path has no `sign()` to hook. So the check must move to where the address is
consumed, not where a signature happens to be produced.

So rows 2 and 3 below understate the change; entity callers are not safe. A relayer that submits a
deposit built with `userAddress = user` mints the shares to the **relayer**. A withdrawal built with
`userAddress = otherHolder` — legal today whenever the submitter holds a share allowance from that
holder, because `onBehalf` is a real ERC-4626 `owner` parameter — burns the **submitter's** shares
instead. Both misroute funds and raise no error at any layer. Mitigation:

- `userAddress` is redefined in JSDoc as *the account that must submit the transaction*, not the
  position owner, on every re-routed vault method;
- the entities check it opportunistically: when `client.account` is present and differs from
  `userAddress`, throw the existing `AddressMismatchError` through `validateUserAddress`. With no
  connected account the check is impossible, which is what preserves the public-client build pattern
  the regression test above pins;
- the delegated capability itself is **lost**, not relocated — capability-loss row 16 covers it, and
  integrations that depend on it must keep a direct vault call.

Enforcing builder = signer unconditionally would be the stronger guarantee, but it would break that
documented invariant and the public-client pattern with it. See Considered Alternatives and Open
Question 7.

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
- Permit2 **SignatureTransfer** — new encoder, and **not a single requirement**: see below.

The Permit2 point is not optional. `TokenLib.pullToken` calls
`IPermit2.permitTransferFrom(PermitTransferFrom(TokenPermissions(token, amount), nonce, deadline), …)`.
The SDK's existing `encodeErc20Permit2Approve` produces an **AllowanceTransfer** `PermitSingle`
signature; it is a different EIP-712 type and is not consumable by this contract. PR #945 sidestepped
this by resolving classic approvals only; carrying that choice into vault deposits would turn a
signature into an extra transaction for every Permit2 user.

**Permit2 is a two-requirement path, not one.** A SignatureTransfer signature is worthless on its
own: Permit2 executes the `transferFrom` itself, so it needs an ERC-20 allowance from the owner to
the Permit2 contract, and a first-time user has none. `getGeneralAdapterRequirements` already
resolves this — it reads `allowance(from, permit2)` and, when that is short of `amount`, emits an
infinite (`MAX_UINT_160`) approval to Permit2 **before** the signature requirement
(`getGeneralAdapterRequirements.ts:160-182`, `getGeneralAdapterRequirementsPermit2.ts:79-103`).
`getBundlesTokenRequirements` inherits that behavior, including the `APPROVE_ONLY_ONCE_TOKENS`
`approve(0)` reset, so the Permit2 path can return **up to three** ordered requirements. Dropping the
prerequisite would produce a valid signature and a reverting transaction, so the first-time Permit2
depositor is a required authorization test.

Two things must change rather than be inherited. The spender inside the signature becomes
`vaultBundlesV1` instead of `generalAdapter1`; and the approval amount moves from `MAX_UINT_160` to
`MAX_UINT_256`, because `MAX_UINT_160` is a copy of AllowanceTransfer's `PermitDetails.amount` field
width and SignatureTransfer's `TokenPermissions.amount` is `uint256` (`morpho-ts/src/abis.ts:576-578`).
Keeping the narrower cap would make `getRequirementsApproval` throw
`ApprovalAmountLessThanSpendAmountError` — it rejects `approvalAmount < spendAmount` outright
(`getRequirementsApproval.ts:63-65`) — for a gross amount the contract itself accepts. A gross above
`MAX_UINT_160` is economically unreachable at any real token supply, so this is a boundary-correctness
fix rather than a live risk; it matters because §5 mandates property-based coverage over `bigint`
inputs, and a generator that does not respect an undocumented `uint160` ceiling will hit the throw.
The `MAX_UINT_160 + 1n` boundary is therefore an explicit property-test case.

**SignatureTransfer needs its own signature discriminant.** `PermitRequirementSignature` tags
AllowanceTransfer as `action.type: "permit2"` and carries an `expiration` that SignatureTransfer has
no equivalent for (`types/action.ts:590-594`, `:631-635`), and `selectRequirementSignatures` matches
**only** on `action.type`, collapsing `"permit"` and `"permit2"` into one `permit` slot
(`types/action.ts:901-939`). Reusing the tag would therefore let a stale AllowanceTransfer signature
reach `getBundlesTokenPermit` and be reshaped into a `TokenPermit` the contract cannot verify, and
would make a legitimate permit + permit2 pair throw `AmbiguousRequirementSignaturesError` instead of
resolving. Phase 1 adds a distinct union member — `action.type: "permit2SignatureTransfer"` with
`{ spender, amount, nonce, deadline }` and no `expiration` — and narrows every consumer
(`selectRequirementSignatures`, `getBundlesTokenPermit`, `getTokenRequirementActions`) exhaustively,
so a Bundler3 consumer handed the new kind fails with `UnexpectedRequirementSignatureError` rather
than mis-encoding. This is not a new decision:
[TIB-2026-06-03](./TIB-2026-06-03-midnight-action-output-interface.md) already recorded it as the
required follow-up — "a distinct requirement type for Permit2 SignatureTransfer rather than reusing
Blue's `action.type === \"permit2\"`" — and deferred it because Midnight shipped approval-only. This
TIB is where it comes due.

**SignatureTransfer nonces are unordered**, not sequential: Permit2 tracks them in
`nonceBitmap(owner, wordPos)` — already present in `packages/morpho-ts/src/abis.ts`. A signature
whose bit is already flipped reverts, and an unsubmitted signature leaves its bit free forever, so
reusing "the next nonce" is not a strategy. Following the existing `BlueBundlesV1` entity contract,
Permit2 selection therefore requires the caller to supply an explicit unused `permit2Nonce` through
`BundlesTokenRequirementsOptions`. Before any nonce RPC read, `getBundlesTokenRequirements` throws
`NegativeInputError` below zero or `InputExceedsMaxError` above `MAX_UINT_256`; it then derives
`wordPos = permit2Nonce >> 8` and `bitPos = permit2Nonce & 255`, reads that one bitmap word, and
throws `Permit2TransferFromNonceAlreadyUsedError` when the bit is already flipped. Omitting the nonce
when dispatch reaches Permit2 throws `MissingPermit2TransferFromNonceError`; the coordinator does
not scan for or allocate a replacement.

**Concurrency ownership stays with the application.** Two callers can choose distinct free bits and
submit the resulting SignatureTransfer permits in either order. If they reuse the same still-free
nonce before either transaction lands, both requirement resolutions can succeed and Permit2 accepts
only the first submission. Preventing that would require the SDK to remember what it handed out —
state, which §1 forbids: `morphoViemExtension()` is stateless by construction, with no cache and no
warm-up. The requirement's `action.args` surface the caller-selected nonce so the allocation remains
observable. Tests cover a missing nonce, a consumed nonce, and two concurrent intents supplied with
distinct nonces.

**Share-side approval (withdraw / redeem / migration).** `IERC4626(vault).withdraw(assets,
address(this), msg.sender)` and `redeem(shares, address(this), msg.sender)` spend the caller's
shares, so the bundler needs a share allowance. This is the plan's "approval before each withdraw"
regression. Mitigation, in order:

1. sufficient existing allowance → no requirement;
2. otherwise, `supportSignature: true` →
   `encodeVaultSharesPermit({ spender: vaultBundlesV1, version })`, one
   EIP-712 signature, no extra transaction. Both Vault V1 (OZ `ERC20Permit`) and Vault V2 (native
   ERC-2612, `nonces` + `DOMAIN_SEPARATOR`) support this, so **no vault is forced onto an approval
   transaction**;
3. otherwise `encodeErc20Approval` on the vault share token.

Allowance sizing is exact, never max, and must **upper-bound** the shares burned at execution:

- redeem / migration-by-shares: exactly `shares` — deterministic;
- withdraw / migration-by-assets: shares are previewed, so the bound must survive share-price drift.
  Reuse the `inKindRedeem` rule — accrue the vault forward (which mints pending performance-fee
  shares and therefore *lowers* the share price) before `toShares(assets)` — and widen by the
  caller's `slippageTolerance`. The widening applies to **Vault V2 and MetaMorpho 1.0**, not to V2
  alone, which is a correction to the V1/V2 asymmetry an earlier draft of this TIB asserted.

  Accrual is only one of the two ways a share price moves, and the safe direction is the only one the
  SDK models. Accrual alone cannot lower a V1 price: market interest is non-negative
  (`Market.ts:358-360`) and the vault's fee mint charges `feeAssets ≤ totalInterest`
  (`Vault.ts:466-473`), so the accrued preview does upper-bound the burn *if accrual is the only state
  change*. Loss realization is the other way, and the SDK does not simulate it — there is no
  `liquidate()` state transition anywhere, and `totalSupplyAssets` is a plain fetched field
  (`Market.ts:35,57`). A Blue bad-debt socialization between resolution and inclusion reduces a
  market's `totalSupplyAssets` with shares unchanged, and `AccrualVault.totalAssets` is exactly the
  allocation sum (`Vault.ts:238-241`), so it flows straight through.

  What separates the two V1 generations is the `lostAssets` clamp. **MetaMorpho 1.1** has it, and it
  guarantees `totalAssets ≥ lastTotalAssets` (`Vault.ts:457-464`, asserted at `Vault.test.ts:270-275`),
  so the price is non-decreasing by construction and the bound survives a loss — but it becomes
  exactly *tight* rather than conservative, since the price goes flat instead of rising.
  **MetaMorpho 1.0** has `lostAssets === undefined` (`blue-sdk-viem/src/fetch/Vault.ts:128`), the
  clamp branch is skipped, and a fetched loss propagates directly into the share price. There, the
  accrued preview is **not** an upper bound and an exact allowance reverts for insufficient
  allowance. Since `toShares` rounds `"Up"`, the only existing margin is one wei.

  Note this is a **pre-existing gap, not one this migration introduces**: the shipped `inKindRedeem`
  V1 path sizes its allowance on the same assumption and carries the same comment
  (`entities/vaultV1/vaultV1.ts:489-493`). The migration is what makes it load-bearing on the common
  withdraw path, so the fix belongs in Phase 3 and the comment at that call site must be corrected
  rather than copied.

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
and the property test asserts exact round-tripping rather than a ±1 window.

Action args carry exact `referralFeeAssets` and `netAssets` only when the gross asset amount is fixed:
deposit, withdraw-by-assets, and migration-by-assets. Redeem and migration-by-shares determine their
asset proceeds from the share price at execution, so those branches omit both derived fields rather
than embedding an entity preview that can drift before inclusion. Their action args retain the input
shares and fee configuration; integrations that need proceeds inspect asset deltas from a finalized,
execution-equivalent transaction simulation and present them as a preview, not an enforced floor.

Validation lives in the builders as well as the entities, since the builders are the exported
surface, and it has a lower bound as well as an upper one: reject `pct < 0n` with
`NegativeInputError` — otherwise the `uint256` ABI encoder fails with an untyped viem error and the
gross-up divides by a value greater than `WAD`, both violating §3's typed-error rule — reject
`pct >= WAD` with `ReferralFeePctExceededError` (contract: `PctExceeded`), and reject `pct > 0` with
a zero recipient (which would revert in `SafeTransferLib`). `validateSlippageTolerance`
(`helpers/validate.ts:575-582`) is the precedent for the pair: `NegativeInputError` below, a
dedicated class above.

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
keeps its V1→V2 scope and its existing shares branch, and gains an assets branch through a readonly
exclusive union:

```ts
export type VaultV1MigrateToV2AmountArgs =
  | { readonly shares: bigint; readonly assets?: never }
  | { readonly assets: bigint; readonly shares?: never };
```

The exported action parameter and the entity method input both incorporate this union. Both-invalid
states are therefore unrepresentable to typed callers; `AmountAndSharesExclusiveError` remains the
runtime boundary for JavaScript, deserialized, or otherwise untyped input. A full-position migration
passes the full share balance, which — unlike Blue's exact-share withdrawal — does not drift with
interest accrual.

**Zero and dust.** The contract states that no-ops and zero checks are not systematic. A deposit
minting zero shares makes `toDeposit.mulDivUp(1e27, shares)` divide by zero and panic. The builders
reject non-positive `assets` / `shares` with `NonPositiveInputError`; the **entities** reject a
previewed zero share mint, as `deposit` already does today (`entities/vaultV1/vaultV1.ts:310-318`).

That split is deliberate, and the guarantee must be stated at the layer that can hold it. The pure
builders receive only addresses, amounts, and the collapsed `maxSharePrice` scalar — no share
preview, no vault state, no client (§1, Action layer: no RPC reads) — so they cannot know whether a
positive net deposit mints zero shares. Passing a precomputed preview into the builder was considered
and rejected (see Considered Alternatives): it would put a value the builder can neither validate nor
refresh into its signature, and a stale preview is precisely the case the guard exists to catch. A
caller that bypasses the entity and encodes `vaultV1Deposit` directly therefore keeps the onchain
panic as its failure mode; the acceptance matrix scopes the row to the entity accordingly.

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

The union closes the args side but not the signature side, and that gap changes severity here.
`buildTx(signatures)` calls `selectRequirementSignatures(signatures, { permit: true })`
unconditionally, and the builder then **silently drops** the permit when `amount === 0n` — documented
today as intended behavior at `actions/vaultV1/deposit.ts:66-68`. Under this contract the drop stops
being harmless: `pullOrWrapNative` requires `permit.kind == None` when value is attached, so a permit
that *did* reach the encoded `TokenPermit` reverts with `BothNativeAndToken`. A stale or
hand-assembled signature is the realistic trigger — a user who switches from WETH to ETH after
signing. The bundles deposit paths therefore **reject** a selected token signature whenever native
funding is active, reusing `MixedBundlesFundingError` (same contract error, no new class) rather than
ignoring it. Discarding a signature the contract would reject is the §2 rule-2 antipattern with a
revert attached.

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

Contract reverts map to named, exported classes (§3). Reused — deliberately, so the migration adds no
class where one already fits: `NonPositiveInputError`, `NegativeInputError` (`referralFeePct < 0n`),
`ExpiredDeadlineError`, `VaultAssetMismatchError`, `VaultAddressMismatchError`,
`ChainIdMismatchError`, `ChainWNativeMissingError`, `NativeAmountOnNonWNativeVaultError`,
`UnknownAddressError`, `AddressMismatchError` (`userAddress` is not the connected account),
`InputExceedsMaxError`, `MissingPermit2TransferFromNonceError`,
`Permit2TransferFromNonceAlreadyUsedError` (preserved from the Blue bundles requirements path),
`UnexpectedRequirementSignatureError` (an AllowanceTransfer signature on a bundles path), and
`AmbiguousRequirementSignaturesError`. New:

| Error | Guards |
| ----- | ------ |
| `MixedBundlesFundingError` | `amount` and `nativeAmount` both set, **or** a token permit selected while native funding is active (contract: `BothNativeAndToken` / `InconsistentAmountAndNative`) |
| `ReferralFeePctExceededError` | `pct >= WAD` (contract: `PctExceeded`) |
| `ReferralFeeRecipientMissingError` | `pct > 0` with a zero recipient |
| `AmountAndSharesExclusiveError` | both or neither set on migration input received from an untyped caller (contract: `NotExactlyOneZero`) |
| `SameVaultMigrationError` | source and destination are the same address |
| `BundlesPermitMismatchError` | generalizes `VaultExitBundlesV1PermitMismatchError` |

No gate error class: gate compatibility is a simulation concern, per §3.

### Implementation Phases

- **Phase 0 — WDK deprecation runway (pre-release dependency).** Before the bundles-migration major,
  publish a `wdk-protocol-lending-morpho-evm` minor that introduces
  `MorphoExclusiveSupplyOptions`, a readonly `amount` / `nativeAmount` XOR with the absent key typed
  `?: never`. Mark the additive `MorphoErc20SupplyOptions`, `MorphoNativeSupplyOptions`, and
  `MorphoSupplyOptions` exports `@deprecated` with the exclusive successor and removal major named
  in their JSDoc. The supply, quote, collateral-supply, and requirement methods accept both surfaces
  during this release and preserve today's additive runtime behavior. The deprecated interfaces and
  overloads remain published for at least this full minor; Phase 4 cannot remove them until that
  release has shipped.
- **Phase 1 — shared bricks.** Extract the pure §1 table into `src/actions/bundles/`, rename PR #945's
  `BlueBundles*` types, add `encodeErc20Permit2SignatureTransfer` over a caller-supplied selected
  nonce, add the synchronous `resolveBundlesTokenRequirements` over plain state, add the distinct
  `action.type: "permit2SignatureTransfer"` requirement-signature union member and narrow every
  consumer exhaustively, carry the ERC-20-approval-to-Permit2 prerequisite into the pure resolver,
  add `computeVaultMaxSharePrice` and `grossFromNetAssets`, add the
  `bundles.vaultBundlesV1` registry slot, `vaultBundlesV1Abi`, and the `RequirementSpenderKey` entry.
  No module in this phase reads from a viem client.
- **Phase 2 — re-route the pure builders.** Rewrite the bodies of `actions/vaultV1/{deposit,
  withdraw,redeem,migrateToV2}.ts` and `actions/vaultV2/{deposit,withdraw,redeem}.ts` to encode
  `VaultBundlesV1` calls. Names, files, and barrel exports are untouched. Property-based coverage
  per §"Verification".
- **Phase 3 — entity requirements.** Add the shared entity-layer
  `src/entities/requirements/getBundlesTokenRequirements.ts`; it performs the allowance,
  ERC-2612 metadata / nonce, and selected Permit2 `nonceBitmap`-word reads; requires and validates
  `BundlesTokenRequirementsOptions.permit2Nonce` when Permit2 is selected; and passes readonly plain
  state into `resolveBundlesTokenRequirements`. Migrate both Blue and vault funding entities onto
  that split and export the readonly shared options type, preserving Blue's existing public nonce
  control. `withdraw` / `redeem` change from `{ buildTx }` to a full `ActionOutput` with share-permit
  / approval requirements; `migrateToV2` drops `minSharePriceVaultV1`. Fork tests run at pinned
  blocks.
- **Phase 4 — dependents.** `wdk-protocol-lending-morpho-evm` `withdraw` calls
  `vault.entity.withdraw({...}).buildTx()` with no arguments at `src/morpho-protocol-evm.ts:650-656`
  and exposes no withdrawal-requirements method, so first-time withdrawals would revert for
  insufficient share allowance. Two pieces are needed, and the second is what makes the first usable:
  1. `getWithdrawRequirements(options)` on the WDK protocol surface, mirroring the existing
     `getBorrowRequirements` shape (`morpho-protocol-evm.ts:695-728`). **Withdraw only** — the WDK
     surface exposes no `redeem`, so there is no `getRedeemRequirements` to add.
  2. A **signature-bearing options type**, because today there is nowhere to put the signed result:
     `withdraw` takes upstream `WithdrawOptions` from `@tetherto/wdk-wallet/protocols`
     (`{ token, amount, to }`), which this repo neither owns nor can extend. Borrow already solved
     the identical problem by declaring a local superset — `MorphoBorrowOptions` with
     `requirementSignature?: RequirementSignature` (`morpho-protocol-evm.ts:153-166`), read at the
     `buildTx` site (`:782-788`). Withdraw follows it exactly: export `MorphoWithdrawOptions`, accept
     it in `withdraw` **and in `quoteWithdraw`** (which shares the options type, `:616-619`), and
     pass `options.requirementSignature ? [options.requirementSignature] : undefined` into `buildTx`.

  `withdrawCollateral` / `quoteWithdrawCollateral` have the same no-argument `buildTx` shape
  (`:1068-1076`) but route through Blue, so they belong to the `BlueBundlesV1` sibling TIB, not here.
  Tests must pin `buildTx`'s arguments: today's `describe("withdraw")` block asserts the entity call
  but never the `buildTx` argument (`morpho-protocol-evm.test.ts:429-459`), which is why the gap was
  invisible.

  **WDK supply breaks too, and its removal is staged.** §5's exclusive funding invalidates every WDK
  native vault supply, because `normalizeOptionalNonNegativeAmount` turns an omitted `amount` into
  `0n` (`morpho-protocol-evm.ts:331-335`) and `_getSupplyAction` then forwards **both** keys
  unconditionally (`:566-568`), so even a purely native supply arrives as
  `{ amount: 0n, nativeAmount: X }` — a compile error against `BundlesFundingArgs` and
  `MixedBundlesFundingError` at runtime. Fixing the normalization is necessary but not sufficient:
  the WDK *public* options advertise the additive behavior the contract removes.
  `MorphoErc20SupplyOptions` requires `amount` and accepts an optional `nativeAmount`, and
  `MorphoNativeSupplyOptions` mirrors it (`:119-151`). Phase 0 first introduces and deprecates those
  shapes in favor of `MorphoExclusiveSupplyOptions`; only after they have remained available for one
  minor does this phase remove the deprecated interfaces / overloads and make every supply method
  accept the exclusive successor. That removal makes **`wdk-protocol-lending-morpho-evm` a major** —
  the withdraw work above is additive, but this is not. Normalization, `_getSupplyAction`, the supply
  tests, and the WDK migration-guide entry change here; the major must not ship if the Phase 0 minor
  has not completed its deprecation window.
- **Phase 5 — release surface.** Migration guide entry — led by the `userAddress` semantics change
  and the Permit2 signature-type change — glossary update, `AGENTS.md` routing summary rewrite, and
  changesets: **major** for `morpho-sdk`, **minor** for `morpho-ts`, **major** for
  `wdk-protocol-lending-morpho-evm` (the withdraw work is additive but the supply-options change
  removes fields — see Phase 4), plus an explicit changeset for `liquidity-sdk-viem`. That last one is not an open audit
  item: `packages/liquidity-sdk-viem/package.json:34` pins `"@morpho-org/morpho-sdk": "^5.4.0"` as a
  **peer**, which a `6.0.0` release does not satisfy, and §4 makes internal peer ranges a manual
  obligation — Changesets will not infer it. Its own source consumes only `PublicReallocation` and
  `ReallocationData` (`src/loader.ts:8-9`), neither of which this TIB retypes, so the correct move is
  to **widen** the range to `"^5.4.0 || ^6.0.0"` and ship a **minor**; narrowing to `"^6.0.0"` would
  drop 5.x consumers and owe a major, and is justified only if the master PR retypes a symbol it
  actually uses. `wdk-protocol-lending-morpho-evm` needs no range work — it declares morpho-sdk as a
  workspace `dependencies` entry (`package.json:54`), which Changesets bumps automatically.

## Breaking changes, regressions, and new failure modes

The question this TIB was asked to answer: wrapping is a breaking change, but it is not the only
one. `Plan` marks whether the migration plan already tracks the row.

**Breaking DevEx changes**

| # | Change | Plan | Mitigation |
| - | ------ | ---- | ---------- |
| 1 | Deposit `amount` + `nativeAmount` stop being additive; ETH and WETH become exclusive | tracked | `BundlesFundingArgs` XOR type surfaces it at compile time; migration guide shows the two-transaction fallback. Also breaks WDK supply — row 20 |
| 20 | WDK's additive `MorphoErc20SupplyOptions` / `MorphoNativeSupplyOptions` and `MorphoSupplyOptions` surface is removed after its deprecation window; normalization can no longer forward both keys | **new — untracked** | A prerequisite minor introduces `MorphoExclusiveSupplyOptions`, deprecates and retains the old exports / overloads for one full minor, then this subsequent major removes them. Today even a purely native supply reaches the entity as `{ amount: 0n, nativeAmount: X }` (`morpho-protocol-evm.ts:331-335`, `:566-568`) |
| 2 | Deposit `recipient` removed — shares always mint to `msg.sender` | new | The retyped action args retain `recipient?: never`, so fresh literals **and existing legacy-typed values** fail compilation. **Entity callers are not unaffected**: `userAddress` need not be the submitter, so a relayer-submitted deposit mints to the relayer — §2 and row 18 |
| 3 | Withdraw / redeem `recipient` and `onBehalf` removed | new | The retyped action args retain both keys as `?: never`, so structural assignment cannot silently preserve them. `onBehalf` is the ERC-4626 `owner`, so this removes a real delegated-exit capability (row 16); through the entity it silently changes *whose* shares burn — row 18 |
| 4 | Withdraw / redeem return `ActionOutput` instead of `{ buildTx }`; `buildTx` takes signatures | new | This is the API face of the share-approval regression; migration guide ships the requirement loop; WDK is updated in Phase 4 |
| 5 | Withdraw / redeem gain a required-with-default `deadline` and optional referral fields | new | Defaults keep call sites compiling |
| 6 | `migrateToV2` loses `minSharePriceVaultV1` and `recipient`, and gains an exclusive assets mode alongside shares | partially | Name and V1→V2 scope are preserved. Removed routing keys remain `?: never`, and the assets / shares XOR rejects both-invalid states at compile time; the lost slippage bound is row 11 |
| 7 | Permit2 AllowanceTransfer signatures are no longer accepted; SignatureTransfer only, under a **new** `action.type` | new | Encoder plus a distinct union member ship in Phase 1, so a stale AllowanceTransfer signature is rejected by `UnexpectedRequirementSignatureError` instead of mis-encoded; the requirement loop hides the difference from apps that use `getRequirements()`, which now returns up to three ordered entries |
| 8 | `tx.to` and calldata change for every vault flow; `action.args` shapes change | tracked (Integration/API) | Indexers, Dune queries, and simulation consumers need the new selectors before release; coordinate with the Data and API teams in Phase 5 |
| 18 | `userAddress` now means "the account that must submit", not "the position owner" | **new — untracked** | The only change here that is silent at compile time *and* build time, and it misroutes funds. JSDoc redefinition, opportunistic `AddressMismatchError` when `client.account` is present, leads the migration guide. Cannot be fully enforced without breaking the documented builder ≠ signer invariant — Open Question 7 |

**UX regressions**

| # | Regression | Plan | Mitigation |
| - | ---------- | ---- | ---------- |
| 9 | Every withdraw / redeem needs a share allowance the direct call never needed | tracked | ERC-2612 permit on both V1 and V2 shares reduces it to one signature; only `supportSignature: false` clients pay a transaction |
| 10 | No exit path returns native token, and this contract forecloses adding one | new, low | Already true today — the SDK has no `unwrapNative` bundler action, so no capability is lost, only a future one is closed off |
| 11 | **Migration loses the source-leg `minSharePrice`** the Bundler3 route enforced | **new — untracked** | Cannot be compensated onchain. Delete the input and document the loss. Share-mode `action.args` omit derived proceeds; apps that gate submission must inspect asset deltas from a finalized transaction simulation, which is still a preview rather than an onchain floor. Needs a product decision (Open Questions) |
| 12 | One `VaultBundlesV1` call per transaction | **new — untracked** | Documented; `migrateToV2` covers the main composite case; multi-vault batching is lost |
| 13 | Gated Vault V2s must allow `VaultBundlesV1` in `sendAssetsGate` (was GA1) **and now also in `receiveAssetsGate`, which exits never needed** because the direct call paid the user | **new — untracked** | Curators of permissioned vaults must update gates **before** the SDK release, or exits break. The SDK cannot pre-check this reliably (§3), so detection is by finalized-transaction simulation. Highest-risk operational item in this migration |
| 14 | With a referral fee, gross and net diverge and every displayed amount must say which it is | new | Exact gross-up helper (§4); irrelevant at `pct = 0` |
| 15 | A dust deposit minting zero shares panics onchain instead of reverting typed | new | Entity rejects a previewed zero mint before building. The pure builder cannot — it holds no share preview — so a direct action caller keeps the panic (§4) |
| 19 | Permit2 SignatureTransfer requires the caller to allocate an explicit unused unordered nonce | **new — untracked** | Preserve the public `BlueBundlesV1` behavior through `BundlesTokenRequirementsOptions`; the SDK validates the selected bitmap bit, while apps with concurrent intents allocate distinct values because a stateless SDK cannot reserve them (§3) |

**Capability losses**

| # | Loss | Plan | Mitigation |
| - | ---- | ---- | ---------- |
| 16 | No deposit-for-another-address and no withdraw-to-another-address | new | None available in this contract. Integrations relying on it must keep a direct vault call |
| 17 | No composition with other actions in one transaction (Bundler3's core value) | implied | The fixed entrypoints cover the known composite flows; anything else is two transactions |

Rows 18, 13, and 11 are the three findings that most warrant a decision before implementation — row 18
because it is the only one that misroutes funds without any diagnostic, rows 13 and 11 because their
mitigation is operational and product-owned rather than technical.

## Edge-Behavior Acceptance Matrix

Only `VaultBundlesV1`-specific behavior. Existing action validations are inherited.

| Situation | Required behavior |
| --------- | ----------------- |
| Deposit funded with both ETH and ERC-20 | Reject at the type level; `MixedBundlesFundingError` for untyped callers |
| Deposit with `nativeAmount != assets` | Structurally impossible — `assets` is derived from the funding side |
| Deposit into a non-wNative vault with native funding | `NativeAmountOnNonWNativeVaultError`, unchanged from today |
| Deposit whose net amount mints zero shares | **Entity** rejects before building; the pure builder holds no share preview, so a direct action caller keeps the onchain panic (§4) |
| Deposit with `referralFeePct < 0n` | `NegativeInputError` in the builder, before the `uint256` encoder raises an untyped viem error |
| Permit2 deposit by an owner who has never approved Permit2 | Requirements include the ERC-20 approval to Permit2 **ordered before** the signature; a signature alone is never presented as sufficient |
| Permit2 selected without `permit2Nonce` | `MissingPermit2TransferFromNonceError`; never silently choose a nonce the stateless SDK cannot reserve |
| `permit2Nonce < 0` or `permit2Nonce > MAX_UINT_256` | `NegativeInputError` or `InputExceedsMaxError`, respectively, before any nonce RPC read or signing step |
| Two concurrent Permit2 requirements supplied distinct free nonces | Both resolve with the caller-selected nonce and may execute in either order |
| Two concurrent Permit2 requirements supplied the same still-free nonce | Both may resolve before chain state changes; the caller owns uniqueness, and Permit2 accepts only the first submission |
| AllowanceTransfer (`action.type: "permit2"`) signature passed to a bundles path | `UnexpectedRequirementSignatureError`; never reshaped into a `TokenPermit` the contract cannot verify |
| Token permit passed to a native-funded deposit | `MixedBundlesFundingError` at build time; never silently dropped, since the contract reverts `BothNativeAndToken` |
| Entity handle built with `userAddress != client.account` | `AddressMismatchError` when an account is connected; with a public client the SDK cannot check, and the JSDoc states `userAddress` must be the submitter |
| Deposit share price moves past the bound | Contract reverts `SlippageExceeded`; bound is computed from the **net** amount |
| Migration with both `assets` and `shares`, or neither | Rejected by the readonly XOR type; `AmountAndSharesExclusiveError` remains for untyped callers (contract: `NotExactlyOneZero`) |
| Withdraw-by-assets after a V2 share-price drop | Allowance must still cover the burn: exact bound plus the caller's slippage tolerance |
| Withdraw-by-assets from a **MetaMorpho 1.0** vault across a Blue bad-debt socialization | Same widening as V2 — the accrued preview is not an upper bound without a `lostAssets` clamp; MetaMorpho 1.1's clamp keeps the bound but makes it exactly tight |
| Permit2 deposit whose gross exceeds `MAX_UINT_160` | Resolves: the ERC-20 approval to Permit2 is sized `MAX_UINT_256`, since `TokenPermissions.amount` is `uint256`. Never `ApprovalAmountLessThanSpendAmountError` |
| WDK purely native vault supply | Reaches the entity with `nativeAmount` only; the pre-existing `{ amount: 0n, nativeAmount: X }` shape must not survive Phase 4 |
| Share balance shrinks between quote and inclusion (full exit by shares) | Contract reverts; do not describe a shares exit as saturated |
| Share balance grows between quote and inclusion | Residual shares remain; the exit is partial by design |
| Permit already consumed by a third party | `submitPermit` skips it; the existing allowance path must still cover the burn |
| Permit2 nonce bit already flipped | `Permit2TransferFromNonceAlreadyUsedError`; choose another explicit nonce and resolve again |
| Migration source and destination assets differ | Reject before building (contract: `InconsistentAssets`) |
| Migration source and destination are the same vault | `SameVaultMigrationError` |
| Migration source share price drops | No onchain bound exists; share-mode action args claim no fixed proceeds, and integrations disclose the latest finalized-simulation preview and the trade-off |
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
- Retype rather than silently ignore: a parameter the contract cannot honor remains present as
  `?: never`, so fresh literals and structurally assignable legacy values both fail compilation.
- Extract the `TokenLib` surface shared with `BlueBundlesV1` once, in the master PR, and migrate the
  Blue paths onto it in the same change.
- Keep `withdraw` and `redeem` as two methods over one entrypoint, and keep `migrateToV2` scoped to
  V1→V2 with an assets / shares exclusive union.
- `amount` is always the contract's gross value; the net-target gross-up is an exported pure helper
  whose inverse is exact.
- Native funding is exclusive and expressed in the type system.
- Do not expose a share-price bound the contract cannot enforce or encode mutable share-mode
  previews as fixed action args; execution-equivalent simulation owns proceeds previews.
- Keep RPC at the entity boundary: `getBundlesTokenRequirements` reads allowances, permit metadata,
  and `nonceBitmap` under `src/entities/requirements/`, then passes plain state into the synchronous
  Action-layer `resolveBundlesTokenRequirements`.
- Resolve every funding path the contract accepts from `getRequirements()`, including Permit2
  SignatureTransfer with an explicit caller-supplied nonce validated against `nonceBitmap`, plus its
  ERC-20-approval-to-Permit2 prerequisite.
- Give Permit2 SignatureTransfer its own `RequirementSignature` discriminant; never reuse Blue's
  AllowanceTransfer `"permit2"` tag.
- Never silently drop a signature the contract would reject; reject it at build time with a typed
  error.
- `userAddress` means the submitting account on bundles paths, checked opportunistically rather than
  enforced, so the documented builder ≠ signer freedom survives.
- State each guarantee at the layer that can hold it: share-preview checks are entity-level, because
  a pure builder has no vault state.
- Stage the WDK additive-supply removal through a published deprecation minor before removing its
  interfaces and overloads in the bundles major.
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

### Enforce builder = signer on the bundles paths

Call `validateUserAddress(client.account?.address, userAddress)` unconditionally in every re-routed
entity method, so the misrouting described in §2 becomes impossible.

**Why rejected:** it would break a documented, regression-tested invariant rather than a stale
assumption. `packages/morpho-sdk/src/entities/AGENTS.md:9` states that entities do not enforce
builder = signer, and `entities/vaultV1/vaultV1.test.ts:737-741` pins the public-client case — build a
transaction with no connected account and a divergent `userAddress`, sign and submit it elsewhere.
That is a legitimate pattern (quoting services, Safe proposal builders) that this migration has no
mandate to remove. The opportunistic check keeps the guarantee wherever it is checkable and costs
nothing where it is not. Revisit under Open Question 7 if product decides the safety is worth the
pattern.

### Reserve Permit2 nonces inside the SDK

Track handed-out bits so concurrent intents never collide.

**Why rejected:** it requires state, and `morphoViemExtension()` is stateless by construction (§1) —
no `init()`, no cache, no warm-up. A per-client bitmap would also be wrong across processes, tabs, and
server replicas, which is exactly where concurrent intents come from. Requiring an explicit
`permit2Nonce` on the Permit2 path puts the allocation in the only layer that can see all in-flight
intents.

### Pass a precomputed share preview into the pure deposit builders

Would let a direct `vaultV1Deposit` caller reject a zero-share mint without an RPC read.

**Why rejected:** it adds a parameter the builder can neither validate nor refresh, so a stale preview
would pass the guard it exists to satisfy — worse than no guard, because it reads as protection.
Deriving `maxSharePrice` already collapses the preview into a scalar the contract itself enforces.
The honest fix is to scope the guarantee to the entity (§4) and say so in the acceptance matrix.

### Max-approve vault shares once per vault

Removes the per-exit approval entirely for `supportSignature: false` clients.

**Why rejected:** an unbounded share allowance to a periphery contract is a materially larger blast
radius than one signature per exit, and the permit path already removes the transaction for clients
that support signatures.

## Verification

Per §5, and following the `inKindRedeem` test layout:

- **Unit, colocated.** Calldata equality against `IVaultBundlesV1` for all seven re-routed builders;
  inline snapshots for transaction shape, including exact fee/net fields on fixed-assets modes and
  their absence on redeem / migration-by-shares; every typed error asserted by class identity.
- **Property-based** (`fast-check`) on **every re-routed calldata builder** — all seven take inputs
  enumerable from primitives (addresses, bigints, tagged amount modes), so §5 requires generated
  ABI-equality properties for each, not only example tests. Also on `resolveBundlesFunding`, the
  pure `resolveBundlesTokenRequirements`, the assets/shares XOR, `computeVaultMaxSharePrice`
  monotonicity in `slippageTolerance`, and exact round-tripping of `grossFromNetAssets` against the
  contract's floor-fee rule.
- **Security invariants as tests** — each fails if the guard is removed: exclusive native funding,
  a token permit rejected on the native path, net-based deposit share-price bound,
  exact-and-upper-bounded share allowance, `chainId` validation, referral recipient non-zero,
  `referralFeePct` rejected below zero and at or above `WAD`, a missing or already-consumed explicit
  Permit2 nonce rejected, distinct caller-selected nonces preserved, the ERC-20 approval to Permit2
  ordered before the signature on a first-time depositor, an AllowanceTransfer signature rejected on
  a bundles path, and `AddressMismatchError` when a connected `client.account` differs from
  `userAddress`.
- **Fork, pinned block, per chain.** Vault V1 and Vault V2 × deposit / withdraw / redeem /
  migration; permit and approval paths; native deposit; referral fee crediting; `AlreadyInitiated`
  on a double call; full exit by shares; a Permit2 deposit from an owner with zero Permit2 allowance,
  proving the two-requirement path end to end. Plus a **MetaMorpho 1.0 withdraw-by-assets across a
  simulated bad-debt socialization**, asserting the widened allowance still covers the burn — the case
  that shows why the V1 bound needs the same treatment as V2.
- **Boundary coverage.** `MAX_UINT_160 + 1n` gross on the Permit2 SignatureTransfer path, asserting
  the approval is sized `MAX_UINT_256` and no `ApprovalAmountLessThanSpendAmountError` escapes;
  `permit2Nonce = -1n` and `MAX_UINT_256 + 1n` throw their named errors before transport access.
- **Compile-time API guards.** Pass named values typed as every legacy action-args interface into the
  retyped builders and assert that `recipient`, `onBehalf`, and `minSharePriceVaultV1` are rejected
  through the retained `?: never` keys; fresh-literal-only checks are insufficient. Assert that
  migration accepts exactly one of `assets` and `shares` and rejects both-invalid states.
- **WDK funding shape.** A purely native supply must reach the entity with `nativeAmount` only, and a
  `MorphoExclusiveSupplyOptions` value passing both an ERC-20 and a native amount must fail at
  compile time — the two cases that today pass silently through `normalizeDepositAmounts`. Phase 0
  separately pins that the deprecated additive overload still compiles and behaves additively for
  its required minor window; Phase 4 removes that fixture with the deprecated surface.
- **Regression guard.** Existing `BlueBundlesV1` and `VaultExitBundlesV1` tests stay green through
  the Phase 1 rename, with no assertions weakened. The builder ≠ signer regression test
  (`entities/vaultV1/vaultV1.test.ts:737-741`) must still pass — the `userAddress` check is
  opportunistic, not unconditional. WDK tests cover the new withdrawal-requirements path end to end
  and **assert `buildTx`'s argument**, which today's `describe("withdraw")` block never did
  (`morpho-protocol-evm.test.ts:429-459`).

## Assumptions & Constraints

- `VaultBundlesV1` is deployed on the supported chains and its addresses land in the registry
  through the usual sync, as PR #936 did for `vaultExitBundlesV1`. The TIB hardcodes no address.
- Both Vault V1 and Vault V2 shares implement ERC-2612, so the share-approval regression is always
  mitigable by a signature.
- No assumption is made that a Vault V1 share price is monotonic. It is monotonic under *accrual*, but
  the SDK does not model loss realization, and a MetaMorpho 1.0 vault has no `lostAssets` clamp to
  absorb one — so allowance sizing treats V1.0 like V2 (§3). Correcting an earlier draft of this TIB
  that asserted a V1/V2 asymmetry here.
- Vault V2 configurations used with this contract keep to `MorphoMarketV1AdapterV2` or
  `MorphoVaultV1Adapter`, per the contract's own deployment note. The SDK does not enforce it.
- Curators of gated Vault V2s update `sendAssetsGate` and `receiveAssetsGate` before release. The
  SDK cannot detect a stale gate ahead of submission.
- Referral-fee policy and eligibility stay a product concern outside the core SDK.
- No shipped integration builds a vault handle with a `userAddress` that differs from the submitting
  account. This is an **assumption, not a guarantee** — the SDK permits it today and the public-client
  path cannot be checked (§2, row 18) — so it must be confirmed with the app teams before the major,
  not asserted here.
- App-side simulation remains the only protection on the migration source leg, and the only reliable
  gate pre-flight.

## Dependencies

- `morpho-org/bundles` at the final reviewed deployment revision (audit:
  `2026-08-07-blue-vaults-bundles-blackthorn.pdf`).
- PR #937 / PR #945 (`BlueBundlesV1`) — Phase 1 renames their types and folds their action
  vocabulary into the existing Blue builders if Open Question 1 resolves that way.
- The bundles-migration master PR, which owns the major bump and the migration guide.
- A published `wdk-protocol-lending-morpho-evm` minor that introduces
  `MorphoExclusiveSupplyOptions`, deprecates the additive supply interfaces / overloads, and leaves
  them available for the required one-minor window before the master PR removes them.
- Registry sync PR for `bundles.vaultBundlesV1`.

## Security

- The share allowance granted to `VaultBundlesV1` is the new trust delegation on the exit paths.
  Exact, upper-bounded sizing keeps residual allowance to preview rounding; max-approval is
  rejected. "Upper-bounded" must hold against loss realization, not only accrual — see §3, and note
  the shipped `inKindRedeem` V1 path currently assumes otherwise
  (`entities/vaultV1/vaultV1.ts:489-493`), a pre-existing gap this migration must fix rather than
  propagate.
- `validateUserAddress` inside `encodeVaultSharesPermit.sign` must keep holding for the new spender:
  a third party must not be able to authorize someone else's exit.
- `validateRequirementSpender` must gain the `vaultBundlesV1` key; without it, approvals to the new
  contract are rejected — and with a wrong key, approvals could be directed at an unintended
  spender.
- Permit2 requires an explicit caller-selected nonce; the entity rejects a flipped bit before
  signing, and the signed `TokenPermissions.token` and `amount` must equal the pulled asset and gross
  amount exactly.
- The signed **spender** must be validated against the expected spender, which no consumer does
  today: `getTokenRequirementActions` checks asset and amount (`DepositAssetMismatchError`,
  `DepositAmountMismatchError`) but never the spender, and `selectRequirementSignatures` matches on
  `action.type` alone. With two live spenders in the tree (`generalAdapter1` and `vaultBundlesV1`)
  that omission becomes reachable, so the bundles path adds the check.
- Removing `recipient` / `onBehalf` while `userAddress` stays unvalidated is a fund-misrouting
  surface, not just a DevEx change (§2, row 18): the transaction is well-formed and pays the wrong
  account. Retaining the removed action keys as `?: never`, the opportunistic
  `AddressMismatchError`, and the JSDoc redefinition are the mitigation; the latter two still cannot
  cover the public-client path, which is why the migration guide leads with it.
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
   exit, or require integrations to gate submission on a finalized transaction simulation? The
   result remains a preview and is never encoded as an SDK or onchain floor.
3. **Gross vs. net inputs (§4).** Confirm `amount` stays the contract's gross value, with the exact
   gross-up as a helper.
4. **Withdraw-by-assets allowance buffer (§3).** Slippage-widened exact bound, or the user's full
   share balance for maximum robustness? Now applies to MetaMorpho 1.0 as well as V2, so the answer
   covers more vaults than the question originally assumed.
5. **Gate readiness (row 13).** Who owns confirming that every gated Vault V2 has whitelisted
   `VaultBundlesV1` on both gates before the major ships?
6. **Aave V3 → Vault V2.** Confirm it stays on Bundler3 past the major, or that the flow is dropped
   until a contract exists.
7. **Builder = signer (row 18).** Accept the opportunistic `AddressMismatchError` and carry the
   misrouting risk on public-client builds, or enforce `userAddress == client.account` on bundles
   paths and retire the documented builder ≠ signer freedom (`entities/AGENTS.md:9`) plus the
   quoting-service and Safe-proposal patterns that rely on it?
## References

- [VaultBundlesV1 source at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/VaultBundlesV1.sol)
- [IVaultBundlesV1 interface at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/vault/interfaces/IVaultBundlesV1.sol)
- [TokenLib at reviewed revision](https://github.com/morpho-org/bundles/blob/f27e7bcf744310303e24faa522b71d702e696686/src/libraries/TokenLib.sol)
- [Bundles repository README](https://github.com/morpho-org/bundles/blob/main/README.md)
- [Blue and vault bundles audit — Blackthorn, 2026-08-07](https://github.com/morpho-org/bundles/blob/main/audits/2026-08-07-blue-vaults-bundles-blackthorn.pdf)
- [Permit2 SignatureTransfer](https://docs.uniswap.org/contracts/permit2/reference/signature-transfer)
- [Permit2 AllowanceTransfer](https://docs.uniswap.org/contracts/permit2/reference/allowance-transfer)
  — the incompatible type the SDK signs today
- [TIB-2026-06-03 — Midnight ActionOutput interface](./TIB-2026-06-03-midnight-action-output-interface.md)
  — records the deferred distinct requirement type for Permit2 SignatureTransfer
- [TIB-2026-07-27 — VaultExitBundlesV1 in-kind redemption](./TIB-2026-07-27-vault-exit-in-kind-redemption.md)
- [TIB-2026-08-25 — BlueBundlesV1 SDK action flows](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [Stack base — morpho-org/sdks PR #937](https://github.com/morpho-org/sdks/pull/937)
- [BlueBundlesV1 implementation — morpho-org/sdks PR #945](https://github.com/morpho-org/sdks/pull/945)
- [Transaction Flow Migration plan](https://app.notion.com/p/morpho-labs/Transaction-Flow-Migration-3a4d69939e6d81c69393dc649d2f4d77)
