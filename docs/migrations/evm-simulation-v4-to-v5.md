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
by class identity. Their constructors, codes and fields are preserved.
Failures and timeouts reject the call; they do not produce a successful result.

`simulationTxs`, `calls`, `transfers`, and `assetChanges` retain their shapes in
this step. Native transfers, including internal transfers such as WETH refunds,
come from `traceTransfers`; they are counted once in net balance changes.
Optional asset `symbol` and `decimals` metadata is no longer supplied by the
retired backend; the log-derived output omits it. Standalone-bundle retention
still rejects net inbound value above 100 raw units per restricted address/token.

## Authorization migration landed in SDK-1293

SDK-1293 removed the legacy `{type: "approval"}` and `{type: "signature"}`
authorization variants and cut the runtime over to the SDK-1292 domain types.
Callers now pass `SimulateParams` (`PreviewSimulateParams |
FinalSimulateParams`) with `mode` defaulting to `"final"`. Instead of the two
legacy variants, preview mode accepts five typed authorization descriptors:
`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`,
`blueAuthorization`, and `blueAuthorizationSignature`.

```ts
// v4
{ type: "approval", token, spender, amount }
// v5 (preview mode)
{ mode: "preview", authorizations: [{ type: "erc20Approval", token, owner, spender, amount }] }
```

Other contract changes in this step: all input fields are `readonly`,
`value` transfers are funded by the sender's real native balance (no balance
inflation — under-funded bundles revert like on-chain), and `simulationTxs` /
`txIdx` index user transactions only — no prepended approval calls appear in
the result. Authorization preparation and consumer-limit enforcement ship in
later PRs: passing `authorizations` or `limits` throws
`UnsupportedVerificationFeatureError` rather than being silently ignored.
The [proposed TIB](../tibs/TIB-2026-09-18-evm-simulation-calldata-verification.md)
describes the target contract.

## Release exception and audit

The user-approved exception dated 2026-09-24 permits `evm-simulation` 5.0.0 to
remove only `TenderlyRpcConfig`, `ChainSimulationConfig.tenderlyRpc`,
Tenderly/provider-fallback behavior, and those two legacy authorization variants
without the prior successor-introduction, `@deprecated`, and published
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
