# TIB-2026-06-15: EVM simulation — verify declared intent and effective result

| Field      | Value                       |
| ---------- | --------------------------- |
| **Status** | Proposed                    |
| **Date**   | 2026-06-15                  |
| **Author** | @foulques                   |
| **Scope**  | Package: `evm-simulation`   |

---

## Context

`evm-simulation` previews a bundle through Tenderly first, falling back to `eth_simulateV1`, and today guarantees exactly one thing: **no value is retained by bundler3** (`assertNoBundlerRetention`, net `(bundler3, token)` flow above `DUST_THRESHOLD`). It also parses token/native transfers and surfaces per-account balance deltas.

That is a narrow guarantee. "Nothing got stuck in the bundler" does not mean "the user is safe". A bundle can pass the retention check and still:

- ask the user to sign an `approve` or a Permit2 transfer to a **spender that is not ours**;
- hide the dangerous call **nested inside a batch** (Multicall3, Safe `multiSend`, bundler3 multicall, a 4337 `userOp`) so the outer `to` looks trusted;
- end with **balance delta = 0** but leave a **standing allowance or authorization** behind — a future drain, invisible to a balance-only check;
- change **value or positions the parser cannot interpret**: vault shares appear only as generic token transfers, while debt and LP state are not represented at all;
- **under-deliver** on the amount the user expected, where the realized amount differs from the encoded one (e.g. slippage on a swap).

`eth_simulateV1` now exposes the call results, logs, and internal native-ETH movements needed for the ordinary verification path. It should therefore become the default: consumers can use an RPC they already operate without making a vendor-specific service or credential part of every simulation. Tenderly remains valuable as an independent fallback when that path is unavailable or cannot provide a complete verdict.

Effective-result verification also needs an explicit economic safety envelope. A technically successful bundle is not acceptable when it exceeds the consumer's tolerance for slippage or fees, or leaves a position closer to liquidation than the consumer accepts. Shared defaults prevent each integration from inventing — or omitting — that policy, while optional inputs let products state their own risk posture.

This TIB freezes the product contract for expanding the package along two axes — **declared intent** (before signing) and **effective result** (after simulating) — prioritised **vaults first, then markets**, matching where the SDK's surface and integrator demand are heaviest.

## Goals / Non-Goals

**Goals**

- Verify the **declared intent** of a bundle statically, including at signature-request time: decode approvals and signatures **recursively through batches and bundler3 callback payloads**, require every spender on a **per-chain allowlist**, and authenticate each callback payload against its commitment. Calls marked `skipRevert` remain subject to every trust check and are optional only when no callback is committed; simulation determines whether those optional calls took effect.
- Verify the **effective result** dynamically: each asset's realized diff (ERC20, native, vault shares, debt/LP) **matches the declared expectation**, based on the simulated post-state and events, not balance alone — and **no allowance or authorization is granted as a side effect**.
- Use **`eth_simulateV1` as the primary simulation path** and Tenderly as the fallback, applying the same acceptance policy and making any backend coverage gap explicit.
- Let consumers optionally set the **maximum accepted asset-delivery slippage, maximum accepted protocol/reallocation fees, and maximum resulting LTV for every affected position**. Safe defaults apply when they omit any of these inputs.
- Deliver in priority order: **Milestone 1** = Vault V1 (MetaMorpho) + Vault V2 + the shared static-decode "requirements" layer; **Milestone 2** = Market V1 (Morpho Blue) transactions.
- Keep every new failure mode a named, exported subclass of `SimulationPackageError`; keep the staged pipeline shape.
- 100% JSDoc + colocated `*.spec.ts` unit tests + fork tests on every new path, in the same PR as the code.

**Non-Goals**

- No new on-chain execution backend. `eth_simulateV1` / Tenderly stay the only simulation engines; we consume their simulation evidence, we do not replace them.
- No general-purpose calldata decoder for arbitrary protocols. We decode the batch wrappers and the Morpho/bundler action set — not every DEX or third-party adapter.
- No automatic remediation. The package **reports typed findings**; it never rewrites or re-signs a bundle.
- No price oracle / USD valuation. "Value" is measured per-asset against the bundle's own declared expectation, not a fiat number.
- **No cross-asset net-value computation.** Each asset is checked against its own declared expectation; we do not net different asset types against each other (e.g. a swap A → B), which would require a price. Netting across asset types is too complex to do correctly for now.
- **Standard ERC-20 semantics only.** Non-standard tokens — fee-on-transfer, rebasing, ERC-777 hooks, double-entry-point / return-false tokens — are out of scope; Morpho flows have only ever used standard ERC-20s.
- **No account-level grant verification (EIP-7702).** Delegating an EOA's code via an EIP-7702 authorization is a wallet/account-level concern, not something this package can reliably verify at the application layer.
- No new runtime dependency without a package-level justification in the PR.

