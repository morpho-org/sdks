# ADR-2026-11-17: evm-simulation takes the caller's client and returns a failure report with a severity

| Field          | Value                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **Date**       | 2026-11-17                                                                                             |
| **Author**     | @jinmel                                                                                                |
| **Scope**      | `evm-simulation` 9.0.0                                                                                 |

_Frozen after merge; only superseded-by entries in References change._

## Context

A simulation can fail several checks at once: a bundle can retain funds, break a slippage quote and
leave a signed request unused in the same run. Consumers need every one of those failures, and they
need to decide quickly how loudly to log and alert on the run.

ADR-2026-11-11-evm-simulation-error-types-and-findings answered the first need by throwing one
primary error and attaching the others as `findings`. That shape makes the run's severity
ambiguous: the primary is chosen by group and pipeline order, so a primary that only warrants a
warning can carry findings that warrant an error, and a consumer that logs the thrown error at its
level under-reports the run. It also gives a consumer two places to look for the same kind of
fact, and two shapes to handle for a failure that is the same class in both places.

That record also left log levels to consumers. Consumers then wrote that mapping themselves, and
the mappings disagree: the same funds-retention failure is a top-priority alert in one service and
an ordinary warning in another, and reverts and limit failures are logged at info by one consumer
and at warn by another. The SDK is the one place that knows what each failure means, and the
logging libraries these services use (pino) share the level names `fatal`, `error` and `warn`.

Failures a caller must handle are not exceptional for a simulator: rejecting bundles is its job.
Libraries that return expected failures as values (Zod's `safeParse`, Rust's `Result`) make the
caller branch before reading the value; libraries that throw them, including JavaScript's
`AggregateError` and Python's `ExceptionGroup` for several failures, let a caller that forgets the
`catch` crash or, worse, catch too broadly.

`simulate` also takes its RPC clients from a per-chain map, either as URLs it builds a client
from or, from 8.9.0, as caller clients it validates. Every consumer already owns a viem client for
the same chain, with the transport, retries and headers its infrastructure needs, and has to
restate the chain as a map key and shape the transport to the SDK's rules. Because the SDK cannot
know which chain a URL serves, it also probes `eth_chainId` after some failures and reports
`InvalidChainIdError` when the endpoint serves another chain. That probe and the per-chain map are
client concerns the SDK carries for the caller. A transport timeout, by contrast, bounds one
request; only the SDK knows the several reads one simulation makes, so the whole-simulation
deadline is the SDK's.

## Decision

`simulate(client, params, options?)` runs on a viem client the caller owns and returns a report
that is either the verified result or every SDK failure of the run with the run's severity; it
throws only for errors the SDK did not classify.

**The caller owns the client.** The first argument is a viem `Client` whose `chain` is set (typed
`Client<Transport, Chain>`) and whose transport supports `eth_simulateV1`. The chain ID is
`client.chain.id`; `params.chainId` is removed. `SimulationConfig`, `ChainSimulationConfig` and
its per-chain map are removed, with 8.9.0's `ChainSimulationClientConfig` and
`ChainSimulationConfigEntry`. The optional third argument holds `logger`, `timeoutMs`,
`blockOverrides`, `callGasLimit` and `parentHashCheck`. An invalid value among the last four, or
an unknown key, is reported as a `SimulationValidationError` before any RPC call; checking
`timeoutMs` (an integer from 1 to 2147483647 ms) is new in 9.0, since 8.x passed it unchecked to its abort
signal. The SDK sets no retry policy: the caller's
transport owns retries, request timeouts and endpoint selection.

**The SDK checks the client only where safety or the chain depends on it.** `simulate` requires
`client.chain` and nothing else about the client; CCIP-Read is turned off by the SDK, below. Unlike 8.9.0, it
does not reject a `fallback` transport or a transport `retryCount` other than 0; the README
recommends a single-endpoint `http()` transport with `retryCount: 0`. The maintainer chose
documentation over enforcement: "I think enforcing a client configuration is too harsh. can we
just keep it under documentation?" (@jinmel, 2026-11-18).

