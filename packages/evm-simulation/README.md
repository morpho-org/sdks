# @morpho-org/evm-simulation

## Overview

EVM transaction simulation engine for Morpho — bundle execution preview
and transfer parsing.

## Installation

Add to the consuming app's `package.json`:

```jsonc
{
  "dependencies": {
    "@morpho-org/evm-simulation": "workspace:*"
  }
}
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
        tenderlyRpc: { rpcUrl: process.env.TENDERLY_RPC_URL! },
        simulateV1Url: process.env.MAINNET_RPC_URL,
      },
    ],
  ]),
  timeoutMs: 5000,
};

try {
  const { transfers, simulationTxs } = await simulate(config, {
    chainId: 1,
    transactions: [{ from: user, to: vault, data: encodedDeposit }],
    authorizations: [{ type: "signature", token: usdc, spender: vault }],
  });
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user
  }
  throw err;
}
```

Each chain entry must declare at least one backend — `tenderlyRpc` (primary), `simulateV1Url` (fallback), or both. The type system enforces this.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `TenderlyRpcConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Data types: `SimulationTransaction`, `SimulationAuthorization`, `Transfer`, `SimulateParams`, `SimulationResult`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`.

### Deeper docs

See [`CLAUDE.md`](./CLAUDE.md) in this directory for the execution flow diagram,
backend tradeoffs, authorizations model, error-handling table,
and recipes for adding a chain or a new backend.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
