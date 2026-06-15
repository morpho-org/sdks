# TIB-2026-06-15: EVM simulation — verify declared intent and effective result

| Field      | Value                       |
| ---------- | --------------------------- |
| **Status** | Proposed                    |
| **Date**   | 2026-06-15                  |
| **Author** | @foulques                   |
| **Scope**  | Package: `evm-simulation`   |

---

## Context

`evm-simulation` previews a bundle through Tenderly / `eth_simulateV1` and today guarantees exactly one thing: **no value is retained by bundler3** (`assertNoBundlerRetention`, net `(bundler3, token)` flow above `DUST_THRESHOLD`). It also parses ERC20 / WETH9 `Transfer` logs and surfaces per-account balance deltas.

That is a narrow guarantee. "Nothing got stuck in the bundler" does not mean "the user is safe". A bundle can pass the retention check and still:

- ask the user to sign an `approve` or a Permit2 transfer to a **spender that is not ours**;
- hide the dangerous call **nested inside a batch** (Multicall3, Safe `multiSend`, bundler3 multicall, a 4337 `userOp`) so the outer `to` looks trusted;
- end with **balance delta = 0** but leave a **standing allowance or authorization** behind — a future drain, invisible to a balance-only check;
- move **value the parser never sees**: native ETH, ERC-4626 vault shares, debt, LP — only ERC20 `Transfer` logs are read today;
- under-deliver on a **fee-on-transfer / rebasing** token, where the realized amount differs from the encoded one.

This TIB freezes the design for expanding the package along two axes — **declared intent** (static decode, before signing) and **effective result** (dynamic state-diff, after simulating) — prioritised **vaults first, then markets**, matching where the SDK's surface and integrator demand are heaviest.

## Goals / Non-Goals

**Goals**

- Verify the **declared intent** of a bundle statically: every approval / signature targets a spender in a **per-chain trust-list**, decoded **recursively through batches**, intercepted **at signature-request time** (not only on final calldata).
- Verify the **effective result** dynamically: the user does not lose value across **every asset type** (ERC20, native, vault shares, debt/LP), measured by **state diff and events**, not balance alone — and **no allowance or authorization is granted as a side effect**.
- Deliver in priority order: **Milestone 1** = Vault V1 (MetaMorpho) + Vault V2 + the shared static-decode "requirements" layer; **Milestone 2** = Market V1 (Morpho Blue) transactions.
- Keep every new failure mode a named, exported subclass of `SimulationPackageError`; keep the staged pipeline shape.
- 100% JSDoc + colocated `*.spec.ts` unit tests + fork tests on every new path, in the same PR as the code.

**Non-Goals**

- No new on-chain execution backend. Tenderly / `eth_simulateV1` stay the only simulation engines; we consume their state-diff and event output, we do not replace them.
- No general-purpose calldata decoder for arbitrary protocols. We decode the batch wrappers and the Morpho/bundler action set — not every DEX or third-party adapter.
- No automatic remediation. The package **reports typed findings**; it never rewrites or re-signs a bundle.
- No price oracle / USD valuation. "Value" is measured per-asset against the bundle's own declared expectation, not a fiat number.
- No new runtime dependency without a package-level justification in the PR.

## Current Solution

The 5-stage pipeline (`src/simulate/simulate.ts`): validate input → build simulation txs (resolve signature authorizations to `approve` calldata) → execute via backend → parse ERC20/WETH9 transfers → `assertNoBundlerRetention`. Asset coverage is ERC20 + WETH9 + top-level native `value`. The only trust-list is the per-chain `bundler3` address set pulled from `@morpho-org/blue-sdk`, used solely to detect retention. There is no static decode of intent, no state/storage-diff inspection, no event inspection beyond `Transfer`/`Deposit`/`Withdrawal`, and no protocol awareness of vaults vs markets.

## Proposed Solution

Two verification layers, added as new pipeline stages, both consuming what the backends already return (decoded input for static, `stateDiff` + full logs for dynamic). Each check is independent, returns a **typed finding**, and is **opt-in per chain** via existing `SimulationConfig`.

### Layer A — Static decode (declared intent)

What the user is *being asked to authorize*, checked **before** the bundle is sent.

