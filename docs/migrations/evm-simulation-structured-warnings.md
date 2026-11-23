# Structured simulation warnings migration

Simulation reports now expose diagnostics as data instead of invoking application
logging callbacks. `options.logger` and the public `SimulationLogger` type remain
available with `@deprecated` JSDoc. The option is accepted but ignored, including
when `undefined`; no logger method is ever invoked. Existing JavaScript callers
receive the normal simulation report, not a validation failure for this key.
Migrate to `report.warnings`; both legacy symbols will remain through at least
one coexistence minor and be removed only in a future major.

This minor release changes sender-outflow reporting: undeclared sender outflows
no longer make `ok` false. Warning values are plain `SimulationWarning` data,
not Errors, and reports always include warnings and expose explicit retention
coverage. Keeping the logger symbols does not preserve the earlier `ok`-only
signing policy; signing callers must adopt the warning and coverage checks below.

Both success and failure reports always have `warnings: readonly SimulationWarning[]`.
Warnings are plain recursively frozen data, not Error instances. Narrow on `code`,
not `instanceof`; every warning has severity `"warn"`, `message` and `chainId`.
`UNEXPECTED_TOKEN_TRANSFER` adds `token`, `sender` and `recipients`. Other codes
describe skipped retention, swept balances, malformed transfer logs and wrapped-native
event mismatches. Quantity context such as `netSwept` is bigint in raw token units;
choose your own JSON encoding when persisting or returning it.

Undeclared sender outflows no longer block. All other failures still do.
An `ok`-only signing gate is no longer enough. A conservative replacement is:

```ts
const report = await simulate(client, params);
if (!report.ok) {
  handleFailures(report.failures);
  return;
}
if (report.warnings.length > 0) {
  requestReview(report.warnings);
  return;
}
if (report.verification?.retention !== "checked") {
  requestRetentionReview();
  return;
}
return report.result.simulationTxs;
```

Applications may instead explicitly accept or alert on selected warning codes;
the SDK neither logs nor decides that policy. Warnings never change `ok` or the
severity computed from blocking failures.

When retention ran with every user transaction's logs present, success and failure
reports include `report.verification.retention`. It is `"checked"`
after checking configured restricted intermediaries, even if retention fails, or
`"skipped-unsupported-chain"` when blue-sdk does not know the chain or catalogs no
standalone bundles or `midnightBundlesV2`. A skip also emits `RETENTION_CHECK_SKIPPED`
with a reason distinguishing those cases. Failure reports include `verification`
only if the stage ran with complete user-transaction logs and no discarded
transfer records. A `MALFORMED_TRANSFER_LOG` warning omits `verification` on both
success and failure reports; remaining evidence still produces warnings and
blocking failures. Omitted logs (even with `limits: "none"`), pre-execution failures,
reverts and unusable transfer evidence omit it. Explicit empty `logs: []` count as
present evidence. Absence does not mean checked or unsupported. Existing operation-limit
verification remains at `result.verification` on successful reports.