## Current Solution

The 5-stage pipeline (`src/simulate/simulate.ts`): validate input → build simulation txs (resolve signature authorizations to `approve` calldata) → execute through Tenderly when configured and fall back to `eth_simulateV1` only when Tenderly is unavailable → parse token/native transfers → `assertNoBundlerRetention`. Asset coverage is generic balance movement, without semantic treatment of vault shares or debt/LP positions. The only trust-list is the per-chain `bundler3` address set pulled from `@morpho-org/blue-sdk`, used solely to detect retention. There is no static verification of intent, no inspection of resulting approvals or authorizations, and no protocol awareness of vaults vs markets.

## Proposed Solution

Two complementary verification layers cover what the user is asked to authorize and what the simulated bundle actually does. Each check is independent and returns a **typed finding**; this TIB commits to the outcome, not a specific evidence-normalization design.

### Simulation availability and economic defaults

When both backends are available, `eth_simulateV1` is primary and Tenderly is the fallback. This keeps routine verification on the consumer's RPC path while preserving continuity when that path does not support simulation, is temporarily unavailable, or cannot supply the evidence required for a complete verdict. A bundle revert or safety finding is an outcome, not a backend failure, and does not trigger fallback. Backend coverage gaps are always explicit; they never silently turn a failed or incomplete check into a pass.

Consumers may optionally size the acceptance envelope for each simulation. Omitted inputs use defaults already established by the SDK and Morpho applications:

- **Maximum adverse asset-delivery slippage: 0.5% (50 bps).** This follows the Morpho application's established default for its former swap-backed leverage and deleverage flows. Morpho share-price and accrual guards retain their separate, tighter 0.03% (3 bps) operation-level default; the two limits protect different risks.
- **Maximum additional protocol/reallocation fee: zero unless explicitly accepted, excluding network gas.** A consumer may declare an absolute cap for each fee asset; observed fees must stay under that cap, and a PublicAllocator fee must also match its accepted native-token amount. This mirrors the application, which asks for acceptance of every non-zero reallocation fee.
- **Maximum resulting LTV for every affected debt-bearing position: that position's LLTV minus an absolute 0.5 percentage-point buffer, floored at zero.** This matches `DEFAULT_LLTV_BUFFER`, the SDK's existing safe-position ceiling. A consumer may pass a tighter product threshold, such as the application's 95%-of-protected-LLTV target.

These inputs express product risk appetite; they do not relax spender, recipient, authorization, or bundler-retention checks.

### Layer A — Static decode (declared intent)

What the user is *being asked to authorize*, checked **before** the bundle is sent.

- **Per-chain allowlist of spenders/operators — deny by default.** The only addresses authorized to receive an approval or signed grant are **`GeneralAdapter1`** and **`Permit2`**, scoped **by `chainId`** (sourced from `@morpho-org/blue-sdk`). This is an *allowlist*, not a denylist: every other spender is flagged. In particular the **bundler3 dispatcher is deliberately excluded** — per bundler3's security model it receives no approvals and could move funds, so a grant to it is a red flag even though it is a Morpho address (only individual adapters are safe to approve). An `approve`, an EIP-2612 `permit`, or a Permit2 grant whose **spender** is not on the allowlist is flagged.
- **Intercept at the signature request, not only the calldata.** Off-chain signatures never produce a `Transfer` log, so a balance-only or calldata-only view misses them entirely. We decode the **typed-data being signed** — EIP-2612 `permit` and Permit2 grants — and check the granted **spender** against the allowlist. The **amount and deadline/expiration are not part of the security model**: `GeneralAdapter1` is a static, trusted component, so the property that matters is *who* receives the grant, not how much or for how long.
- **Recursive batch decode.** The sensitive action is usually nested. We unwrap **Multicall3**, **Safe `multiSend`**, the **bundler3 multicall**, and **ERC-4337 `userOp` / `handleOps`**, recursively, and run every leaf call through the same checks.
- **Cover callback-triggered and optional bundler3 calls.** Intent verification includes every call that may execute through `reenter(Call[])`, including nested actions such as swaps, and confirms that the supplied callback payload matches its parent call's `callbackHash` commitment. A missing, unsupported, or mismatched payload cannot produce a clean verdict; otherwise sensitive actions could hide behind a trusted outer `to`. A `skipRevert=true` call with no callback commitment remains subject to every check because it may succeed, while Layer B determines whether its effects occurred. When `callbackHash` is nonzero, the committed callback remains mandatory even if `skipRevert` is set.
- **Validate resolved targets inside trusted routers and callbacks.** A matching `callbackHash` proves payload consistency, not that the addresses inside it are trusted. A trusted entry point (e.g. `GeneralAdapter1`) or a callback role can still be instructed to route value to an untrusted address. The internal action list and every resolved execution target — including a selected flashloan provider or Paraswap Augustus router — must therefore pass the chain-scoped address allowlist; the trusted outer address or role alone is insufficient.

