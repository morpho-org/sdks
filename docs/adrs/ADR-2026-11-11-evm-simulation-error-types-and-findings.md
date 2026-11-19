# ADR-2026-11-11: evm-simulation errors sit under four action groups and report other failures as findings

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **Date**   | 2026-11-11                                                                         |
| **Author** | @jinmel                                                                            |
| **Scope**  | `evm-simulation` next 8.x minor; the required `findings` and structured fields bind 9.0.0 |

_Frozen after merge; only superseded-by entries in References change._

## Context

Every `evm-simulation` rejection was one typed error with a stable `code` and a message. The error
did not say who had to act, so each consumer kept its own lists of codes it treated as fatal,
bypassable or paging. Those lists drifted whenever codes changed.

After the single execution, the pipeline ran independent checks over data it already held, and
it still threw at the first one that failed. A check late in the order could be hidden behind an
earlier one: a bundle that left funds in a bundler contract and also drifted past its slippage
quote was reported only as the slippage failure. The two classes thrown from the most places, limit
violations and checks that could not run, carried only a message, so a reader had to parse prose
to learn which operation, field or bound failed.

ADR-2026-10-12-evm-simulation-simplify-errors-without-deprecation reduced the base error to `code`
and the standard `Error` fields, rejected a semantic taxonomy of revert reasons because contract
errors do not identify a category reliably, and rejected parallel report objects. That reasoning
covered reverts and duplicate representations. It did not consider the SDK's own checks, which are
deterministic: the SDK always knows which of its checks failed. Consumers already catch by class
with `instanceof`, as viem's error hierarchy teaches them, and the release rules make a new class or
field a minor and a retyped constructor a major.

## Decision

Every concrete `evm-simulation` error class extends exactly one of four abstract group classes that
say who has to act, and a rejection after a bundle executes without a revert throws one primary
error with every other failure attached as `findings`.

**Groups are classes.** Four abstract classes extend `SimulationPackageError`:

- `SimulationSafetyError`: funds or permissions are at risk, such as value retained by a bundles
  contract or a sender grant outside the approval allowlist.
- `SimulationRejectedError`: the bundle reverted, or broke a declared quote, bound, assertion or
  signed-request use. The user or caller acts.
- `SimulationInvalidRequestError`: the request or configuration is wrong. The integrator acts.
- `SimulationInfrastructureError`: the RPC or node failed, or the SDK could not run a check. The
  operator investigates.

Consumers branch with `instanceof`. There is no `type` field, no exported list of groups and no
map from code to group. Groups are not a severity scale: every group rejects, and the SDK exports
no severity, level, rank or numeric order. Consumers map groups to their own log levels and alerts.

**Every class sits under one group.** Class names and codes stay as they are; only the parent
changes. A subclass of a concrete class inherits its parent's group.

