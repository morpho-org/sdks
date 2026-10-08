import type { Chain, Client, Transport } from "viem";
import { InvalidChainIdError } from "../errors.js";
import type { SimulateParams } from "../params.js";
import type { VerifiedSimulationResult } from "../result.js";
import { parseRequest } from "./request/index.js";
import { runSimulation } from "./run-simulation.js";

/**
 * Simulate a bundle of EVM transactions.
 *
 * Parses and normalizes the request → resolves a single pinned block (skipped
 * when `params.block` is supplied) → resolves quoted-asset metadata → plans
 * state reads and the execution → executes once through `eth_simulateV1`
 * (simulation with in-block state reads → response
 * parsing) → derives ERC20/WETH9 transfers and net asset changes from the
 * user calls only → decodes quoted balances/positions → runs slippage checks
 * → asserts no funds are retained by standalone `bundles` periphery contracts
 * → returns the result. The caller reads whichever fields they need:
 *
 * - `simulationTxs` → exactly the caller's ordered transactions, normalized
 *   (checksummed addresses, `value` defaulted to `0n`). Internal state reads are
 *   never exposed.
 * - `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`,
 *   `gasUsed`), aligned 1:1 with `simulationTxs[i]`. `gasUsed` is not a safe
 *   gas limit; consumers deriving one must add their own headroom.
 * - `transfers` → user-facing preview / server-side verification; each
 *   transfer's `txIdx` indexes into `simulationTxs`.
 * - `assetChanges` → net per-asset balance changes grouped by account (sender
 *   and counterparties) over the whole bundle.
 *
 * **Modes.** `mode` defaults to `"final"`, which executes the signed calldata
 * against actual permissions and accepts no `authorizations`. `mode:
 * "preview"` accepts typed authorization descriptors, which the pipeline
 * prepares as simulated approval calls. No authorization read-back checks run.
 * `limits` are optional caller-supplied quotes and percentage tolerances;
 * violations throw `ConsumerLimitViolationError`.
 *
 * **Funding.** `value` transfers are funded by the sender's real native
 * balance — no balance inflation — so under-funded bundles revert exactly as
 * they would on-chain. `validation: false` keeps gas from being charged,
 * separating gas from economic effects. Monad nodes reject `false`, so Monad
 * simulations send `true`; its simulated block charges no gas either way.
 *
 * @param client - The caller's viem client; its `chain` sets the chain the
 *   bundle targets and its transport owns the RPC endpoint, timeout and
 *   retries. `client.chain.id` is sent on every call inside `eth_simulateV1`,
 *   so nodes that check it reject a wrong-chain endpoint; there is no
 *   separate `eth_chainId` lookup.
 * @param params - Per-call simulation input.
 * @param params.transactions - The bundle's transactions, in execution order.
 *   All must share the same `from`.
 * @param params.mode - `"final"` (default) or `"preview"`.
 * @param params.authorizations - Preview-only typed authorization descriptors.
 * @param params.limits - Optional quotes and percentage tolerances; unquoted amounts require no reads.
 * @param params.blockNumber - Optional pinned block number or `BlockTag` other
 *   than `"pending"`.
 *   Defaults to `latest` (`finalized` on Monad, whose `latest` block is not
 *   final), resolved exactly once.
 * @param params.block - Optional caller-supplied state block (`number`,
 *   `hash`, `timestamp`). Skips the block lookup, so a simulation without
 *   asset metadata reads makes a single `eth_simulateV1` request. Cannot be
 *   combined with `blockNumber`.
 * @param params.blockOverrides - Optional `eth_simulateV1` block overrides;
 *   `gasLimit` is sent as the simulated block's gas limit. Unset means no
 *   override.
 * @param params.parentHashCheck - Optional check that the simulated block's
 *   `parentHash` equals the pinned block hash. Defaults to on, and to off on
 *   Stable (chain 988), whose nodes never report a matching `parentHash`.
 * @param params.timeoutMs - Bounds the steps `simulate()` drives between
 *   calls (default 5000 ms); in-flight requests follow the client transport's
 *   own timeout and retry policy.
 * @param params.logger - Optional logger for parsing and retention warnings.
 * @throws {InvalidChainIdError} when `client` was built without a `chain`,
 *   or when the node rejects the request `chainId`
 *   because it serves another chain — the client's transport points at the
 *   wrong chain.
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad
 *   addresses, empty transactions, malformed authorizations, final-mode
 *   authorizations, malformed limits, unknown fields, a `"pending"` block tag,
 *   a malformed `block` or one combined with `blockNumber`, a `timeoutMs`
 *   that is not a positive integer within the `AbortSignal.timeout` range, a
 *   `blockOverrides.gasLimit` that is not a positive bigint, a `parentHashCheck`
 *   that is not a boolean, or share quotes for
 *   `blueSupplyCollateral` / `blueWithdrawCollateral`).
 * @throws {ConsumerLimitViolationError} when a declared `limits` bound is
 *   violated by the observed effects.
 * @throws {UnsupportedChainError} when limits or preview authorizations
 *   require a Morpho Blue address absent from blue-sdk's
 *   `getChainAddresses`.
 * @throws {SimulationRevertedError} when a preparation or user transaction reverts.
 * @throws {MissingVerificationEvidenceError} when a planned state read fails
 *   or returns empty data, native outgoing traces do not cover value
 *   sent, or required metadata reverts or returns empty/invalid data.
 * @throws {InvalidSimulationResponseError} when the node response cannot be
 *   trusted (bad shape, call-count mismatch, block that is neither the pinned
 *   state block nor its immediate successor, a successor with a mismatched
 *   `parentHash` (unless `parentHashCheck` is off; off by default on Stable,
 *   chain 988), a block timestamp earlier than the pinned block's, a
 *   malformed per-call result, or a quoted balance/position read whose
 *   non-empty return data cannot be decoded).
 * @throws {BlacklistViolationError} when the simulation leaves value retained
 *   beyond the dust threshold by a `bundles` periphery contract
 *   (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1, MidnightBundlesV1).
 *   Never bypassable.
 * @throws {ExternalServiceError} when the RPC fails or times out (per the
 *   client transport) or returns a malformed JSON-RPC envelope. A looked-up state
 *   block without number/hash is reported as `InvalidSimulationResponseError`.
 * @returns A frozen {@link VerifiedSimulationResult} carrying the normalized
 *   `simulationTxs`, per-tx `calls` (aligned 1:1), parsed `transfers` (each
 *   stamped with `txIdx`), per-account net `assetChanges`, and per-operation
 *   verification outcomes and preparations. Each `verification.operations[i]`
 *   mirrors the `limits.operations[i]` entry it verified. Only the amounts
 *   quoted in each entry are checked; `checkedLimits` identifies precisely
 *   what was checked. Measurements are scoped to the whole bundle.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import {
 *   type Address,
 *   createPublicClient,
 *   encodeFunctionData,
 *   erc20Abi,
 *   getAddress,
 *   http,
 * } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http("https://rpc.example"),
 * });
 * const user: Address = getAddress("0x1111111111111111111111111111111111111111");
 * const usdc: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
 * const recipient: Address = getAddress("0x2222222222222222222222222222222222222222");
 *
 * const result = await simulate(
 *   client,
 *   {
 *     transactions: [
 *       {
 *         from: user,
 *         to: usdc,
 *         data: encodeFunctionData({
 *           abi: erc20Abi,
 *           functionName: "transfer",
 *           args: [recipient, 1_000_000n],
 *         }),
 *       },
 *     ],
 *   },
 * );
 * ```
 */
export async function simulate(
  client: Client<Transport, Chain>,
  params: SimulateParams,
): Promise<VerifiedSimulationResult> {
  if (client.chain === undefined)
    // Unreachable through the type but reachable for JS callers.
    throw new InvalidChainIdError(
      "simulate() requires a client built with a chain (client.chain is undefined). Pass one created with `chain: <chain>` so the target chain is known.",
    );
  return runSimulation({
    client,
    request: parseRequest(params, client.chain.id),
    logger: params.logger,
  });
}
