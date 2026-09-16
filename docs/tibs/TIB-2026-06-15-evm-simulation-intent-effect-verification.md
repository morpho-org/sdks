# TIB-2026-06-15: EVM simulation — calldata-derived state and safety checks

| Field      | Value                                                           |
| ---------- | --------------------------------------------------------------- |
| **Status** | Proposed                                                        |
| **Date**   | 2026-06-15                                                      |
| **Author** | @foulques                                                       |
| **Scope**  | Package: `evm-simulation`; consumers: Vaults frontend and write API |

---

## Context

Transaction creation is moving from `morpho-apps` to an independent write API. Both need shared
effect/position checks; the frontend must match API output to user choices.

Today, `evm-simulation` runs ordered transactions and reports calls, transfers and asset changes.
Configured Tenderly runs first; `eth_simulateV1` handles service failures, not reverts. Tenderly
recently omitted an `assetChanges` entry, failing a check. Users are not clearly told of this reliance.

Audit: `morpho-apps@8a0afba`, SDK `5.5.0`, simulation `4.1.3` (2026-09-14): transactions still built
locally; only chain/transactions passed. **Asset reporting exists; expected-change comparisons do not.**
Previews display positions and substitute approvals for permits. Final preflight checks success;
generic failures are bypassable, except retention, in-kind exit and shared-liquidity failures.

## Goals / Non-Goals

**Goals:** Infer operations from calldata; verify assets, permissions, position end states/diffs and
market safety. Preserve the API; add optional mode and limits.

**Non-Goals:** Arbitrary contracts/account protocols, unencoded intent, global solvency or future guarantees.

## Proposed Solution

Use `eth_simulateV1` only; remove Tenderly and fallback. Both consumers call the SDK directly;
it owns decoding, reads and checks, reusing existing SDK math. The write API runs only `preview`.
The frontend independently previews, checks signing requests, then runs `final` before submission.

This removes Tenderly's effect-summary dependency, retaining RPC trust. Independent frontend verification
prevents a faulty builder from supplying the only trusted assessment.

### Decode supported operations

Use Bundles V1 registries and explicit direct withdrawal/authorization/wrapper/read rules.

| Check | Threat / why it matters |
| --- | --- |
| Match chain, registered address and function | Familiar calldata at another deployment/entrypoint can move funds or grant authority differently |
| Decode parameters; independently verify protocol relationships | ABI-valid arguments can mismatch a vault's underlying, adapter or market; misbound owners/recipients redirect the claim |
| Recognize every Bundler3/GA1 inner call/callback | A trusted outer contract can carry hidden transfers or permissions unrelated to the visible action |
| Reject top-level callbacks | Callbacks rely on surrounding execution context; accepting them as user entrypoints applies the wrong safety rules |
| Reject unknown payloads/effects | Unmodeled behavior must not receive a successful verification based on partial coverage |
| Only contract-defined sentinels imply MAX | Treating a literal as MAX can hide an incomplete close or reject an intentional partial action |

### Input and output

Keep `simulate(config, params)`, `config.chains`, `simulateV1Url`, `logger`, `timeoutMs` and existing
`SimulateParams`. No new client object; only two new optional fields:

| Input | Contents | Why |
| --- | --- | --- |
| `chainId`, `transactions` | Ordered `{ from, to, data, value? }`; protected user = common `from`. No intent input | Another sender protects the wrong account; reordering changes available balances/permissions |
| `authorizations?` | Keep prepended approvals/order; add typed-data `request` variant for pre-signing checks | Inspect authority before the user creates a signature that may be usable independently |
| `blockNumber?` | Keep `bigint`/block tag; resolve tag/default `latest` once | Mixed blocks can produce inconsistent balances, interest and deadlines |
| `mode?` (new) | Default `final`; explicit `preview` enables signature overrides | Omitted options must not silently bypass signature verification |
| `limits?` (new) | Thresholds/ranges below; omitted values use SDK defaults | Missing consumer settings must not remove baseline protections |

