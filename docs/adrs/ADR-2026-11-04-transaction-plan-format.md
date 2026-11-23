# ADR-2026-11-04: Persisted TransactionPlan format

| Field      | Value                                                |
| ---------- | ---------------------------------------------------- |
| **Date**   | 2026-11-04                                           |
| **Author** | @jinmel                                              |
| **Scope**  | `morpho-sdk` (first release that ships it); `TransactionPlan` format 1 |

_Frozen after merge; only superseded-by entries in References change._

## Context

Preparing an operation, collecting signatures and submitting transactions happened in
different processes and at different times. A live entity handle or closure could not
serve as the saved operation: another process needed the same recipes, request identities
and resolved values to reproduce its transactions. Once applications stored that data,
its shape and bigint representation became a compatibility contract independent of the
code used to prepare or build it. Stored data could also be edited, so request consistency
and signature verification needed a clear boundary from the integrator's intended operation.

## Decision

`TransactionPlan` is an experimental, versioned, data-only operation that the SDK prepares,
the consumer signs, and the SDK builds into plain transactions without further reads.
The initial operations are Vault V2 deposits and asset withdrawals.

```ts
interface TransactionPlan {
  readonly version: 1;
  readonly chainId: number;
  readonly account: Address;
  readonly expiresAt: number; // Unix seconds
  readonly calldataOrigin?: Hex;
  readonly steps: readonly Step[];
  readonly signatureRequests: readonly SignatureRequest[];
}
```

Each `Step` is `{ id, label, action }`, with a plan-unique string `id` and a display
`label`. Its `Action` is `erc20Approval`, `vaultV2Deposit` or `vaultV2Withdraw`.
Every action carries its own `inputs.chainId` and `inputs.account`, including approvals.
Vault actions also carry the vault, amount, deadline, `referralFeePct` and
`referralFeeRecipient`, plus
the deposit's asset and `maxSharePrice` or the withdrawal's `requiredShareAllowance`.
Native deposits use `nativeAmount` instead of the ERC-20 `amount`. Vault actions refer
to a permit only by `signatureRequestIds.tokenPermit`; approvals have no request dependency.

Each `SignatureRequest` has a plan-local `id`, `kind: "permit"`, the EIP-712 `typedData`
(`domain`, `types`, `message`, `primaryType`), encoder-facing `args` containing `spender`,
`amount`, `nonce` and `deadline`, and an optional `signature: Hex`. There are no fetch
requests or fetch-result updates. Consumers fetch the vault snapshot
before preparation. Preparers finish the allowance, nonce, chain and registry-code
reads they require before returning; the plan contains every value building needs.

At preparation, plan-level `chainId` and `account` identify the intended execution
network and submitting account, and `expiresAt` supplies the action and permit deadlines.
Preparation rejects an already-expired deadline and defaults expiry to two hours ahead.
Parsing checks that each action's chain and account agree with the plan headers, but
does not check `expiresAt` against the clock. Plans supplied directly can bypass
parsing, and building uses the actions' own inputs. The caller must enforce plan expiry,
bind the wallet and network to the actions, and check freshness before signing or
submitting. Contracts independently enforce the encoded deadlines; changing header
`expiresAt` does not update those deadlines.

The public functions are:

```ts
prepareVaultV2Deposit(
  client: Client, params: VaultV2DepositPlanParams,
): Promise<TransactionPlan>;
prepareVaultV2Withdraw(
  client: Client, params: VaultV2WithdrawPlanParams,
): Promise<TransactionPlan>;
applySignatures(plan: TransactionPlan, signatures: readonly {
  readonly id: string;
  readonly signature: Hex;
}[]): TransactionPlan;
getPendingSignatureRequests(plan: TransactionPlan): readonly SignatureRequest[];
buildTransaction(plan: TransactionPlan, step: Step): Readonly<Transaction>;
buildTransactions(plan: TransactionPlan): readonly Readonly<Transaction>[];
serializeTransactionPlan(plan: TransactionPlan): string;
parseTransactionPlan(json: string): TransactionPlan;
```

