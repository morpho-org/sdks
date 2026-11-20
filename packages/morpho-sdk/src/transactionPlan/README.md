# TransactionPlan

TransactionPlan prepares immutable, serializable recipes for Vault V1 and V2 deposits, asset withdrawals and
exact-share redemptions, plus Vault V1 to V2 migrations, Vault V2 forced asset exits and force redemptions. Consumers own the client, wallet, storage and submission. The SDK
does not sign or retain a client in a plan. Stable entity handles remain the recommended path
during beta. See the [package guide](../../README.md#transactionplan-sign-and-verify-permits)
for signature attachment and transaction building.

## Field mapping: prepare → stored inputs → entity and ABI

This is the complete field-name mapping for all eleven vault actions and their approval steps.
Shared intent rows describe vault preparers; derived approvals carry only their listed inputs.
Shared rows apply alongside each vault action's rows, with the exceptions stated below. The stored
column means `action.inputs` unless it explicitly says **top-level plan** or **request**.
The final mapping column distinguishes stable entity/action arguments from contract ABI names;
these protocol-native names are not stored-plan aliases. Builders need not call entity handles.

Each preparer accepts the vault once: as an accrual snapshot, a share `Token`, or an explicit
`vaultAddress` for force-redeem. Stored vault fields remain addresses, never snapshots or tokens.

Quantities are bigint base units of the underlying asset, native currency (wei), or the relevant
vault's shares. RAY prices are scaled by `1e27` (asset base units per share base unit); WAD ratios
are scaled by `1e18`. Addresses, flags, timestamps and routing data have no asset/share denomination.
An em dash means the value is not stored or not encoded, not a zero-valued argument.

| Scope / action | Prepare params | Stored fields | Stable entity/action arguments → ABI arguments | Denomination / meaning |
| --- | --- | --- | --- | --- |
| All actions | `chainId` | `chainId`; also top-level plan `chainId` | Entity factory/action vault context `chainId` → chain selection, no calldata field | Integer chain ID |
| All actions | `account` | `account`; also top-level plan `account` | `userAddress` → bundle uses `msg.sender`; force-redeem uses `onBehalf` and `redeem.recipient` → deallocation owner and redeem receiver/owner | Address; signer, sender, share owner and recipient are the same account |
| All except migration | `vault.address` (snapshot operations), `shareToken.address` (redemptions), or `vaultAddress: Address` (force-redeem) | `vault` | Entity factory/action vault address → ABI `vault` (force-redeem instead calls that vault directly) | Address derived from the supplied snapshot/token, or supplied directly for force-redeem |
| All actions | `expiresAt?` | `deadline = BigInt(expiresAt)`; top-level plan `expiresAt` stays a number; force-redeem stores only top-level expiry | `deadline` → ABI `deadline`; force-redeem has neither argument | Unix seconds; defaults to two hours from preparation |
| Deposits, withdrawals, redemptions, migration, force-withdraw | `referralFee?.bps`, `referralFee?.recipient` | `referralFeePct`, `referralFeeRecipient` | Same names → same ABI names | Basis points → WAD ratio (`BigInt(bps) * 10n ** 14n`); recipient address; defaults to zero fee/zero address |
| In-kind exits and force-redeem | No `referralFee` param | — | — | These plans do not route referral fees |
| All actions | `calldataOrigin?` | Top-level plan `calldataOrigin`, not an input | Related entity option `metadata.origin` accepts at most 4 bytes, optionally preceded by a 4-byte timestamp; plan builder appends `calldataOrigin` directly to transaction `data`, not an ABI argument | Plan accepts any non-empty, even-length hex attribution bytes |
| All except force-redeem | `supportSignature?` | Not stored as a flag; determines approval steps or permit requests | Entity option `supportSignature` → referenced signature becomes action `requirementSignature` → `assetPermit` / `sharesPermit` | Boolean, default false; SDK never signs |
| Deposits only | `deployless?` | — | Underlying-token permit metadata reads honor entity option `supportDeployless` | Optional boolean; preparation-only read strategy; other preparers have no such option |
| Deposits, withdrawals, force-withdraw, in-kind exits | `vault: AccrualVault` (V1) or `vault: AccrualVaultV2` (V2) | Snapshot is not stored; its address and derived fields below are kept | Entity `vaultData` → — | One caller-fetched V1/V2 accrual snapshot, not a quantity |
| Redemptions | `shareToken: Token` (required for both V1 and V2) | Token is not stored; its address is `vault` | Share-token metadata for permit resolution → — | No accrual snapshot or asset quote; an address-only Token is sufficient for V2 |
| `vaultV2Deposit` | `assets`, `funding?: {type: "erc20" \| "native"}` | Exactly one of `assets` / `nativeAssets` | Entity/action `amount` / `nativeAmount` → `vaultBundlesV1Deposit.assets`; native funding also sets `tx.value` | Gross asset/native base units before referral fee; native asset must wrap to the vault asset |
| `vaultV1Deposit` | `assets`, `funding?: {type: "erc20" \| "native"}` | Exactly one of `assets` / `nativeAssets` | Entity/action `amount` / `nativeAmount` → `vaultBundlesV1Deposit.assets`; native funding also sets `tx.value` | Gross asset/native base units before referral fee; native asset must wrap to the vault asset |
| Both deposits | `slippageTolerance?`; `vault.asset` | Derived `maxSharePrice`; `asset` | Entity `slippageTolerance` derives action `maxSharePrice` → ABI `maxSharePriceE27`; `asset` is action vault context, not a calldata argument | WAD tolerance → RAY maximum price; asset address |
| `vaultV2Withdraw` | `assets` | `assets` | Entity/action `amount` → `vaultBundlesV1Withdraw.assets` (ABI `shares = 0`) | Gross asset base units before referral fee |
| `vaultV1Withdraw` | `assets` | `assets` | Entity/action `amount` → `vaultBundlesV1Withdraw.assets` (ABI `shares = 0`) | Gross asset base units before referral fee |
| Both withdrawals | Snapshot quote, no explicit allowance or slippage param | Derived `requiredShareAllowance` | Used only to resolve authorization, not an ABI limit | Share base units of the withdrawing vault; not a maximum-shares bound |
| `vaultV2Redeem` | `shares` | `shares` | Entity/action `shares` → `vaultBundlesV1Withdraw.shares` (ABI `assets = 0`) | Exact vault shares burned, no minimum-assets bound |
| `vaultV1Redeem` | `shares` | `shares` | Entity/action `shares` → `vaultBundlesV1Withdraw.shares` (ABI `assets = 0`) | Exact vault shares burned, no minimum-assets bound |
| `vaultV2ForceWithdraw` | `assets`; `slippageTolerance?` | `assets`; derived `minSharePriceE27` | Entity/action `exitAssets` → ABI `exitAssets`; entity `slippageTolerance` derives action/ABI `minSharePriceE27` | Penalty-inclusive assets debited from the position; WAD tolerance → RAY minimum realized exit price |
| Force-withdraw and V2 in-kind | `adapter?` (otherwise snapshot's sole eligible adapter) | Resolved `adapter` | Entity/action `adapter` → ABI `adapter` | Adapter address |
| `vaultV2ForceRedeem` | `shares`; `deallocations[].assets` | `redeem.shares`; `deallocations[].assets` | Entity/action `redeem.shares` → vault `redeem(shares, receiver, owner)`; entity/action `deallocations[].amount` → `forceDeallocate(adapter, data, assets, onBehalf)`, before redeem, in one `multicall` | Exact vault shares; ordered asset deallocations with caller's penalty buffer; no price floor |
| Force-redeem routing | `deallocations[].adapter`, optional `deallocations[].marketParams` | Same fields, copied as plain data | `adapter` → `forceDeallocate` adapter; `marketParams` → encoded `data` (empty bytes when omitted) | Adapter address; market tuple described below |
| `vaultV2InKindRedeem` | `assets`; `marketParamsList` | `assets`; `marketParamsList` | Entity/action `amount` → `vaultExitBundlesV1InKindRedemptionVaultV2.exitAssets`; same market list → ABI `marketParamsList` | Penalty-inclusive asset base units, not shares; ordered markets |
| `vaultV1InKindRedeem` | `assets`; `marketParamsList` | `assets`; `marketParamsList` | Entity/action `amount` → `vaultExitBundlesV1InKindRedemptionVaultV1.exitAssets`; same market list → ABI `marketParamsList` | Asset base units, not shares; ordered markets |
| `vaultV1MigrateToV2` | Exactly one of `assets` / `shares` | Selected `assets` / `shares` only | Same entity/action names → `vaultBundlesV1Migrate.assetsWithdrawn` / `sharesRedeemed`; unselected ABI quantity is zero | Source-vault underlying assets (gross, before referral fee), or exact source shares |
| Migration routing / snapshots | `sourceVault: AccrualVault`, `targetVault: AccrualVaultV2` | `vault = sourceVault.address`, `sourceVault = sourceVault.address`, `targetVault = targetVault.address`; source snapshot's `asset`; snapshots not stored | Source entity factory; entity `sourceVault` / `targetVault` take snapshots; action source vault / `targetVault` → ABI `sourceVault` / `destVault`; alias `vault` and `asset` are not additional ABI arguments | Vault and common-asset addresses; one caller-fetched snapshot per vault |
| Migration bound / authorization | `slippageTolerance?`; source/target quote | Derived `maxSharePrice`, `requiredShareAllowance` | Entity quote `maxSharePriceVaultV2` is stored as `maxSharePrice`, then mapped back to action `maxSharePriceVaultV2` → ABI `destMaxSharePriceE27`; allowance quote only resolves source-share authorization | WAD tolerance → destination RAY maximum price; source-vault share allowance, not an exit bound |
| Market tuples (in-kind / force-redeem) | `loanToken`, `collateralToken`, `oracle`, `irm`, `lltv` on each market | Same five plain fields, preserving list order | Same tuple fields → ABI struct, directly or in adapter `data` | Four addresses; WAD-scaled `lltv`; no class methods or cached/derived market IDs stored |
| `erc20Approval` (derived step, no preparer) | Derived token/spender/allowance | `token`, `spender`; exactly one of `assets` / `shares`, plus shared `chainId` / `account` | Encoder `token`, `spender`, `amount` → token target and `approve(spender, value)` | Underlying-asset or vault-share base units; deposits approve assets, exits/migration approve source shares; token/spender are addresses |
| ERC-2612 deposit request (not an action input) | Derived from underlying-token metadata and requirements; ERC-20 funding only | Request `args.amount`, `args.spender`, `args.deadline`, `args.nonce`, `typedData`, optional `signature`; action references it via `signatureRequestIds.tokenPermit` | `requirementSignature` → `assetPermit = {kind: ERC2612, data: abi.encode(deadline, v, r, s)}`; no nonce or value in this tuple; gross `assets` is a separate deposit ABI argument | Asset base units; signed `value` equals gross `assets`; nonce stays in the request/typed data; spender is an address, deadline is Unix seconds; protocol-native `amount` / `value` are not renamed |
| ERC-2612 exit / migration request (not an action input; no force-redeem permit) | Derived from vault-share metadata and requirements | Request `args.amount`, `args.spender`, `args.deadline`, `args.nonce`, `typedData`, optional `signature`; action references it via `signatureRequestIds.tokenPermit` | `requirementSignature` → `sharesPermit = {value, nonce, deadline, v, r, s}`; token/owner come from typed-data domain/message and the action context | Source-vault share base units; prepared permits authorize `maxUint256`; spender is an address, deadline is Unix seconds, nonce is a counter; protocol-native `amount` / `value` are not renamed |

Native deposits still take `assets` at preparation: select `funding: { type: "native" }` to store
`nativeAssets`. The vault asset must be the chain's wrapped-native token. Deposits accept
`slippageTolerance`, which derives the stored `maxSharePrice`. Ordinary withdrawals have no on-chain
share-price or maximum-shares bound; the allowance quote is not such a bound. Redemptions burn
exact shares without enforcing minimum assets received.

V1 and V2 deposits share preparation and validation. Supply the matching caller-fetched accrual
snapshot as `vault`; the preparer derives and stores its address without retaining the snapshot.

Force-withdraw plans derive their quote through shared pure helpers; optional `slippageTolerance`
uses the entity default when omitted. The resolved `minSharePriceE27` is stored, not the tolerance. There is no raw floor
override in plan preparation. Received assets exclude penalties and any referral fee; approvals
and unlimited share permits target VaultExitBundlesV1.

Force-redeem plans fix caller-supplied deallocations before the exact-share redeem in one vault
multicall. They need no snapshot, approval or signature request. They have no share-price floor;
expiry is plan metadata, not an on-chain deadline.

## Breaking rename for stored version 2

These APIs may break in minor releases. The denomination-explicit format uses `version: 2`.
Version 1, including plans saved by SDK 9.7.0, is rejected with
`UnsupportedTransactionPlanVersionError` before stored action fields are interpreted; there is no
legacy parser. SDK 9.7.0 shipped only deposit and withdrawal preparation. Update those calls and
migrate trusted stored plans to the new fields and version before parsing them with the new SDK:

- Deposit: `amount` → `assets` in preparation, `amount` → `assets` and `nativeAmount` →
  `nativeAssets` in stored inputs.
- Withdrawal: `amount` → `assets` in preparation and stored inputs.
- Deposit approval inputs (underlying token): `amount` → `assets`.
- Withdrawal approval inputs (vault-share token): `amount` → `shares`.

Do not rename ERC-2612 request `args.amount`, typed-data `value`, or the low-level
action/transaction `args`: those retain their ABI names. Encoded calldata, permit signatures and
stable entity APIs are unchanged by this representation-only rename.

For SDK 9.7.0 V2 deposit and withdrawal preparation calls, replace `vault` plus `vaultData` with
the snapshot as `vault`, and remove the unused `deployless` option from withdrawal calls. These
preparation-input changes do not change format-2 stored vault addresses or transaction bytes.

Redemption is new in format 2: it takes `shareToken: Token` and `shares` from the start, and its
stored inputs and vault-share approvals use `shares`. For V2, an address-only `Token` is sufficient.
For V1 permits, supply share-permit domain metadata, for example from `fetchToken`.

Vault V2 force withdrawal is also new in format 2. Its preparation and stored inputs use
penalty-inclusive `assets`. Optional `slippageTolerance` derives the stored `minSharePriceE27` floor,
using the entity default when omitted. Its share approval inputs use `shares`.

New force-redemption plans take `vaultAddress`, top-level `shares`, and asset-denominated
`deallocations[].assets`. Stored inputs use `vault` and `redeem.shares`. No `supportSignature` or
`deployless` option is accepted because this native vault multicall needs no token permissions.

`parseTransactionPlan` validates structure and internal consistency, not authenticity, intent,
expiry, live state or stored signature validity. Protect stored plans independently; a successful
parse is not authorization to submit them.

## V1 asset withdrawals

Use `prepareVaultV1Withdraw` with an `AccrualVault` snapshot from `fetchAccrualVault`.
V1 and V2 withdrawals share preparation and structural validation.
Preparation takes gross `assets` and fixes `requiredShareAllowance` before resolving share
authorization. Sufficient allowance needs no prerequisite; otherwise an unlimited share approval
or ERC-2612 permit is required. V1 permit-domain metadata comes from the snapshot; read and
metadata errors propagate. There is no Permit2 or hidden snapshot fetch. Ordinary withdrawals
accept no slippage input and have no on-chain share-price or maximum-shares bound.

Sign `getPendingSignatureRequests(plan)` externally, then use synchronous `applySignatures` to
verify and attach without RPC. Builders return plain transactions without step IDs or kinds.
The ordinary withdrawal allowance quote uses `DEFAULT_SLIPPAGE_TOLERANCE` internally.

## Shared share spending

Both redemption preparers take exact `shares` and required `shareToken: Token` metadata, not an
accrual snapshot. An address-only Token is sufficient for V2. V1 and V2 redemptions and ordinary withdrawals share
authorization preparation. Independent chain, bytecode and requirement reads run in `Promise.all`,
matching V2 withdrawal. The requirement resolver validates the RPC chain before allowance or nonce
reads, and sufficient allowance skips nonce reads. Fixed shares impose no minimum-assets bound.

Migration fixes its quote before resolving share requirements through the same concurrent helper.
Its validator uses the shared vault schema and requires `vault` to equal `sourceVault`. Format-2
migration plans store the derived price bound as `maxSharePrice`.
Migration takes `sourceVault: AccrualVault` and `targetVault: AccrualVaultV2`, storing only their
addresses. It rejects different underlying assets or identical vault addresses. It has no `deployless`
option because its share-authorization reads do not use deployless calls.

V1 and V2 in-kind exits prepare and store `assets`, then map to the stable entity/action `amount`
(ABI `exitAssets`). They take a single `vault` snapshot (`AccrualVault` for V1, `AccrualVaultV2` for V2) and no `deployless`
option. They
have no share-price or maximum-shares bound. New in-kind plans use stored format 2, and their
share approvals use `shares`.
