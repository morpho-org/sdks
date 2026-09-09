# TIB-2026-06-15: EVM simulation — verify declared intent and effective result

| Field      | Value                                    |
| ---------- | ---------------------------------------- |
| **Status** | Proposed                                 |
| **Date**   | 2026-06-15                               |
| **Author** | @foulques                                |
| **Scope**  | Packages: `evm-simulation`, `morpho-sdk` |

---

## Context

`evm-simulation` previews transactions and checks that bundler3 retains no value. That is useful,
but it is not a safety verdict. A transaction can still request the wrong signature, hide an unsafe
nested call, leave an unexpected approval behind, under-deliver assets, or leave a Morpho position
too close to liquidation.

These risks appear at two different moments. Before signing, the user needs assurance that the
requested authority matches the intended chain, signer, route, assets, recipients, and limits.
After simulation, the caller needs assurance that the realized balances, positions, fees, and
authorizations match the package-defined effects of the selected interaction and the consumer's
bounds. Neither view is sufficient alone.

## Goals / Non-Goals

**Goals**

- Add an opt-in, fail-closed safety verdict covering declared intent and simulated effects.
- Prevent unsafe signature requests before the wallet prompt.
- Apply protocol-aware checks and conservative economic defaults.
- Preserve existing preview behavior for callers that do not opt in.

**Non-Goals**

- General-purpose protocol decoding, price-oracle valuation, or cross-asset fairness checks.
- Safe, ERC-4337, EIP-7702, `DELEGATECALL`, bridge, or cross-chain verification in the first
  release.
- Support for non-standard ERC-20 behavior such as rebasing or fee-on-transfer.
- Automatic remediation, transaction rewriting, signing, or execution.
- Package-wide coverage on day one. Midnight and VaultExitBundlesV1 require later scope.

## Proposed Solution

Add a separate verified path with two mandatory gates:

1. **Declared-intent verification** authenticates what the user is asked to sign or send.
2. **Effective-result verification** checks that the exact simulated transaction stays within the
   package-defined effect contract for the authenticated interaction.

A verified result exists only when both gates complete. Unsafe input, unsupported execution, or
incomplete evidence fails closed; warnings never substitute for a verdict.

The existing preview remains unchanged. Verified simulation must not require a vendor-specific
service, and switching evidence providers can never turn a revert or unsafe verdict into a safe
one.

### Supported scope and routes

Delivery remains vaults first, then markets:

- **Vault milestone:** canonical Vault V1 and Vault V2 deposit, mint, withdraw, and redeem flows.
- **Morpho Blue milestone:** the canonical high-level route for the supported SDK major. For
  `morpho-sdk` 6, that route is BlueBundlesV1, including its funding and Morpho authorization
  targets. The legacy Bundler3/GeneralAdapter1 route is separate compatibility scope, never an
  automatic fallback.

### Gate 1 — declared intent

The consumer identifies the interaction and supplies the authority-bearing artifacts:

| Consumer input | Requirement | Default |
| --- | --- | --- |
| Interaction | Supported operation type; source and target protocol positions; amounts and asset-or-share mode for each selected leg; funder, owner, on-behalf account, and receiver; supported route options | None for required values; canonical route and no optional legs or reallocations |
| Chain and identities | Exact chain ID, bundle sender, and expected signer or signers | None |
| Signing request | Exact typed data for every wallet request; omitted only when the interaction requires no signature | Empty |
| Transaction intent | Complete transactions and every committed callback payload once available | None |
| External execution policy | For each external executor: chain, address, role, and supported call semantics | Empty; no external executor is trusted |

The gate succeeds only when all of the following hold:

- Every transaction, nested call, optional call, and callback is inside the supported execution
  scope. Callback payloads match their commitments.
- The transaction chain and bundle sender, decoded operation, selected legs, targets, amounts,
  modes, accounts, and recipients match the interaction. Every call required by its canonical
  route is present, and no extra call is present.
- Every Morpho contract, spender, and operator matches the pinned chain registry and selected
  protocol route. A trusted router or callback role grants no additional authority.
- Every signature request matches its supported schema, domain, chain, verifying contract, signer,
  owner or authorizer, token, spender or operator, amount, nonce, and time bounds, and corresponds
  to exactly one grant required by the selected interaction.
- External executors match the complete supplied policy. An address alone is not sufficient, and
  the policy may narrow trust but can never add an allowed effect.
- There are no unmatched signatures, grants unrelated to the interaction, malformed calls, opaque
  leaves, or unsupported envelopes.

