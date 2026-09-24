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
    [
      1,
      {
        simulateV1Url: process.env.MAINNET_RPC_URL!,
      },
    ],
  ]),
  timeoutMs: 5000,
};

try {
  const { simulationTxs, calls, transfers, assetChanges } = await simulate(
    config,
    {
      chainId: 1,
      transactions: [{ from: user, to: vault, data: encodedDeposit }],
      authorizations: [{ type: "signature", token: usdc, spender: vault }],
    },
  );
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user
  }
  throw err;
}
```

Every chain entry requires `simulateV1Url`, pointing to a JSON-RPC endpoint that supports `eth_simulateV1`. Execution uses the full `timeoutMs` budget (default 5000 ms), with no retries or provider fallback. RPC failures, timeouts and reverts throw typed errors. The optional logger still reports parsing and retention warnings.

This is the unreleased v5 integration stack. See the [v4 → v5 migration guide](../../docs/migrations/evm-simulation-v4-to-v5.md) for the backend cutover and remaining release gates.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams`, `SimulationTransaction`, `SimulationAuthorization`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`.

### Deeper docs

See [`AGENTS.md`](./AGENTS.md) for the simulation pipeline, authorization and retention conventions, and testing requirements.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
