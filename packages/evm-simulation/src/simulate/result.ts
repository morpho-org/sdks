import { deepFreeze } from "@morpho-org/morpho-ts";
import type {
  AuthorizationPreparation,
  Fee,
  SimulationStateChange,
  SimulationVerification,
  VerifiedSimulationResult,
} from "../result.js";
import type { SimulationCall } from "../types.js";
import { type AssetChangeEntry, groupAssetChanges } from "./asset-changes.js";
import type { CheckContext, CheckedOperation } from "./check/helpers.js";
import { toSimulatedOperation } from "./check/index.js";
import { parseTransfers } from "./parsing/index.js";
import type { ParsedRequest } from "./request/parse-request.js";
import type { ParsedState } from "./state/types.js";

const toPublicState = (state: ParsedState) => ({
  balances: state.balances,
  allowances: state.allowances,
  morphoAuthorizations: state.morphoAuthorizations,
  nonces: state.nonces,
  positions: state.positions,
  markets: state.markets,
  vaults: state.vaults,
});

/**
 * Assemble the public result from the checked pipeline. Only user
 * transactions appear in `simulationTxs`/`calls`/`transfers` — preparation
 * calls and state reads never get a public `txIdx`.
 * @internal
 */
export function assembleResult(params: {
  readonly ctx: CheckContext;
  readonly request: ParsedRequest;
  readonly before: ParsedState;
  readonly after: ParsedState;
  readonly diff: SimulationStateChange;
  readonly actionDiff: SimulationStateChange;
  readonly operations: readonly CheckedOperation[];
  readonly authorizations: readonly AuthorizationPreparation[];
  readonly fees: readonly Fee[];
  readonly userCalls: readonly SimulationCall[];
}): VerifiedSimulationResult {
  const {
    ctx,
    request,
    before,
    after,
    diff,
    actionDiff,
    operations,
    authorizations,
    fees,
    userCalls,
  } = params;

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
    operations: operations.map(toSimulatedOperation),
    authorizations,
    before: toPublicState(before),
    after: toPublicState(after),
    diff,
    actionDiff,
    conversions: [],
    fees,
  };

  return deepFreeze({
    simulationTxs: request.transactions,
    calls: userCalls,
    transfers,
    assetChanges: groupAssetChanges(entries),
    verification,
  });
}