`preview` scopes an [`ecrecover` override](https://geth.ethereum.org/docs/interacting-with-geth/rpc/objects#state-override-set)
to decoded digests/signers to preserve unrelated signature checks. Valid-format placeholders execute real
permit/authorization logic, including nonce/deadline/allowance checks; no synthetic approvals.
`final` uses fresh chain state and actual signatures without signature/permission overrides, exposing
failures preview grants/nonces could mask. Both apply identical checks; unsupported mechanisms fail.

Match signing requests to decoded operations. Legacy signature hints require preview plus a matching
complete permit; token/spender/amount alone could conceal excessive authority.

Preserve `SimulationResult` fields/shapes (`simulationTxs`, `calls`, `transfers`, `assetChanges`), errors and
call/transfer indices; separate probes to avoid misidentifying calls.
`VerifiedSimulationResult extends SimulationResult` adds `verification`: operations, block/time, mode, limits, checks,
balance/permission/position/market records, conversions and fees.

Report **before/after** and numeric **diff/actionDiff**; only `actionDiff` excludes modeled accrual.
Endpoints reveal exposure; deltas reveal changes. Include unchanged values so omissions cannot imply proof;
numeric-only deltas avoid status arithmetic.
Separate fees/conversions explain losses; mode/block/limits identify verification conditions. Typed errors block failures.

### Consumer limits

| Optional `limits` field | Meaning / default | Threat / why it matters |
| --- | --- | --- |
| `maxSlippageBps` | Conversion slippage; default 3 bps | Bound overpayment/under-receipt while accepting limited rounding/quote movement; 3 bps is SDK policy |
| `minLltvBufferBps` | Distance below liquidation threshold; default 50 bps | Avoid ending immediately at a liquidation/protection boundary; the policy buffer cannot guarantee future health |
| `ranges` | Inclusive `{ subject?, metric, at?, min?, max? }`; `at` = `after` (default), `diff` or `actionDiff`. Subject = account + token/market/vault; omit when unambiguous | Enforce consumer-specific outcomes; binding subject/metric/time basis avoids checking the wrong position, amount or remaining exposure |

Examples: LTV ≤75%, debt increase 990–1,000 USDC, shares received ≥990, utilization ≤90%, per-asset fee cap.
Use `bigint`: raw amounts/shares, WAD ratios, WAD/second rates, `1e36` Blue prices, integer bps.
Require an endpoint; equal endpoints mean exact. Fixed units/endpoints prevent scaling mistakes and empty checks.

Intersect SDK, calldata and caller bounds so none weakens another; callers only tighten checks.
Reject malformed, unknown, ambiguous, inapplicable or contradictory bounds to avoid silently ignored
restrictions. SDK-derived accounting needs no caller limits.

### Error taxonomy

Preserve `SimulationPackageError`, names/codes, constructors, fields and `instanceof`. First five classes
already exist; additions extend the base directly. Use rule/subject details, not per-flow subclasses.

| Class / code | Failure |
| --- | --- |
| `SimulationValidationError` / `VALIDATION_ERROR` | Invalid config/input/calldata, mixed senders, incomplete signature hints or invalid ranges |
| `UnsupportedChainError` / `UNSUPPORTED_CHAIN` | Missing chain configuration or `simulateV1Url` |
| `ExternalServiceError` / `EXTERNAL_SERVICE_ERROR` | RPC transport, timeout, authentication, rate-limit, availability or unclassified rejection |
| `SimulationRevertedError` / `SIMULATION_REVERTED` | Failed user execution, including panic, gas, signature, nonce or deadline rejection |
| `BlacklistViolationError` / `BLACKLIST_ERROR` | Bundle/adapter retention exceeds dust |
| `UnsupportedOperationError` / `UNSUPPORTED_OPERATION` | Unrecognized target/selector or unsupported call recipe/top-level callback |
| `ProtocolBindingMismatchError` / `PROTOCOL_BINDING_MISMATCH` | Known route has wrong owner/recipient, underlying, market, adapter or deployment binding |
| `UnsupportedVerificationFeatureError` / `UNSUPPORTED_VERIFICATION_FEATURE` | Recognized route lacks registry/model coverage (token/vault/oracle/IRM/signature) or required RPC capability |
| `InvalidSimulationResponseError` / `INVALID_SIMULATION_RESPONSE` | Malformed response, call status/count/index or required logs |
| `MissingVerificationEvidenceError` / `MISSING_VERIFICATION_EVIDENCE` | Missing state/events/prices/rates, failed probe execution or inconsistent snapshot reference |
| `AuthorizationRequestMismatchError` / `AUTHORIZATION_REQUEST_MISMATCH` | Signing request disagrees with decoded owner/domain/token/spender/amount/nonce/deadline |
| `AssetChangeMismatchError` / `ASSET_CHANGE_MISMATCH` | Wrong debit/receipt/refund, double funding, consumed gas reserve or unexplained balance change |
| `PermissionChangeMismatchError` / `PERMISSION_CHANGE_MISMATCH` | Any ERC-20, Permit2, IKR, lasting/temporary approval or Morpho operator invariant fails |
| `StateChangeMismatchError` / `STATE_CHANGE_MISMATCH` | Position/market/vault/Aave accounting, accrual, full-close or configuration mismatch |
| `MarketConstraintViolationError` / `MARKET_CONSTRAINT_VIOLATION` | Verified state violates health/buffer, rescue, AutoDeleverage, no-Aave-debt or liquidity/capacity policy |
| `SlippageLimitExceededError` / `SLIPPAGE_LIMIT_EXCEEDED` | Conversion violates quote/calldata/SDK slippage bound |
| `FeeMismatchError` / `FEE_MISMATCH` | Wrong fee/penalty amount, recipient or schedule; forbidden discretionary fee |
| `ConsumerRangeViolationError` / `CONSUMER_RANGE_VIOLATION` | Verified value outside a valid caller range |
| `UnexpectedSimulationError` / `UNEXPECTED_SIMULATION_ERROR` | Unclassified local SDK/dependency failure |

**Classification:** Validate → bind → execute → establish evidence → check effects/limits. Throw once in
stable transaction/rule order; preserve known errors and classify structured data, never message text.
Missing/malformed evidence is never zero or an effect mismatch. Probe execution failure means missing evidence; probe transport/response
failures retain those classes. Unsupported RPC capability requires proof. Invalid RPC parameters mean
validation for bad caller input, unexpected failure for SDK-built requests. Wrong fee → fee error;
valid fee above caller cap → range error; retention → existing blacklist error.

**Diagnostics:** Add optional trailing context/cause options: stage/mode, chain/block/time, transaction/call
path or probe ID, rule/subject, expected/observed values/units and RPC code. Keep `txIdx` indexing
`simulationTxs`, `fieldErrors`, `reason`, `details` and retention's `{ address, token, netRetained }` shape
(string amounts); omit unavailable context. Context is readonly; messages give remedies. Consumers branch
on class/code. Adapters own HTTP mapping; serialize safe fields and decimal bigints, not signatures,
credentials or raw causes.

**Enforcement:** All errors block API output/submission; never bypass/fallback. Retry transient RPC failures;
inspect persistent RPC errors, correct input/configuration/route faults and report/fix SDK defects.
Rerun verification without silently widening limits.
Replace today's broad service-error wrapping, skipped required logs/registries and frontend bypass of
every code except `BLACKLIST_ERROR`. Only irrelevant logs/optional metadata may warn; unknown errors block.

### Position and market checks

Cover affected positions, backing allocations, fee recipients and markets. Accrue a no-action baseline
to simulation time so interest cannot masquerade as proceeds or hide debits. Reconcile ordered calls with
protocol rounding/clamps and entrypoint-specific accrual/fee mints to avoid false failures.
Require exact raw shares to expose accounting errors; reprice claims, whose diffs need not equal cash flows.

| State / metric | Required checks | Threat / why it matters |
| --- | --- | --- |
| Blue positions | Collateral, supply/borrow assets and shares match decoded legs. Supply never repays debt | Wallet transfers cannot prove collateral/supply credits or debt reduction; wrong shares can leave excess debt or credit another position |
| Vault positions | Reconcile user/fee-recipient shares/claims, mints/burns, idle assets, allocations, totals, fees, penalties and losses by vault version | Missing credits/excess burns lose claims; untracked allocations hide depleted backing. Fees dilute claims or credit the user; losses change redeemable value |
| Aave migration source | Reconcile nominal/scaled aToken balances, income index, withdrawal and destination credit; require no existing Aave debt | Index accrual can disguise overspending or overstate migrated value. The no-debt policy avoids removing collateral supporting an existing loan |
| Market accounting | Reconcile supply/borrow asset/share totals, fee shares and accrual time. Check liquidity, utilization, rates/APYs and borrow/withdraw/flash-loan/reallocation capacity | Inconsistent totals distort claims/debt; insufficient capacity makes the route impossible. Utilization/rates expose liquidity pressure and borrowing/yield costs for confirmation or ranges |
| LTV and health | Compute collateral value, debt, LTV, health/liquidatability, health factor, liquidation price and borrow/withdraw headroom. Separate protocol LLTV and active `preLLTV` metrics; supply rounds down, debt up | Valuation/rounding errors can understate liquidation exposure. Health/LTV describe current risk; price/headroom show distance to thresholds. Separate protection metrics avoid confusing early deleveraging with protocol liquidation |
| Risk limits | Borrow/collateral removal ends ≤applicable LLTV/active `preLLTV` minus buffer (floor zero). Pure repayments/top-ups may remain unhealthy if risk does not worsen. Check markets/refinance legs separately; AutoDeleverage enable requires LTV <canonical `preLLTV` | Limit new risk near thresholds; improvement elsewhere cannot excuse an unsafe market. Allow rescue actions that cannot fully restore health; avoid enabling protection already eligible to trigger |
| Slippage/share price | Check assets/shares/debt conversions against independent quotes, calldata limits and SDK tolerance; retain two-hour accrual allowance and onchain inflation guards | Permissive calldata can overcharge or under-credit; inflation/share-price manipulation can destroy deposit value. Interest headroom avoids false slippage failures or underfunded share repayments, without allowing unlimited spend |
| Fees/reallocations | Match charges/recipients to route/pinned schedule. Separate V1 native fees, V2 loan-token penalties and refunds; reject discretionary/referral fees unless SDK policy permits | Hidden/double charges or redirected fees take value despite correct main legs. Separating assets/refunds prevents netting away costs; calldata alone does not establish fee consent |
| Configuration/completeness | Verify protocol identities, oracle/IRM availability and operation-specific vault/adapter caps; reject missing reads, unsupported accounting or unexplained configuration changes | Wrong identities/models or missing prices/rates can fabricate healthy positions and claims. Unexpected configuration can change later rights/risk despite correct balances |

Debt-free means no liquidation risk; debt with zero collateral value means infinite LTV/zero health.
Respect V2 rate-capped assets to avoid overstating claims. Existing allocations may exceed lowered caps;
enforce operation-specific capacity so valid exits remain possible. Reported metrics alone provide no
guarantee; only SDK rules/caller ranges impose limits.

### Shared invariants

Match decoded inputs/outputs to catch excess debits, lost receipts and redirects. Keep unrelated raw
balances/shares/permissions unchanged to catch hidden effects, except modeled accrual/fees; recompute
derived claims/metrics to avoid false failures. Fund ERC-20 first, then native, preventing double funding
while reserving native balance for gas.

| Invariant | SDK rule | Threat / why it matters |
| --- | --- | --- |
| Bundle retention dust limit | Per bundle/adapter and asset, net retention ≤SDK dust threshold | Successful execution can strand funds in temporary contracts. Per-asset bounds prevent offsetting losses; dust permits harmless rounding residues |
| IKR headroom below residual cap | Derive grant/residual caps from rounded burn/deadline; final VaultExitBundlesV1 allowance ≤cap. Reset existing excess | Rounded burns need headroom; excess surviving share allowance enables later withdrawals. Resetting existing excess makes the final cap effective |
| Lasting approval below accepted cap | Fresh exact funding ends zero; reused allowance ≤start. Persistent token→Permit2 ≤`MAX_UINT160`; balance-MAX Aave aToken→GA1 ≤`MAX_UINT256` | Avoid adding unintended authority while retaining supported persistent routes. These large accepted caps still permit future spending and do not protect against spender compromise |
| Unchanged unrelated permission | Reject unexpected grants, including temporary ones; unrelated permissions unchanged | A balance-neutral transaction can grant a future drain, exercise temporary authority, or revoke permissions needed by another workflow |
| Expected Morpho operator authorization or unchanged | Required route operator authorized; canonical AutoDeleverage operator gets decoded boolean; otherwise unchanged | A wrong operator gains position control; missing/revoked intended authority breaks the route or disables selected protection. Lasting operator trust remains |
| Permit2 invariants | Correct owner/token/spender; exact gross grant; managed amount ends zero; nonce advances once; expiry `MAX_UINT48`; bounded signing deadline | Identity/gross amount prevent redirected or oversized grants; zero remainder prevents continued managed spending; nonce consumption prevents grant replay; signing deadline bounds submission time. Long expiry is accepted policy, not short-lived protection |

Examples: fresh 100-USDC funding leaves zero allowance; a 101-share IKR grant permits a 100-share burn
with one-share residual. Check events **and** endpoints: approve 100/spend 40 can leave 60 without
another event; approve/revoke hides temporary authority in equal endpoints. Approval events may also
represent spending; treating every event as a grant rejects valid consumption.

### Action coverage

**All rows require the asset, permission, position and market checks above.** Move post-confirmation IKR
checks before submission to catch missing replacement claims. `A` = assets, `S` = shares, `D/N` = ERC-20/native
funding; exclude gas, apply rounding/fees. **Funding** and unmentioned fields follow shared invariants;
**operator** = registered operator (legacy GA1).

| Decoded flow / amount mode | Wallet and position checks | Permission rule | Threat / why it matters |
| --- | --- | --- | --- |
| V1/V2 deposit: ERC-20/native/mixed assets | Underlying `−D`, native `−N`; vault credit from `A=D+N`. Native-only preserves wrapped-native balance | Funding | Catch uncredited/redirected deposits and double funding from native plus wrapped balances |
| V1/V2 withdrawal: exact assets, liquidity-limited MAX | Underlying `+A`; share burn ≤cap | Unchanged: direct own-share withdrawal | Prevent excessive share burns or underpayment; liquidity-limited MAX must not demand an impossible full exit |
| V1/V2 redemption: full/exact shares | Vault shares `−S`; underlying ≥floor | Unchanged | Ensure selected shares produce sufficient underlying, without burning extra shares |
| V2 force withdrawal | Exact net receipt; cap combined withdrawal/penalty share burns | Unchanged | Catch omitted/double penalties and extra burns hidden behind the requested cash receipt |
| V2 force redemption | Burn redeem + penalty shares; underlying ≥floor; allowed headroom may remain | Unchanged | Include penalty shares in lost claims; allow intentional headroom instead of falsely requiring zero shares |
| V2 in-kind redemption: assets/MAX | Share burn → idle receipt + penalty + actual user market supply credits; source allocations decrease | IKR cap | Wallet-only checks miss missing/redirected Morpho credits or depletion of the wrong backing allocations |
| V1→V2 migration: full | All V1 shares `−S`; V2 shares ≥floor; wallet underlying unchanged | Funding | A closed source position must fund the correct destination; unrelated wallet funds must not hide a broken migration |
| Aave V3→V2: partial / liquidity-limited MAX | Nominal/scaled debit → V2 credit; wallet underlying unchanged | Funding | Prevent index rounding masking excess source depletion or missing destination credit; respect liquidity-limited scope |
| Aave V3→V2: balance-limited MAX | Drain accrued/scaled balance; V2 credit ≥floor; underlying unchanged | Fixed lasting cap | A stale literal can leave accrued interest behind; verify actual depletion and its destination |
| Supply loan assets | Loan `−D`, native `−N`; mint supply shares | Funding | Ensure loan-token spending creates the decoded supply claim rather than a transfer or repayment |
| Withdraw supplied assets: exact assets | Loan `+A`; corresponding supply-share burn | Operator | Prevent burning more claim than the cash received justifies |
| Withdraw supplied assets: MAX/exact shares | Burn decoded shares; loan ≥floor; full close zero supply shares except fee credits | Operator | Catch underpaid or incomplete closes; fee credits must not make legitimate full exits fail |
| Supply collateral | Wallet collateral `−D`, native `−N`; position collateral `+A` | Funding | Ensure spent collateral reaches the protected position and supports its debt |
| Borrow | Loan `+A`; corresponding debt/share increase | Operator | Prevent debt without the promised loan receipt, or debt exceeding the allowed risk |
| Supply collateral + borrow | Combined collateral credit, loan receipt and debt increase | Funding + operator | Either linked credit/receipt can be missing despite plausible net wallet changes |
| Repay: exact assets | Loan `−D`, native `−N`; corresponding debt-share burn | Funding | A token debit must reduce the correct debt, not merely transfer funds |
| Repay: MAX/exact shares | Burn decoded debt shares; full close zero debt; reconcile gross pull/refund, native `−N`, loan/wrapped-native refunds | Gross funding | Catch residual debt after full closure and missing refunds; net spend alone cannot validate gross permission use |
| Withdraw collateral | Wallet collateral `+A`, position collateral `−A` | Unchanged: direct Morpho | Catch redirected collateral and excessive removal that leaves remaining debt unsafe |
| Repay + withdraw collateral: exact / MAX | Repayment plus collateral wallet `+A` / position `−A` | Funding + operator | Debt repayment must not conceal arbitrary collateral extraction or unsafe remaining debt |
| Refinance: collateral-only / partial debt | Move collateral/debt source→target; wallet unchanged except fees/penalties | Operator | Prevent lost collateral, excess target debt or unintended source changes; assess both markets |
| Refinance: full debt/exact shares | Burn source debt shares; bound target debt; conserve collateral; full close zero source debt; bounded loan dust | Operator | Catch stranded source debt or excess target borrowing; allow only bounded conversion dust |
| Wrap legacy MORPHO: bundler / debug direct route | Legacy token `−A`, new token `+A` | Legacy token funding to GA1 / approval to wrapper | Prevent legacy tokens disappearing without matching replacement tokens |
| AutoDeleverage: enable / disable | Wallet/raw positions unchanged; verify resulting risk/protection | Canonical authorization true / false | Ensure the selected protection changes, without asset movement or authority to another operator |
| V1 in-kind redemption: SDK-supported, app unwired | Source vault burn → actual supply credits in each market | IKR cap; frontend missing | Checking only one destination can hide missing or redirected credits in other markets |

Validate exit method/deallocation order to avoid penalties/reverts. Two-hour repayment funding covers
accrual; reconcile gross pulls/refunds to prevent excess spend. Apply route fees/penalties throughout,
including wallet-neutral flows: V2 penalties may require funding for loan withdrawals, borrowing,
refinancing and combinations. Require zero residual positions only for decoded full closes.

No standalone mint/revoke/native unwrap/swap/multiply/repay-with-collateral journey found; reward
claims use external apps. Approval prerequisites are covered above.

### Required implementation changes

| Area | Work |
| --- | --- |
| Consumers | Integrate API preview and all wired frontend verification stages |
| Decoder/backend | Register supported calls; implement signature override; remove Tenderly execution |
| State/permissions | Move reads/calculations into SDK; add probes, comparisons, accrual baseline and all rules above; normalize IKR allowances |
| Compatibility | Preserve existing config/params/result/errors; add mode, limits and verification subtype |
| Errors | Implement the taxonomy, preserve legacy fields/codes, classify boundary failures and update bypass-related docs/consumer handling |
| Retention | Release/consume main's `bundles` guard; published 4.1.3/4.1.5 only scan `bundler3`. Retain legacy guards; internal native transfers already work |
| Tests | Cover every flow/invariant, both modes, input/index compatibility, bounds, missing/extra evidence, rounding/accrual, full/partial closes, non-worsening unhealthy repayments/top-ups and deterministic replay. Pin state-dependent tests |

Keep deprecated Tenderly fields/types inert, require `simulateV1Url` and retain legacy guards until route
migration to preserve retention coverage. Backend removal, incomplete signature-hint rejection and stricter checks
require a major/migration guide; preserve other APIs to avoid unrelated integration failures.
Test every threat/valid exception; pin state-dependent tests to isolate regressions. Include error class/code/data
compatibility, precedence, causes, malformed/missing evidence and blocking of every code, including unknown ones.

## Considered Alternatives

### Alternative 1: Original general two-gate verifier

**Rejected:** Signature/intent then general protocol-effect verification required arbitrary call-graph
support. Limit complete checks to recognized operations.

### Alternative 2: Keep market and state checks in the frontend

**Superseded:** One consumer/faster UI iteration originally favored frontend ownership. Both consumers
now need the same checks.

### Alternative 3: Tenderly fallback or asset-only checks

**Rejected:** Undisclosed provider reliance/missing-change failures; asset-only checks miss permissions.

### Alternative 4: Caller-supplied intent and complete expected-change arrays

**Rejected:** Duplicate calldata/rules. Accept optional numeric limits; infer operations.

## Acceptance Criteria

Verify every supported affected position's end state/diff and market metrics. Errors/missing evidence
block API output/submission; bypass defeats these protections. V1 IKR remains app-unwired.
Changes to checks must preserve their protection or document the changed assumption/rationale.

## Assumptions & Constraints

Identical inputs/pinned state produce identical checks; time comes from the block. Trust remains in
RPC, supported tokens, oracles/IRMs and vault/adapter accounting. Coverage includes all affected state
within supported routes, not hidden allowances, global solvency, future execution or economic fair value.

## Security

Bind `from` to the connected user/request account; compare/display decoded operations against the form.
Internal consistency and supplied ranges can miss a wrong amount, market or beneficiary. Check requests
before signing: final simulation cannot undo granted authority. Present preview permissions/nonces as
provisional; assumed signatures cannot prove valid authority until final verification.

## References

- [EVM simulation safety priorities](https://app.notion.com/p/morpho-labs/EVM-simulation-safety-priorities-3d6d69939e6d8145bc9deb1b0be31ae8)
- [Audited Vaults app](https://github.com/morpho-org/morpho-apps/tree/8a0afba42cb24a2eb472e9368809ac880db90a91/apps/vvrm-app): `src/services/simulate`, `src/hooks/operation/market/v2`, vault review dialogs and withdrawal hooks
- [Pinned funding rules](https://unpkg.com/@morpho-org/morpho-sdk@5.5.0/lib/esm/actions/requirements/generalAdapter/getGeneralAdapterRequirements.js)
- [Existing public simulation types](https://unpkg.com/@morpho-org/evm-simulation@4.1.3/lib/esm/types.d.ts) · [existing error API](https://unpkg.com/@morpho-org/evm-simulation@4.1.3/lib/esm/errors.d.ts)
- [Published retention guard](https://unpkg.com/@morpho-org/evm-simulation@4.1.5/lib/esm/simulate/pipeline/bundler-retention.js) · [expanded guard on main](https://github.com/morpho-org/sdks/blob/6ad775fc794b1b164fef5defaf10f2d32a889fd1/packages/evm-simulation/src/simulate/pipeline/bundler-retention.ts#L107)
- [`eth_simulateV1`](https://ethereum.github.io/execution-apis/api/methods/eth_simulateV1/) · [ERC-20 allowance/event behavior](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20-transferFrom-address-address-uint256-)
- [Permit2 allowance, nonce and deadline enforcement](https://github.com/Uniswap/permit2/blob/main/src/AllowanceTransfer.sol)
- [Morpho accounting and health](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol) · [conversion tolerance](https://github.com/morpho-org/sdks/blob/6ad775fc794b1b164fef5defaf10f2d32a889fd1/packages/blue-sdk/src/constants.ts#L24) · [LLTV buffer](https://github.com/morpho-org/sdks/blob/6ad775fc794b1b164fef5defaf10f2d32a889fd1/packages/morpho-sdk/src/helpers/constant.ts#L14)
