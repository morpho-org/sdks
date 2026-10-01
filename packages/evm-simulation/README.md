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
import {
  simulate,
  type SimulationConfig,
  SimulationRevertedError
} from "@morpho-org/evm-simulation";

const config: SimulationConfig = {
  chains: new Map([
    [1, { simulateV1Url: process.env.MAINNET_RPC_URL! }],
  ]),
  timeoutMs: 5000,
};

try {
  const { simulationTxs, calls, transfers, assetChanges } = await simulate(
    config,
    {
      chainId: 1,
      // mode: "final" (default) executes the signed calldata against actual
      // permissions; mode: "preview" accepts typed authorization descriptors.
      transactions: [{ from: user, to: vault, data: encodedDeposit }],
      // limits: { operations: [{ type: "vaultV1Deposit", vault, quote: { sharesMinted: 1000n }, slippageTolerance: 10_000000000000000n }] },
    },
  );
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user; err.reasonCode is "UNKNOWN_REVERT" until
    // revert mapping lands with the verification pipeline
  }
  throw err;
}
```

Every chain entry requires `simulateV1Url`, pointing to a JSON-RPC endpoint that supports `eth_simulateV1`. Execution uses the full `timeoutMs` budget (default 5000 ms), with no retries or provider fallback. RPC failures, timeouts and reverts throw typed errors. The optional logger still reports parsing and retention warnings.

Native-ETH movements are observed through `traceTransfers` logs on the simulated calls — no `stateOverrides` or helper contracts are injected.

This is the unreleased v5 integration stack. See the [v4 → v5 migration guide](../../docs/migrations/evm-simulation-v4-to-v5.md) for the backend cutover and remaining release gates.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams` (v5 shape: `mode`, `SimulationAuthorization` requests, `SimulationLimits`), `SimulationMode`, `SimulationTransaction`.
- `toSimulationAuthorizations({ chainId, mode, blockNumber, owner, requirements })` — map morpho-sdk `ActionRequirement[]` onto `SimulationAuthorization[]` straight from `action.args` — nothing is decoded or validated; validation happens in `simulate()`'s request parser.
- Authorizations and limits: `SimulationAuthorization` and its members (`Erc20ApprovalAuthorization`, `Erc2612PermitAuthorization`, `Permit2TransferAuthorization`, `BlueAuthorization`, `BlueAuthorizationSignature`) with their EIP-712 payloads (`Eip712Domain`, `Eip712Field`, `Erc2612PermitTypedData`, `Permit2TransferTypedData`, `BlueAuthorizationTypedData`); `SimulationLimits`, `OperationLimit`, and the shared `SlippageLimits` and `SlippageQuote`.
- Slippage-check result types: `VerifiedSimulationResult`, `SimulationVerification`, `SimulatedOperation`, `AuthorizationPreparation`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`, and the verification errors `UnsupportedOperationError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`.
- Error helpers: `SIMULATION_ERROR_CODES` / `SimulationErrorCode` (every `error.code`), `SimulationErrorContext` (frozen `error.context`; union of the per-stage `SimulationValidationContext`, `SimulationTransportContext`, `SimulationPreparationContext`, `SimulationExecutionContext`, `SimulationVerificationContext`), `SimulationStage`, `SimulationExecutionReason` (`SimulationRevertedError.reasonCode`), `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`), `RetainedAsset`.
- Verification vocabulary: `SIMULATION_MODES` / `SimulationMode`, `OPERATION_TYPES` / `OperationType`, `BLUE_MARKET_OPERATION_TYPES` / `BlueMarketOperationType`, `VAULT_OPERATION_TYPES` / `VaultOperationType`, `SimulationOperationSubject` and its members `BlueMarketOperationSubject`, `BlueRefinanceSubject`, `BlueAuthorizationSubject`, `VaultOperationSubject`, `VaultV1MigrateToV2Subject` (operation groups and the operation-keyed subject union that key the execution/verification `SimulationErrorContext`).
### Optional limits

The caller chooses the action, subject, quote, and percentage tolerance. Each
entry supplies `quote` with at least one raw-unit amount: `assetsReceived`,
`sharesMinted`, `assetsPaid`, or `sharesBurned`, plus `slippageTolerance` as a
WAD-scaled fraction (`10_000000000000000n` = 1%, `1e18` = 100%). Tolerance must
be between 0 and 100% inclusive; it has no default. Omit `limits` to skip checks.
Unquoted amounts stay unchecked. The simulator never decodes calldata or fetches
a quote to infer constraints.

Non-empty `limits.operations` and preview authorizations require a Morpho Blue
address registered in blue-sdk's `getChainAddresses`; otherwise
`UnsupportedChainError` is thrown.

Received assets and minted supply shares must be at least
`ceil(quote * (1 - tolerance))`; paid assets and burned supply shares must be at
most `floor(quote * (1 + tolerance))`. For debt shares, minting is capped at
`floor(quote * (1 + tolerance))` and burning must be at least
`ceil(quote * (1 - tolerance))`. Equality and favorable movement pass.

```ts
const result = await simulate(config, {
  chainId: 1,
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
value sent, or a non-transport metadata read that fails or returns empty/invalid
data. Excessive slippage throws `ConsumerLimitViolationError`.

Only quoted amounts are observed. ERC-20 assets and vault shares use `balanceOf`;
Blue shares use `position`. Each distinct call runs before and after the bundle.
Native amounts use the existing transfer traces. Without limits there are no
slippage reads. Asset-only quotes resolve `asset()` or market parameters only
when an explicit `assetPaid` or `assetReceived` was not supplied; share-only quotes need no metadata
reads. No vault factories, full entities, allocations, risk metrics, allowances,
or nonces are fetched for slippage.

For example, a Vault V2 deposit quoting assets paid and shares minted needs four
view calls: the sender's asset balance and recipient's share balance, each before
and after execution. `verification.operations[].checkedLimits` records the quote
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