**`timeoutMs` stays a whole-simulation deadline.** The maintainer kept it: "lets keep timeout"
(@jinmel, 2026-11-18). One deadline, 5000 ms by default, covers every read a simulation makes.
After it passes, the SDK starts no further read and reports an `RpcTransportError` in an `ok: false`
report. It does not abort a request already in flight in the caller's transport, so the README
tells callers to set the transport timeout at or below `timeoutMs`.

**The SDK turns CCIP-Read off on its own copy of the caller's client.** viem follows an
`OffchainLookup` revert by fetching the gateway URL the contract names unless the client sets
`ccipRead: false`, so a simulated contract could make the SDK's host fetch an arbitrary URL.
`simulate` runs every request on a copy of the caller's client with `ccipRead: false`, whatever the
caller's setting; the caller's client is not changed, a client with viem's default is accepted,
and no option turns CCIP-Read on. viem's `call` reads only `client.ccipRead`, and viem's own
`simulateCalls` calls it on such a copy. The copy leaves out the client's decorated actions,
which stay bound to the caller's client, so every read goes through `viem/actions` on the copy.
viem >=2.9.2 is required, the first version with client-level `ccipRead`.

**No served-chain probe.** The SDK no longer calls `eth_chainId` and `InvalidChainIdError` is
removed. Every call inside `eth_simulateV1` still carries `client.chain.id`, so a node that
checks it rejects a wrong-chain request; that rejection is an `RpcTransportError` like any other
node error. The SDK also stops matching node error wording (geth's "chainId does not match
node's", Anvil's and Monad's "invalid chain id") to tell a wrong-chain rejection apart: the
maintainer chose to move every chain check to the caller, the wording differs per node and
release, and a bundle on the wrong chain is rejected either way. `RpcTransportError` does not
imply retryability, so a consumer that retries it bounds those retries in its own transport.
Pointing the client at the right chain is the caller's obligation, as it is for every other viem
action the caller runs. `UnsupportedChainError` remains only for a chain absent from
Morpho's address registry when the request needs a Morpho address there.

**Report shape.** The report is a discriminated union on `ok`:

```ts
| { readonly ok: true; readonly result: VerifiedSimulationResult } // or the typed-input result
| {
    readonly ok: false;
    readonly severity: SimulationErrorSeverity;
    readonly failures: readonly SimulationPackageError[];
  }
```

The result is reachable only after narrowing on `ok`, so fail-closed handling is the only way to
read it. A failure report always holds at least one failure. Each overload keeps its own result
type.

**Every SDK failure, flat, in pipeline order.** `failures` holds the package error instances the
run produced, in the order the pipeline found them, with no primary and no nesting. Failures stop
the run at the same points they did before:

- Before execution (request parsing, chain, block, contract-code, asset and pending-approval
  resolution) and for whole-response integrity failures, the run stops at the first failure,
  which is the report's only failure.
- After execution, every post-execution check runs, as ADR-2026-11-11 decides, and every failure is
  reported.
- A revert is terminal: the report holds the assertion failures evaluated for transactions before
  the first revert, then the `SimulationRevertedError`. No limit, approval or retention check runs
  on a partially executed bundle.

**Unclassified errors still throw.** An error that is not a package error, such as a bug in the SDK,
is wrapped in `UnexpectedSimulationError` and thrown, as before. Other public functions that throw
today, such as `toSimulationLimits`, keep throwing.

**Callers that only await `simulate`.** A caller that today relies on a throw to stop, with a bare
`await simulate(...)` and no use of the result, still compiles in 9.0 but continues after a failed
run. We accept that risk rather than add a throwing helper: the 9.0 migration guide tells every
caller to find each bare `await simulate(...)` and branch on `ok` before going on.

**Every error carries a default severity.** Every package error exposes a required readonly
`severity` of type `SimulationErrorSeverity = "fatal" | "error" | "warn"`, lowercase pino level
names, so a logger is indexed with the field and no mapping. Each group class sets the severity its
concrete classes inherit:

| Group                           | Severity | Exception                             |
| ------------------------------- | -------- | ------------------------------------- |
| `SimulationSafetyError`         | `fatal`  |                                       |
| `SimulationExecutionError`      | `warn`   | `UnusedAuthorizationError` is `error` |
| `SimulationInvalidRequestError` | `error`  |                                       |
| `SimulationInfrastructureError` | `error`  |                                       |

`UnusedAuthorizationError` is `error` because a final-mode signed request that the bundle never uses
stays valid and was assembled wrongly by the integrator, not by the user. A new concrete class takes its group's
default unless an override is deliberate and recorded with its reason.

**The report's severity is the highest of its failures**, in the order `fatal`, `error`, `warn`, so
one `logger[report.severity](...)` call never under-reports a run.

**Severity is only a log level.** Every failure report rejects the bundle, whatever its severity;
no severity means a failure may be ignored or bypassed, and nothing in the package branches on it.
Consumers may log at another level; the field is a default, not a policy.

**Group renamed.** The group ADR-2026-11-11 calls `SimulationRejectedError` is
`SimulationExecutionError`: once failures are returned rather than thrown, every group describes a
rejection, and this one is the bundle's own execution or limits failing.

**Duplicate installs.** `isSimulationPackageError` stays the shape-based check for an error from
another copy of the package, and requires a `severity` of one of the three values, so a narrowed
object always has a usable level. An error from a pre-9.0 copy has no `severity`, so 9.0 no longer recognizes
it: in a mixed 8.x/9.0 install, `toSimulationErrorResponse` reports such an error as
`UNEXPECTED_SIMULATION_ERROR`, and the bundle is still rejected.

**JSON response unchanged.** `toSimulationErrorResponse` serializes one failure with the fields
ADR-2026-10-12 defined; a caller serializes a report by mapping over its failures. Neither the
report's nor a failure's severity is added to the response.

**Relation to ADR-2026-11-11.** This record supersedes its "primary plus findings" decision
(`findings` is removed, and no failure is selected as primary), the selection half of "collect
after execution, then select", the throw wording of "revert is terminal" and "pre-execution stays
first-throw", its rule that the SDK exports no severity, level, rank or numeric order, its rejected
alternatives "one aggregate error listing every failure" and "SDK-defined severity levels", and the
invariants on primary selection and `findings`, and the name `SimulationRejectedError`, now
`SimulationExecutionError`, and its rule that the guard accepts an error from an older copy
that lacks a newer field. It also supersedes the post-check `eth_chainId` probe, the rule and
invariant that `InvalidChainIdError` outranks every collected failure, and `InvalidChainIdError`
in its group table. The four groups, cause-based class choice,
structured limit and unavailable-check fields, post-execution collection, and the shape-based guard
stand, except its rule that 9.0.0 makes the structured fields required (see below).

**Structured fields stay optional in 9.0.** ADR-2026-11-11 says 9.0.0 makes the structured fields
of `ConsumerLimitViolationError` and `SlippageCheckUnavailableError` required; this record
overrides that. Both constructors keep accepting a message alone, so the fields stay optional in
the type, which is honest about an instance built that way; every instance the SDK creates sets
them. Requiring them would break every caller that constructs these errors with a message only,
and the no-overlap waiver stays limited to `simulate`.

**Relation to ADR-2026-09-18 and ADR-2026-10-01.** The caller-owned client supersedes
ADR-2026-09-18's `simulate(config, params)` signature with `config.chains` and `simulateV1Url`, and
ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation's required per-chain
`simulateV1Url` and its `timeoutMs` abort signal; `timeoutMs` stays, as a deadline that does not
abort the caller's requests. Its rule that `eth_simulateV1` is the only
execution method stands. Its rule that no other provider is selected and nothing is retried after
a failure is superseded as an SDK guarantee: the SDK itself still never retries or switches
providers, but a caller's transport may (viem's `http()` retries by default and `fallback()`
switches endpoints), and with no `eth_chainId` probe the SDK cannot tell whether every request
reached the same endpoint. A failure still rejects the bundle either way. The README recommends a
single-endpoint `http()` transport with `retryCount: 0` for the 8.x behaviour.

