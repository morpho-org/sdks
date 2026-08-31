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
        tenderlyRpc: { rpcUrl: process.env.TENDERLY_RPC_URL! },
        simulateV1Url: process.env.MAINNET_RPC_URL,
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

Each chain entry must declare at least one backend — `tenderlyRpc` (primary), `simulateV1Url` (fallback), or both. The type system enforces this.

### Simulation fidelity: gas cost & sender balance

Every backend runs the bundle with the sender's native balance overridden to `maxUint256 / 2` and **no gas price** (`SimulationTransaction` cannot express one). This is deliberate — it suppresses false "insufficient funds for gas" reverts for wallets low on the native token — but it has a consequence:

> A bundle step that reverts on-chain **only because** the caller's real, post-gas native balance is too low still **succeeds in simulation**. If that step is encoded with `skipRevert: true`, Bundler3 continues past it on-chain and any funds routed to `bundler3` by earlier steps are stranded — and `BlacklistViolationError` will **not** have fired, because the simulated run retained nothing (Cantina finding 1631).

The Morpho builders (`@morpho-org/morpho-sdk`) avoid this by keeping every native/value-carrying step `skipRevert: false`, so any such bundle reverts atomically rather than silently skipping a step. **Integrators composing raw bundles must uphold the same invariant**, and may additionally keep an on-chain native reserve for gas. `simulate()` is a preview and a retention safety-net, not a guarantee of on-chain success.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `TenderlyRpcConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams`, `SimulationTransaction`, `SimulationAuthorization`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `BlacklistViolationError`, `ExternalServiceError`, `SimulationValidationError`, `UnsupportedChainError`.

### Deeper docs

See [`CLAUDE.md`](./CLAUDE.md) in this directory for the execution flow diagram,
backend tradeoffs, authorizations model, error-handling table,
and recipes for adding a chain or a new backend.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
