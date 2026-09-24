---
"@morpho-org/evm-simulation": patch
---

Define the internal v5 simulation domain contracts for preview/final requests,
typed wallet authorizations, operation-specific limits, decoded recipes,
verification evidence, results and diagnostics. Keep the existing public
exports and simulation behavior unchanged until the v5 runtime cutover.

This foundation remains on the unreleased v5 integration stack. The inherited
major changeset governs publication; no workspace package has a direct runtime
or peer dependency on evm-simulation requiring a dependent bump.