**No deprecation overlap.** Root AGENTS.md §7 asks for a successor, a deprecated minor and one minor
with both before a public symbol is retyped. The maintainer waives those steps for this change
only: "I authorize retyping simulate() in 9.0.0 with no overlap minor" (@jinmel). The maintainer
extended the change to the signature in the same release: "I want to ship this changes in current
major release: make the viemClient a consumer obligation to provide, not within the
evm-simulation. So simulate() should accept the `client` variable as first argument." (@jinmel).
The waiver covers only `@morpho-org/evm-simulation` 9.0.0: the return type of `simulate`, its
client-first signature, and the removal of `params.chainId`, `SimulationConfig`,
`ChainSimulationConfig` and `InvalidChainIdError`, plus the removal of `findings` and the
renaming of `SimulationRejectedError` to `SimulationExecutionError`, both published in 8.8.0
(see below), and the removal of `ChainSimulationClientConfig` and `ChainSimulationConfigEntry`,
which 8.9.0 publishes without deprecation. The client-first authorization above removes every
per-chain configuration shape, and the maintainer confirmed that direction after 8.9.0's client
configuration merged, in the quote on client checks above. It does not waive the major changeset, the
migration guide or the dependent audit, and 8.x stays published. docs/EXCEPTIONS.md records the
waiver.