### Layer B — Dynamic simulation (effective result)

What *actually happened*, from the simulated **post-state and events** — not balances alone.

- **Conformance to the declared expectation, per asset type.** For each asset the bundle touches — **ERC20, native ETH, ERC-4626 vault shares, and debt/LP positions** (today transfers are parsed without vault/debt/LP semantics) — the realized diff must match the integrator's **declared expected amount** for that asset within the accepted slippage envelope. Layer B verifies *conformance to declared intent*, **not fairness**: it does not net value *across* asset types (a swap of A → B has no common unit without a price — a Non-Goal), and it cannot judge whether a declared expectation is itself a good deal.
- **Realized amount, not encoded amount.** Measure what the receiver actually got — the realized diff can differ from the encoded amount through slippage on a swap. **Standard ERC-20 semantics are assumed** (see Non-Goals); non-standard tokens are out of scope.
- **Protocol and reallocation fees stay within the accepted per-asset envelope**, and any **PublicAllocator fee matches the accepted native-token amount** (vault/market reallocation). Network gas is not part of this fee envelope.
- **Every outflow recipient is verified by resolved address.** A receiver different from the sender can be legitimate for vault `deposit`/`mint`, bridges, smart-account / 4337 flows, and callbacks, but its exact address must match the declared intent or a chain-scoped destination allowlist. A callback role never confers trust: the resolved target — such as a flashloan provider or Paraswap Augustus router — must itself be allow-listed before it may route or receive value.
- **Authorization effects, not just balance effects.** A bundle can finish with **balance delta = 0 yet leave a standing allowance or authorization** → a future drain. The resulting state and events — `Approval` (ERC20 + Permit2), `AuthorizationSet` (Morpho), operator approvals — must show that **no approval or authorization is granted as a side effect** beyond what the declared intent required.
- **Every affected debt-bearing position stays at or below its accepted LTV threshold** after the bundle, rather than merely remaining non-liquidatable.

### Implementation Phases (milestones)

Priority order: **vaults first, then markets.** Each milestone ships its own checks plus the fork tests that prove them.

- **Milestone 1 — Requirements decode + Vault V1/V2 verification.** Build the shared Layer-A foundation (per-chain spender allowlist, signature/permit interception, recursive batch decode, trusted-router inner-action validation) and apply Layer B to **both Vault V1 (MetaMorpho) and Vault V2**: track ERC-4626 shares as an asset; verify `deposit`/`mint`/`withdraw`/`redeem` value diffs (assets ↔ shares) conform to the declared expectation including realized-amount and slippage; verify every `receiver ≠ from` by resolved address; verify **PublicAllocator fee**; and run the side-effect **`Approval`/authorization** result-state check.
  - *Phase 1.1* — Per-chain spender allowlist (`GeneralAdapter1`, `Permit2`) from blue-sdk; `chainId`-scoped lookup, deny by default.
  - *Phase 1.2* — Signature-request decode: EIP-2612 `permit` + Permit2 grant, **spender allowlist check** (amount/expiration are out of the model).
  - *Phase 1.3* — Recursive coverage of supported batch and callback paths, including supplied callback-payload / `callbackHash` validation, checks on every callback leaf and resolved target, correct required-vs-optional treatment of `skipRevert`, and trusted-router inner-action validation.
  - *Phase 1.4* — Multi-asset value-diff engine (ERC20 + native + ERC-4626 shares), realized-amount aware, **conformance to declared expectations per asset within the accepted slippage and fee envelope** (standard ERC-20 semantics assumed).
  - *Phase 1.5* — Side-effect `Approval`/authorization verification; resolved-address verification for non-`from` recipients.
  - *Phase 1.6* — Vault V1 + V2 e2e: deposit/mint/withdraw/redeem, PublicAllocator fee, fork tests at a pinned block.
