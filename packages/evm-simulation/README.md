# @morpho-org/evm-simulation

## Overview

EVM transaction simulation engine for Morpho — bundle execution preview,
transfer parsing, and net per-account balance changes.

## Installation

```bash
pnpm add @morpho-org/evm-simulation
```

## Usage

```ts
import { simulate, SimulationRevertedError } from "@morpho-org/evm-simulation";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.MAINNET_RPC_URL!),
});

try {
  const { simulationTxs, calls, transfers, assetChanges } = await simulate(
    client,
    {
      timeoutMs: 5000,
      // mode: "final" (default) executes the signed calldata against actual
      // permissions; mode: "preview" accepts typed authorization descriptors.
      transactions: [{ from: user, to: vault, data: encodedDeposit }],
      // limits: { operations: [{ type: "vaultV1Deposit", vault, quote: { sharesMinted: 1000n }, slippageTolerance: 10_000000000000000n }] },
    },
  );
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user; err.reasonCode is currently always "UNKNOWN_REVERT"
  }
  throw err;
}
```

Every call inside `eth_simulateV1`, including preparation calls and state reads, carries `client.chain.id` as a hex quantity, so nodes that check it (geth, Anvil, Monad and Stable do) reject an endpoint on another chain with `InvalidChainIdError`.

The client's transport must point at a JSON-RPC endpoint that supports `eth_simulateV1`. Requests send `validation: false` so gas is not charged. Monad (chain 143) is handled internally: its nodes reject `false`, so it sends `true` (its simulated block charges no gas either way), and it pins to the `finalized` block by default because its `latest` block is not final. On Monad, `gasUsed` reports the call's gas limit, not the gas consumed. Set `blockOverrides.gasLimit` on the params to send that gas limit as the simulated block's `blockOverrides.gasLimit`; without it, no block override is sent. Set `parentHashCheck` on the params to turn on or off the check that the simulated block's `parentHash` is the pinned block hash. It defaults to off on Stable (chain 988), whose nodes report a `parentHash` that never matches the pinned block, and on for every other chain. The block number and timestamp checks always apply. `timeoutMs` (default 5000 ms) bounds the steps `simulate()` drives between calls; in-flight requests follow the client transport's own timeout and retry policy. RPC failures, timeouts and reverts throw typed errors. The optional logger still reports parsing and retention warnings.

Native-ETH movements are observed through `traceTransfers` logs on the simulated calls — no `stateOverrides` or helper contracts are injected.

Upgrading? See the [v5 → v6](../../docs/migrations/evm-simulation-v5-to-v6.md) and [v4 → v5](../../docs/migrations/evm-simulation-v4-to-v5.md) migration guides.

### API surface

All symbols below are re-exported from the package root.

