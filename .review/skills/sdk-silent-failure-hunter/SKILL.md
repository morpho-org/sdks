---
name: sdk-silent-failure-hunter
description: Use for catches, promises, optional lookups, retries/fallback, returned errors, callbacks, loading/error states, or transaction outcome handling.
---

# SDK failure propagation

Read root `AGENTS.md` §2–3 and §8 and the affected package contract. Follow each changed failure from its origin to the public caller, including the success value that could be confused with failure.

- Check swallowed or overly broad catches, logging-only handling of nonrecoverable errors, discarded critical return values and detached promises. A returned/rejected promise may correctly propagate failure without a local catch; inspect its caller before claiming it is unhandled.
- Typed errors remain named/exported public API; wrapping preserves cause. Coordinate with `sdk-code-quality` for representation and inspect what handling does with the error.
- Optional lookup uses `_try(accessor, ExpectedError)` with explicit expected errors. Unrelated failures propagate. A successful undefined value must remain distinguishable from a caught failure through the documented tagged/null representation.
- Follow retry/fallback eligibility, restoration and caller-visible outcomes. In `evm-simulation`, only ExternalServiceError permits backend fallback/bypass; SimulationRevertedError belongs to the bundle and propagates. Domain errors remain under SimulationPackageError.
- Check transaction receipts, simulation results, callback completion, and relevant UI loading/error states where the changed code owns those responsibilities. Returning a descriptor/hash intentionally is different from treating an unmined/failed transaction as successful.
- Inspect unreachable or default branches against actual unions and runtime decoding. A redundant branch alone is not a defect; establish the missed behavior or applicable written obligation.

Finish with a caller-visible trace for each implicated failure mechanism. Name unavailable evidence in coverage. Retain a finding only when the change loses, misclassifies or hides a failure or violates a relevant contract; propose the smallest correction to that path.
