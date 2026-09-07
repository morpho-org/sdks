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
nested call, leave an undeclared approval behind, under-deliver assets, or leave a Morpho position
too close to liquidation.

These risks appear at two different moments. Before signing, the user needs assurance that the
requested authority matches the intended chain, signer, route, assets, recipients, and limits.
After simulation, the caller needs assurance that the realized balances, positions, fees, and
authorizations match the declared outcome. Neither view is sufficient alone.

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
2. **Effective-result verification** checks that the exact simulated transaction produces the
   authenticated, declared outcome.

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

The consumer supplies the authority it expects the transaction to request:

| Consumer input | Requirement | Default |
| --- | --- | --- |
| Chain and identities | Exact chain ID, bundle sender, and expected signer or signers | None |
| Signing intent | Exact typed data and expected grant for every wallet request | None |
| Transaction intent | Complete transactions and every committed callback payload once available | None |
| External execution policy | For each external executor: chain, address, role, and supported call semantics | Empty; no external executor is trusted |

The gate succeeds only when all of the following hold:

- Every transaction, nested call, optional call, and callback is inside the supported execution
  scope. Callback payloads match their commitments.
- Every Morpho contract, spender, and operator matches the pinned chain registry and selected
  protocol route. A trusted router or callback role grants no additional authority.
- Every signature request matches its supported schema, domain, chain, verifying contract, signer,
  owner or authorizer, token, spender or operator, amount, nonce, and time bounds, and corresponds
  to exactly one declared action.
- External executors match the complete supplied policy. An address alone is not sufficient.
- There are no unmatched signatures, undeclared grants, malformed calls, opaque leaves, or
  unsupported envelopes.

The initial signature scope is EIP-2612, the Permit2 mechanism used by the selected route, and
Morpho authorization in the Blue milestone. Other permit or account-signature schemes remain
unsupported until explicitly scoped.

A successful gate authenticates the exact signing and transaction intent. Existing Morpho signing
flows must be able to run this gate before displaying the wallet prompt.

### Gate 2 — effective result

The consumer supplies the outcome and economic limits it expects:

| Consumer input | Requirement | Default |
| --- | --- | --- |
| Authenticated intent | Successful Gate 1 result | None |
| Sendable transaction and signatures | Exact transaction and every required signature | None |
| Declared effects | Expected changes for every touched asset, position, recipient, fee, and authorization | None; undeclared effects fail |
| Maximum adverse asset-delivery slippage | Optional per-asset limit | 0.5% (50 bps) |
| Maximum additional protocol or reallocation fee | Optional absolute cap for each fee asset | Zero; network gas excluded |
| Maximum resulting LTV | Optional limit for each affected debt position | LLTV minus 0.5 percentage points, floored at zero, for risk-increasing operations; pre-simulation LTV for pure risk-reducing operations |

Existing operation-level share-price and accrual guards retain their tighter 0.03% (3 bps) default.
Consumers may choose stricter limits, but economic inputs can never relax trust, recipient,
authorization, or retention invariants.

At the end of simulation, all of the following must hold:

- The simulated transaction and recovered signers match the authenticated intent exactly, and all
  required execution and final-state evidence is present.
- Each realized ERC-20 and native-asset delta matches its declared expectation within the accepted
  per-asset slippage. Different assets are never netted into one value judgment.
- Vault deposits match declared assets spent and minimum raw shares received; mints match maximum
  assets spent and raw shares received; withdrawals match assets received and maximum raw shares
  burned; redeems match raw shares burned and minimum assets received.
- Morpho Blue supply shares, borrow shares, and collateral match their declared changes. Derived
  supply assets round down and debt rounds up.
- Every realized recipient matches the declared recipient.
- Every protocol or reallocation charge stays within the cap for its actual asset. PublicAllocator
  V1 fees are native-token charges; Vault V2 BluePublicAllocator penalties are loan-token charges.
- Final ERC-20 allowances by owner and spender, Permit2 allowances by owner, token, and spender
  including amount, expiration, and nonce, and Morpho authorizations by authorizer and operator
  contain no undeclared new or increased authority. Unchanged pre-existing grants are not side
  effects; persistent authority is allowed only when explicitly declared for the selected route.
- Guarded vault deposits preserve the canonical share-price inflation protection.
- Risk-increasing operations finish below their accepted LTV limit. Pure repayment and collateral
  addition do not worsen LTV, allowing incremental recovery from an already-unsafe position.
- The existing bundler-retention invariant still passes.

A successful result reports the authenticated intent and matched effects alongside the ordinary
simulation result. It certifies the simulated transaction at that state; it does not turn a direct
exit or other snapshot into an execution-time slippage guarantee.

### Compatibility and release

The change is additive, leaves existing simulation callers unchanged, and keeps the two packages
decoupled. It follows the repository's existing dependency and release policy.

## Considered Alternatives

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

- Unsafe or mismatched signature intent is rejected before a wallet prompt.
- Canonical Vault and Blue routes pass only with their registered spenders, operators, recipients,
  and supported signature mechanisms.
- Nested, callback-triggered, unknown, and externally routed calls obey the same trust boundary.
- Realized assets, positions, fees, recipients, and authorizations match the declared outcome;
  missing evidence cannot produce a verified result.
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
address. Undeclared approvals and authorizations fail even when balances return to their starting
values.

Vault inflation resistance, bundler retention, recipient checks, route-specific authorization,
and position health are mandatory. User-selected limits may tighten but never disable them.

## References

- [`eth_simulateV1` Execution API](https://ethereum.github.io/execution-apis/api/methods/eth_simulateV1/)
- [BlueBundlesV1 routing decision](https://github.com/morpho-org/sdks/blob/main/docs/tibs/TIB-2026-08-25-blue-bundles-v1-sdk-actions.md)
- [TIB-2026-05-19](./TIB-2026-05-19-marketv1-supply-withdraw-loan-asset.md)
- [Permit2](https://github.com/Uniswap/permit2)
- [EVM simulation expansion](https://linear.app/morpho-labs/project/evm-simulation-expansion-15b5c85f08d6/overview)
- Root [engineering rules](../../AGENTS.md)
