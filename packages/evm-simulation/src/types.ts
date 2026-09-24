import type { Address, Hex } from "viem";

// ─── Config ────────────────────────────────────────────────────────────────────
// Shapes the caller constructs once and passes into `simulate()`.

/** Per-chain endpoint for the sole supported simulation method, `eth_simulateV1`. */
export interface ChainSimulationConfig {
  /** JSON-RPC URL supporting `eth_simulateV1`. Required for every configured chain. */
  readonly simulateV1Url: string;
}

/**
 * Top-level configuration for `simulate`.
 *
 * Every chain entry must supply an `eth_simulateV1` endpoint. An absent chain
 * or missing endpoint throws `UnsupportedChainError`; execution never selects
 * another provider after a failure.
 */
export interface SimulationConfig {
  /** Per-chain simulation endpoints. */
  chains: Map<number, ChainSimulationConfig>;
  logger?: SimulationLogger;
  /** Overall execution timeout budget in ms (default 5000). */
  timeoutMs?: number;
}

// ─── Call-site data ────────────────────────────────────────────────────────────
// Shapes the caller passes per-call or receives back.

/**
 * A single EVM call to simulate. `from` must be identical across all transactions
 * in a bundle — the orchestrator rejects mixed senders with `SimulationValidationError`.
 */
export interface SimulationTransaction {
  readonly from: Address;
  readonly to: Address;
  readonly data: Hex;
  readonly value?: bigint;
}

/**
 * Net balance change for a single asset (one token) within an account's entry.
 * Native ETH uses viem's `ethAddress` sentinel as `token`. `symbol`/`decimals`
 * are optional metadata; the log-derived `eth_simulateV1` output omits them.
 */
export interface AssetChange {
  readonly token: Address;
  readonly symbol?: string;
  readonly decimals?: number;
  /** Signed net change of the account's balance, in raw token units. */
  readonly diff: bigint;
}

/**
 * Net per-token balance changes for one account over the whole bundle. Returned
 * for every account that nets a non-zero change, the sender and counterparties
 * alike (the zero address is kept for mints/burns). Accounts and their `changes`
 * are sorted by address for deterministic output.
 *
 * The backend reports the full net native-ETH delta, including ETH moved via
 * internal calls (e.g. a `WETH.withdraw` refund). `traceTransfers` makes the
 * node synthesize native moves as transfer logs under viem's `ethAddress`.
 */
export interface AccountAssetChanges {
  readonly account: Address;
  readonly changes: readonly AssetChange[];
}

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
   * Index into `SimulationResult.simulationTxs` of the user transaction that
   * emitted the underlying log. `txIdx` only ever indexes caller-supplied
   * transactions — internal probes are never exposed in the result.
   */
  readonly txIdx: number;
}

/**
 * Happy-path return of `simulate`. All failures throw typed errors.
 *
 * - `simulationTxs` are exactly the caller's ordered transactions, normalized
 *   (checksummed `from`/`to`, `value` defaulted to `0n`) — internal probes are
 *   never exposed.
 * - `calls[i]` corresponds 1:1 with `simulationTxs[i]` — read raw logs,
 *   status, returnData/gasUsed.
 * - `assetChanges` is the net per-asset balance change over the whole bundle,
 *   grouped by account (sender and counterparties) — see `AccountAssetChanges`.
 * - `transfers[k].txIdx` indexes into `simulationTxs` to attribute each
 *   transfer to its emitting user transaction.
 */
export interface SimulationResult {
  /** Exactly the caller's ordered transactions, normalized. */
  readonly simulationTxs: readonly Readonly<SimulationTransaction>[];
  /**
   * Per-transaction normalized output. `calls[i]` corresponds 1:1 with
   * `simulationTxs[i]`. Use this to read raw logs, status, return data, gas used.
   */
  readonly calls: readonly SimulationCall[];
  /** Parsed ERC-20 / WETH9 transfers from the simulation. */
  readonly transfers: readonly Transfer[];
  /** Net per-asset balance changes, grouped by account, over the whole bundle. */
  readonly assetChanges: readonly AccountAssetChanges[];
}

/** Minimal structured logger the package calls for warnings and info. */
export interface SimulationLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ─── Internal (consumed by backend / pipeline) ───────────────────────────────

/**
 * Internal raw result from a simulation adapter before normalization.
 * `calls[i]` corresponds 1:1 with the i-th transaction passed to the
 * backend; `assetChanges` is the bundle-level aggregate grouped by account.
 */
export interface RawSimulationResult {
  calls: RawCall[];
  assetChanges: AccountAssetChanges[];
}

/**
 * Normalized EVM log emitted by a single simulated call. The shape is the
 * log shape produced by `eth_simulateV1` via viem. Returned indirectly via
 * `SimulationCall.logs` and consumed by the SDK's transfer parser.
 */
export interface RawLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

/**
 * Internal mirror of `SimulationCall`, mutable during construction by the
 * simulation backend.
 *
 * @internal
 */
export interface RawCall {
  readonly logs: readonly RawLog[];
  readonly status: boolean;
  readonly returnData: Hex;
  readonly gasUsed: bigint;
}

/**
 * Per-transaction normalized output from the simulation backend.
 *
 * `SimulationResult.calls[i]` corresponds 1:1 with
 * `SimulationResult.simulationTxs[i]`. Use this to read raw logs, status,
 * return data, and gas used. Net asset changes are reported at the bundle
 * level — see `SimulationResult.assetChanges`.
 */
export interface SimulationCall {
  readonly logs: readonly RawLog[];
  /**
   * True iff the call succeeded. The bundle as a whole reverts via
   * `SimulationRevertedError` before the result is returned, so on a
   * successful `simulate()` every entry is `true` today. Field kept for
   * per-call inspection alongside logs and return data.
   */
  readonly status: boolean;
  /** Return data from the top-level call. */
  readonly returnData: Hex;
  /**
   * Gas consumed by this call's root frame, not a safe gas limit. This is
   * post-refund consumption and does not account for EIP-150's 63/64 rule in
   * nested calls, so consumers deriving a limit must add their own headroom,
   * larger than headroom derived from `eth_estimateGas`.
   */
  readonly gasUsed: bigint;
}
