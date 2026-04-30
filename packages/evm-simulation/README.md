# @morpho-org/evm-simulation

EVM transaction simulation engine for Morpho — bundle execution preview,
transfer parsing, and compliance screening.

## Install

Add to the consuming app's `package.json`:

```jsonc
{
  "dependencies": {
    "@morpho-org/evm-simulation": "workspace:*"
  }
}
```

## Quick start

```ts
import {
  simulate,
  screenAddresses,
  type SimulationConfig,
  SimulationRevertedError
} from "@morpho-org/evm-simulation";

const config: SimulationConfig = {
  tenderlyRest: {
    apiBaseUrl: "https://api.tenderly.co",
    accessToken: process.env.TENDERLY_ACCESS_TOKEN!,
    accountSlug: "my-account",
    projectSlug: "my-project",
    supportedChainIds: new Set([1]),
  },
  chains: new Map([[1, { simulateV1Url: process.env.MAINNET_RPC_URL }]]),
  timeoutMs: 5000,
};

try {
  // Pass { shareable: true } when you want a shareable Tenderly URL (user-facing preview).
  // Omit it for server-side verification — the same function, same return shape.
  const { transfers, simulationTxs, tenderlyUrl } = await simulate(
    config,
    {
      chainId: 1,
      transactions: [{ from: user, to: vault, data: encodedDeposit }],
      authorizations: [{ type: "signature", token: usdc, spender: vault }],
    },
    { shareable: true }
  );

  // For server-side flows, pipe into screenAddresses:
  await screenAddresses({ simulationTxs, transfers });
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // show err.reason to the user
  }
  throw err;
}
```

## API surface

All symbols below are re-exported from the package root.

- `simulate(config, params, options?)` — run a bundle through the simulation pipeline. Pass `{ shareable: true }` for a shareable Tenderly URL; omit for server-side verification.
- `screenAddresses({ simulationTxs, transfers, chainalysisApiKey? })` — static sanctioned-set + optional Chainalysis screening.
- Config types: `SimulationConfig`, `TenderlyRestConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Data types: `SimulationTransaction`, `SimulationAuthorization`, `Transfer`, `SimulateParams`, `SimulationResult`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `AddressScreeningError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`.

## Deeper docs

See [`CLAUDE.md`](./CLAUDE.md) in this directory for the execution flow diagram,
backend tradeoffs, authorizations model, screening design, error-handling table,
and recipes for adding a chain or a new backend.