`getPendingSignatureRequests` returns existing, referenced, unsigned
requests once each in first-reference order, after checking them against every
referencing action. An unreferenced request throws `TransactionPlanSignatureMismatchError`;
a reference to an absent request is omitted by the selector and fails at build.
Parsing rejects absent request references before returning a restored plan.

Consumers sign each pending request's `typedData` with their own wallet stack, then
call `applySignatures`. Verification is synchronous and mandatory for every supplied
signature. It first rejects unsupported versions, then unknown action types, before
interpreting requests or updates. Next it checks every request against its referencing
actions, including requests already carrying signatures, then rejects unknown or
duplicate input IDs with `TransactionPlanSignatureMismatchError` (`field: "reference"`
or `"duplicate"`). Only then does it parse and verify the supplied signatures.

Only ECDSA permit signatures, serialized as 65 bytes or in 64-byte compact form, are
supported. Other encodings throw `BundlesPermitMismatchError`, using the same parsing
rules as the builders. Offline public-key recovery checks each signature against its
request's EIP-712 typed data and permit owner. High-s signatures, failed recovery or a
wrong signer throw `InvalidSignatureError`; high-s signatures are rejected because
ERC-2612 tokens using OpenZeppelin ECDSA reject them. No client or RPC is involved,
and no client-chain check is needed because the EIP-712 domain binds the signature to
the action's chain. Contract wallets must use `supportSignature: false` and direct
approvals because the deployed bundles cannot encode ERC-1271 or ERC-6492 signatures.
The SDK never signs.

`@noble/curves` is a direct runtime dependency to provide synchronous secp256k1
recovery: viem's recovery API is asynchronous, so it cannot implement a synchronous
verification boundary. This keeps signature attachment offline and prevents callers
from accidentally omitting or failing to await verification.

After verification, `applySignatures` returns a new plan without mutating its input,
storing supplied signatures in serialized form and preserving omitted IDs. Empty input
still validates version, action types and every request, then returns the original
plan unchanged. Existing signatures are not reverified, and builders do not verify
signers in restored plans. Modifying the plan after verification invalidates the check.

After compatibility checks, `buildTransaction` checks only the selected step's
signature dependencies. Missing referenced
requests or signatures throw `IncompleteTransactionPlanError`, exposing `id: string`.
It returns a deeply frozen `{ to, data, value, action }`; there is no step `id` or `kind`
on the transaction. `buildTransactions` preserves step order and returns an array of
these frozen transactions, without narrowing generics. Building reads no RPC state,
accesses no clock or wallet, and does not execute or submit transactions.

Every helper that interprets a plan rejects an unsupported `version` with
`UnsupportedTransactionPlanVersionError`, exposing `version: number`, before reading
its requests or steps. This applies to `getPendingSignatureRequests`, `applySignatures`,
`buildTransaction` and `buildTransactions`, even with empty
steps, requests or updates. These same helpers reject unknown `action.type` values
with `UnsupportedTransactionPlanActionError`, exposing `actionType: string`, before
interpreting any requests, accepting signature updates, verifying signatures or
encoding transactions. Prototype-property names such as `toString` and
`constructor` are unknown action types, not dispatch targets. These guards apply after
restoration and rollback. Parsing also rejects unsupported integer versions and
unknown action types with these same errors while validating restored data.

When supplied, `calldataOrigin` is appended verbatim to every built transaction's data.
Preparation accepts only nonempty, byte-aligned hex and throws
`InvalidCalldataOriginError` for invalid values, including `"0x"`. Builders do not
repeat that intent validation on restored data. The JSON codecs tag bigints as
`{ "$bigint": "123" }`, using a decimal string, and restore those tags to bigints.
The tag shape is reserved for bigints; optional `undefined` properties may be omitted
by JSON. Serialization performs no validation.

`parseTransactionPlan` revives bigints, then validates structure and internal
consistency. It checks objects and arrays, required fields and discriminators, valid
addresses and byte-aligned hex, safe integer numbers and uint256 bigint ranges,
unique step and request IDs, request references, and agreement between each action's
chain/account and the plan headers. It also checks every permit request against its
referencing actions, including requests with stored signatures. Extra keys remain
allowed for forward compatibility. Malformed JSON, bigint tags, field shapes or
consistency failures throw `InvalidTransactionPlanError`, exposing the first failure's
`path` and `reason`; unsupported versions and action types retain their dedicated
errors. Parsing uses no clock or RPC. It checks neither expiry, live state, signature
ownership nor action-layer business constraints, and does not prove authenticity or
intent. Tampered but well-formed, internally consistent plans pass, so integrators
must still protect stored plans.