- `simulate(client, params)` — run a bundle through the simulation pipeline.
- `SimulationLogger` (passed as `params.logger`).
- Input types: `SimulateParams` (v5 shape: `mode`, `SimulationAuthorization` requests, `SimulationLimits`), `SimulationMode`, `SimulationTransaction`, `StateBlock` (the optional `SimulateParams.block`: `{ number, hash, timestamp }`).
- `toSimulationAuthorizations({ chainId, mode, blockNumber, owner, requirements })` — map morpho-sdk `ActionRequirement[]` onto `SimulationAuthorization[]` straight from `action.args` — nothing is decoded or validated; validation happens in `simulate()`'s request parser.
- Authorizations and limits: `SimulationAuthorization` and its members (`Erc20ApprovalAuthorization`, `Erc2612PermitAuthorization`, `Permit2TransferAuthorization`, `BlueAuthorization`, `BlueAuthorizationSignature`) with their EIP-712 payloads (`Eip712Domain`, `Eip712Field`, `Erc2612PermitTypedData`, `Permit2TransferTypedData`, `BlueAuthorizationTypedData`); `SimulationLimits`, `OperationLimit`, and the shared `SlippageLimits` and `SlippageQuote`.
- Slippage-check result types: `VerifiedSimulationResult`, `SimulationVerification`, `SimulatedOperation`, `AuthorizationPreparation`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError` (the only bypassable error), `SimulationValidationError`, `UnsupportedChainError`, `InvalidChainIdError` (missing `client.chain` or a wrong-chain endpoint), and the verification errors `UnsupportedOperationError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`.
- Error helpers: `SIMULATION_ERROR_CODES` / `SimulationErrorCode` (every `error.code`), `SimulationErrorContext` (frozen `error.context`; union of the per-stage `SimulationValidationContext`, `SimulationTransportContext`, `SimulationPreparationContext`, `SimulationExecutionContext`, `SimulationVerificationContext`), `SimulationStage`, `SimulationExecutionReason` (`SimulationRevertedError.reasonCode`), `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`), `RetainedAsset`.
- Verification vocabulary: `SIMULATION_MODES` / `SimulationMode`, `OPERATION_TYPES` / `OperationType`, `BLUE_MARKET_OPERATION_TYPES` / `BlueMarketOperationType`, `VAULT_OPERATION_TYPES` / `VaultOperationType`, `SimulationOperationSubject` and its members `BlueMarketOperationSubject`, `BlueRefinanceSubject`, `VaultOperationSubject`, `VaultV1MigrateToV2Subject` (operation groups and the operation-keyed subject union that key limit-bound verification `SimulationErrorContext`s).
### Optional limits

The caller chooses the action, subject, quote, and percentage tolerance. Each
entry supplies `quote` with at least one raw-unit amount: `assetsReceived`,
`sharesMinted`, `assetsPaid`, or `sharesBurned`, plus `slippageTolerance` as a
WAD-scaled fraction (`10_000000000000000n` = 1%, `1e18` = 100%). Tolerance must
be between 0 and 100% inclusive; it has no default. Omit `limits` to skip checks.
Unquoted amounts stay unchecked. The simulator never decodes calldata or fetches
a quote to infer constraints.
Unknown input keys are rejected as `SimulationValidationError` rather than
silently ignored.

Non-empty `limits.operations` and preview authorizations require a Morpho Blue
address registered in blue-sdk's `getChainAddresses`; otherwise
`UnsupportedChainError` is thrown.

Received assets and minted supply shares must be at least
`ceil(quote * (1 - tolerance))`; paid assets and burned supply shares must be at
most `floor(quote * (1 + tolerance))`. For debt shares, minting is capped at
`floor(quote * (1 + tolerance))` and burning must be at least
`ceil(quote * (1 - tolerance))`. Equality and favorable movement pass.

```ts
const result = await simulate(client, {
  transactions,
  limits: {
    operations: [{
      type: "vaultV1Deposit",
      vault,
      account: user, // Share/position owner; defaults to transaction sender.
      receiver: user, // Asset recipient; defaults to transaction sender.
      quote: { sharesMinted: 1_000n, assetsPaid: 1_000n },
      slippageTolerance: 10_000000000000000n, // 1%
    }],
  },
});
// result.verification.operations[0].checkedLimits contains this quote and tolerance.
```

Measurements cover the named subject over the **whole bundle**. Entries do not
attribute aggregate state changes to individual transactions. Use separate
simulations for per-transaction limits. Asset bounds use net wallet balance
changes (gas excluded). For native ETH, set `assetPaid` or `assetReceived` to
viem's `ethAddress` (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`); other
sentinels such as `zeroAddress` are read as ERC-20 tokens. Share bounds use the
selected account's vault shares or Blue position shares. Borrow/repay entries
use debt shares; refinance selects
source shares burned and target shares minted; migration selects source vault
shares burned and target vault shares minted. Combined collateral/borrow actions
measure collateral paid and loan assets received; repay/collateral-withdraw actions
measure loan assets paid and collateral received.

For `vaultV1InKindRedeem` and `vaultV2InKindRedeem`, `assetsReceived` measures
only the receiver's wallet balance of the vault asset (the idle portion); it
does not measure in-kind Morpho positions.

Only slippage is checked; there are no separate refund or penalty checks.
`sharesMinted` and `sharesBurned` quotes for `blueSupplyCollateral` and
`blueWithdrawCollateral` are invalid and throw `SimulationValidationError`
during request parsing. `MissingVerificationEvidenceError` reports runtime
evidence gaps: a failed state read, native outgoing traces that do not cover
value sent, or a metadata read that reverts or returns empty/invalid
data. A quoted balance/position read whose non-empty return data cannot be
decoded throws `InvalidSimulationResponseError`. Excessive slippage throws
`ConsumerLimitViolationError`.

Only quoted amounts are observed. ERC-20 assets and vault shares use `balanceOf`;
Blue shares use `position`. Each distinct call runs before and after the bundle.
Native amounts use the existing transfer traces. Without limits there are no
slippage reads. Quotes with an asset amount resolve `asset()` or market parameters only
when an explicit `assetPaid` or `assetReceived` was not supplied; share-only quotes need no metadata
reads. No vault factories, full entities, allocations, risk metrics, allowances,
or nonces are fetched for slippage.

For example, a Vault V2 deposit quoting assets paid and shares minted makes four
in-bundle view calls — the sender's asset balance and the `account`'s share balance, each before
and after execution — plus one `asset()` read unless `assetPaid` is supplied. `verification.operations[].checkedLimits` records the quote
and tolerance checked. The result does not include broad state snapshots or diffs;
`transfers` and `assetChanges` remain available.

The result's historical `VerifiedSimulationResult` name does not imply that
unchecked outcomes are economically verified.

Preview authorizations remain an adapter from `getRequirements()` through
`toSimulationAuthorizations` into preparation calls. No permission or nonce
read-back policy runs. Successful execution establishes success under the
simulated permissions; it does not prove that a future signature is valid.
Preparation and user-transaction failures still propagate. Final mode executes
actual calldata without preparation. State reads and preparation calls do not
receive public transaction indices.

See [AGENTS.md](./AGENTS.md) for pipeline conventions and retention rules.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
