import { deepFreeze } from "@morpho-org/morpho-ts";
import type { VerifiedSimulationResult } from "../../domain/result.js";
import type { ConstrainedEffects } from "../../domain/stages.js";
import { InvalidSimulationResponseError } from "../../errors.js";
import { type AssetChangeEntry, groupAssetChanges } from "../asset-changes.js";
import { parseTransfers } from "../parsing/index.js";

/**
 * Assemble the public result from constrained effects. Only user
 * transactions appear in `simulationTxs`/`calls`/`transfers` — preparation
 * calls and probes are never exposed.
 *
 * @internal
 * @param effects - Limit-checked effects carrying complete evidence.
 * @returns The deep-frozen {@link VerifiedSimulationResult}.
 * @throws {InvalidSimulationResponseError} when the user call count does not
 *   match the caller's transactions.
 */
export function assembleResult(
  effects: ConstrainedEffects,
): VerifiedSimulationResult {
  const { evidence, verification } = effects.effects;
  const request = evidence.plan.request;

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

  const transfers = parseTransfers(userCalls);

  const entries: AssetChangeEntry[] = [];
  for (const { token, from, to, amount } of transfers) {
    entries.push({ account: to, token, diff: amount });
    entries.push({ account: from, token, diff: -amount });
  }

  return deepFreeze({
    simulationTxs: request.transactions,
    calls: userCalls,
    transfers,
    assetChanges: groupAssetChanges(entries),
    verification,
  });
}
