import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  AuthorizationPreparation,
  SimulatedOperation,
  SimulationVerification,
  VerifiedSimulationResult,
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
 * calls and state reads never get a public `txIdx`.
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
}): VerifiedSimulationResult {
  const {
    ctx,
    request,
    operations,
    authorizations,
    userCalls,
    transfers,
    assetChanges,
  } = params;

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
    assetChanges,
    verification,
  });
}