| Group                           | Classes                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SimulationSafetyError`         | `BlacklistViolationError`, `UnexpectedTokenApprovalError`, `UnexpectedMorphoAuthorizationError`, `UnexpectedMidnightAuthorizationError`                                                                                         |
| `SimulationRejectedError`       | `ConsumerLimitViolationError`, `SimulationAssertError`, `SimulationLogAssertError`, `UnusedAuthorizationError`, `SimulationRevertedError`                                                                                       |
| `SimulationInvalidRequestError` | `SimulationValidationError`, `UnsupportedChainError`, `UnsupportedOperationError`, `AuthorizationRequestMismatchError`, `LimitAccountMismatchError`, `MissingExpectedQuoteError`, `AmbiguousExpectedQuoteError`, `UnsupportedLimitActionError` |
| `SimulationInfrastructureError` | `SlippageCheckUnavailableError`, `ApprovalCheckUnavailableError`, `RpcTransportError`, `InvalidSimulationResponseError` (and `InvalidChainIdError` through it), `UnexpectedSimulationError`                                     |

A code belongs to one group: classes that share a code share a group. A new concrete class extends
a group class, never `SimulationPackageError` directly. Moving an existing class to another group
is a breaking change.

The thrower picks the class by cause, not by the step that notices it. A failure caused only by the
request, such as a supplied market for another deployment, an `assetPaid` that is not the market's
token, an `account` the operation cannot measure, or quoted flows that cannot be measured
separately, throws an invalid-request class, usually `SimulationValidationError`, even when a
slippage or approval check detects it. `SlippageCheckUnavailableError` and
`ApprovalCheckUnavailableError` are only for evidence the SDK could not read, measure or classify
for a valid request, so a consumer can route on the group without checking `code` or `reason`.

**Primary plus findings, not an aggregate.** Every error exposes a readonly `findings` list of
other package error instances, empty by default. The primary error never appears in its own
`findings`, findings carry no findings of their own, and the list keeps pipeline order. Findings
are additional rejections, never alternatives or advice that a failure is bypassable. No aggregate
error class wraps several failures. In 8.x the TypeScript declaration types `findings` as optional
(`readonly findings?: readonly SimulationPackageError[]`) so that error objects from older copies
still type-check, and every instance the SDK creates sets it to a frozen empty array. 9.0.0 makes it
required.

**Collect after execution, then select.** When no preparation or user transaction reverted, every
post-execution check runs before the SDK throws: approval events, preparation asset transfers,
signed-request use, every transaction assertion, every quoted or derived limit side and bound, and
bundles retention. A failure in one check never prevents another from running. Unless the
wrong-chain probe below finds another chain, the SDK throws the first `SimulationSafetyError` in
pipeline order, or the first failure in pipeline order when none is a safety error, and attaches
every other failure as `findings`. Selection happens inside the SDK; consumers never sort
findings. Collection changes what a rejection reports, never whether a bundle is rejected.

**Revert is terminal.** When a preparation or user transaction reverts, the SDK throws
`SimulationRevertedError` for the first revert in call order. Its `findings` hold only assertion
failures already evaluated for transactions before the revert. No limit, approval or retention
check runs on a partially executed bundle.

**Pre-execution stays first-throw.** Failures before the execution request (request parsing,
chain, block, contract-code, asset and pending-approval resolution) throw at the first failure
with empty `findings`. So do whole-response integrity failures (a malformed response, a call-count
mismatch), which are checked before any post-execution check runs, because no check can be trusted
on a response of the wrong shape. Data one check needs but cannot use, such as a state read that is
empty or will not decode, or missing logs for the approval check, is a failure of that check and is
collected like any other. When a collected failure is one the pipeline already follows with its
single `eth_chainId` probe, such as a failed planned state read, the probe still runs once, after
the checks. If the endpoint serves another chain, `InvalidChainIdError` is thrown alone: no check
result from the wrong chain means anything.

**Structured limit and unavailable-check fields.** `CONSUMER_LIMIT_VIOLATION` exposes
`operationIndex`, `operationType`, `field`, `check`, `expected` and `observed`, plus `tolerance` or
`bound` when the check applies one; `check` comes from a fixed exported set of check kinds.
`SLIPPAGE_CHECK_UNAVAILABLE` exposes `operationIndex`, `operationType` and `field` when the failure
belongs to one operation, and a `reason` from a fixed exported set; no reason describes a request
mistake. The fields repeat what the
message says; messages keep their text. In 8.x the fields are optional in the TypeScript
declaration and the SDK sets them on every instance `simulate` throws. 9.0.0 makes them required.
The exported sets grow additively.

**JSON response unchanged.** `toSimulationErrorResponse` and `SimulationErrorResponse` keep the
fields ADR-2026-10-12 defined. Groups and findings live on the error instances; serializing them is
not part of this decision.

**Duplicate installs.** `instanceof` fails when two copies of the package are installed, for groups
as for concrete classes. `isSimulationPackageError` stays the shape-based fallback for that case,
and `code` stays the stable discriminator across copies. An error that passes only the shape check
can come from an older copy without `findings`, so the fallback path treats a missing `findings` as
empty.

**Relation to ADR-2026-10-12.** Revert reasons stay unclassified: `SimulationRevertedError` is
always a `SimulationRejectedError`, and no group is derived from revert bytes, decoded names or
messages. Findings are instances of the same error classes a consumer already catches, not a second
representation of a failure, so the rejection of parallel report objects stands. This record
replaces only the rule that the base error carries no fields beyond `code` and the standard
`Error` fields. From ADR-2026-09-18 it replaces only the rule that additions extend the base error
directly.

**Semver.** Everything above except the 9.0.0 requirements is additive and ships in one 8.x minor:
every concrete class still extends `SimulationPackageError`, and no code, class name, constructor
signature or response field is removed or retyped.

## Invariants

- Every exported concrete error class is an instance of exactly one group class → a unit test
  constructs every exported concrete class and asserts exactly one of the four `instanceof` checks
  holds and that classes sharing a code share a group.
- No group is expressed as data → review rejects a `type`-like field, an exported group list or a
  code-to-group map; a new inline snapshot of the package's exported names lists none.
- A bundle that fails any check never produces a result → the existing fail-closed tests, and a
  property test over random subsets of failing post-execution checks whose outcome is always a
  rejection.
- Unless the wrong-chain probe finds another chain, when any post-execution failure is a
  `SimulationSafetyError` the primary is one; otherwise it is the first failure in pipeline order
  → a property test over synthetic failure sets drawn from all four groups, a
  security-invariant-tagged test, and a fork test where a bundle both retains funds and breaks a
  slippage quote and is rejected with `BlacklistViolationError` and one
  `ConsumerLimitViolationError` finding.
- `findings` never contains the primary, never nests and keeps pipeline order → unit tests on the
  selection step.
- A revert stops verification → a fork test where an assertion fails before a later transaction
  reverts: the primary is `SimulationRevertedError`, the assertion failure is its only finding.
- Pre-execution and whole-response integrity failures carry empty `findings` and are thrown before
  any post-execution check runs → the existing tests for those failures assert an empty list, and a
  test where a call-count mismatch and an unexpected approval occur together is rejected with
  `InvalidSimulationResponseError` alone.
- A per-check data failure does not hide a safety failure → a test where a slippage read will not
  decode and the bundle also emits an unexpected approval is rejected with
  `UnexpectedTokenApprovalError` and an `InvalidSimulationResponseError` finding.
- When the probe finds another chain, `InvalidChainIdError` outranks every collected failure → a
  test where a planned state read fails, the bundle also emits an unexpected approval and
  `eth_chainId` reports another chain is rejected with `InvalidChainIdError` alone.
- Every `CONSUMER_LIMIT_VIOLATION` and `SLIPPAGE_CHECK_UNAVAILABLE` that `simulate` throws or
  attaches carries its structured fields → a test helper applied to every instance caught in the
  unit and fork suites; the count of message-only instances is zero.
- A request mistake never surfaces as an infrastructure error → real-path tests for each
  request-shaped slippage or approval conflict assert `SimulationValidationError`, and review
  rejects a new `SlippageCheckUnavailableError` reason or `ApprovalCheckUnavailableError` throw
  that describes the request.
- The JSON response is unchanged → the existing `error-response` tests pass without edits.
- Revert reasons stay unclassified → the revert tests assert `SimulationRevertedError` is a
  `SimulationRejectedError` for custom-error, string, panic, empty and undecodable payloads.
- Revisit if a post-execution check can no longer run after another check failed, or needs an RPC
  call of its own: collect-then-select assumes pure checks over the execution result.
- Revisit if consumers commonly run duplicate installs, or need groups across a process boundary:
  `instanceof` and the unchanged JSON response assume neither.
- Revisit if a consumer constructs SDK error instances: making the structured fields required in
  9.0.0 assumes only tests do.

## Rejected alternatives

- **A `type` string field alongside the class.** Rejected because it repeats what the class already
  says, adds a second source of truth that can disagree with the hierarchy, and departs from viem,
  whose hierarchy consumers already use. The cost accepted: a group cannot be read across duplicate
  installs or from serialized output.
- **One aggregate error listing every failure.** Rejected because it changes what every consumer
  catches and breaks each `instanceof` and code switch, a major with a migration, while no consumer
  shows more than one failure.
- **Run safety checks first and keep first-throw.** Rejected because it still loses every other
  failure, makes the check order a hidden contract and leaves limit failures message-only.
- **One class and code per check kind.** Rejected because it adds about twenty codes every consumer
  must map; structured fields on two classes carry the same facts with less surface.
- **SDK-defined severity levels.** Rejected because every simulation error rejects, so a scale
  suggests some are safe to ignore, and the SDK knows which check failed but not how a consumer
  pages. Groups are facts; levels are consumer policy.

## References

- ADR-2026-09-18-evm-simulation-calldata-verification — the original error surface; its rule that
  additions extend the base error directly is superseded.
- ADR-2026-10-12-evm-simulation-simplify-errors-without-deprecation — the error surface this
  extends; its base-error field set is superseded.
- ADR-2026-10-15-evm-simulation-fail-closed-limits and
  ADR-2026-10-21-evm-simulation-fail-closed-limits-ships-in-v8 — limits always run and reject,
  which collection preserves.
- ADR-2026-10-22-evm-simulation-approval-allowlist — the approval checks whose failures are safety
  errors.
- Primary plus findings, primary selection, throwing on failure, the rule that the SDK exports no
  severity, level, rank or numeric order, and the rejected alternatives "One aggregate error listing
  every failure" and "SDK-defined severity levels", and the group name `SimulationRejectedError`
  (renamed `SimulationExecutionError`), superseded by
  ADR-2026-11-17-evm-simulation-failure-report.
- The post-check `eth_chainId` probe, the rule and invariant that `InvalidChainIdError` outranks
  every collected failure, and `InvalidChainIdError` in the group table superseded by
  ADR-2026-11-17-evm-simulation-failure-report.
- The rule that 9.0.0 makes the structured fields of `ConsumerLimitViolationError` and
  `SlippageCheckUnavailableError` required superseded by
  ADR-2026-11-17-evm-simulation-failure-report; they stay optional.
- The rule that the shape-based guard accepts an error from an older copy that lacks a newer field
  superseded by ADR-2026-11-17-evm-simulation-failure-report.