Requirements are none when allowance is sufficient, a direct ERC-20 approval, or an
ERC-2612 permit consumed by the vault bundle. There is no Permit2 route.
`supportSignature` defaults to `false`, selecting direct approval when needed. For
deposit assets, `true` prefers ERC-2612 when available and falls back to direct approval
otherwise; for withdrawals it selects a vault-share permit. Native deposits need no
token permit. Direct approvals are unlimited, subject to the existing per-token caps
and zero-reset behavior.

Deposit asset permits sign the exact pull amount: `message.value` and `args.amount`
must equal the action's `amount`. The deployed deposit flow calls `permit`
with the pull amount, so an unlimited signature would make that permit call revert
and cannot establish the allowance needed for the pull. Withdrawal share permits
instead sign `maxUint256`: typed-data value, request amount and encoded permit
value agree because the withdrawal flow passes the signed value to `permit`.
`requiredShareAllowance` remains the minimum allowance check;
stored finite share permits covering it remain valid and retain their signed value.
Later withdrawals reuse sufficient allowance without another signature. This adopts
the trade-off of ADR-2026-10-21: an asset-mode withdrawal has no on-chain max-shares or
share-price bound, so a price drop before inclusion can burn more shares than quoted.
Withdrawal parameters therefore take no `slippageTolerance`: exposing a parameter
with no on-chain effect would suggest protection the contract cannot provide. The
share-allowance quote uses the SDK's default margin internally. Deposit parameters
retain `slippageTolerance` to derive their on-chain maximum share-price bound.
Unlimited allowances also expose the full balance if the approved contract is
compromised; callers can inspect and revoke remaining allowance.

Stored and restored plans remain trusted for authenticity and intended operation,
even after parsing validates their shape and consistency. Before exposing pending
typed data, and again for referenced requests at build, consistency checks compare chain, token
or vault, owner, registered spender, amount, nonce, deadline and primary type against
the referencing actions and encoding arguments. Mismatches throw
`TransactionPlanSignatureMismatchError`, exposing `id` and `field`. Pre-sign nonce and
deadline checks compare typed data with encoding arguments, not fresh chain state or
the clock. A typed-data deadline that differs from the request's encoding arguments
throws `TransactionPlanSignatureMismatchError` with `field: "message.deadline"` in the
pending selector and builders; parsing wraps that mismatch in
`InvalidTransactionPlanError` with the request's typed-data deadline path. Before
signing, the pending selector also compares each request's encoding deadline with
every referencing action's deadline, throwing `TransactionPlanSignatureMismatchError`
with `field: "args.deadline"` on mismatch. Parsing and signature attachment reuse this
check; parsing reports `InvalidTransactionPlanError` at the request's `args.deadline`
path. Builders retain their additional equality check against the action deadline,
throwing `BundlesPermitMismatchError` with `field: "deadline"` on mismatch. These
comparisons use stored fields, not the clock or live state. Building still runs
the action-layer validators: unregistered approval spenders throw
`UnsupportedErc20ApprovalSpenderError`; non-positive deposit share-price bounds or
deadlines, fees at least WAD and positive fees without a recipient are rejected.
These range and consistency checks do not prove that stored vaults, amounts, fees,
recipients or price bounds match the integrator's intent. Integrators must preserve
the authenticity and integrity of plans across storage and transport, and ensure a
restored plan matches the operation the user intended before exposing signing
requests or submitting transactions. Request consistency and signature verification
do not authenticate the rest of the plan. Data from an untrusted store or sender must
not be treated as an authorized plan merely because parsing or building succeeds.

This additive API ships in a minor `morpho-sdk` release.

From the first `morpho-sdk` release that ships TransactionPlan, public TransactionPlan exports tagged `@experimental`
may take breaking changes with a minor changeset describing the break, without
a major bump or the normal deprecation steps. Stored-format version guards still
apply. AGENTS.md §7 defines the exact symbol and directory scope and the boundary
rules. Removing the tag graduates a symbol permanently; tagging an already-released
stable symbol needs maintainer approval.