- **Per-chain trust-list of spenders/operators.** `GeneralAdapter1`, the bundler3 adapters, and `Permit2`, scoped **by `chainId`** (sourced from `@morpho-org/blue-sdk`, same pattern as the bundler3 set). An `approve`, an EIP-2612 `permit`, or a Permit2 `SignatureTransfer` whose **spender** falls outside the chain's trust-list is flagged.
- **Intercept at the signature request, not only the calldata.** Off-chain signatures never produce a `Transfer` log, so a balance-only or calldata-only view misses them entirely. We decode the **typed-data being signed** — EIP-2612 `permit` and Permit2 `PermitTransferFrom` / `PermitBatchTransferFrom` — and check the granted `spender`/`amount`.
- **Recursive batch decode.** The sensitive action is usually nested. We unwrap **Multicall3**, **Safe `multiSend`**, the **bundler3 multicall**, and **ERC-4337 `userOp` / `handleOps`**, recursively, and run every leaf call through the same checks.
- **Validate the inner actions of a trusted router.** A trusted entry point (e.g. `GeneralAdapter1`) can still be instructed to do an untrusted thing. For our routers we decode and validate the **internal action list**, not just the outer address.

### Layer B — Dynamic simulation (effective result)

What *actually happened*, from the post-simulation **state diff + events** — not balances alone.

- **No net value loss, across every asset type.** Net diff ≥ expected, computed over **ERC20, native ETH, ERC-4626 vault shares, and debt/LP positions** — not only ERC20. (Today only ERC20 is parsed.)
- **Realized amount, not encoded amount.** Measure what the receiver actually got, so **fee-on-transfer / rebasing** tokens are accounted correctly.
- **Slippage & fees within tolerance**, and **PublicAllocator fee is correct** (vault/market reallocation).
- **No asset leaves to an unknown / unexpected address.** Every outflow recipient is either the user or an explicitly-allowed destination.
- **Legitimate non-`from` recipients are allowed.** A receiver different from the sender is expected and fine for: vault `deposit`/`mint` → shares to `receiver`, bridges, smart-account / 4337 flows, and callback adapters. These must pass, not trip the "unknown recipient" check.
- **State diff, not just balance diff.** A bundle can finish with **balance delta = 0 yet leave a standing allowance or authorization** → a future drain. We inspect **storage/state diffs and events** — `Approval` (ERC20 + Permit2), `AuthorizationSet` (Morpho), operator approvals — and assert that **no approval or authorization is granted as a side effect** beyond what the declared intent required.
- **Position stays non-liquidatable** after the bundle (health / LLTV buffer holds).

### Implementation Phases (milestones)

Priority order: **vaults first, then markets.** Each milestone ships its own checks plus the fork tests that prove them.

- **Milestone 1 — Requirements decode + Vault V1/V2 verification.** Build the shared Layer-A foundation (per-chain trust-list, signature/permit interception, recursive batch decode, trusted-router inner-action validation) and apply Layer B to **both Vault V1 (MetaMorpho) and Vault V2**: track ERC-4626 shares as an asset; verify `deposit`/`mint`/`withdraw`/`redeem` value diffs (assets ↔ shares) including realized-amount and slippage; allow `receiver ≠ from` for shares; verify **PublicAllocator fee**; and run the side-effect **`Approval`/authorization** state-diff check.
  - *Phase 1.1* — Per-chain trust-list (spenders/operators) from blue-sdk; `chainId`-scoped lookup.
  - *Phase 1.2* — Signature-request decode: EIP-2612 `permit` + Permit2 `SignatureTransfer`, spender/amount check.
  - *Phase 1.3* — Recursive batch decode (Multicall3, Safe `multiSend`, bundler3 multicall, 4337 userOps) + trusted-router inner-action validation.
  - *Phase 1.4* — Multi-asset value-diff engine (ERC20 + native + ERC-4626 shares), realized-amount / fee-on-transfer aware.
  - *Phase 1.5* — State-diff + event inspection: side-effect `Approval`/authorization detection; allowed non-`from` recipients.
  - *Phase 1.6* — Vault V1 + V2 e2e: deposit/mint/withdraw/redeem, PublicAllocator fee, fork tests at a pinned block.
- **Milestone 2 — Market V1 (Morpho Blue) transaction verification.** Extend the engine to market accounting and apply the full suite to market flows.
  - *Phase 2.1* — Debt & collateral positions as asset types in the value-diff engine (borrow increases debt; the diff must net the debt taken on).
  - *Phase 2.2* — `AuthorizationSet` verification on `Morpho`: only the expected adapter is authorized, and no authorization lingers as a side effect.
  - *Phase 2.3* — **Position non-liquidatable** invariant after the bundle (LLTV buffer / health).
  - *Phase 2.4* — Market V1 e2e: supply/withdraw loan asset, `supplyCollateral`/`borrow`/`repay`/`withdrawCollateral`, market callbacks & recipients, fork tests.

## Considered Alternatives

### Alternative 1: Balance-diff only, skip state/storage diffs

Keep reading balances and `Transfer` logs; add the new asset types but not the storage/event inspection.

