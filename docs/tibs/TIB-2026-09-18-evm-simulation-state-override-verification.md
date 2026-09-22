# TIB-2026-09-18: EVM simulation — calldata-derived checks with explicit approval preparation

| Field             | Value                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| **Date**          | 2026-09-18                                                                                                   |
| **Author**        | @foulques, @jinmel                                                                                           |
| **Scope**         | `evm-simulation` next major (5.0.0) plus one prerequisite deprecation minor; consumers: Vaults frontend and write API |

## Context

Transaction creation is moving from `morpho-apps` to an independent write API. Both need the same
effect and position checks, and the frontend must be able to match API output to the user's choices.

Today `evm-simulation` runs ordered transactions and reports calls, transfers and asset changes. A
configured Tenderly backend runs first and `eth_simulateV1` only handles service failures. Pending
authorizations are modeled by **prepending a synthetic `approve(spender, max)` transaction**: that
mixes preparation with user transactions, shifts every `txIdx`, does not validate typed permit
requests or model Morpho authorization, and can grant more authority than the wallet will. Audit
(`morpho-apps@8a0afba`, SDK `5.5.0`, simulation `4.1.3`, 2026-09-14): asset reporting exists,
expected-change comparisons do not, and the frontend bypasses every error except retention.

The earlier draft of this brief (PR #795) proposed an `ecrecover` precompile override so placeholder signatures would
verify. viem's `StateOverride` exposes no `movePrecompileToAddress`, the override weakens every
signature check inside the bundle, and it still requires fake signatures in the calldata under test.
Its `limits.ranges` field was also an open-ended `{ subject, metric, at, min, max }` record that could
address any value and therefore could not be validated against the operation it claimed to bound.

## Goals / Non-Goals

**Goals**

- Infer operations from calldata and verify assets, permissions, position end states and diffs, and
  market safety for every supported route, identically for both consumers.
- Model pending token allowances with explicit simulated `approve` calls derived from the exact wallet
  request, without requiring token storage layouts. Use proven state overrides for Morpho authorization
  only; distinguish preparation from user transactions and verify both at the same pinned block.
- Let consumers tighten checks only through typed, operation-specific limits with fixed units.
- Preserve `simulate(config, params)`, the `SimulationResult` fields and the existing error classes.

**Non-Goals**

- Arbitrary contracts, account-abstraction senders, unencoded intent, Midnight routes, global
  solvency or guarantees about future execution.
- Overriding precompiles, contract code or signature verification (`movePrecompileToAddress`, `code`
  overrides). Signatures are verified only by the real contracts in `final` mode.
- A generic limit that names a metric by string, or any limit whose unit is not fixed by its type.
- A Tenderly backend, fallback or effect summary.
- Changing how `morpho-sdk` builds transactions: `preview` uses the existing no-signature build.

## Current Solution

`simulate` accepts `authorizations` as `{ type: "approval", transaction }` (prepended as-is) or
`{ type: "signature", token, spender, amount? }` (encoded as `approve(spender, amount ?? maxUint256)`
and prepended). `simulationTxs` therefore contains transactions the user never submits. The
`eth_simulateV1` backend already applies one state override: it inflates the sender's native balance
to `maxUint256 / 2`, which hides insufficient native funding. Retention is enforced per
`(restricted address, token)` across the `bundler3` and `bundles` registries since `4.1.6`.

## Decision

Use `eth_simulateV1` only and remove Tenderly. Every authorization the wallet will be asked to sign
or send is passed as a typed request. For token allowances, the SDK executes `approve(spender, amount)`
as the owner before the user transactions in the same stateful simulation. The token executes its own
storage writes; no token slot discovery or allowance storage override is used. Morpho authorization
uses a `stateDiff` override derived from its pinned layout. Both mechanisms require read-back evidence.
Preparation calls are reported separately, so `simulationTxs` remains exactly the caller's `transactions`.

The SDK decodes supported routes from calldata, verifies asset, permission, position and market
effects against SDK rules intersected with per-operation typed consumer limits, and blocks on every
typed error. The write API runs only `preview`; the frontend independently previews, checks each
signing request before the wallet shows it, then runs `final` before submission.

## Public Interface

`simulate(config, params)` keeps `config.chains`, `simulateV1Url`, `logger`, `timeoutMs`, and every
existing `SimulateParams` field. `simulateV1Url` becomes required per chain. Two optional fields are
added and `authorizations` is retyped.

| Input | Contents | Why |
| --- | --- | --- |
| `chainId`, `transactions` | Ordered `{ from, to, data, value? }`; protected user = common `from`. No intent input | Another sender protects the wrong account; reordering changes available balances and permissions |
| `authorizations?` (retyped) | `readonly SimulationAuthorization[]`, one entry per wallet request the user has not yet completed; `preview` only | Preparation must model exactly the authority the wallet grants, not a widened substitute |
| `blockNumber?` | `bigint` or block tag; resolved once, `latest` by default | Mixed blocks produce inconsistent balances, interest and deadlines |
| `mode?` (new) | `"final"` (default) or `"preview"` | An omitted option must not silently enable authorization preparation |
| `limits?` (new) | `SimulationLimits` below; omitted values use SDK defaults | Missing consumer settings must not remove baseline protections |

### `SimulationAuthorization`

A discriminated union of wallet requests. Every variant names the owner; the owner must equal the
transactions' common `from`. Typed-data variants carry the exact EIP-712 payload
(`{ domain, types, primaryType, message }`) the wallet will be shown, so the SDK verifies what is
signed, not a summary of it.

| Variant `type` | Wallet action | Fields |
| --- | --- | --- |
| `"erc20Approval"` | Sends `approve(spender, amount)` on `token` | `token`, `owner`, `spender`, `amount` |
| `"erc2612Permit"` | Signs `Permit` typed data on an ERC-20 or a Vault V1/V2 share token | `typedData` with `primaryType: "Permit"`; `domain.verifyingContract` is the token |
| `"permit2Allowance"` | Signs Permit2 `PermitSingle` typed data | `typedData` with `primaryType: "PermitSingle"`; `domain.verifyingContract` is the chain's Permit2 |
| `"blueAuthorization"` | Sends `Morpho.setAuthorization(authorized, isAuthorized)` | `authorizer`, `authorized`, `isAuthorized` |
| `"blueAuthorizationSignature"` | Signs Morpho `Authorization` typed data consumed by `setAuthorizationWithSig` | `typedData` with `primaryType: "Authorization"`; `domain.verifyingContract` is the chain's Morpho |

The legacy `approval` and `signature` variants are removed in the major (see Breaking Changes).

### `SimulationLimits`

Consumers may only tighten. Every ratio is a WAD-scaled `bigint`; every amount is a raw `bigint` in
the token's or share's smallest unit; every address is an `Address`; every market is a `MarketId`.
Bounds are inclusive. There is no free-form metric, subject or time-basis field.

| Field | Meaning / default | Why |
| --- | --- | --- |
| `maxSlippageWad?` | Conversion slippage bound; default `DEFAULT_SLIPPAGE_TOLERANCE` (`3_00000000000000n`, 0.03%) | Bound overpayment and under-receipt while accepting rounding and quote movement |
| `minLltvBufferWad?` | Distance below LLTV (or active `preLltv`) a risk-increasing action must keep; default `DEFAULT_LLTV_BUFFER` (`WAD / 200n`, 0.5%) | Never end at a liquidation or protection boundary |
| `maxSignatureLifetimeSeconds?` | Upper bound on `deadline − blockTimestamp` for every typed-data request; default `7_200n` | A long-lived signature can be submitted later under different state |
| `wallet?` | `{ maxDebit?: TokenAmount[], minCredit?: TokenAmount[] }` where `TokenAmount = { token, amount }` and native uses viem's `ethAddress` | Decode-independent safety net on the protected user's balances, gas excluded |
| `operations?` | `readonly OperationLimit[]`, defined below | Operation-specific bounds whose fields exist only where they are meaningful |

### `OperationLimit`

A discriminated union keyed by the decoded operation `type`. The discriminators reuse the
`morpho-sdk` `TransactionAction` names where one exists. Each variant carries **subject** fields that
bind it to exactly one decoded operation, optional **`expected*` pins** compared byte-for-byte to the
decoded calldata parameter, and optional **outcome bounds** on verified before/after state. Field
suffixes fix the unit: `*Assets` and `*Shares` are raw amounts, `*Wad` is a WAD ratio,
`*ApyWad` is a WAD per-year rate. An optional `transactionIndex` (index into `transactions`)
disambiguates when a bundle contains two operations with the same subject.

Blue operations (subject: `marketId`, or `sourceMarketId` + `targetMarketId` for refinance,
`authorized` for authorization):

| `type` | `expected*` pins | Outcome bounds | Verified quantity each bound constrains |
| --- | --- | --- | --- |
| `blueSupply` | `expectedAssets`, `expectedOnBehalf` | `minSupplySharesMinted` | Supply shares credited to `onBehalf` (action diff) |
| `blueWithdraw` | `expectedReceiver`, `expectedFullClose` | `minAssetsReceived`, `maxSupplySharesBurned`, `maxUtilizationAfterWad`, `maxReallocationPenaltyAssets` | Loan token credited to `receiver`; supply shares burned; market utilization after; V2 penalty paid in loan token |
| `blueSupplyCollateral` | `expectedAssets`, `expectedOnBehalf` | `maxLtvAfterWad` | Position LTV after |
| `blueBorrow` | `expectedAssets`, `expectedReceiver` | `maxBorrowSharesMinted`, `maxLtvAfterWad`, `minHealthFactorAfterWad`, `maxUtilizationAfterWad`, `maxBorrowApyAfterWad`, `maxReallocationPenaltyAssets` | Debt shares minted; LTV, health factor, utilization and borrow APY after; penalty paid |
| `blueSupplyCollateralBorrow` | `expectedCollateralAssets`, `expectedBorrowAssets`, `expectedOnBehalf`, `expectedReceiver` | Same as `blueBorrow` | Same as `blueBorrow` |
| `blueRepay` | `expectedOnBehalf`, `expectedFullClose` | `maxAssetsPaid`, `minBorrowSharesBurned`, `maxResidualBorrowShares`, `minRefundAssets` | Gross loan-token debit including wrapped native; debt shares burned; debt shares remaining; refund credited to `receiver` |
| `blueWithdrawCollateral` | `expectedAssets`, `expectedReceiver` | `maxLtvAfterWad`, `minHealthFactorAfterWad` | LTV and health factor after |
| `blueRepayWithdrawCollateral` | `expectedWithdrawAssets`, `expectedOnBehalf`, `expectedReceiver`, `expectedFullClose` | Union of `blueRepay` and `blueWithdrawCollateral` bounds | As listed |
| `blueRefinance` | `expectedCollateralAssets`, `expectedSourceFullClose` | `maxTargetBorrowAssets`, `maxTargetBorrowSharesMinted`, `maxSourceResidualBorrowShares`, `maxTargetLtvAfterWad`, `minTargetHealthFactorAfterWad`, `maxLoanDustAssets`, `maxReallocationPenaltyAssets` | Target debt created; source debt left; target risk after; loan-token dust left in the user's wallet or adapters; penalty paid |
| `blueAuthorization` | `expectedIsAuthorized` | none | `Morpho.isAuthorized(user, authorized)` after |

Vault operations (subject: `vault`, or `sourceVault` + `targetVault` for migration, `aToken` +
`targetVault` for Aave):

| `type` | `expected*` pins | Outcome bounds | Verified quantity each bound constrains |
| --- | --- | --- | --- |
| `vaultV1Deposit`, `vaultV2Deposit` | `expectedAssets` (ERC-20 plus native), `expectedReceiver` | `minSharesMinted` | Vault shares credited to `receiver` |
| `vaultV1Withdraw`, `vaultV2Withdraw` | `expectedAssets`, `expectedReceiver` | `maxSharesBurned` | Vault shares burned from the user |
| `vaultV1Redeem`, `vaultV2Redeem` | `expectedShares`, `expectedReceiver` | `minAssetsReceived` | Underlying credited to `receiver` |
| `vaultV2ForceWithdraw` | `expectedAssets`, `expectedDeallocations` (`{ adapter, marketId?, amount }[]`, ordered) | `maxSharesBurned`, `maxPenaltyAssets` | Shares burned for withdrawal plus penalty; penalty in underlying |
| `vaultV2ForceRedeem` | `expectedShares`, `expectedDeallocations` | `minAssetsReceived`, `maxPenaltyShares`, `maxPenaltyAssets` | Underlying credited; penalty shares; penalty in underlying |
| `vaultV1InKindRedeem`, `vaultV2InKindRedeem` | `expectedAssets`, `expectedMarketIds` (ordered) | `maxSharesBurned`, `minIdleAssetsReceived`, `minSupplyAssetsByMarket` (`{ marketId, minAssets }[]`), `maxPenaltyAssets`, `maxResidualShareAllowance` | Shares burned; idle underlying credited; Blue supply credited per market; penalty; share allowance left to `VaultExitBundlesV1` |
| `vaultV1MigrateToV2` | `expectedSharesBurned`, `expectedReceiver` | `minTargetSharesMinted` | Vault V2 shares credited |
| `aaveV3MigrateToVaultV2` | `expectedAssets` or `expectedFullBalance: true` | `minTargetSharesMinted`, `maxSourceResidualAssets` | Vault V2 shares credited; aToken balance left |
| `legacyMorphoWrap` | `expectedAmount` | none | Legacy MORPHO debited equals new MORPHO credited |

### Output

`VerifiedSimulationResult extends SimulationResult` preserves `simulationTxs`, `calls`, `transfers`,
`assetChanges` and their indices, and adds `verification` with: `mode`, `chainId`, `blockNumber`,
`blockTimestamp`, the effective `limits`, the decoded `operations`, one record per authorization
request (the request, a discriminated preparation record: `type: "approvalCalls"` with ordered
`{ from, to, data, value }` calls and their results/logs, or `type: "stateOverride"` with
`{ address, storageVariable, slot, value }`; plus read-back evidence and request checks), and
**before / after / diff / actionDiff** records for wallet balances, permissions, positions, vaults and
markets, plus conversions and fees. Only `actionDiff`
excludes modeled accrual. Unchanged values are reported so an omission can never read as proof.
Preparation records carry `authorizationIndex` into `authorizations`. The executor maps each raw
response to preparation, a probe, or a user `transactionIndex`; user `calls`, `transfers`, `assetChanges`
and `txIdx` retain indices into `simulationTxs`, with preparation results kept in `verification`.
Preparation failures identify their authorization and stage, never a fabricated user `txIdx`.

### Errors

`SimulationPackageError`, existing names, codes, constructors, fields and `instanceof` behavior are
preserved. The first five classes exist today; additions extend the base directly.

| Class / code | Failure |
| --- | --- |
| `SimulationValidationError` / `VALIDATION_ERROR` | Invalid config, input, calldata or limit; mixed senders; request owner differs from sender; `authorizations` in `final`; `preview` transaction containing a signature-consuming call |
| `UnsupportedChainError` / `UNSUPPORTED_CHAIN` | Missing chain configuration or `simulateV1Url` |
| `ExternalServiceError` / `EXTERNAL_SERVICE_ERROR` | RPC transport, timeout, authentication, rate limit, availability or unclassified rejection |
| `SimulationRevertedError` / `SIMULATION_REVERTED` | Failed user or preparation execution, including a reverted approval or an approval returning `false`, panic, gas, signature, nonce or deadline rejection |
| `BlacklistViolationError` / `BLACKLIST_ERROR` | Bundle or adapter retention exceeds dust |
| `UnsupportedOperationError` / `UNSUPPORTED_OPERATION` | Unrecognized target or selector, unsupported call recipe or top-level callback |
| `ProtocolBindingMismatchError` / `PROTOCOL_BINDING_MISMATCH` | Known route with wrong owner, recipient, underlying, market, adapter, operator or deployment binding |
| `UnsupportedVerificationFeatureError` / `UNSUPPORTED_VERIFICATION_FEATURE` | Recognized route lacks registry or model coverage (token approval behavior, vault, oracle, IRM, signature kind) or a required RPC capability; an override whose read-back disagrees with the written value |
| `InvalidSimulationResponseError` / `INVALID_SIMULATION_RESPONSE` | Malformed response, call status, count, index or required logs |
| `MissingVerificationEvidenceError` / `MISSING_VERIFICATION_EVIDENCE` | Missing state, events, prices or rates; a probe that failed to execute; inconsistent snapshot reference |
| `AuthorizationRequestMismatchError` / `AUTHORIZATION_REQUEST_MISMATCH` | A request disagrees with the decoded operation or real state: owner, domain, token, spender, amount, nonce, expiration or deadline |
| `AssetChangeMismatchError` / `ASSET_CHANGE_MISMATCH` | Wrong debit, receipt or refund; double funding; native funding not covered by the real balance; unexplained balance change |
| `PermissionChangeMismatchError` / `PERMISSION_CHANGE_MISMATCH` | Any ERC-20, Permit2, in-kind-redemption, lasting or temporary approval, or Morpho operator invariant fails |
| `StateChangeMismatchError` / `STATE_CHANGE_MISMATCH` | Position, market, vault or Aave accounting, accrual, full-close or configuration mismatch |
| `MarketConstraintViolationError` / `MARKET_CONSTRAINT_VIOLATION` | Verified state violates health or buffer, rescue, pre-liquidation, no-Aave-debt or liquidity and capacity policy |
| `SlippageLimitExceededError` / `SLIPPAGE_LIMIT_EXCEEDED` | Conversion violates quote, calldata or SDK slippage bound |
| `FeeMismatchError` / `FEE_MISMATCH` | Wrong fee or penalty amount, recipient or schedule; forbidden discretionary fee |
| `ConsumerLimitViolationError` / `CONSUMER_LIMIT_VIOLATION` | A decoded parameter differs from an `expected*` pin, or a verified value violates an outcome bound or wallet limit |
| `UnexpectedSimulationError` / `UNEXPECTED_SIMULATION_ERROR` | Unclassified local SDK or dependency failure |

Errors carry optional readonly context: stage and mode, chain, block and time, transaction or call
path or probe id, rule and subject, expected and observed values with units, RPC code. `txIdx` keeps
indexing `simulationTxs`; `fieldErrors`, `reason`, `details` and retention's
`{ address, token, netRetained }` shape (string amounts) are preserved. Messages give remedies;
consumers branch on class or code. Adapters own HTTP mapping and never serialize signatures,
credentials or raw causes.

## Behavior

### Authorization preparation

Requests are accepted only in `preview`. The `preview` transaction is the transaction `morpho-sdk`
builds **without requirement signatures**: token pulls consume the ERC-20 allowance of the decoded
spender, `VaultExitBundlesV1` receives the empty-permit sentinel, and no `permit`, `approve2` or
`setAuthorizationWithSig` call is present. A `preview` transaction that contains any of those calls, or
a non-sentinel permit struct, is rejected with `SimulationValidationError`. Each request is turned into
the preparation that grants that form exactly the authority the wallet will grant the `final` form, keyed
by `(owner, token or protocol contract, spender or operator, amount or flag)`.

| Request | Target contract | Preparation mechanism | Value | Checked against real state and decoded operation | Read-back evidence after preparation |
| --- | --- | --- | --- | --- | --- |
| `erc20Approval` | `token` | Owner calls `approve(spender, amount)` | `amount` | `owner` = sender; `spender` is a registered spender for the decoded route; `amount` equals the decoded pull exactly, or is the accepted persistent cap (`MAX_UINT_160` to Permit2; balance-MAX aToken to GeneralAdapter1 ≤ `MAX_UINT_256`); an explicit reset request with `amount = 0` is accepted only before its matching validated nonzero approval; execute both in order and verify each result | `allowance(owner, spender)` returns `amount` |
| `erc2612Permit` | `domain.verifyingContract` (ERC-20, Vault V1 or Vault V2 share token) | Owner calls `approve(spender, message.value)` | `message.value` | `nonces(owner)` equals `message.nonce`; `domain.chainId` equals `chainId`; Vault V2 uses the two-field domain, Vault V1 its EIP-5267 domain, ERC-20s their token domain; `owner` = sender; `spender` = decoded spender; `value` equals the decoded pull or in-kind-redemption grant exactly; `deadline` within the lifetime bound | `allowance(owner, spender)` returns `value` |
| `permit2Allowance` | `message.details.token` | Owner calls `approve(spender, message.details.amount)` | `message.details.amount` | `Permit2.allowance(owner, token, spender).nonce` equals `details.nonce`; `details.expiration` equals `MAX_UINT_48`; `sigDeadline` within the lifetime bound; `spender` = decoded spender; `amount` equals the decoded pull exactly; `domain.verifyingContract` is the registered Permit2; the token's real allowance to Permit2 covers `amount` or a companion `erc20Approval` to Permit2 is present | `allowance(owner, spender)` returns `amount` |
| `blueAuthorization` | Morpho | `stateDiff`: `isAuthorized[authorizer][authorized]` | `isAuthorized` | `authorizer` = sender; `authorized` is a registered operator for the decoded route, or a pre-liquidation contract for the decoded market (below) | `Morpho.isAuthorized(authorizer, authorized)` returns `isAuthorized` |
| `blueAuthorizationSignature` | Morpho | `stateDiff`: `isAuthorized[authorizer][authorized]` | `message.isAuthorized` | As above, plus `Morpho.nonce(authorizer)` equals `message.nonce`, `deadline` within the lifetime bound, `domain.verifyingContract` is the registered Morpho | As above |

- **Permit2 storage is not overridden.** The no-signature build never routes through Permit2, so the
  Permit2 tuple, nonce advance and expiration are verified on the request in `preview` and on real
  execution in `final`. The token approval prepares the same authority
  `(owner, token, spender, amount)` expressed where the `preview` form reads it.
- **Token allowances use contract execution, not storage discovery.** Each preparation call has
  `from = owner`, `to = token` and `value = 0`. Run the ordered preparation calls, read-back probes and
  unchanged user transactions in one stateful `eth_simulateV1` request at the pinned block; each call
  observes prior writes. These calls are simulated only and are never broadcast or added to a signing
  request. A proxy or namespaced/custom storage layout needs no special slot handling. The SDK validates
  preparation results before accepting any later user result, even if the RPC executes subsequent calls
  after a failed preparation call.
- **Approval success is checked.** A reverted call or a decoded `false` return fails with
  `SimulationRevertedError` at the preparation stage. Accept an empty return for supported legacy
  tokens only when the subsequent `allowance(owner, spender)` read equals the intended value; malformed
  return data fails with `InvalidSimulationResponseError`. A successful read that disagrees with the
  intended allowance fails with `PermissionChangeMismatchError`. Never proceed on logs alone.
- **Reset requirements are explicit.** Direct `erc20Approval` requests execute in their supplied order;
  the SDK does not silently insert a wallet approval absent from those requests. For a supported token
  requiring a zero reset, permit-derived preparation may use simulated `approve(spender, 0)` followed by
  the exact grant, recording both calls as modeling steps for that request. This models allowance only,
  not permit execution. Unsupported approval behavior fails typed; there is no storage-probing retry.
- **Preparation cannot hide side effects.** Capture real state without overrides or preparation, prepared state before
  user execution, and final state. Check preparation logs and state changes: only the declared permissions
  may change (gas excluded); reject unexpected asset, position or unrelated permission changes. User
  action checks use prepared permissions as their starting allowance; wallet limits and verification
  retain the real pre-preparation baseline so preparation cannot conceal a debit.
- **Only Morpho storage keys are derived.** Morpho's storage layout is pinned in-package like its ABI.
  Prove its authorization override with a read-back under the same override set before preparation
  calls execute. All probes use the same pinned block and execution state appropriate to their stage,
  are read-only, and never appear in `simulationTxs` or user `calls`.
- **Nonces are never overridden.** Request nonces are compared with the real chain nonce at the pinned
  block; a stale nonce fails with `AuthorizationRequestMismatchError`.
- **`final` accepts no `authorizations`.** Signatures live in the calldata and approvals must be mined
  before `final` runs; any request is a `SimulationValidationError`. `final` runs no synthetic approval
  preparation and applies no permission or signature override, so it exposes failures `preview` can mask.
- **No native-balance override may inform a funding conclusion.** Native funding (`value`) is verified
  against the sender's real balance at the pinned block, minus a gas reserve, whatever balance the
  simulation itself runs with.
- Both modes apply identical decode, effect, position, market and limit checks. Unsupported
  mechanisms fail; no provider fallback or bypass is allowed.

### Decode supported operations

Use the Bundles V1 registries (`BlueBundlesV1`, `VaultBundlesV1`, `VaultExitBundlesV1`), the Bundler3
and GeneralAdapter1 action vocabulary, and explicit direct withdrawal, authorization, wrapper and read
rules.

| Check | Threat / why it matters |
| --- | --- |
| Match chain, registered address and function | Familiar calldata at another deployment or entrypoint can move funds or grant authority differently |
| Decode parameters; independently verify protocol relationships | ABI-valid arguments can mismatch a vault's underlying, adapter or market; misbound owners or recipients redirect the claim |
| Recognize every Bundler3 / GeneralAdapter1 inner call and callback | A trusted outer contract can carry hidden transfers or permissions unrelated to the visible action |
| Reject top-level callbacks | Callbacks rely on surrounding execution context; accepting them as entrypoints applies the wrong rules |
| Reject unknown payloads or effects | Unmodeled behavior must not receive a successful verification based on partial coverage |
| Only contract-defined sentinels imply MAX | Treating a literal as MAX can hide an incomplete close or reject an intentional partial action |
| Recognize only the `morpho-sdk` transaction-metadata suffix appended to `data`; reject any other trailing bytes | The SDK appends an origin/timestamp suffix after the ABI payload, so a decoder must know exactly where calldata ends; unknown trailing bytes can change how a contract reads its arguments or carry an unmodeled payload |

Registered operators are `bundler3.generalAdapter1` and `bundles.blueBundlesV1`. A pre-liquidation
("AutoDeleverage") operator is valid only when the chain's registered `preLiquidationFactory` reports
`isPreLiquidation(operator)` and the operator's `preLiquidationParams` bind the decoded market; its
`preLltv` is the active protection threshold.

### Consumer limits

- SDK bounds, calldata bounds and caller bounds intersect; a caller bound never widens an SDK or
  calldata bound.
- Each `OperationLimit` must bind to exactly one decoded operation. A limit whose subject matches no
  operation, matches more than one after `transactionIndex`, or names a `type` the bundle does not
  contain is a `SimulationValidationError`; a limit is never silently ignored.
- `expected*` pins compare with the decoded calldata parameter, not with simulated outcomes, and fail
  with `ConsumerLimitViolationError`. `expectedFullClose` / `expectedSourceFullClose` require the
  decoded amount mode to be a full close by shares.
- Outcome bounds compare with verified state: `*After*` fields with end state, received, minted,
  burned, paid, refund and penalty fields with the action diff. Health and utilization metrics are
  reported for every affected position and market even when no bound is supplied.
- `maxLtvAfterWad` is additionally capped by `lltv − minLltvBufferWad` (or active `preLltv − minLltvBufferWad`) for risk-increasing operations; the SDK bound wins when tighter.
- Wallet limits count the protected user's net ERC-20 and native changes, gas excluded, using the
  same `ethAddress` sentinel as `assetChanges`.

### Position and market checks

Cover affected positions, backing allocations, fee recipients and markets. Accrue a no-action baseline
to the block time so interest cannot masquerade as proceeds or hide debits. Reconcile ordered calls
with protocol rounding, clamps, and entrypoint-specific accrual or fee mints to avoid false failures.
Require exact raw shares to expose accounting errors; reprice claims, whose diffs need not equal cash
flows.

| State / metric | Required checks | Threat / why it matters |
| --- | --- | --- |
| Blue positions | Collateral, supply and borrow assets and shares match decoded legs. Supply never repays debt | Wallet transfers cannot prove collateral or supply credits or debt reduction; wrong shares can leave excess debt or credit another position |
| Vault positions | Reconcile user and fee-recipient shares and claims, mints and burns, idle assets, allocations, totals, fees, penalties and losses by vault version | Missing credits or excess burns lose claims; untracked allocations hide depleted backing; fees dilute claims; losses change redeemable value |
| Aave migration source | Reconcile nominal and scaled aToken balances, income index, withdrawal and destination credit; require no existing Aave debt | Index accrual can disguise overspending or overstate migrated value; removing collateral under an existing loan is refused by policy |
| Market accounting | Reconcile supply and borrow asset and share totals, fee shares and accrual time. Check liquidity, utilization, rates, and borrow, withdraw, flash-loan and reallocation capacity | Inconsistent totals distort claims and debt; insufficient capacity makes the route impossible; utilization and rates expose liquidity pressure and cost |
| LTV and health | Compute collateral value, debt, LTV, health factor, liquidatability, liquidation price and borrow or withdraw headroom. Separate protocol LLTV from active `preLltv`; supply rounds down, debt up | Valuation or rounding errors understate liquidation exposure; separate protection metrics avoid confusing early deleveraging with protocol liquidation |
| Risk limits | Borrow and collateral removal end ≤ applicable LLTV or active `preLltv` minus the buffer (floor zero). Pure repayments and top-ups may remain unhealthy if risk does not worsen. Check markets and refinance legs separately; enabling pre-liquidation requires LTV < its `preLltv` | Limit new risk near thresholds; improvement elsewhere cannot excuse an unsafe market; allow rescue actions; avoid enabling protection already eligible to trigger |
| Slippage and share price | Check asset, share and debt conversions against independent quotes, calldata limits and the SDK tolerance; retain the two-hour accrual allowance and onchain inflation guards | Permissive calldata can overcharge or under-credit; inflation can destroy deposit value; interest headroom avoids false slippage failures without allowing unlimited spend |
| Fees and reallocations | Match charges and recipients to the route's pinned schedule. Separate Vault V1 native fees, V2 loan-token penalties and refunds; reject discretionary or referral fees unless SDK policy permits | Hidden or redirected fees take value despite correct main legs; calldata alone does not establish fee consent |
| Configuration and completeness | Verify protocol identities, oracle and IRM availability and operation-specific vault or adapter caps; reject missing reads, unsupported accounting or unexplained configuration changes | Wrong identities or missing prices can fabricate healthy positions; unexpected configuration changes later rights or risk |

Debt-free means no liquidation risk; debt with zero collateral value means infinite LTV and zero
health. Respect V2 rate-capped assets. Existing allocations may exceed lowered caps; enforce
operation-specific capacity so valid exits remain possible. Reported metrics alone impose no limit;
only SDK rules and consumer limits do.

### Shared invariants

Match decoded inputs and outputs to catch excess debits, lost receipts and redirects. Keep unrelated
raw balances, shares and permissions unchanged, except modeled accrual and fees; recompute derived
claims and metrics to avoid false failures. Fund ERC-20 first, then native, preventing double funding
while reserving native balance for gas.

| Invariant | SDK rule | Threat / why it matters |
| --- | --- | --- |
| Bundle retention dust limit | Per bundle or adapter and asset, net retention ≤ SDK dust threshold | Successful execution can strand funds in temporary contracts; per-asset bounds prevent offsetting |
| In-kind-redemption headroom below residual cap | Derive grant and residual caps from the rounded burn and deadline; final `VaultExitBundlesV1` share allowance ≤ cap; reset existing excess | Rounded burns need headroom; surviving allowance enables later withdrawals |
| Lasting approval below accepted cap | Fresh exact funding ends at zero; reused allowance ≤ start; persistent token → Permit2 ≤ `MAX_UINT_160`; balance-MAX Aave aToken → GeneralAdapter1 ≤ `MAX_UINT_256` | Avoid unintended authority while retaining supported persistent routes |
| Unchanged unrelated permission | Reject unexpected grants, including temporary ones; unrelated permissions unchanged | A balance-neutral transaction can grant a future drain or revoke a permission another workflow needs |
| Expected Morpho operator authorization or unchanged | Required route operator authorized; a pre-liquidation operator gets the decoded boolean; otherwise unchanged | A wrong operator gains position control; a missing or revoked intended authority breaks the route or disables protection |
| Permit2 invariants | Correct owner, token and spender; exact gross grant; managed amount ends at zero; nonce advances once; expiration `MAX_UINT_48`; bounded signing deadline | Identity and gross amount prevent redirected or oversized grants; zero remainder prevents continued spending; nonce consumption prevents replay |

Events **and** endpoints are checked: approve 100 then spend 40 leaves 60 without another event;
approve then revoke hides temporary authority behind equal endpoints; an approval event may also
represent spending.

### Action coverage

All rows require the asset, permission, position and market checks above. `A` = assets, `S` = shares,
`D` / `N` = ERC-20 / native funding; gas excluded, rounding and fees applied. **Funding** and unmentioned
permissions follow the shared invariants; **operator** = registered operator.

| Decoded flow / amount mode | Wallet and position checks | Permission rule | Threat / why it matters |
| --- | --- | --- | --- |
| V1/V2 deposit: ERC-20, native or mixed | Underlying `−D`, native `−N`; vault credit from `A = D + N`; native-only preserves the wrapped-native balance | Funding | Catch uncredited or redirected deposits and double funding |
| V1/V2 withdrawal: exact assets, liquidity-limited MAX | Underlying `+A`; share burn ≤ cap | Unchanged | Prevent excessive burns or underpayment; liquidity-limited MAX must not demand a full exit |
| V1/V2 redemption: full or exact shares | Vault shares `−S`; underlying ≥ floor | Unchanged | Ensure selected shares produce sufficient underlying without burning extra |
| V2 force withdrawal | Exact net receipt; cap combined withdrawal and penalty burns | Unchanged | Catch omitted or double penalties and hidden extra burns |
| V2 force redemption | Burn redeem plus penalty shares; underlying ≥ floor; allowed headroom may remain | Unchanged | Include penalty shares in lost claims; allow intentional headroom |
| V2 in-kind redemption: assets or MAX | Share burn → idle receipt + penalty + actual Morpho supply credits; source allocations decrease | In-kind cap | Wallet-only checks miss missing or redirected credits or wrong backing depletion |
| V1 → V2 migration: full | All V1 shares `−S`; V2 shares ≥ floor; wallet underlying unchanged | Funding | A closed source must fund the correct destination |
| Aave V3 → V2: partial or liquidity-limited MAX | Nominal and scaled debit → V2 credit; wallet underlying unchanged | Funding | Prevent index rounding masking excess depletion or missing credit |
| Aave V3 → V2: balance-limited MAX | Drain the accrued scaled balance; V2 credit ≥ floor; underlying unchanged | Fixed lasting cap | A stale literal can leave accrued interest behind |
| Supply loan assets | Loan `−D`, native `−N`; supply shares minted | Funding | Loan-token spending must create the decoded supply claim |
| Withdraw supplied assets: exact assets | Loan `+A`; corresponding supply-share burn | Operator | Prevent burning more claim than the cash received justifies |
| Withdraw supplied assets: MAX or exact shares | Burn decoded shares; loan ≥ floor; full close leaves zero supply shares except fee credits | Operator | Catch underpaid or incomplete closes |
| Supply collateral | Wallet collateral `−D`, native `−N`; position collateral `+A` | Funding | Spent collateral must reach the protected position |
| Borrow | Loan `+A`; corresponding debt and share increase | Operator | Prevent debt without the promised receipt or beyond allowed risk |
| Supply collateral + borrow | Combined collateral credit, loan receipt and debt increase | Funding + operator | Either linked leg can be missing despite plausible net changes |
| Repay: exact assets | Loan `−D`, native `−N`; corresponding debt-share burn | Funding | A debit must reduce the correct debt |
| Repay: MAX or exact shares | Burn decoded debt shares; full close leaves zero debt; reconcile gross pull, refund, native `−N` and wrapped-native refunds | Gross funding | Catch residual debt and missing refunds |
| Withdraw collateral | Wallet collateral `+A`, position collateral `−A` | Unchanged (direct Morpho) | Catch redirected collateral and unsafe removal |
| Repay + withdraw collateral: exact or MAX | Repayment plus collateral wallet `+A` / position `−A` | Funding + operator | Repayment must not conceal extraction or unsafe remaining debt |
| Refinance: collateral-only or partial debt | Move collateral and debt source → target; wallet unchanged except fees and penalties | Operator | Prevent lost collateral, excess target debt or unintended source changes |
| Refinance: full debt or exact shares | Burn source debt shares; bound target debt; conserve collateral; full close leaves zero source debt; bounded loan dust | Operator | Catch stranded source debt or excess target borrowing |
| Wrap legacy MORPHO: bundler or direct route | Legacy token `−A`, new token `+A` | Legacy token funding to GeneralAdapter1 / approval to wrapper | Prevent legacy tokens disappearing without replacement |
| Pre-liquidation ("AutoDeleverage"): enable or disable | Wallet and raw positions unchanged; verify resulting risk and protection | Pre-liquidation operator true / false | Ensure the selected protection changes without asset movement or authority elsewhere |
| V1 in-kind redemption: SDK-supported, app-unwired | Source vault burn → actual supply credits in each market | In-kind cap | Checking one destination can hide missing credits elsewhere |

Validate exit method and deallocation order. Two-hour repayment funding covers accrual; reconcile
gross pulls and refunds. Apply route fees and penalties throughout, including wallet-neutral flows: Vault V2 reallocation penalties may require loan-token funding (and its approval or permit) on loan withdrawals, borrows, refinances and their combinations, so "Operator" rows also accept that exact penalty funding.
Require zero residual positions only for decoded full closes.

### Classification and enforcement

Validate → bind → apply and prove Morpho overrides → execute and verify approval preparation →
execute user transactions → establish evidence → check effects and limits. Throw once, in stable transaction and rule order; classify structured data, never message
text. Missing or malformed evidence is never zero or an effect mismatch. A probe that fails to execute
is missing evidence; a probe that executes but disagrees with its Morpho override is an unsupported
feature. An approval allowance mismatch is a permission error; reverted or false-return approvals
are preparation execution failures.
Wrong fee → fee error; valid fee above a caller bound → limit error; retention → existing blacklist
error. Every error blocks API output and submission; nothing is bypassable or falls back.

## Invariants

- `simulationTxs` equals `params.transactions` element for element. The raw simulation may prepend
  recorded approval preparation and insert read-only probes; it never rewrites or reorders user
  transactions. Preparation and probe indices never shift public user transaction indices.
- Token allowances are prepared exclusively through explicit owner `approve` calls with validated
  amounts, including recorded zero resets where required. Preparation cannot change unrelated state.
  State overrides are limited to requested Morpho authority and any balance headroom that no check
  depends on; no override touches token storage, code, precompiles, nonces or unrelated storage.
- Every permission override and approval preparation is verified by read-back in the corresponding
  simulated state at the pinned block before user execution; missing or mismatched evidence fails typed.
- A request whose owner is not the protected user, whose nonce is not the current chain nonce, or whose
  grant is not exactly the decoded authority, fails before any signature exists.
- `final` runs with real signatures, no synthetic approval preparation and no permission override;
  `preview` may never be the last check before submission.
- Native funding is judged against the real balance at the pinned block, never a simulated one.
- Consumer limits only tighten; unknown, ambiguous or inapplicable limits fail rather than being
  ignored; every limit field has one fixed unit encoded in its name and type.
- The six shared invariants above hold for every supported route regardless of mode.
- Identical inputs at a pinned block produce identical verification output; time comes from the block.
- Trust remains in the RPC, supported tokens, oracles and IRMs and vault or adapter accounting. Coverage
  is all affected state within supported routes, not hidden allowances, global solvency or economic
  fair value.

## Rejected alternatives

- **`ecrecover` precompile override (earlier draft).** Rejected: viem's `StateOverride` has no
  `movePrecompileToAddress`, forcing a raw RPC path; it relaxes every signature check inside the bundle;
  it still needs placeholder signatures in the calldata under test; and it cannot model direct
  `setAuthorization` or approval transactions at all.
- **Generic token storage-layout discovery.** Rejected: ERC-20 does not standardize storage layouts;
  candidate probing cannot guarantee coverage of arbitrary mappings, namespaces or custom logic and
  adds discovery RPC work. Execute the token's own `approve` instead, without a slot-discovery fast path.
- **Unbounded, untracked synthetic approvals (current).** Rejected: defaulting to `maxUint256` can
  widen the requested authority and mixing preparation with user results shifts indices. Explicit
  approval preparation uses validated amounts, records every call separately, and keeps user indices
  stable. Typed permit checks and final signature execution remain necessary.
- **Overriding Permit2 and Morpho storage under a final-shaped `preview` transaction.** Rejected: the
  `approve2`, `permit` and `setAuthorizationWithSig` calls cannot succeed without a valid signature, so
  they would have to be stripped, and the verifier would then be testing a transaction it authored.
- **Generic `ranges` limit.** Rejected: a string metric with optional subject and time basis can bind to
  the wrong position, unit or basis and cannot be validated against the operation it claims to bound.
  Per-operation types make every field meaningful, unit-fixed and checkable at compile time.
- **Caller-supplied intent or complete expected-change arrays.** Rejected: duplicates calldata and
  rules; operations are inferred and callers only pin or tighten.
- **Tenderly fallback or asset-only checks.** Rejected: undisclosed provider reliance and
  missing-change failures; asset-only checks miss permissions.
- **Frontend-owned market and position checks.** Superseded: both consumers now need the same checks.

## Breaking Changes & Migration

- **Deprecation minor (`evm-simulation` 4.x).** Mark `TenderlyRpcConfig`,
  `ChainSimulationConfig.tenderlyRpc` and the `approval` / `signature` `SimulationAuthorization`
  variants `@deprecated`, pointing to `simulateV1Url` and the typed requests. Behavior is unchanged.
- **Major (`evm-simulation` 5.0.0).** Remove Tenderly and the fallback; require `simulateV1Url`;
  replace the `SimulationAuthorization` union; add `mode`, `limits`, `VerifiedSimulationResult` and the
  new error classes; `simulationTxs` no longer contains authorization transactions, so `txIdx` indexes
  `params.transactions` directly; stricter checks block flows that succeed today. The migration guide
  maps `{ type: "signature", token, spender, amount }` to a typed request, removes prepended-index
  arithmetic in favor of separate authorization preparation records, lists the new codes, and removes
  every consumer bypass except retries of `EXTERNAL_SERVICE_ERROR` re-runs.
- **Rule change to codify first.** `packages/evm-simulation/AGENTS.md` currently instructs a
  Tenderly-first pipeline and prepended `approve` authorizations. The implementation PR must rewrite
  those bullets to this decision (and the `morpho-protocol` / `web3-security` persona backlinks if they
  cite them) before the code is measured against them.
- Consumers (Vaults frontend, write API) integrate `preview`, pre-signing request checks and `final`;
  they are not versioned by this TIB.

## Acceptance Criteria

- [ ] `simulationTxs` is element-for-element equal to `params.transactions` in both modes; preparation
      and probe results map separately without shifting user indices, including preparation failures.
- [ ] Each request variant produces exactly the preparation in the table, with read-back at the same
      pinned block; tests fail if proof is removed, preparation lacks a request, or token storage is overridden.
- [ ] Fork tests cover ordinary, proxy and namespaced token layouts without slot discovery, vault-share
      approvals, reset-then-approve sequencing, legacy empty returns, false returns and reverts; local
      contract fixtures cover custom storage and unexpected approval side effects. No mocked transport
      substitutes for contract round-trips. Preparation and user execution share one stateful request.
- [ ] A request with a foreign owner, stale nonce, wrong spender or token, an amount outside the exact grant, accepted cap or
      paired zero-reset rules, expiration
      other than `MAX_UINT_48`, or deadline beyond `maxSignatureLifetimeSeconds` fails typed before any
      signature exists.
- [ ] `final` rejects any `authorizations`; `preview` rejects transactions containing `permit`,
      `approve2`, `setAuthorizationWithSig` or a non-sentinel permit struct.
- [ ] Unknown token storage layout alone does not reject a supported token; unsupported approval
      behavior, unrecognized targets or selectors, and top-level callbacks fail typed with no partial
      verification. `final` never inserts synthetic approval calls.
- [ ] Every `OperationLimit` field in the two tables is enforced by a test that fails when the bound is
      removed; unknown `type`, unmatched or ambiguous subject, and widened bounds are rejected.
- [ ] Each of the six shared invariants, the `chainId` and domain binding, native funding against real
      balance, and the pre-liquidation operator binding has a test that fails if the invariant is removed
      (`AGENTS.md` §5 security invariants).
- [ ] Every error class and code in the table is thrown by at least one path, carries the documented
      context, and is never caught and downgraded inside the package.
- [ ] Pinned-block replays produce byte-identical `verification` output.
- [ ] Legacy error classes keep their names, codes, constructor signatures and fields.
- [ ] `packages/evm-simulation/AGENTS.md` describes this pipeline before the implementation lands.

## Consequences

- `preview` exercises token `approve`, but not ERC-2612 permit, Permit2 or `setAuthorizationWithSig`
  execution. Approval preparation does not prove a permit can execute; those failures surface in
  `final`. Reassess a `morpho-sdk` "authority-assumed" preview build if `final`-only failures in these
  paths become frequent.
- Token storage-layout discovery and its RPC probes are eliminated. Explicit approvals and read-back
  probes add execution work within the simulation request and count against provider call/gas limits.
  Layout independence does not guarantee support for arbitrary token behavior: a token whose approval
  semantics cannot model the required allowance still fails typed.
- Removing the sender balance inflation may surface native-funding failures that were previously hidden;
  this is intended.
- Midnight routes, standalone mint or revoke, native unwrap, swaps, multiply and repay-with-collateral
  are out of scope until a route ships in `morpho-sdk`.

## References

- [Earlier draft of this brief (PR #795)](https://github.com/morpho-org/sdks/pull/795)
- [EVM simulation safety priorities](https://app.notion.com/p/morpho-labs/EVM-simulation-safety-priorities-3d6d69939e6d8145bc9deb1b0be31ae8)
- [Audited Vaults app](https://github.com/morpho-org/morpho-apps/tree/8a0afba42cb24a2eb472e9368809ac880db90a91/apps/vvrm-app)
- [`eth_simulateV1`](https://ethereum.github.io/execution-apis/api/methods/eth_simulateV1/) · viem `StateOverride` (`balance`, `nonce`, `code`, `state`, `stateDiff`)
- [Permit2 allowance, nonce and deadline enforcement](https://github.com/Uniswap/permit2/blob/main/src/AllowanceTransfer.sol)
- [Morpho accounting, authorization and health](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol)
- `morpho-sdk` requirement encoders: `encodeErc20Approval`, `encodeErc20Permit`,
  `encodeErc20Permit2Approve`, `encodeVaultSharesPermit`, `encodeBlueSignatureAuthorization`;
  policy constants `DEFAULT_SLIPPAGE_TOLERANCE`, `DEFAULT_LLTV_BUFFER`, `MAX_TOKEN_APPROVALS`,
  `APPROVE_ONLY_ONCE_TOKENS`
- `blue-sdk-viem` typed data: `getPermitTypedData`, `getPermit2PermitTypedData`,
  `getAuthorizationTypedData`; pre-liquidation ABIs `preLiquidationFactoryAbi`, `preLiquidationAbi`
- [TIB-2026-08-25: Route Blue actions through BlueBundlesV1](./TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [TIB-2026-07-27: Vault exit in-kind redemption](./TIB-2026-07-27-vault-exit-in-kind-redemption.md)
