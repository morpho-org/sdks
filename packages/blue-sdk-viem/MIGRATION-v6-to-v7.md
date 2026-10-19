# Blue SDK viem v6 → v7

Token metadata reads in `fetchToken` (and `Token.fetch`) now fail closed:
v6 silently defaulted or dropped fields when a read failed, v7 only keeps
`name`, `symbol` and `eip712Domain` optional.

Vault fetch paths also read share-token metadata: `fetchVaultConfig`, `fetchVault`,
`fetchVaultUser`, `fetchAccrualVault`, `fetchVaultV2` and `fetchAccrualVaultV2`.
These paths can throw `UnknownTokenError` for unusable share-token decimals,
`MalformedTokenMetadataError` when the share token's `eip712Domain()` or `bytes32`
`name`/`symbol` retry — or the deployless query result — is malformed, and
propagate transport or RPC errors from those metadata reads.

## Handle missing token decimals

`fetchToken` throws `UnknownTokenError` (from `@morpho-org/blue-sdk`) when
`decimals()` reverts, the address has no code, the returned data cannot be
decoded, or the decoded value is outside 0–255. v6 returned `decimals: 0` in every one of these cases, so a
non-contract address or a broken token read produced a usable-looking
`Token`.

Callers that probe arbitrary addresses should catch `UnknownTokenError` by
class identity:

```ts
import { Token, UnknownTokenError } from "@morpho-org/blue-sdk";
import { fetchToken } from "@morpho-org/blue-sdk-viem";

let token: Token;
try {
  token = await fetchToken(address, client);
} catch (error) {
  if (error instanceof UnknownTokenError) {
    // Not a usable ERC-20: no code, reverting or invalid decimals().
    return undefined;
  }
  throw error;
}
```

Genuine 0-decimal tokens still return `decimals: 0`.

A deployless query that reports `decimals: 0` no longer resolves directly:
v7 always falls back to direct ERC-20 reads in that case, because the query
cannot tell a 0-decimal token from a failed or non-standard `decimals()`
read. This applies even with `deployless: "force"`; the confirming reads are
not atomic with the query unless `blockNumber` is pinned. With
`deployless: true` or `"force"`, a query that reports malformed
`name()`/`symbol()`/`eip712Domain()` returndata throws
`MalformedTokenMetadataError` instead of falling back to direct reads: the
query is stricter than viem's decoding (for example, it requires the `0x20`
string offset), so a token that direct reads accept can be rejected in the
default mode.

## Handle transport errors

Transport errors — HTTP 429/503 responses, timeouts — and JSON-RPC
errors that are not revert-shaped now propagate unchanged from any
metadata read. v6 caught every
error and returned the corresponding field as `undefined`, so an outage
looked like missing metadata. Detect retryable transport failures —
timeouts, rate limits, socket errors, HTTP 408/429/5xx — with
`isTransportError(error)` from `@morpho-org/blue-sdk-viem`. Other JSON-RPC
and HTTP errors (for example `-32000 "header not found"` or HTTP 401/403)
also propagate unchanged but return `false`; find them by walking the cause
chain (`error.walk(...)`) for `RpcRequestError` or `HttpRequestError`.
These classes appear in the rejected error's cause chain rather than as the
top-level error, so walk the chain whatever the top-level wrapper is.
`UnknownTokenError` and `MalformedTokenMetadataError` describe the token
itself; the viem errors in the cause chain describe the transport.
A revert-shaped RPC error — a data-less `-32000 "execution reverted"`,
even on a 5xx response — still reads as the method being absent: `name`,
`symbol` and `eip712Domain` become `undefined`, and `decimals()` throws
`UnknownTokenError`.

Only `name`, `symbol` and `eip712Domain` stay optional, and only when the
call reverts or the contract has no code. A `name`/`symbol` result that
does not decode as `string` is retried as `bytes32`; an undecodable
`bytes32` retry or `eip712Domain()` result throws
`MalformedTokenMetadataError(token, field)` — its `cause` holds the viem
decode error or the deployless query's revert when one exists, while a
`bytes32` retry returning data that is not exactly 32 bytes throws with no
`cause`. v6 returned `undefined` in those cases.

## Permit typed data

`getPermitTypedData` throws `MissingPermitDomainNameError` when the token
exposes neither `name()` nor an EIP-5267 domain, and `fetchToken`/`Token.fetch`
throw `MalformedTokenMetadataError` when `eip712Domain()` answers with data
that does not decode. v6 built permit typed
data whose domain `name` was `undefined`, producing a signature the token
contract cannot verify.

Catch `MissingPermitDomainNameError` and fall back to an onchain approval
or Permit2 for those tokens.