**8.8.0 shipped first; hold for one 9.0 release.** evm-simulation 8.8.0 published `findings`
and `SimulationRejectedError` before this record was accepted, so removing `findings` and
renaming `SimulationRejectedError` to `SimulationExecutionError` with no alias in 9.0.0 break a
published API. The maintainer waives the deprecation steps for both:
"just bump to 9.0.0" (@jinmel, 2026-11-18). 8.x releases, such as 8.9.0 with the CCIP-Read fix
and the client configuration, may ship until the first breaking 9.0 change merges. From then until 9.0.0 is complete, evm-simulation
stays out of version PRs, so no partial 9.0.0 ships without the client-first signature, and any
evm-simulation changeset names only that package: Changesets rejects a changeset that names both
an ignored and a released package, which would stop the version PR for every package. The change
that completes 9.0.0 ends the hold, so the next version PR releases evm-simulation 9.0.0 with
every pending evm-simulation changeset.

**Relation to ADR-2026-10-12.** The report holds the same error instances a consumer already
handles, not a second representation of a failure, so the rejection of parallel report objects
that duplicate error fields stands. Revert reasons stay unclassified.

## Invariants

- No SDK failure escapes `simulate` as a throw, and nothing but an `UnexpectedSimulationError` does →
  tests for pre-execution, RPC, wrong-chain, revert and post-execution failures assert a failure
  report, and a test where a pipeline step throws a non-package error asserts a thrown
  `UnexpectedSimulationError`.
- A failing run never exposes a result → a type-level test that `result` does not exist on the
  `ok: false` branch, and the fail-closed tests assert `ok: false` with no `result`.
- `failures` is flat, complete and in pipeline order → a property test over random subsets of
  failing post-execution checks asserts the failures match the failing checks in order.
- A revert stops verification → a fork test where an assertion fails before a later transaction
  reverts reports exactly the assertion failure, then `SimulationRevertedError`.
- The chain comes only from the client → a test asserts every call inside `eth_simulateV1`
  carries `client.chain.id`, and no test or source path sends `eth_chainId`.
- No simulation follows `OffchainLookup` → a unit test with a `createPublicClient` client (whose
  decorated actions include `call`) and viem's default `ccipRead`, whose read reverts with
  `OffchainLookup`, sees no gateway request and an unchanged client, and a fork test
  with a default client where a vault reverts with `OffchainLookup` sees no gateway request.
- No read starts after the `timeoutMs` deadline → a unit test whose first read outlasts the
  deadline reports a single `RpcTransportError` and sends no later request.
- The SDK checks only `client.chain` on the caller's client → a unit test runs a client with a
  `fallback` transport and a nonzero `retryCount` to an `ok: true` report.
- An invalid `timeoutMs` is rejected → a unit test reports a `SimulationValidationError` for zero,
  negative, fractional, out-of-range, non-finite and non-number values.
- A node's chain-ID rejection is a transport failure → a test where the node rejects the request
  `chainId` reports a single `RpcTransportError`.
- The report's severity is the highest of its failures → a property test over random failure
  lists.
- Every exported concrete error class has a deliberate severity → a unit test constructs every
  exported concrete class and compares its severity with a table that lists every class; a class
  missing from the table fails it, and the totals are four `fatal`, fourteen `error`, four `warn`.
- Severity never changes whether a bundle is rejected → review rejects any branch on `severity`
  inside the package.
