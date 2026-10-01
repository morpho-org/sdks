# EVM simulation v4 → v5

Status: unreleased integration stack. SDK-1291 implemented the backend cutover
below, SDK-1293 replaced the legacy authorization variants, and SDK-1297
completes the migration and acceptance suite. Do not publish this intermediate
stack. SDK-556 owns publication.

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
SDK-1293 section for the changed `SimulationRevertedError.details` shape.
Several node-side failures that v4 reported as the bypassable
`ExternalServiceError` now throw the non-bypassable
`InvalidSimulationResponseError`: an endpoint whose `eth_chainId` differs from
the configured chain, a malformed `eth_simulateV1` block envelope, a call count
that does not match the request, a simulated block that is neither the pinned
state block nor its immediate successor (or a successor whose `parentHash` does
not match), a block timestamp earlier than the pinned block's, and a pinned
state block whose hash changed during the simulation. Callers that bypass
`ExternalServiceError` to proceed unsimulated must handle these as hard
failures. `ExternalServiceError` remains for transport failures, timeouts and
malformed JSON-RPC envelopes.
Failures and timeouts reject the call; they do not produce a successful result.

`simulationTxs`, `calls`, `transfers`, and `assetChanges` retain their shapes in
this step. Native transfers, including internal transfers such as WETH refunds,
come from `traceTransfers`; they are counted once in net balance changes.
Optional asset `symbol` and `decimals` metadata is no longer supplied by the
retired backend; the log-derived output omits it. Standalone-bundle retention
still rejects net inbound value above 100 raw units per restricted address/token.

## Authorization migration landed in SDK-1293

SDK-1293 removed the legacy `{type: "approval"}` and `{type: "signature"}`
authorization variants and cut the runtime over to the SDK-1292 input types.
Callers now pass `SimulateParams` with `mode` defaulting to `"final"`. `blockNumber` is
typed as `bigint | Exclude<BlockTag, "pending">` — `"pending"` has no stable hash and is
rejected at runtime. Instead of the two
legacy variants, preview mode accepts five typed authorization descriptors:
`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`,
`blueAuthorization`, and `blueAuthorizationSignature`.

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

## Optional caller limits (SDK-1295)

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

The unreleased broad state-reporting fields (`verification.before`, `after`,
`diff`, and `actionDiff`) and their snapshot/diff types are removed. Read planning
now depends only on quoted amounts: balances for assets/vault shares, positions
for Blue shares, and existing transfer traces for native assets. Omitted limits
produce no slippage reads. Use the existing `transfers` and `assetChanges` for
transfer reporting, and `verification.operations` for checked quotes.

## Release exception and audit

Root `AGENTS.md` §7's EVM simulation v5 retirement exception permits
`evm-simulation` 5.0.0 to remove `TenderlyRpcConfig`,
`ChainSimulationConfig.tenderlyRpc` and Tenderly/provider-fallback behavior
(SDK-1291), the two legacy authorization variants of
`SimulateParams.authorizations`, and to narrow `SimulateParams.blockNumber`
to exclude `"pending"` (SDK-1293) without the prior
successor-introduction, `@deprecated`, and published
deprecation-minor/coexistence steps. No other removal inherits this exception.
See root `AGENTS.md` §7 and its `module-api-architecture` review persona.

The major changeset and this migration guide remain required. At the SDK 6.0.0
baseline (`2e2595d59e9db8e3d7533b54d6fbffcf8107c274`), no workspace package has a
direct runtime or peer dependency on `@morpho-org/evm-simulation`, so there are
no dependent bumps or peer-range updates for this change. Re-audit at promotion.
The `viem` peer range is unchanged. A Cantina major audit and public report link
in the release CHANGELOG are required before release, and v4 remains available.

The execution branches start from that exact release commit. At implementation
time, refreshed `main` still contained SDK 5.13.0 and the SDK 6.0.0 release was
on `next`; using the named release preserves the plan's v6 baseline requirement.