The initial signature scope is EIP-2612, the Permit2 mechanism used by the selected route, and
Morpho authorization in the Blue milestone. Other permit or account-signature schemes remain
unsupported until explicitly scoped.

A successful gate binds the interaction and its parameters to the exact signing and transaction
intent. Existing Morpho signing flows must be able to run this gate before displaying the wallet
prompt.

### Gate 2 — effective result

The consumer does not supply expected balance or position deltas. The package owns a fixed,
exhaustive effect contract for each supported interaction; consumers cannot replace or extend it.
The consumer supplies the interaction and exact transaction once through Gate 1, then supplies
only the resulting signatures and optional economic bounds for Gate 2:

| Consumer input | Requirement | Default |
| --- | --- | --- |
| Authenticated intent | Successful Gate 1 result binding the interaction to the exact sendable transaction | None |
| Signatures | Every signature produced from the authenticated requests | Empty when none are required |
| Maximum adverse conversion slippage | Optional per-asset limit on a variable input excess or output shortfall, relative to the canonical conversion at simulation start | 0.5% (50 bps) |
| Maximum share-price or accrual drift | Optional limit for each protocol asset/share conversion | 0.03% (3 bps) |
| Maximum additional protocol or reallocation fee | Optional absolute cap for each fee asset | Zero; network gas excluded |
| Maximum resulting LTV | Optional limit for each affected debt position | LLTV minus 0.5 percentage points, floored at zero, for risk-increasing operations; pre-simulation LTV for pure risk-reducing operations |

Omitted bounds use these defaults. Consumers may override slippage, must explicitly accept every
non-zero fee, and may only tighten the package's LTV ceiling. When both slippage limits apply to one
variable leg, the tighter one wins. Economic inputs can never relax trust, recipient,
authorization, or retention invariants.

The package-defined effect contracts are:

| Interaction | Exact effects | Bounded effects |
| --- | --- | --- |
| Vault deposit | The funder spends the selected asset amount | The receiver's raw-share increase cannot fall below the canonical conversion after the applicable slippage bounds |
| Vault mint | The receiver gains the selected raw-share amount | The funder's asset spend cannot exceed the canonical conversion after the applicable slippage bounds |
| Vault withdraw | The receiver gains the selected asset amount | The owner's raw-share burn cannot exceed the canonical conversion after the applicable slippage bounds |
| Vault redeem | The owner's selected raw-share amount is burned | The receiver's asset gain cannot fall below the canonical conversion after the applicable slippage bounds |
| Blue supply | The funder spends the selected loan-asset amount | The on-behalf position's supply-share increase must respect the applicable conversion bounds |
| Blue withdraw | In asset mode, the receiver gains the selected loan-asset amount; in share mode, the on-behalf position burns the selected supply-share amount | The unselected asset-or-share counter-leg must respect the applicable conversion bounds |
| Blue supply collateral | The funder spends and the on-behalf position gains the selected collateral amount | None |
| Blue borrow | The receiver gains the selected loan-asset amount | The on-behalf position's debt-share increase must respect the applicable conversion bounds and resulting-LTV limit |
| Blue repay | In asset mode, the funder spends the selected loan-asset amount; in share mode, the on-behalf position burns the selected debt-share amount | The unselected asset-or-share counter-leg must respect the applicable conversion bounds |
| Blue withdraw collateral | The on-behalf position loses and the receiver gains the selected collateral amount | The resulting position must respect the applicable LTV limit |
| Blue supply collateral and borrow | The exact effects of both selected legs occur | Only the borrow debt-share increase and resulting LTV are bounded |
| Blue repay and withdraw collateral | The exact effects of both selected legs occur | The repay counter-leg and resulting LTV use their respective bounds |
| Blue refinance | The selected collateral amount moves from source to target; asset mode moves the selected loan-asset debt from source to target; share mode burns the selected source debt shares | Only share-mode target-debt overshoot may vary, within the conversion and accrual bounds; fees and both resulting positions stay within their respective bounds; no unrelated position changes |

The effect contract also fixes every supported route overlay. Native wrapping conserves the selected
amount and leaves no router residue. Reallocations move only the selected liquidity between the
named markets and charge only the accepted fee asset and amount. Required allowance,
authorization, and nonce changes are exact. An overlay omitted from the interaction's package rule
fails rather than becoming consumer-configurable.

At the end of simulation, all of the following must hold:

- Every simulated transaction and call succeeds without a revert. The transaction and recovered
  signers match the authenticated intent exactly, and all required execution and final-state
  evidence is present.
