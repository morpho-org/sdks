import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  AuthorizationPreparation,
  SimulatedOperation,
  SimulationVerification,
  VerifiedSimulationResult,
} from "../result.js";
import type { SimulationCall } from "../types.js";
import { type AssetChangeEntry, groupAssetChanges } from "./asset-changes.js";
import type { CheckContext } from "./context.js";
import { parseTransfers } from "./parsing/index.js";
import type { ParsedRequest } from "./request/parse-request.js";

/**
 * Assemble the public result from the checked pipeline. Only user
 * transactions appear in `simulationTxs`/`calls`/`transfers` — preparation
 * calls and state reads never get a public `txIdx`.
 * @internal
 */
export function assembleResult(params: {
  readonly ctx: CheckContext;
  readonly request: ParsedRequest;
  readonly operations: readonly SimulatedOperation[];
  readonly authorizations: readonly AuthorizationPreparation[];
  readonly userCalls: readonly SimulationCall[];
}): VerifiedSimulationResult {
  const { ctx, request, operations, authorizations, userCalls } = params;

  const transfers = parseTransfers(userCalls);

  const entries: AssetChangeEntry[] = [];
  for (const { token, from, to, amount } of transfers) {
    entries.push({ account: to, token, diff: amount });
    entries.push({ account: from, token, diff: -amount });
  }

  const verification: SimulationVerification = {
    mode: ctx.mode,
    chainId: ctx.chainId,
    blockNumber: ctx.block.blockNumber,
    blockTimestamp: ctx.block.blockTimestamp,
    limits: ctx.limits,
    operations,
    authorizations,
  };

  return deepFreeze({
    simulationTxs: request.transactions,
    calls: userCalls,
    transfers,
    assetChanges: groupAssetChanges(entries),
    verification,
  });
}
