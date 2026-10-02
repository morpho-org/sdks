import {
  _try,
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { SimulateParams } from "../params.js";
import type { SimulationConfig, SimulationResult } from "../types.js";

import { type AssetChangeEntry, groupAssetChanges } from "./asset-changes.js";
import { parseTransfers } from "./parsing/index.js";
import {
  assertNoBundlesRetention,
  executeSimulation,
} from "./pipeline/index.js";
import { planExecution } from "./plan/index.js";
import { parseRequest } from "./request/index.js";

/**
 * Simulate a bundle of EVM transactions.
 *
 * Parses and normalizes the input → plans the execution as ordered user calls
 * → resolves the chain
 * endpoint → executes once through `eth_simulateV1` under the full timeout
 * budget (chain identity check, single block resolution, pinned simulation) →
 * derives ERC20/WETH9 transfers and net asset changes from the user calls only
 * → asserts no funds are retained by standalone `bundles` periphery contracts →
 * returns the result. The caller reads whichever fields they need:
 *
 * - `simulationTxs` → exactly the caller's ordered transactions, normalized
 *   (checksummed addresses, `value` defaulted to `0n`).
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
 * "preview"` accepts typed authorization descriptors, but authorization
 * preparation and verification are not implemented on this integration
 * branch: passing `authorizations` (or `limits`, which is enforced by the
 * verification release) throws `UnsupportedVerificationFeatureError` instead
 * of silently ignoring them.
 *
 * **Funding.** `value` transfers are funded by the sender's real native
 * balance — no balance inflation — so under-funded bundles revert exactly as
 * they would on-chain. `validation: false` keeps gas from being charged,
 * separating gas from economic effects.
 *
 * @param config - Required per-chain `eth_simulateV1` URL, optional logger, and
 *   the overall timeout budget.
 * @param params - Per-call simulation input.
 * @param params.chainId - Chain id the bundle targets; must match the endpoint.
 * @param params.transactions - The bundle's transactions, in execution order.
 *   All must share the same `from`.
 * @param params.mode - `"final"` (default) or `"preview"`.
 * @param params.authorizations - Preview-only typed authorization descriptors.
 * @param params.limits - Optional consumer constraints (tightening only).
 * @param params.blockNumber - Optional pinned block number or `BlockTag` other
 *   than `"pending"`. Defaults to `latest`, resolved exactly once.
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad
 *   addresses, empty transactions, malformed authorizations, final-mode
 *   authorizations, weakening limits, a `"pending"` block tag, unknown fields).
 * @throws {UnsupportedVerificationFeatureError} when preview authorizations or
 *   limits are supplied before their verification release.
 * @throws {UnsupportedChainError} when the chain has no `eth_simulateV1`
 *   endpoint configured.
 * @throws {SimulationRevertedError} when a user transaction or the bundle
 * reverts at the node (including unfundable `value`); `details` carries the
 * URL-free revert context.
 * @throws {InvalidSimulationResponseError} when the node response cannot be
 *   trusted (bad shape, call-count mismatch, block that is neither the pinned
 *   state block nor its immediate successor, a successor whose `parentHash`
 *   is not the pinned hash, a block timestamp earlier than the pinned
 *   block's, a per-call result that fails normalization — non-quantity
 *   `gasUsed`, non-iterable `logs`, malformed log `topics`/`address`/`data` —
 *   or a state-block hash that changed mid-flight) or an
 *   endpoint whose `eth_chainId` differs from `params.chainId` (checked
 *   before any block lookup).
 * @throws {BlacklistViolationError} when the simulation leaves value retained
 *   beyond the dust threshold by a `bundles` periphery contract
 *   (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1, MidnightBundlesV1).
 *   Never bypassable.
 * @throws {ExternalServiceError} when the RPC is unavailable within the
 *   timeout budget, returns a malformed JSON-RPC envelope, or returns a state
 *   block without number/hash.
 * @returns A frozen {@link SimulationResult} carrying the normalized
 *   `simulationTxs`, per-tx `calls` (aligned 1:1), parsed `transfers` (each
 *   stamped with `txIdx`), and per-account net `assetChanges`.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import { type Address, encodeFunctionData, erc20Abi, getAddress } from "viem";
 *
 * const rpcUrl = "https://mainnet.example/rpc";
 * const user: Address = getAddress("0x1111111111111111111111111111111111111111");
 * const usdc: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
 * const recipient: Address = getAddress("0x2222222222222222222222222222222222222222");
 *
 * const result = await simulate( // result: SimulationResult
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
): Promise<SimulationResult> {
  const request = parseRequest(params);

  const wNative = _try(
    () => getChainAddresses(request.chainId).wNative ?? null,
    UnsupportedChainIdError,
  );

  const plan = planExecution(request);
  const execution = await executeSimulation({
    config,
    plan,
  });

  // Plan order is transactionIndex order, so no re-sort is needed.
  const userCalls = execution.transactions.map(
    (transaction) => transaction.result,
  );

  const transfers = parseTransfers(userCalls, {
    wNative,
    logger: config.logger,
  });

  const entries: AssetChangeEntry[] = [];
  for (const { token, from, to, amount } of transfers) {
    entries.push({ account: to, token, diff: amount });
    entries.push({ account: from, token, diff: -amount });
  }
  const assetChanges = groupAssetChanges(entries);

  // Reject retained funds before returning a successful simulation.
  assertNoBundlesRetention({
    chainId: request.chainId,
    transfers,
    assetChanges,
    logger: config.logger,
  });

  return deepFreeze({
    simulationTxs: request.transactions,
    calls: userCalls,
    transfers,
    assetChanges,
  });
}
