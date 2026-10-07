# EVM simulation v4 → v5

## Configure the sole backend

Remove `TenderlyRpcConfig` imports and `ChainSimulationConfig.tenderlyRpc`.
Every configured chain must provide an endpoint supporting `eth_simulateV1`:

```ts
import type { SimulationConfig } from "@morpho-org/evm-simulation";

const config: SimulationConfig = {
  chains: new Map([
    [1, { simulateV1Url: "https://your-eth-simulate-v1-rpc.example" }],
  ]),
  timeoutMs: 5000,
};
```

The type system requires `simulateV1Url`; JavaScript callers with a missing,
empty or non-string endpoint receive `UnsupportedChainError`. A node that does
not implement the method produces `ExternalServiceError`. There is no provider
fallback or automatic retry. The single request receives the entire timeout
budget (default 5000 ms), without the former 60% split or minimum fallback budget.
The optional `logger` continues to receive parsing and retention warnings.

Keep handling `SimulationRevertedError`, `BlacklistViolationError`,
`ExternalServiceError`, `SimulationValidationError`, and `UnsupportedChainError`
by class identity. Their class identities and codes are preserved; see the
[Authorization migration](#authorization-migration) section for the changed `SimulationRevertedError.details` shape.
Two failures that v4 reported as the bypassable `ExternalServiceError` now
throw the non-bypassable `InvalidSimulationResponseError`: a malformed
`eth_simulateV1` block envelope and a call count that does not match the
request. Five checks are new — v4 did not perform them and returned a
successful result — and also throw `InvalidSimulationResponseError`: an
endpoint whose `eth_chainId` differs from the configured chain, a simulated
block that is neither the pinned state block nor its immediate successor (or a
successor whose `parentHash` does not match), a block timestamp earlier than
the pinned block's, a per-call result that fails normalization (for example a
non-quantity `gasUsed` or a log without a `topics` array), and a pinned state
block whose hash changed, or that the node no longer serves, during the
simulation. Callers that bypass `ExternalServiceError` to proceed unsimulated
must handle all seven as hard failures. `ExternalServiceError` remains for
transport failures, timeouts and malformed JSON-RPC envelopes.
Failures and timeouts reject the call; they do not produce a successful result.

Since 5.2.0, the endpoint's `eth_chainId` and a mid-flight reorg of the pinned
block are no longer checked, so those two failures no longer occur and five
hard failures remain. `SimulationConfig.chains` must map each chain to a
matching URL.

`simulationTxs`, `calls`, `transfers`, and `assetChanges` retain their shapes in
this step. Native transfers, including internal transfers such as WETH refunds,
come from `traceTransfers`; they are counted once in net balance changes.
Optional asset `symbol` and `decimals` metadata is no longer supplied by the
retired backend; the log-derived output omits it. Standalone-bundle retention
still rejects net inbound value above 100 raw units per restricted address/token.

## Authorization migration

v5 removed the legacy `{type: "approval"}` and `{type: "signature"}`
authorization variants and cut the runtime over to the typed authorization descriptors below.
Callers now pass `SimulateParams` with `mode` defaulting to `"final"`. `blockNumber` is
typed as `bigint | Exclude<BlockTag, "pending">` — `"pending"` has no stable hash and is
rejected at runtime. Instead of the two
legacy variants, preview mode accepts five typed authorization descriptors:
`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`,
`blueAuthorization`, and `blueAuthorizationSignature`. `parseRequest` rejects
unknown keys on `SimulateParams`, transactions, authorizations and limits with
`SimulationValidationError` (`<path>.<key>: unknown field`); v4 ignored extra
properties.

```ts
// v4
{ type: "approval", transaction }
{ type: "signature", token, spender, amount? }
// v5 (preview mode)
{ mode: "preview", authorizations: [{ type: "erc20Approval", token, owner, spender, amount }] }
```

Other contract changes in this step: all input fields are `readonly`,
`value` transfers are funded by the sender's real native balance (no balance
inflation — under-funded bundles revert like on-chain), and `simulationTxs` /
`txIdx` index user transactions only — no prepended approval calls appear in
the result. `SimulationRevertedError.details` carries a URL-free
`{ code, shortMessage }` for node-level reverts or per-transaction results.

## Optional caller limits

`simulate()` now returns any requested slippage checks in
`VerifiedSimulationResult.verification`. Preview requirements can be converted
with `toSimulationAuthorizations`; preparation and user reverts propagate without
an independent authorization or nonce-verification layer.

Replace the earlier unreleased action-specific and absolute bounds with
`SlippageLimits`: a caller-supplied `quote` and required `slippageTolerance`.
Quotes contain one or more raw-unit `assetsReceived`, `sharesMinted`, `assetsPaid`,
or `sharesBurned` amounts. Tolerance is a WAD-scaled percentage (1e16 = 1%),
from 0 through 1e18 inclusive. Outputs may fall and inputs may rise by at most
that percentage; integer rounding never increases the allowed deviation.

Keep each entry's action and subject, and use `account`/`receiver` for observation
context. Omit `limits` to skip slippage checks; unquoted amounts are unchecked.
There are no implicit economic-policy defaults, penalty/refund checks, or
`transactionIndex` on limits. Measurements cover the named subject across the
whole bundle; use separate simulations for per-transaction checks.
The former single `asset` override is replaced by `assetPaid` and
`assetReceived`, so two-asset operations can select each token independently.
For `vaultV1InKindRedeem` and `vaultV2InKindRedeem`, `assetsReceived` measures
only the receiver's vault-asset wallet balance (the idle portion), not in-kind
Morpho positions.

No transaction calldata is decoded to supply missing limits. Read
`verification.operations[].checkedLimits` for the quote and tolerance checked;
unchecked outcomes are observations, not economic guarantees. See the
[package README](../../packages/evm-simulation/README.md#optional-limits) for units,
subject scope, and which measurements require additional evidence.

The unreleased state-reporting fields `verification.diff` and
`verification.fees` and the removed exported types (`SimulationStateChange`,
`TokenAllowance`, `MorphoAuthorizationChange`, `SignatureNonceChange`,
`SequentialNonceChange`, `Permit2NonceChange`, `Fee`) are gone. Read planning
now depends only on quoted amounts: balances for assets/vault shares, positions
for Blue shares, and existing transfer traces for native assets. Omitted limits
produce no slippage reads. Use the existing `transfers` and `assetChanges` for
transfer reporting, and `verification.operations` for checked quotes.

## Release exception

`evm-simulation` 5.0.0 removes `TenderlyRpcConfig`,
`ChainSimulationConfig.tenderlyRpc` and Tenderly/provider-fallback behavior,
the two legacy authorization variants of `SimulateParams.authorizations`, and
narrows `SimulateParams.blockNumber` to exclude `"pending"` without a prior
deprecation release. This is a one-time exception to the SDK's usual
deprecate-then-remove policy; no other removal inherits it.

No other workspace package depends on `@morpho-org/evm-simulation`, so no
dependent package needs a bump. The `viem` peer range is unchanged, and v4
remains available.