- The JSON response is unchanged → the existing `error-response` tests pass without edits to their
  expected objects.
- Revisit if a consumer needs a level below `warn` for a rejection (such as `info`), if a severity
  default turns out to be wrong for most consumers, or if callers need a report to cross a process
  boundary as one JSON object.

## Rejected alternatives

- **Keep throwing, with a helper that computes the highest severity over the primary and its
  findings.** Rejected because it keeps two places to look for one kind of fact and leaves
  `logger[err.severity](err)` under-reporting for every consumer that does not know the helper.
- **Throw one aggregate, as `AggregateError` or Python's `ExceptionGroup`.** Rejected because a
  caller still needs a `catch` to see failures, JavaScript has no `except*` to match members, and a
  forgotten `catch` turns an ordinary rejection into a crash.
- **Add a non-throwing variant beside a throwing `simulate`, as Zod's `parse` and `safeParse`.**
  Rejected because two entry points double the contract and the throwing one keeps the ambiguity
  above; one report gives every caller one path.
- **A throwing assert, such as `assertSimulationOk(report)`, for callers that only gate.** Rejected
  because it is a second way to handle a failure, and a caller that forgets the report would forget
  the assert too; the migration guide's audit of bare `await simulate(...)` calls covers them.
- **An 8.x minor with a report-returning successor before the 9.0 retype.** Rejected because the
  successor would be a second entry point that every consumer migrates to and then away from; the
  maintainer authorized the direct retype instead.
- **Return unclassified errors in the report too.** Rejected because a bug has no meaningful
  severity or group and should stay loud; the report holds only failures the SDK understood.
- **Keep severity out of the SDK, categories only, as in Stripe or viem.** Rejected because
  consumers already map codes to levels, each differently; the groups already give the category,
  and the diagnostics model (PostgreSQL's `DatabaseError.severity`, TypeScript's
  `DiagnosticCategory`, ESLint rule severity) adds the level, with the difference that every level
  here rejects.
- **An `info` level for rejections a user causes.** Rejected because every severity blocks the
  transaction, and `info` reads as "nothing went wrong".
- **Keep SDK-built clients from per-chain URLs.** Rejected because every consumer already owns a
  configured viem client and had to restate its transport and retries as SDK configuration.
- **Keep 8.9.0's per-chain map of caller clients.** Rejected because the map key restates the
  chain the client already carries, and two sources of the chain ID can disagree.
- **Reject fallback transports and nonzero retry counts, as 8.9.0 does.** Rejected by the
  maintainer as too strict for callers' own clients; the README recommends the setting instead.
- **Require the caller's client to set `ccipRead: false`, failing closed otherwise.** Rejected
  because every caller would have to reconfigure its client for a setting the SDK can apply to its
  own copy.
- **Drop `timeoutMs` and leave every bound to the transport.** Rejected because a transport
  timeout bounds one request, not the several reads of one simulation.
- **Keep the `eth_chainId` probe and `InvalidChainIdError` with a caller client.** Rejected because
  the chain the client serves is the caller's configuration, like any viem action's, and the probe
  added a request and a code path for a misconfiguration the node's own chain-ID check already
  rejects.
- **Keep a wrong-chain error for node rejections matched by message.** Rejected because it keeps a
  chain check in the SDK that the maintainer moved to the caller, and depends on node error
  wording that differs across geth, Anvil and Monad.
- **Accept a bare client and keep `params.chainId`.** Rejected because two sources of the chain ID
  can disagree; requiring `client.chain` makes the client the only one.

## References

- ADR-2026-11-11-evm-simulation-error-types-and-findings — the groups, structured fields and
  post-execution collection this builds on; the parts listed above are superseded.
- ADR-2026-10-12-evm-simulation-simplify-errors-without-deprecation — the JSON response this keeps.
- ADR-2026-10-15-evm-simulation-fail-closed-limits — limits always run and reject, which the report
  preserves.
- ADR-2026-09-18-evm-simulation-calldata-verification — its `simulate(config, params)` signature is
  superseded by the caller-owned client.
- ADR-2026-10-01-evm-simulation-retire-tenderly-without-deprecation — its per-chain URL,
  `timeoutMs` abort signal and no-fallback guarantee are superseded; `eth_simulateV1` as the only execution method
  stands.
