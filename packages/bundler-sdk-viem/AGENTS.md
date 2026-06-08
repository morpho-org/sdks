# bundler-sdk-viem Conventions

## Deprecated package freeze

- `@morpho-org/bundler-sdk-viem` is frozen/deprecated. Do not make feature, address, ABI, dependency, test, JSDoc, refactor, or changeset updates in this package.
- Only PRs explicitly scoped to deprecation metadata or source deletion may touch this package, and those PRs must not add new supported behavior.
- If requested work appears to require this package, stop and move the maintained surface to `@morpho-org/morpho-sdk`, `@morpho-org/blue-sdk`, or `@morpho-org/blue-sdk-viem` as appropriate, or leave this package unchanged.

- Convert simulation operations (input language) into bundler actions (output language) before encoding transactions.
- `ActionBundle` and bundle helpers own action ordering and nested bundle sequencing.
- Keep action encoders pure where possible: `BundlerAction.encode(chainId, action)`.
- Throw `BundlerErrors.MissingSignature` when a signature-required action lacks a signature.
- Track native value only for transfers into bundler adapter addresses.
- Prefer infinite approvals used elsewhere, e.g. `MathLib.MAX_UINT_160`, when Permit2 flow requires it.
- Return both planned operations and the encoded bundle from setup helpers.
- Validate signatures after signing with `verifyTypedData` before caching them on actions.
- Never sign for independent consumers; only adapters like `generalAdapter1` should receive permits.
- Recursive callbacks force `sender: generalAdapter1` before encoding nested operations.
- Callback simulation must preserve sender and authorization semantics before actions are encoded.

## Continuous Improvement

- Keep I/O and signing explicit at the viem boundary; action encoding should remain pure where possible.
- Existing code may predate current conventions; do not widen divergence when touching it.
- Prefer typed errors, explicit protocol routes, and fewer exported helpers over generic bundling abstractions.
- If a convention cannot yet be met, keep the exception local and make the touched surface closer to the target design.
