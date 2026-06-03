import type { Address, BlockTag, Hex } from "viem";

// ─── Config ────────────────────────────────────────────────────────────────────
// Shapes the caller constructs once and passes into `simulate()`.

/**
 * Credentials for the Tenderly Node Web3 Gateway. The `rpcUrl` is the
 * chain-specific gateway URL with the access key embedded in the path,
 * e.g. `https://mainnet.gateway.tenderly.co/{ACCESS_KEY}`.
 */
export interface TenderlyRpcConfig {
  rpcUrl: string;
}

/**
 * Per-chain backend capabilities. Exactly one configuration shape per chain;
 * the discriminated union enforces that **at least one** of `tenderlyRpc`
 * (primary) or `simulateV1Url` (fallback) is supplied.
 */
export type ChainSimulationConfig =
  | {
      /** Tenderly RPC config — `tenderly_simulateTransaction` / `tenderly_simulateBundle`. */
      tenderlyRpc: TenderlyRpcConfig;
      /** JSON-RPC URL supporting `eth_simulateV1`. Optional when Tenderly is set. */
      simulateV1Url?: string;
    }
  | {
      tenderlyRpc?: TenderlyRpcConfig;
      simulateV1Url: string;
    };

/**
 * Top-level configuration for `simulate`.
 *
 * Every chain entry must declare at least one backend (Tenderly RPC primary,
 * `eth_simulateV1` fallback, or both). Calling `simulate` for a `chainId`
 * missing from `chains` throws `UnsupportedChainError`.
 */
export interface SimulationConfig {
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
  readonly token: Address;
  readonly from: Address;
  readonly to: Address;
  readonly amount: bigint;
  /**
   * Index into `SimulationResult.simulationTxs` of the transaction that
   * emitted the underlying log. For bundles with prepended authorization
   * approvals, indices `[0, simulationTxs.length - params.transactions.length)`
   * are authorization txs; the remainder are caller-supplied.
   */
  readonly txIdx: number;
}

/**
 * Happy-path return of `simulate`. All failures throw typed errors.
 *
 * - `simulationTxs` is the full resolved transaction list (including
 *   prepended authorization txs).
 * - `calls[i]` corresponds 1:1 with `simulationTxs[i]` — read raw logs,
 *   status, returnData/gasUsed, and `assetChanges` (per-tx on Tenderly, a
 *   bundle-level aggregate on the last call for `eth_simulateV1`).
 * - `transfers[k].txIdx` indexes into `simulationTxs` to attribute each
 *   transfer to its emitting transaction.
 */
export interface SimulationResult {
  /** The full resolved transaction list (including prepended authorization txs). */
  readonly simulationTxs: readonly SimulationTransaction[];
  /**
   * Per-transaction normalized output. `calls[i]` corresponds 1:1 with
   * `simulationTxs[i]`. Use this to read raw logs, status, return data, gas
   * used, and asset changes (per-tx on Tenderly; a bundle-level aggregate on
   * the last call for `eth_simulateV1`).
   */
  readonly calls: readonly SimulationCall[];
  /** Parsed ERC-20 / WETH9 transfers from the simulation. */
  readonly transfers: readonly Transfer[];
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
 * `calls[i]` corresponds 1:1 with the i-th transaction passed to the
 * backend.
 */
export interface RawSimulationResult {
  calls: RawCall[];
}

/**
 * Normalized EVM log emitted by a single simulated call. The shape is the
 * common subset both backends (`eth_simulateV1` via viem and Tenderly RPC)
 * produce after schema validation. Returned indirectly via
 * `SimulationCall.logs` and consumed by the SDK's transfer parser.
 */
export interface RawLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

/**
 * Internal mirror of `SimulationCall`, mutable during construction by the
 * simulation backends.
 *
 * @internal
 */
export interface RawCall {
  logs: RawLog[];
  status: boolean;
  returnData: Hex;
  gasUsed: bigint;
  /**
   * Asset-changes payload. Tenderly attaches a per-tx blob to each call;
   * `eth_simulateV1` attaches a single sender-scoped, bundle-level aggregate
   * to the last call (see `simulateV1`). Absent when there are no changes.
   */
  assetChanges?: unknown;
}

/**
 * Per-transaction normalized output from the simulation backend.
 *
 * `SimulationResult.calls[i]` corresponds 1:1 with
 * `SimulationResult.simulationTxs[i]`. Use this to read raw logs, status,
 * return data, gas used, and (Tenderly only) asset changes per transaction.
 */
export interface SimulationCall {
  readonly logs: readonly RawLog[];
  /**
   * True iff the call succeeded. The bundle as a whole reverts via
   * `SimulationRevertedError` before the result is returned, so on a
   * successful `simulate()` every entry is `true` today. Field kept for
   * forward-compatibility with backends that may surface per-call status.
   */
  readonly status: boolean;
  /** Return data from the top-level call. */
  readonly returnData: Hex;
  /** Gas used by this call (root frame). */
  readonly gasUsed: bigint;
  /**
   * Asset-changes payload. Opaque `unknown` — do not destructure without
   * validation. The shape differs by backend: Tenderly reports per-tx changes
   * on each call; `eth_simulateV1` reports a single sender-scoped, bundle-level
   * aggregate (`{ token, value: { pre, post, diff } }[]`, native ETH included)
   * attached to the last call. Absent when the backend reports no changes.
   */
  readonly assetChanges?: unknown;
}