The beta period permits feedback before committing to a stable API. Existing entity
flows remain the recommended stable path during the shadow-mode rollout and retain
their behavior and Permit2 support.

Experimental status does not remove the format version or its rejection rules. A
supported version's stored recipes build to the same bytes; an incompatible persisted
shape requires a distinct format version, and an SDK rejects versions it does not
support rather than reinterpreting them. Older SDKs need not understand newly introduced
actions. Operations beyond Vault V2 deposit and withdrawal are not specified here.

## Invariants

- Supported version-1 stored plans build to committed fixed bytes after restoration,
  not regenerated expectations.
- The selector, signature attachment and both builders reject unsupported versions
  before reading requests, steps or updates, including empty plans. They reject unknown
  action types before reading requests, applying updates, verifying signatures or encoding transactions.
  Check saved plans with unsupported versions and action types, including prototype
  property names, and assert the named compatibility error takes precedence over
  request or signature errors.
- Building retains spender and scalar validation. Check that both builders reject
  unregistered approval spenders, non-positive share-price bounds or deadlines,
  fees at least WAD and missing fee recipients for the applicable actions.
- Inconsistent requests fail before prompting, verification and building. Check
  altered permit fields against their referencing actions, including requests that
  already carry signatures.
- Signature attachment always verifies supplied signatures synchronously and rejects
  unknown or duplicate IDs before recovery. Check serialized and compact ECDSA,
  foreign keys, altered typed data, high-s signatures and unsupported encodings.
  Empty input validates all requests without RPC and preserves the original plan.
- Parsing rejects malformed shapes and inconsistent IDs, references, chains, accounts
  or permit requests, including signed requests, while permitting extra keys. Check
  prepared-plan round trips and typed failures with paths; expiry and authenticity
  remain outside the parsing boundary.
- Only deposit parameters expose slippage tolerance. The withdrawal allowance quote
  uses the SDK default margin without claiming an on-chain price or max-shares bound.
- Preparation never selects Permit2, including for an account with Permit2 allowance.
  Check direct approval with signature support disabled, permit fallback, and an
  on-chain operation that has Permit2 allowance but no allowance to VaultBundlesV1.
- Deposit permits stay exact while newly prepared share permits and share approvals
  are unlimited. Check rejection of enlarged deposit values and insufficient share
  values; preserve the signed share-permit value through storage and encoding. Check
  unlimited withdrawal approvals and permits on-chain, and later preparation that
  reuses the remaining allowance without another signature.
- Building is deterministic and never signs or reads state. Check encoder equivalence
  and frozen outputs without a transport; review preserves the no-I/O boundary.
  Revisit if interpreting untrusted plans without integrator protection or refreshing
  stored action inputs becomes a requirement.

## Rejected alternatives

- **Persist entity handles.** Rejected because lazy handles carry live behavior and
  cannot serve as portable, inspectable data across processes and restarts.
- **Let the SDK sign.** Rejected because consumers use different wallet stacks and
  custody models; signing would duplicate them and widen the SDK's authority.
- **Include Permit2.** Rejected because its prerequisite allowance and distinct
  signature format add a second authorization route that these plans do not need.
- **Sign unlimited deposit asset permits.** Rejected because the deployed token-pull
  path supplies the exact pull amount to `permit`; a signature for another value
  cannot authorize that call. Unlimited share permits use a different contract path.
- **Carry fetch requests and results in the plan.** Rejected because consumers can
  fetch the snapshot before preparation, and preparation resolves its remaining
  reads before returning. There is no deferred fetch stage;
  building depends only on the saved action inputs and referenced signatures.

## References

- Stored-signature verification and restored-header validation superseded by ADR-2026-11-19-transaction-plan-validation-boundary.
- Stored shape and supported version superseded by ADR-2026-11-17-transaction-plan-format-v2.
- ADR-2026-09-23-stateless-entity-flows:
  building depends on the data it receives, not a live handle's hidden state.
- ADR-2026-10-21-unlimited-sdk-approvals:
  unlimited approvals and share permits, exact token permits and the share-burn trade-off.
