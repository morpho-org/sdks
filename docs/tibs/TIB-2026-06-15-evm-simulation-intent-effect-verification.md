# TIB-2026-06-15: EVM simulation — first-party change checks

| Field      | Value                                                           |
| ---------- | --------------------------------------------------------------- |
| **Status** | Proposed                                                        |
| **Date**   | 2026-06-15                                                      |
| **Author** | @foulques                                                       |
| **Scope**  | Package: `evm-simulation`; consumers: Vaults frontend and write API |

---

## Context

Transaction creation is moving from the `morpho-org/morpho-apps` frontend to an independent write
API. The frontend must check its output against the user's intent.

`evm-simulation` executes ordered transactions and returns calls, transfers and net asset changes.
Tenderly runs first when configured; `eth_simulateV1` handles service failures, not reverts.
Tenderly recently omitted an `assetChanges` entry, failing a check. This third-party reliance
is not clearly announced to users.

Audit: `morpho-apps@8a0afba`, SDK `5.5.0`, simulation `4.1.3` (2026-09-14).
The app still builds locally and sends only chain ID and transactions. **Asset reporting exists;
expected asset/allowance comparisons do not.** Previews display shares/positions; final preflight
checks success. Generic failures are bypassable except retention errors; in-kind exits and
shared-liquidity operations require success. Unsigned previews substitute approvals for permits.

## Goals / Non-Goals

**Goals**

- First-party asset and permission checks derived from independent frontend intent.
- Cover every Vaults action below and each deterministic Bundles V1 contract.

**Non-Goals**

- SDK market checks (position health) or state checks (resulting position values).
- General signature/call-graph verification or new transaction-building abstractions.

## Proposed Solution

Use `eth_simulateV1` only; remove Tenderly and fallback. Both consumers call the SDK directly with
their RPC client. The write API runs only the first simulation, without signatures, to check the
transaction against submitted intent before returning it. The frontend independently previews,
checks actual signing requests, then simulates finalized transactions with signatures before submission.

### Input and output

The write API and frontend pass the same intent inputs to SDK `simulate`:

| Input | Contents |
| --- | --- |
| `chainId`, `account`, `transactions` | Chain, user, ordered preview or final transactions |
| `intent.flow`, relevant IDs | Vault/market; source/target for migration/refinance (Aave source = underlying); selected market for V2 IKR, ordered markets for V1 IKR |
| `intent.amount` | Assets/shares amount or MAX; separate collateral/debt amounts for combined flows. Full V1 migration needs none; AutoDeleverage takes `enabled` |
| `intent.maxReallocationFee` | Default zero; user-accepted native allocator fee cap |
| `blockNumber` (optional) | SDK pins reference state when omitted |

Native funding is always allowed: use ERC-20 first, native for the remainder, preserving the gas
reserve. Lasting approvals are always accepted within the SDK's fixed flow/spender caps.

The frontend also supplies `request`: actual approval/typed data before signing. Intent comes from
the form, never generated transaction metadata. Owner/recipient are the connected user.
The SDK independently derives tokens, spenders, routes, conversions, rounding, slippage, fees and
deadline bounds using public SDK math and Vaults defaults. Bind sender, target/entrypoint and
vault/market IDs to intent. No expected-change/cap arrays. MAX resolves against pinned state, never
infinite approval. Use `bigint` internally, decimal strings over HTTP.

Preserve calls, transfers and asset changes. Add `blockNumber`, `simulationTimestamp`,
`checks` (rule, subject, expected, observed), `allowanceChanges` (owner/token/spender, before/after amount and Permit2 expiry/nonce),
and `authorizationChanges` (authorizer/operator, before/after boolean), including unchanged entries.
Throw typed errors for mismatches, unsupported flows or missing evidence.

### Shared invariants

Every flow spends only selected inputs, receives required outputs and leaves other covered wallet
balances unchanged. SDK-derived floors/caps replace per-flow allowance subtraction.

