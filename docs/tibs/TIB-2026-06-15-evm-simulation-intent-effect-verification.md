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

Supported signature mechanisms follow the selected route rather than a package-wide spender
assumption. Each signature must match its complete typed-data schema, domain, signer, chain, and
declared grant.

### Trust boundary

- Morpho contracts, spenders, and operators must match the pinned chain registry and selected
  protocol route.
- Every call that may execute, including optional and callback-triggered calls, remains inside the
  verification boundary. Callback commitments must match their payloads.
- An external executor is verifiable only when its chain, address, role, and supported call
  semantics are pinned. An address-only allowlist is insufficient.
- Trust in a router or callback role never expands spender, operator, or recipient permissions.
- Unknown, malformed, opaque, or unsupported execution fails closed.

### Verified effects and risk

The verdict covers realized ERC-20 and native balances, raw vault shares, Morpho Blue supply and
borrow shares, collateral, recipients, authorization changes, fees, and bundler retention. Supply
assets round down and debt rounds up. New or increased approvals and authorizations are accepted
only when explicitly declared for the selected route.

Guarded vault deposits must preserve the canonical share-price inflation protection. Direct exits
can be verified only as simulations at a particular state; verification does not turn a snapshot
into an execution-time slippage guarantee.

The default economic envelope is:

- **Asset-delivery slippage:** at most 0.5%. Existing operation-level share-price and accrual guards
  retain their tighter 0.03% default.
- **Additional protocol or reallocation fees:** zero unless accepted for the exact fee asset.
  PublicAllocator V1 fees are native-token charges; Vault V2 BluePublicAllocator penalties are
  loan-token charges. Network gas is excluded.
- **Position risk:** a risk-increasing operation must finish at or below LLTV minus the existing
  0.5 percentage-point buffer. A pure repayment or collateral addition may remain above that
  threshold when it does not worsen the position, allowing incremental recovery.

Consumers may choose stricter economic limits. Economic configuration can never relax trust,
recipient, authorization, or retention invariants.

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
