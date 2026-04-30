import type { Address, BlockTag, Hex } from "viem";

// ─── Config ────────────────────────────────────────────────────────────────────
// Shapes the caller constructs once and passes into `simulate()`.

/**
 * Credentials and routing for the Tenderly REST simulation backend.
 * Omit from `SimulationConfig.tenderlyRest` to disable the Tenderly path entirely.
 */
export interface TenderlyRestConfig {
  /** e.g. "https://api.tenderly.co" */
  apiBaseUrl: string;
  accessToken: string;
  accountSlug: string;
  projectSlug: string;
  /** Chain IDs that Tenderly supports for simulation */
  supportedChainIds: Set<number>;
}

/**
 * Per-chain capabilities. Stored as a `Map` value in
 * `SimulationConfig.chains`, keyed by chain ID.
 */
export interface ChainSimulationConfig {
  /** JSON-RPC URL supporting `eth_simulateV1`. undefined = not available for this chain. */
  simulateV1Url?: string;
}

/**
 * Top-level configuration for `simulate`.
 *
 * At least one backend must be reachable for a given chainId — either Tenderly
 * (via `tenderlyRest` with that chainId in `TenderlyRestConfig.supportedChainIds`)
 * or `ChainSimulationConfig.simulateV1Url` in the `chains` map. Otherwise the
 * orchestrator throws `UnsupportedChainError`.
 */
export interface SimulationConfig {
  /** Tenderly REST API config. undefined = Tenderly not available. */
  tenderlyRest?: TenderlyRestConfig;
  /** Per-chain simulation capabilities. */
  chains: Map<number, ChainSimulationConfig>;
  logger?: SimulationLogger;
  /**
   * Overall timeout budget in ms (default 5000). Tenderly gets ~60% of budget.
   * On timeout/failure, fallback gets remaining time (deadline - now).
   */
  timeoutMs?: number;
}

// ─── Call-site data ────────────────────────────────────────────────────────────
// Shapes the caller passes per-call or receives back.

/**
 * A single EVM call to simulate. `from` must be identical across all transactions
 * in a bundle — the orchestrator rejects mixed senders with `SimulationValidationError`.
 */
export interface SimulationTransaction {
  from: Address;
  to: Address;
  data: Hex;
  value?: bigint;
}

/**
 * How the caller expresses a token authorization that must be in place before the
 * main transactions run. The package decides HOW to simulate each one:
 * - "approval" → prepend tx as-is
 * - "signature" → today: encode approve(spender, amount); future: ecrecover override?
 */
export type SimulationAuthorization =
  | { type: "approval"; transaction: SimulationTransaction }
  | {
      type: "signature";
      token: Address;
      spender: Address;
      /** Defaults to maxUint256. Caller can set explicit amount for tokens that don't support max approval. */
      amount?: bigint;
    };

/**
 * A parsed ERC20 / WETH9 transfer extracted from simulation logs. Returned in
 * `SimulationResult.transfers`.
 */
export interface Transfer {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
}

/**
 * Happy-path return of `simulate`. All failures throw typed errors. The same shape is
 * returned regardless of `options.shareable` — fields unused by your use case can be
 * ignored:
 *
 * - Preview (`shareable: true`): read `transfers` + `tenderlyUrl`.
 * - Verify (`shareable: false`, default): read `simulationTxs` + `transfers`, pass both
 *   to `screenAddresses`.
 *
 * `tenderlyUrl` is set only when `shareable: true` AND the Tenderly backend ran
 * successfully (not the `eth_simulateV1` fallback). `assetChanges` is Tenderly-only
 * raw data.
 */
export interface SimulationResult {
  /** The full resolved transaction list (including prepended authorization txs). */
  simulationTxs: SimulationTransaction[];
  /** Parsed ERC-20 / WETH9 transfers from the simulation. */
  transfers: Transfer[];
  /** Shareable Tenderly URL. Present only when `shareable: true` and Tenderly ran (not fallback). */
  tenderlyUrl?: string;
  /** Raw Tenderly `asset_changes` payload. Opaque `unknown` — do not destructure without validation. */
  assetChanges?: unknown;
}

/** Minimal structured logger the package calls for warnings and info. */
export interface SimulationLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Input to `simulate`. Pin a `blockNumber` for deterministic / historical
 * simulation; omit to simulate against `latest`.
 */
export interface SimulateParams {
  chainId: number;
  transactions: SimulationTransaction[];
  authorizations?: SimulationAuthorization[];
  blockNumber?: bigint | BlockTag;
}

// ─── Internal (consumed by backends / pipeline) ───────────────────────────────

/**
 * Internal raw result from a simulation adapter before normalization.
 * Both Tenderly and simulateV1 produce this.
 */
export interface RawSimulationResult {
  logs: RawLog[];
  tenderlyUrl?: string;
  rawAssetChanges?: unknown;
}

export interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}