| Invariant | SDK rule |
| --- | --- |
| Bundle retention dust limit | Net retention at each bundle/adapter ≤SDK dust threshold, separately per token/native asset |
| IKR headroom below residual cap | Rounded burn bounds and deadline determine grant/residual caps; final VaultExitBundlesV1 allowance ≤residual cap. Reset/revoke any existing excess |
| Lasting approval below accepted cap | Fresh exact funding ends at zero; reused approval ends ≤starting value. Persistent approvals are accepted up to fixed caps: token→Permit2 `MAX_UINT160`; balance-MAX Aave aToken→GA1 `MAX_UINT256` |
| Unchanged unrelated permission | Covered permissions outside the flow stay unchanged; reject discovered unexpected grants, including temporary ones |
| Expected Morpho operator authorization or unchanged | GA1 authorization is true when required; AutoDeleverage's canonical operator gets the selected boolean; otherwise unchanged |
| Permit2 invariants | Current signed path: correct owner/token/spender, exact gross grant, managed amount ends zero, nonce advances once, expiry `MAX_UINT48`, bounded signature deadline. Token→Permit2 separately obeys the lasting cap |

Requests must match SDK-derived spenders, amounts and deadlines; signed grants consume their nonces.
Fresh 100-USDC funding requires a 100-USDC grant and zero remainder. A 101-share IKR allowance with
a one-share residual cap accepts a 100-share burn.

Events discover temporary/unexpected changes; reads prove residual permission. Approve 100, spend
40: 60 may remain without another event. Approve then revoke: equal endpoints hide the grant.
Spending can also emit Approval events; these are not necessarily new grants.

### Action coverage

**Every row needs expected asset/permission comparisons.** In-kind exits additionally check receipts
after confirmation today. Keep existing onchain deposit slippage guards.

`A` = assets, `S` = shares; SDK derives ERC-20 funding `D` and native funding `N`. Exclude gas;
allocator fees must match the route and accepted cap. **Funding** uses the shared rules;
**operator** means GA1 authorization. Other permissions stay unchanged; bundle dust limits apply throughout.

| Flow / amount selection | SDK-derived asset checks | Permission rule |
| --- | --- | --- |
| V1/V2 deposit: assets; ERC-20/native/mixed | Underlying `−D`, native `−N`, shares ≥floor for `A = D + N`; native-only leaves wallet wrapped-native unchanged | Funding |
| V1/V2 withdrawal: exact assets, liquidity-limited MAX | Underlying `+A`; share burn ≤cap | Unchanged: direct own-share withdrawal |
| V1/V2 redemption: full/exact shares | Vault shares `−S`; underlying ≥floor | Unchanged |
| V2 force withdrawal | Exact net receipt; cap combined withdrawal/penalty share burns | Unchanged |
| V2 force redemption | Burn selected redeem shares plus penalty shares; underlying ≥floor; deliberate share headroom may remain | Unchanged |
| V2 in-kind redemption: assets/MAX | Bound share burn and idle receipt; remaining value becomes Morpho supply positions | IKR cap |
| V1→V2 migration: full | All V1 shares `−S`; V2 shares ≥floor; wallet underlying unchanged | Funding |
| Aave V3→V2: partial / liquidity-limited MAX | Literal aToken spend, respecting token rounding; V2 shares ≥floor; underlying unchanged | Funding |
| Aave V3→V2: balance-limited MAX | Drain actual accrued aToken balance; V2 shares ≥floor; underlying unchanged | Fixed lasting cap |
| Supply loan assets | Loan token `−D`, native `−N`; no ERC-20 position token received | Funding |
| Withdraw supplied assets: exact assets | Loan token `+A` | Operator |
| Withdraw supplied assets: MAX/exact shares | Loan-token receipt ≥floor for selected supply shares | Operator |
| Supply collateral | Collateral `−D`, native `−N` | Funding |
| Borrow | Loan token `+A` | Operator |
| Supply collateral + borrow | Combine collateral funding and loan receipt | Funding + operator |
| Repay: exact assets | Loan token `−D`, native `−N` | Funding |
| Repay: MAX/exact shares | Bound gross pull and refund from accrued debt; native `−N`; refunds remain loan token/wrapped-native | Funding uses gross pull, not net repayment |
| Withdraw collateral | Collateral `+A` | Unchanged: direct Morpho call |
| Repay + withdraw collateral: exact / MAX | Respective repayment effects above plus collateral `+A` | Funding + operator |
| Refinance: collateral-only / partial debt | Wallet token balances unchanged, apart from allocator fee | Operator; no funding |
| Refinance: full debt/exact shares | No wallet token debit; bounded positive loan-token dust may return; allocator fee | Operator; no funding |
| Wrap legacy MORPHO: bundler / debug direct route | Legacy token `−A`, new token `+A` | Legacy token funding to GA1 / approval to wrapper |
| AutoDeleverage: enable / disable | Token balances unchanged | Morpho permission to canonical pre-liquidation contract becomes true / false |
| V1 in-kind redemption: SDK-supported, app unwired | Bound V1-share burn; received value becomes Morpho supply positions | IKR cap; frontend journey also missing |