- **Milestone 2 — Market V1 (Morpho Blue) transaction verification.** Extend the engine to market accounting and apply the full suite to market flows.
  - *Phase 2.1* — Debt & collateral positions as asset types in the value-diff engine (borrow increases debt; the diff must net the debt taken on).
  - *Phase 2.2* — `AuthorizationSet` verification on `Morpho`: only the expected adapter is authorized, and no authorization lingers as a side effect.
  - *Phase 2.3* — **Resulting-LTV thresholds** for every affected position after the bundle, using the consumer's values or the safe defaults.
  - *Phase 2.4* — Market V1 e2e: supply/withdraw loan asset, `supplyCollateral`/`borrow`/`repay`/`withdrawCollateral`, market callbacks & recipients, fork tests.

## Considered Alternatives

### Alternative 1: Balance effects only, skip resulting authorization state

Keep reading balances and `Transfer` logs; add the new asset types but do not verify resulting approvals or authorizations.

**Why rejected:** the highest-severity exploit class — **a bundle that nets zero balance change but leaves a standing `approve`/`AuthorizationSet`** — is *invisible* to a balance-only view. Resulting authorization state is central to the "effective result" guarantee; dropping it would ship a check that passes the most dangerous bundles.

### Alternative 2: Static decode only (no dynamic simulation)

Decode intent and allowlist-check spenders, but rely on the existing retention guard for outcomes.

**Why rejected:** static decode cannot see realized amounts, slippage, accrued debt, or liquidation health. Declared intent and effective result catch **different** failure classes; we need both layers, not one.

### Alternative 3: A new generic on-chain "tracer" backend

Build our own EVM tracer instead of deriving the required evidence from `eth_simulateV1` / Tenderly simulations.

**Why rejected:** enormous scope, duplicates existing simulation capabilities, and breaks the package's I/O-at-the-edge rule. The package already normalizes backend results; this proposal needs stronger verification outcomes, not another execution engine.

### Alternative 4: Keep Tenderly as the primary backend

Preserve the current backend order and use `eth_simulateV1` only after Tenderly fails.

**Why rejected:** `eth_simulateV1` now provides the ordinary call, log, and native-transfer evidence needed to lead the verification path. Making Tenderly routine would keep every simulation dependent on a vendor-specific service and credential without a stronger baseline guarantee. Tenderly provides more value as an independent continuity path.

## Assumptions & Constraints

