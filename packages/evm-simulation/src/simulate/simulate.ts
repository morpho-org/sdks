import type { SimulateParams } from "../params.js";
import type { VerifiedSimulationResult } from "../result.js";
import type { SimulationConfig } from "../types.js";
import { parseRequest } from "./request/index.js";
import { runSimulation } from "./run-simulation.js";

/**
 * Simulate a bundle of EVM transactions.
 *
 * Parses and normalizes the request → resolves the chain identity → resolves
 * a single pinned block → resolves quoted-asset metadata → plans state reads
 * and the execution → executes once through `eth_simulateV1` under the full
 * timeout budget (simulation with in-block state reads → response parsing →
 * reorg check) → derives ERC20/WETH9 transfers and net asset changes from the
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
 * @param config - Required per-chain `eth_simulateV1` URL, optional per-chain
 *   `blockOverrides.gasLimit` and `parentHashCheck`, optional logger, and the
 *   overall timeout budget.
 * @param params - Per-call simulation input.
 * @param params.chainId - Chain id the bundle targets; must match the endpoint.
 * @param params.transactions - The bundle's transactions, in execution order.
 *   All must share the same `from`.
 * @param params.mode - `"final"` (default) or `"preview"`.
 * @param params.authorizations - Preview-only typed authorization descriptors.
 * @param params.limits - Optional quotes and percentage tolerances; unquoted amounts require no reads.
 * @param params.blockNumber - Optional pinned block number or `BlockTag` other
 *   than `"pending"`.
 *   Defaults to `latest` (`finalized` on Monad, whose `latest` block is not
 *   final), resolved exactly once.
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad
 *   addresses, empty transactions, malformed authorizations, final-mode
 *   authorizations, malformed limits, unknown fields, a `"pending"` block tag, a
 *   `blockOverrides.gasLimit` that is not a positive bigint, a `parentHashCheck`
 *   that is not a boolean, or share quotes for
 *   `blueSupplyCollateral` / `blueWithdrawCollateral`).
 * @throws {ConsumerLimitViolationError} when a declared `limits` bound is
 *   violated by the observed effects.
 * @throws {UnsupportedChainError} when the chain has no `eth_simulateV1`
 *   endpoint configured, or limits/preview authorizations require a Morpho
 *   Blue address absent from blue-sdk's `getChainAddresses`.
 * @throws {SimulationRevertedError} when a preparation or user transaction reverts.
 * @throws {MissingVerificationEvidenceError} when a planned state read fails
 *   or returns empty data, native outgoing traces do not cover value
 *   sent, or required metadata reverts or returns empty/invalid data.
 * @throws {InvalidSimulationResponseError} when the node response cannot be
 *   trusted (bad shape, call-count mismatch, block that is neither the pinned
 *   state block nor its immediate successor, a successor with a mismatched
 *   `parentHash` (unless `parentHashCheck` is off; off by default on Stable, chain 988), a block timestamp earlier than the pinned block's, a
 *   malformed per-call result, a quoted balance/position read whose non-empty
 *   return data cannot be decoded, a state-block hash that changed or a pinned
 *   block that vanished mid-flight, or an
 *   endpoint whose `eth_chainId` differs from `params.chainId`; chain identity
 *   is checked before any block lookup).
 * @throws {BlacklistViolationError} when the simulation leaves value retained
 *   beyond the dust threshold by a `bundles` periphery contract
 *   (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1, MidnightBundlesV1).
 *   Never bypassable.
 * @throws {ExternalServiceError} when the RPC is unavailable within the
 *   timeout budget or returns a malformed JSON-RPC envelope. Chain-id
 *   mismatches and a state block without number/hash are reported as
 *   `InvalidSimulationResponseError`.
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
 * import { type Address, encodeFunctionData, erc20Abi, getAddress } from "viem";
 *
 * const rpcUrl = "https://rpc.example";
 * const user: Address = getAddress("0x1111111111111111111111111111111111111111");
 * const usdc: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
 * const recipient: Address = getAddress("0x2222222222222222222222222222222222222222");
 *
 * const result = await simulate(
 *   { chains: new Map([[1, { simulateV1Url: rpcUrl }]]) },
 *   {
 *     chainId: 1,
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
  config: SimulationConfig,
  params: SimulateParams,
): Promise<VerifiedSimulationResult> {
  return runSimulation({ config, request: parseRequest(params) });
}