The SDK derives normal/force exits and deallocation order from cash-exit intent; in-kind exit is a
separate choice. Repay MAX derives gross funding with the existing two-hour interest buffer.

No current standalone mint, revoke, native unwrap, swap, multiply or repay-with-collateral journey
was found. Reward claims link to external apps. Approval prerequisites are covered above.

### Required implementation changes

| Area | Work |
| --- | --- |
| Consumers | Integrate the stages above into the write API and every wired frontend flow |
| SDK rules/backend | Derive flow checks from intent/state; reject unsupported variants; remove Tenderly configuration/backend |
| Asset checks | Read expected balances before/after; compare spends, receipts and extra changes; missing is not zero |
| Permission checks | Read known/discovered ERC-20, Permit2 and Morpho permissions before/after; enforce shared invariants and IKR allowance normalization |
| Bundle retention | Release/consume main's standalone `bundles` guard; published 4.1.3 **and 4.1.5** scan only `bundler3`. Keep legacy guards until routes migrate. Internal native transfers already work |
| Tests | Cover every row/invariant, deterministic replay, omitted/extra changes, wrong recipients/spenders, refunds, rounding, fees, oversized existing IKR approvals and no-bypass behavior |

## Considered Alternatives

### Alternative 1: Original two-gate verifier

Separate signature/intent verification followed by detailed protocol effects.

**Why rejected:** General signature/call-graph analysis exceeds bounded flow and permission checks.

### Alternative 2: Market and state checks in the SDK

**Why rejected:** Their primary purpose is UI results for human confirmation. The frontend is their
only consumer; no integrator need justifies extracting its simulation/reads. Keeping them there
allows faster iteration; moving them would not reduce trust assumptions or improve safety.

### Alternative 3: Tenderly fallback or asset-only checks

**Why rejected:** Tenderly preserves undisclosed third-party reliance and missing-change failures;
asset-only checks miss permissions to spend later.

### Alternative 4: Frontend-authored expected-change arrays

**Why rejected:** Generic bounds and exact allowance arithmetic duplicate deterministic rules in
the consumer. Intent plus shared SDK invariants needs fewer parameters and accepts bounded residuals.

## Acceptance Criteria

Both consumers enforce their verification stages: mismatches or missing evidence block API output
or frontend submission. No bypass. V1 in-kind redemption remains app-unwired.

## Assumptions & Constraints

Identical intent, transactions and reference state produce identical checks. Derive simulation time
from the pinned block, never the wall clock. Trust remains in the chain RPC and supported tokens;
events cannot enumerate hidden allowances. Guarantees cover identified accounts/permissions in
simulation, not later execution.

## Security

Morpho position-credit validation/display stays frontend-owned. Unsigned previews may substitute
approvals for permits; they cannot prove signatures or final permission/nonce changes, or replace
frontend checks. Check requests before signing: final simulation cannot undo granted authority.

## References

- [EVM simulation safety priorities](https://app.notion.com/p/morpho-labs/EVM-simulation-safety-priorities-3d6d69939e6d8145bc9deb1b0be31ae8)
- [Audited Vaults app](https://github.com/morpho-org/morpho-apps/tree/8a0afba42cb24a2eb472e9368809ac880db90a91/apps/vvrm-app): `src/services/simulate`, `src/hooks/operation/market/v2`, vault review dialogs and withdrawal hooks
- [Pinned funding rules](https://unpkg.com/@morpho-org/morpho-sdk@5.5.0/lib/esm/actions/requirements/generalAdapter/getGeneralAdapterRequirements.js)
- [Published retention guard](https://unpkg.com/@morpho-org/evm-simulation@4.1.5/lib/esm/simulate/pipeline/bundler-retention.js) · [expanded guard on main](https://github.com/morpho-org/sdks/blob/6ad775fc794b1b164fef5defaf10f2d32a889fd1/packages/evm-simulation/src/simulate/pipeline/bundler-retention.ts#L107)
- [`eth_simulateV1`](https://ethereum.github.io/execution-apis/api/methods/eth_simulateV1/) · [ERC-20 allowance/event behavior](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20-transferFrom-address-address-uint256-)
