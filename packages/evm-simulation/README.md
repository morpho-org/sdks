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
      // limits: { maxSlippageWad: 1_00000000000000n },
    },
  );
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user
  }
  throw err;
}
```

Each chain entry declares the `eth_simulateV1` JSON-RPC URL used to simulate bundles on that chain. `timeoutMs` (default 5000) is the budget for that single request; there is no fallback provider.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams` (`PreviewSimulateParams` | `FinalSimulateParams`), `SimulationTransaction`, `SimulationAuthorization` (typed `erc20Approval` / `erc2612Permit` / `permit2SignatureTransfer` / `blueAuthorization` / `blueAuthorizationSignature` variants and their typed-data shapes), `SimulationLimits`, `OperationLimit`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`, `ExecutionContext`.
- Default limits: `DEFAULT_MAX_SLIPPAGE_WAD`, `DEFAULT_MIN_LLTV_BUFFER_WAD`, `DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`, `UnsupportedOperationError`, `ProtocolBindingMismatchError`, `UnsupportedVerificationFeatureError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `AssetChangeMismatchError`, `PermissionChangeMismatchError`, `StateChangeMismatchError`, `MarketConstraintViolationError`, `SlippageLimitExceededError`, `FeeMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`.

Until the authorization-verification release, preview `authorizations` and `limits` are rejected with `UnsupportedVerificationFeatureError` rather than silently ignored.

### Deeper docs

See [`CLAUDE.md`](./CLAUDE.md) in this directory for pipeline staging, authorizations
encoding, the error hierarchy, retention rules, and the recipe for adding a
chain via `SimulationConfig.chains`.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