- Every required effect occurs in the permitted direction and amount, every variable leg stays
  within its supplied or default bound, and no observed change falls outside the package-defined
  effects, bounded accrual, or route overlays. Network-gas deltas are excluded from effect
  matching, and different assets are never netted into one value judgment.
- Derived Morpho Blue supply assets round down and derived debt assets round up.
- Every realized recipient matches the interaction's receiver or other package-defined recipient.
- Every protocol or reallocation charge stays within the cap for its actual asset. PublicAllocator
  V1 fees are native-token charges; Vault V2 BluePublicAllocator penalties are loan-token charges.
- Final ERC-20 allowances by owner and spender, Permit2 allowances by owner, token, and spender
  including amount, expiration, and nonce, and Morpho authorizations by authorizer and operator
  match the package-defined post-state exactly. Unchanged pre-existing grants are not side effects;
  persistent authority is allowed only when the interaction contract permits it for the selected
  route.
- Guarded vault deposits preserve the canonical share-price inflation protection.
- Risk-increasing operations finish at or below their accepted LTV limit. Pure repayment and
  collateral addition do not worsen LTV, allowing incremental recovery from an already-unsafe
  position.
- The existing bundler-retention invariant still passes.

A successful result reports the authenticated interaction and matched package-defined effects
alongside the ordinary simulation result. It certifies the simulated transaction at that state; it
does not turn a direct exit or other snapshot into an execution-time slippage guarantee.

### Compatibility and release

The change is additive, leaves existing simulation callers unchanged, and keeps the two packages
decoupled. It follows the repository's existing dependency and release policy.

## Considered Alternatives

- **Consumer-authored effect vectors:** rejected because they duplicate protocol semantics at every
  call site and can bless an incomplete or incorrect outcome. Interaction parameters and economic
  bounds express everything the consumer should decide.
- **Balance effects only:** rejected because a zero balance change can still leave a future-drain
  authorization.
- **Static intent only:** rejected because it cannot prove realized amounts, fees, debt, or health.
- **A new tracing backend:** rejected because the missing capability is safety policy, not another
  execution engine.
- **Changing the existing preview:** rejected because it would turn an additive safety feature
  into a compatibility break.
- **Warnings or incomplete verdicts:** rejected because an ignored branch would become a security
  bypass.

## Acceptance Criteria

- Consumers provide a supported interaction and its parameters, not an arbitrary expected-effect
  vector. Adding or changing an effect contract requires a package release.
- Unsafe or mismatched signature intent is rejected before a wallet prompt.
- Canonical Vault and Blue routes pass only with their registered spenders, operators, recipients,
  and supported signature mechanisms.
- Nested, callback-triggered, unknown, and externally routed calls obey the same trust boundary.
- Realized assets, positions, fees, recipients, and authorizations match the selected interaction's
  package-defined effect contract; missing evidence cannot produce a verified result.
- PublicAllocator V1 native fees and BluePublicAllocator loan-token penalties use separate
  per-asset limits.
- Risk-increasing operations respect the buffered LTV ceiling, while pure repayment and collateral
  addition can improve an already-unsafe position incrementally.
- Every evidence provider enforces the same verdict, the legacy preview remains unchanged, and
  repository-standard tests prove every supported path and security invariant.

## Assumptions & Constraints

- A backend must expose sufficient evidence for every applicable check. Otherwise verification is
  unavailable.
- Protocol addresses and ABIs remain pinned in maintained SDK packages.
- Verification certifies the simulated transaction at a particular state, not future state
  changes. On-chain limits remain the final protection where available.
- The first release assumes standard ERC-20 semantics and measures each asset independently.

## Security

The safety boundary includes every authority granted and every effect realized. A trusted outer
call cannot hide an untrusted inner target, and a legitimate role cannot substitute for an exact
address. Approvals and authorizations outside the selected interaction's effect contract fail even
when balances return to their starting values.

Vault inflation resistance, bundler retention, recipient checks, route-specific authorization,
and position health are mandatory. User-selected economic bounds never disable them.

## References

- [`eth_simulateV1` Execution API](https://ethereum.github.io/execution-apis/api/methods/eth_simulateV1/)
- [BlueBundlesV1 routing decision](https://github.com/morpho-org/sdks/blob/main/docs/tibs/TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [TIB-2026-05-19](./TIB-2026-05-19-marketv1-supply-withdraw-loan-asset.md)
- [Permit2](https://github.com/Uniswap/permit2)
- [EVM simulation expansion](https://linear.app/morpho-labs/project/evm-simulation-expansion-15b5c85f08d6/overview)
- Root [engineering rules](../../AGENTS.md)