- `eth_simulateV1` exposes per-call results and logs, including internal native moves when `traceTransfers` is enabled ([#803](https://github.com/morpho-org/sdks/pull/803)); Tenderly exposes comparable execution evidence through its simulation service. The proposed checks also need reliable evidence of resulting balances, positions, approvals, and authorizations. Both paths must either provide a complete verdict or expose the missing coverage explicitly; neither may silently pass an unverified outcome. This TIB does not prescribe how that evidence is collected or normalized.
- Morpho spender/operator allowlist addresses (`GeneralAdapter1`, `Permit2`) are sourced from `@morpho-org/blue-sdk` per `chainId`. Callback targets and other trusted destinations are likewise evaluated by their resolved, chain-scoped address; a semantic role alone never grants trust. If the chain or a required target cannot be resolved, verification reports the coverage gap and cannot return a clean verdict.
- `viem` stays the only new-surface peer dependency; decoding uses `viem` ABI utilities + pinned Morpho/bundler ABIs. No runtime ABI fetch.
- New surface is **additive** (new findings, new asset types, new error classes, opt-in stages). Semver: **minor**.
- Every new error is a named subclass of `SimulationPackageError`; only `ExternalServiceError` stays caller-bypassable.

## Security

- **Two complementary trust boundaries.** Layer A stops the user from *signing* a grant to an untrusted spender; Layer B stops a bundle from *executing* an untrusted outflow or side-effect grant. Defense in depth: a bypass of one is caught by the other.
- **Side-effect grants are first-class findings.** The resulting `Approval` / `AuthorizationSet` check is the primary defense against the "zero balance change, future drain" exploit and is **not** bypassable for known chains.
- **Recipients are verified by resolved address, never trusted by role alone.** Legitimate `receiver ≠ from` destinations must match the declared intent or a chain-scoped allowlist. In particular, a callback target is trusted only when its resolved address is allow-listed, preventing an attacker-chosen provider or router from inheriting trust from the callback role.
- **Liquidation safety is asserted against the consumer's threshold, not assumed from transaction success.** The safe default preserves the SDK's 0.5 percentage-point LLTV buffer; products can require more headroom without forking the verifier.
- **Economic policy cannot disable security invariants.** Consumer-selected slippage, fee, and LTV limits never permit an untrusted spender, recipient, authorization, or bundler-retention outcome.
- **No new attack surface in the package itself.** All decoding is pure and offline; no signing, no network writes, no key handling.

## Future Considerations

- **More batch formats** as they appear (new bundler versions, alternative account-abstraction entry points).
- **Cross-chain / bridge intent** verification (destination-chain expectations) once bridge flows enter the SDK.
- **USD/price-aware value diff** as an optional layer for integrators who want a single net-value number rather than per-asset deltas.
- **Vault V2 adapter-specific checks** (per-adapter allow-lists) as the V2 adapter set grows.

## Open Questions

- **Residual-allowance baseline — resolved via the spender allowlist.** bundler3 flows legitimately rely on a **standing Permit2 allowance to `GeneralAdapter1`** (`approve2` / AllowanceTransfer) that persists across bundles *by design*. Because amount and expiration are out of the model (only the spender matters), the baseline is simply: a residual allowance whose **spender is on the allowlist** (`GeneralAdapter1`, `Permit2`) is expected; a residual grant to **any other spender** trips a finding. No per-(spender, token) amount/delta policy is needed.
- Should allowlist checks be **hard errors or warnings by default**? Leaning: allowlist miss = error; backend-coverage gap = warning.
- For ERC-4626 share valuation, do we compare **shares** directly, or convert to assets via `convertToAssets` at the simulated post-state? (Affects how slippage is expressed for vault flows.) **Robustness to in-bundle share-price manipulation (inflation attack) is likely out of scope** — doing it properly is hard, and we lean toward not implementing it unless a simple approach emerges.

## References

- `packages/evm-simulation/src/simulate/simulate.ts` — the 5-stage pipeline this extends.
- `packages/evm-simulation/src/simulate/pipeline/bundler-retention.ts` — the existing "no loss" guard and the per-chain trust-list pattern to reuse.
- `packages/evm-simulation/src/simulate/parsing/transfers.ts` — current token/native transfer parsing to generalise across asset types.
- `packages/evm-simulation/AGENTS.md` — staged-pipeline + typed-error conventions.
- `packages/blue-sdk/src/constants.ts` — existing 0.03% operation-level share-price/accrual slippage tolerance.
- `packages/morpho-sdk/src/helpers/constant.ts` — existing absolute 0.5 percentage-point LLTV buffer.
- [`eth_simulateV1` Execution API](https://ethereum.github.io/execution-apis/api/methods/eth_simulateV1/) — primary-backend call and log contract.
- [morpho-apps swap-backed flow defaults](https://github.com/morpho-org/morpho-apps/blob/5d89ee4a05623a0579097b30fe1bee70ce4b185e/apps/vvrm-app/src/helpers/swap/multiply.ts#L13-L17) — historical 0.5% asset-delivery slippage default.
- [morpho-apps PublicAllocator fee acceptance](https://github.com/morpho-org/morpho-apps/blob/17b6f19068420c5fdaebaa5f473f970b712b4dfe/apps/vvrm-app/src/components/common/PublicAllocatorFeePopover/usePublicAllocatorFeePopover.ts) — explicit acceptance for every non-zero reallocation fee.
- [morpho-apps resulting-LTV policy](https://github.com/morpho-org/morpho-apps/blob/17b6f19068420c5fdaebaa5f473f970b712b4dfe/apps/vvrm-app/src/hooks/operation/market/marketMaxLtv.ts) — SDK safety ceiling plus a tighter application-level threshold.
- [`TIB-2026-05-19`](./TIB-2026-05-19-marketv1-supply-withdraw-loan-asset.md) — MarketV1 supply/withdraw surface (reallocation + authorization context for Milestone 2).
- [Permit2](https://github.com/Uniswap/permit2) — `SignatureTransfer` typed data.
- [Linear — EVM simulation expansion](https://linear.app/morpho-labs/project/evm-simulation-expansion-15b5c85f08d6/overview)
- Root [`AGENTS.md`](../../AGENTS.md) §1 (layering), §2 (forbidden patterns), §3 (types), §5 (testing), §6 (JSDoc), §7 (release).
