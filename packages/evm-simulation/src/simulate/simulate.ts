import {
  _try,
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import type { SimulateParams } from "../domain/request.js";
import {
  InvalidSimulationResponseError,
  UnsupportedVerificationFeatureError,
} from "../errors.js";
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
 * interleaved with synthetic native-balance probes → resolves the chain
 * endpoint → executes once through `eth_simulateV1` under the full timeout
 * budget (chain identity check, single block resolution, pinned simulation) →
 * derives ERC20/WETH9 transfers and net asset changes from the user calls only
 * → asserts no funds are retained by standalone `bundles` periphery contracts →
 * returns the result. The caller reads whichever fields they need:
 *
 * - `simulationTxs` → exactly the caller's ordered transactions, normalized
 *   (checksummed addresses, `value` defaulted to `0n`). Internal probes are
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
 * @param params.blockNumber - Optional pinned block number or `BlockTag`.
 *   Defaults to `latest`, resolved exactly once.
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad
 *   addresses, empty transactions, malformed authorizations, final-mode
 *   authorizations, weakening limits).
 * @throws {UnsupportedVerificationFeatureError} when preview authorizations or
 *   limits are supplied before their verification release.
 * @throws {UnsupportedChainError} when the chain has no `eth_simulateV1`
 *   endpoint configured.
 * @throws {SimulationRevertedError} when a user transaction reverts.
 * @throws {MissingVerificationEvidenceError} when a probe fails or its data
 *   cannot be decoded.
 * @throws {InvalidSimulationResponseError} when the node response cannot be
 *   trusted (bad shape, call-count mismatch, no block advancement).
 * @throws {BlacklistViolationError} when the simulation leaves value retained
 *   beyond the dust threshold by a `bundles` periphery contract
 *   (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1). Never bypassable.
 * @throws {ExternalServiceError} when the RPC is unavailable within the
 *   timeout budget or reports a different chain.
 * @returns A frozen {@link SimulationResult} carrying the normalized
 *   `simulationTxs`, per-tx `calls` (aligned 1:1), parsed `transfers` (each
 *   stamped with `txIdx`), and per-account net `assetChanges`.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import { encodeFunctionData, erc20Abi } from "viem";
 *
 * const result = await simulate(
 *   { chains: new Map([[1, { simulateV1Url: rpcUrl }]]) },
 *   {
 *     chainId: 1,
 *     transactions: [{ from: user, to: usdc, data: transferCalldata }],
 *   },
 * );
 * ```
 */
export async function simulate(
  config: SimulationConfig,
  params: SimulateParams,
): Promise<SimulationResult> {
  const request = parseRequest(params);

  if (request.authorizations.length > 0) {
    throw new UnsupportedVerificationFeatureError(
      "Preview authorization preparation and verification are not implemented yet on the v5 integration branch. Submit the bundle without authorizations or wait for the authorization verification release.",
      {
        mode: request.mode,
        stage: "authorization",
        chainId: request.chainId,
      },
    );
  }
  if (request.limits !== undefined) {
    throw new UnsupportedVerificationFeatureError(
      "Consumer limit enforcement is not implemented yet on the v5 integration branch. Submit the bundle without limits or wait for the verification release.",
      { mode: request.mode, stage: "limits", chainId: request.chainId },
    );
  }

  const wNative = _try(
    () => getChainAddresses(request.chainId).wNative ?? null,
    UnsupportedChainIdError,
  );

  const plan = planExecution(request);
  const evidence = await executeSimulation({
    config,
    plan,
    blockNumber: request.blockNumber,
  });

  const userCalls = evidence.calls
    .filter(
      (
        call,
      ): call is typeof call & {
        identity: { type: "transaction"; transactionIndex: number };
      } => call.identity.type === "transaction",
    )
    .sort((a, b) => a.identity.transactionIndex - b.identity.transactionIndex)
    .map((call) => call.result);
  if (userCalls.length !== request.transactions.length) {
    throw new InvalidSimulationResponseError(
      `Evidence contains ${userCalls.length} user call result(s) for ${request.transactions.length} transaction(s) — refusing to map transfers with mismatched lengths`,
      {
        stage: "evidence",
        chainId: request.chainId,
        mode: request.mode,
      },
    );
  }

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
