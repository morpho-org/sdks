# ADR-2026-10-13: Reject malformed token metadata with `MalformedTokenMetadataError` under the fail-closed exception

| Field      | Value                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| **Status** | accepted                                                                                                  |
| **Date**   | 2026-10-13                                                                                                |
| **Author** | @Foulks-Plb                                                                                               |
| **Scope**  | `blue-sdk-viem` 7.0.0, `morpho-sdk` 8.0.0, `wdk-protocol-lending-morpho-evm` 3.0.0: `MalformedTokenMetadataError` on the exports ADR-2026-10-09 covers through `fetchToken`, and ADR-2026-10-09's `morpho-sdk` target moved from 7.0.0 to 8.0.0 for every error it lists |

_Status is the only field that changes after acceptance._

## Context

ADR-2026-10-09 lets the token-metadata majors throw `UnknownTokenError` and
`MissingPermitDomainNameError` in place, without a deprecation minor, and still lets `name`,
`symbol` and `eip712Domain` resolve to `undefined` when the token does not answer. In the previous
majors, a token that did answer `eip712Domain()`, or the `bytes32` retry of `name()`/`symbol()`,
with returndata that does not decode also resolved that field to `undefined`. A garbled
`eip712Domain()` next to a working `name()` then produced permit typed data for a guessed domain
(`version: "1"`). The previous ADR does not name an error for this case, and leaving viem's raw
decode error would break the rule that every failure mode is a typed SDK error.
ADR-2026-10-09 names `morpho-sdk` 7.0.0, but 7.0.0 shipped as the MidnightBundlesV2 major
without these errors, so the fail-closed errors first ship in `morpho-sdk` 8.0.0.

## Decision

`fetchToken` and `Token.fetch` (`blue-sdk-viem` 7.0.0) throw `MalformedTokenMetadataError(token,
field)`, whose `cause` holds the viem decode error or the deployless query's revert when one
exists — a `bytes32` retry that returns data that is not exactly 32 bytes throws with no `cause` —
when the call to `field` succeeds but returns non-empty data that does not decode:

- `field: "eip712Domain"` — the `eip712Domain()` result is not a valid EIP-5267 tuple;
- `field: "name"` or `"symbol"` — the result decodes neither as `string` nor, on the retry, as
  `bytes32`.

Under `deployless: true` or `"force"`, the `GetToken` query reports malformed
`name()`/`symbol()`/`eip712Domain()` returndata, which it validates more strictly than viem
(it requires the `0x20` string offset), and the fetch throws `MalformedTokenMetadataError`
without falling back to direct reads.

A revert or missing code still resolves the field to `undefined`; transport errors still
propagate. This record retargets ADR-2026-10-09's `morpho-sdk` scope from 7.0.0 to 8.0.0 for
every error that record lists, not just `MalformedTokenMetadataError`; `blue-sdk-viem` 7.0.0
and `wdk-protocol-lending-morpho-evm` 3.0.0 are unchanged. The error reaches the same exports that ADR-2026-10-09 lists for `fetchToken`, including
`encodeErc20Permit` and requirement resolution in `morpho-sdk` 8.0.0 and
`wdk-protocol-lending-morpho-evm` 3.0.0, which ship it in the same majors without a deprecation
minor. `useSimplePermit` does not fall back to Permit2 or an approval on this error.

ADR-2026-10-09's other limits apply unchanged: the majors, migration guides and maintained-dependent
audit are still required, and no other error inherits this extension.

## Invariants

- No permit typed data is built from a malformed `eip712Domain()` result → the token metadata
  tests for a garbled `eip712Domain()` assert `MalformedTokenMetadataError` with
  `field: "eip712Domain"`, in direct reads and in every deployless mode.
- A `bytes32` `name`/`symbol` still resolves → the bytes32 fallback tests.
- Revisit if another malformed-result case needs a typed error not listed here.

## References

- [ADR-2026-10-09: Ship fail-closed token, chain and contract-code errors without a deprecation minor](./ADR-2026-10-09-fail-closed-errors-without-deprecation.md)
- Accepted in the PR that added this file.
