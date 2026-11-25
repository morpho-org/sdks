import type { Address, BlockTag, Hex } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationInputLimits, SimulationLimits } from "./limits.js";
import type { SimulationTransaction } from "./types.js";

/** Every simulation mode; source of `SimulationMode`. */
export const SIMULATION_MODES = ["preview", "final"] as const;

/** Preview prepares pending permissions; final executes calldata and checks signed-request use. */
export type SimulationMode = (typeof SIMULATION_MODES)[number];

/** A mined block the simulation runs on top of. */
export interface StateBlock {
  /** Block number the simulation runs on top of. */
  readonly number: bigint;
  /** Hash selecting simulation state with `requireCanonical: true`; also checked against successor `parentHash`. */
  readonly hash: Hex;
  /** Block timestamp in Unix seconds; the simulated block must not be earlier. */
  readonly timestamp: bigint;
}

/** Caller-supplied account state in JSON-RPC format, applied before all simulated calls. */
export interface SimulationAccountOverride {
  /** Native balance as a hex quantity, for example `"0x0"`. */
  readonly balance?: Hex;
  /** Account nonce as a uint64 hex quantity. */
  readonly nonce?: Hex;
  /** Replacement bytecode; `"0x"` removes code. */
  readonly code?: Hex;
  /** Replace all storage with these 32-byte slot/value pairs. Cannot accompany `stateDiff`. */
  readonly state?: Readonly<Record<Hex, Hex>>;
  /** Replace only these 32-byte slot/value pairs. Cannot accompany `state`. */
  readonly stateDiff?: Readonly<Record<Hex, Hex>>;
}

/** Account-address map passed unchanged to `eth_simulateV1`; consumers validate its contents. */
export type SimulationStateOverrides = Readonly<
  Record<Address, SimulationAccountOverride>
>;

/**
 * Input to `simulate()`. `mode` defaults to "final".
 */
export interface SimulateParams {
  readonly transactions: readonly SimulationTransaction[];
  /** Defaults to "final". */
  readonly mode?: SimulationMode;
  /**
   * Wallet requests, in order. Preview prepares permissions; final requires
   * use events for ERC-2612 and Blue signatures, and an EcrecoverAuthorizer
   * `SetIsAuthorized` event matching the signed `authorizer`, `authorized`,
   * `isAuthorized`, and `nonce`, without preparing calls.
   */
  readonly authorizations?: readonly SimulationAuthorization[];
  /** Resolved once; defaults to "latest" ("finalized" on Monad, whose
   * "latest" block is not final). Only canonical (mined) blocks can be
   * pinned; `pending` has no stable hash and is rejected at runtime. */
  readonly blockNumber?: bigint | Exclude<BlockTag, "pending">;
  /** State block supplied by the caller, verified with one `eth_getBlockByHash`
   * before code or asset reads. Mismatched number, hash or timestamp is an
   * `InvalidSimulationResponseError`; a missing hash is an `RpcTransportError`.
   * Cannot be combined with `blockNumber`.
   * The hash selects onchain code and metadata reads and simulation state with
   * `requireCanonical: true`, requesting rejection of retained non-canonical blocks;
   * the supplied fields must describe the same block. The successor
   * `parentHash` check is independent (off by default on Stable, 988), and
   * `timestamp` only bounds the simulated block's timestamp.
   * On Monad (143), supply a finalized block: `latest` is
   * not final there, so the block at that number can be replaced and its hash
   * rejected as an `RpcTransportError`. */
  readonly block?: StateBlock;
  /**
   * Caller-controlled hypothetical state for all calls in `eth_simulateV1`, in
   * JSON-RPC format. Contents are not validated or normalized by the SDK.
   * No overrides are added automatically. Results describe
   * this overridden state, not necessarily the state at broadcast. Metadata
   * reads outside `eth_simulateV1` still use the pinned onchain state.
   */
  readonly stateOverrides?: SimulationStateOverrides;
  /**
   * Required caller-selected quotes and/or validated control effects, or the explicit
   * `"none"` opt-out, which skips limit reads and checks, but not final signed-request use checks. Omitted `limits`
   * is rejected rather than silently unchecked.
   * Empty operations require non-empty validated effects covering every caller
   * transaction, excluding preparations. Effect violations report `SimulationEffectError`.
   */
  readonly limits: SimulationLimits | "none";
}

/** Input to `simulate()` accepting typed input limits alongside quote limits. */
export interface SimulateInputParams extends Omit<SimulateParams, "limits"> {
  /** Caller-selected quotes, typed inputs with pinned-block derivations and/or validated effects, or the explicit opt-out. Empty operations require validated effects covering every caller transaction, excluding preparations; effect violations report `SimulationEffectError`. */
  readonly limits: SimulationLimits | SimulationInputLimits | "none";
}
