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

### Simulation fidelity: fee context

`SimulationTransaction` accepts an optional fee — legacy `gasPrice`, or EIP-1559 `maxFeePerGas` / `maxPriorityFeePerGas` (the two forms are mutually exclusive). When none is set, the simulator runs the bundle at a **non-zero default** (`DEFAULT_SIMULATION_GAS_PRICE`, 1 gwei), never `0`. This matters because the bundler-retention guard makes a security decision from the simulated execution:

> A zero gas price never occurs on-chain. A step that reverts **only** under a positive fee context — e.g. an external route whose settlement nets out gas cost and then fails its own min-out — would succeed in a zero-fee preview. If that step is encoded `skipRevert: true`, Bundler3 skips it on-chain and any funds routed to `bundler3` by earlier steps are stranded, while `BlacklistViolationError` never fires because the preview retained nothing (Cantina finding 1631).

Running at a realistic non-zero gas price reproduces that revert in the preview instead of hiding it. **For an exact preview, pass the transaction's real effective gas price** — the default only guarantees a *possible* execution, not the submitted one, and cannot catch a revert at a gas price the caller did not simulate (nor one driven by state that moves between simulation and inclusion, such as slippage or deadlines). The Morpho builders (`@morpho-org/morpho-sdk`) keep every value-carrying step `skipRevert: false` so any such bundle reverts atomically; **integrators composing raw bundles must uphold the same invariant**.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- `DEFAULT_SIMULATION_GAS_PRICE` — the non-zero gas price a `SimulationTransaction` runs at when it carries no explicit fee.
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