**Why rejected:** the highest-severity exploit class — **a bundle that nets zero balance change but leaves a standing `approve`/`AuthorizationSet`** — is *invisible* to a balance-only view. State-diff + event inspection is the whole point of "effective result"; dropping it would ship a check that passes the most dangerous bundles.

### Alternative 2: Static decode only (no dynamic simulation)

Decode intent and trust-list-check spenders, but rely on the existing retention guard for outcomes.

**Why rejected:** static decode cannot see realized amounts (fee-on-transfer/rebasing), slippage, accrued debt, or liquidation health. Declared intent and effective result catch **different** failure classes; we need both layers, not one.

### Alternative 3: A new generic on-chain "tracer" backend

Build our own EVM tracer instead of consuming Tenderly / `eth_simulateV1` state-diff output.

**Why rejected:** enormous scope, duplicates what the backends already return, and breaks the package's I/O-at-the-edge rule. We already normalize backend output to `RawSimulationResult` — state diffs and full logs extend that, no new engine required.

## Assumptions & Constraints

- Both backends expose **state/storage diffs and full event logs** for a simulated bundle (Tenderly natively; `eth_simulateV1` via `stateDiff` + per-call logs). Where one backend is thinner (e.g. `eth_simulateV1` internal native transfers), the check **degrades to a typed warning**, never a silent pass — same discipline as the retention skip on unknown chains.
- Trust-list addresses (`GeneralAdapter1`, bundler3 adapters, `Permit2`) are sourced from `@morpho-org/blue-sdk` per `chainId`. Chains blue-sdk does not know **skip with a loud warn**, exactly as `getBundlerAddresses` does today.
- `viem` stays the only new-surface peer dependency; decoding uses `viem` ABI utilities + pinned Morpho/bundler ABIs. No runtime ABI fetch.
- New surface is **additive** (new findings, new asset types, new error classes, opt-in stages). Semver: **minor**.
- Every new error is a named subclass of `SimulationPackageError`; only `ExternalServiceError` stays caller-bypassable.

## Security

- **Two complementary trust boundaries.** Layer A stops the user from *signing* a grant to an untrusted spender; Layer B stops a bundle from *executing* an untrusted outflow or side-effect grant. Defense in depth: a bypass of one is caught by the other.
- **Side-effect grants are first-class findings.** The `Approval` / `AuthorizationSet` state-diff check is the primary defense against the "zero balance change, future drain" exploit and is **not** bypassable for known chains.
- **Recipients are allow-listed by role, not hardcoded.** Legitimate `receiver ≠ from` destinations (vault shares, 4337, bridges, callbacks) are recognised so the "unknown recipient" check has a low false-positive rate and stays trusted by integrators.
- **Liquidation safety is asserted, not assumed.** The market milestone verifies the position is non-liquidatable post-bundle, closing the gap where a borrow bundle simulates "successfully" yet lands the user one block from liquidation.
- **No new attack surface in the package itself.** All decoding is pure and offline; no signing, no network writes, no key handling.

## Future Considerations

- **More batch formats** as they appear (new bundler versions, alternative account-abstraction entry points).
- **Cross-chain / bridge intent** verification (destination-chain expectations) once bridge flows enter the SDK.
- **USD/price-aware value diff** as an optional layer for integrators who want a single net-value number rather than per-asset deltas.
- **Vault V2 adapter-specific checks** (per-adapter allow-lists) as the V2 adapter set grows.

## Open Questions

- Should trust-list checks be **hard errors or warnings by default**? Leaning: trust-list miss = error; backend-coverage gap (e.g. missing internal native trace) = warning.
- For ERC-4626 share valuation, do we compare **shares** directly, or convert to assets via `convertToAssets` at the simulated post-state? (Affects how slippage is expressed for vault flows.)

## References

- `packages/evm-simulation/src/simulate/simulate.ts` — the 5-stage pipeline this extends.
- `packages/evm-simulation/src/simulate/pipeline/bundler-retention.ts` — the existing "no loss" guard and the per-chain trust-list pattern to reuse.
- `packages/evm-simulation/src/simulate/parsing/transfers.ts` — current ERC20/WETH9 log parsing to generalise across asset types.
- `packages/evm-simulation/AGENTS.md` — staged-pipeline + typed-error conventions.
- [`TIB-2026-05-19`](./TIB-2026-05-19-marketv1-supply-withdraw-loan-asset.md) — MarketV1 supply/withdraw surface (reallocation + authorization context for Milestone 2).
- [Permit2](https://github.com/Uniswap/permit2) — `SignatureTransfer` typed data.
- [Linear — EVM simulation expansion](https://linear.app/morpho-labs/project/evm-simulation-expansion-15b5c85f08d6/overview)
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering), §2 (forbidden patterns), §3 (types), §5 (testing), §6 (JSDoc), §7 (release).
