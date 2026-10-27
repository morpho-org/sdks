import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  AuthorizationPreparation,
  SimulatedOperation,
  SimulationInputVerification,
  VerifiedSimulationInputResult,
} from "../result.js";
import type {
  AccountAssetChanges,
  SimulationCall,
  Transfer,
} from "../types.js";
import type { CheckContext } from "./context.js";
import type { ParsedRequest } from "./request/parse-request.js";

/**
 * Assemble the public result from the checked pipeline. Only user
 * transactions appear in `simulationTxs`/`calls`/`transfers` — preparation
 * calls, state reads, and assertion calls never get a public `txIdx`.
 * @internal
 */
export function assembleResult(params: {
  readonly ctx: CheckContext;
  readonly request: ParsedRequest;
  readonly operations: readonly SimulatedOperation[];
  readonly authorizations: readonly AuthorizationPreparation[];
  readonly userCalls: readonly SimulationCall[];
  readonly transfers: readonly Transfer[];
  readonly assetChanges: readonly AccountAssetChanges[];
}): VerifiedSimulationInputResult {
  const {
    ctx,
    request,
    operations,
    authorizations,
    userCalls,
    transfers,
    assetChanges,
  } = params;

  const verification: SimulationInputVerification = {
    mode: ctx.mode,
    chainId: ctx.chainId,
    blockNumber: ctx.block.blockNumber,
    blockTimestamp: ctx.block.blockTimestamp,
    limits: request.limits === "none" ? "none" : ctx.limits,
    operations,
    authorizations,
  };

  return deepFreeze({
    simulationTxs: request.transactions.map(({ from, to, data, value }) => ({
      from,
      to,
      data,
      value,
    })),
    calls: userCalls,
    transfers,
    assetChanges,
    verification,
  });
}
