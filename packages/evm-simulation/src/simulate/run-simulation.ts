import {
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { _try } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import {
  InvalidSimulationResponseError,
  UnsupportedChainError,
} from "../errors.js";
import type { VerifiedSimulationResult } from "../result.js";
import type { SimulationConfig } from "../types.js";
import { groupAssetChanges } from "./asset-changes.js";
import { createSimulationClient } from "./backends/client.js";
import { assertEndpointChain, executePlan } from "./backends/index.js";
import { resolveAssets } from "./backends/resolve-assets.js";
import { resolvePinnedBlock } from "./backends/resolve-pinned-block.js";
import type { CheckContext } from "./context.js";
import { parseTransfers } from "./parsing/index.js";
import { assertNoBundlesRetention } from "./pipeline/bundles-retention.js";
import { resolveChain } from "./pipeline/resolve-chain.js";
import { planExecution } from "./plan/plan-execution.js";
import { prepareAuthorizations } from "./prepare.js";
import type { ParsedRequest } from "./request/parse-request.js";
import { assembleResult } from "./result.js";
import { decodeStateRead, planStateReads } from "./state/read-state.js";
import { verifySlippage } from "./verify-slippage.js";

/** Total execution budget for a single `simulate()` call. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Run the verified simulation pipeline in a single `eth_simulateV1` call:
 * resolve quoted assets → plan quoted observations → execution →
 * slippage comparisons → bundle-retention assertion → result assembly.
 *
 * One `AbortSignal` (the request timeout) covers every RPC step.
 *
 * @internal
 * @param params - The simulation config and the parsed caller request.
 * @returns The deep-frozen {@link VerifiedSimulationResult}.
 */
export async function runSimulation(params: {
  readonly config: SimulationConfig;
  readonly request: ParsedRequest;
}): Promise<VerifiedSimulationResult> {
  const { config, request } = params;
  const chain = resolveChain(config, request.chainId);
  const signal = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const client = createSimulationClient(chain.simulateV1Url, signal);

  const limits = { operations: request.limits?.operations ?? [] };
  const preview = request.mode === "preview";
  const owner = request.transactions[0]!.from;
  const addresses = _try(
    () => getChainAddresses(request.chainId),
    UnsupportedChainIdError,
  );
  const requiresMorpho =
    limits.operations.length > 0 ||
    (preview && request.authorizations.length > 0);
  if (requiresMorpho && addresses?.blue == null)
    throw new UnsupportedChainError(request.chainId);
  const morpho = addresses?.blue ?? zeroAddress;

  await assertEndpointChain({
    client,
    chainId: request.chainId,
    mode: request.mode,
    blockNumber:
      typeof request.blockNumber === "bigint" ? request.blockNumber : undefined,
  });
  const pinnedBlock = await resolvePinnedBlock({
    client,
    blockNumber: request.blockNumber,
    signal,
  });

  // With no calldata decoding, the caller's declared `limits.operations`
  // entries are the operations: subjects for state reads and per-operation
  // checks come straight from the limit list.
  const resolved = await resolveAssets({
    client,
    morpho,
    operations: limits.operations,
    blockNumber: pinnedBlock.number,
    signal,
  });
  const observations = planStateReads({ operations: resolved, owner, morpho });

  const preparations = preview
    ? prepareAuthorizations({
        authorizations: request.authorizations,
        owner,
        morpho,
      })
    : [];

  const plan = planExecution({
    request,
    owner,
    preparations,
    reads: observations.reads,
  });

  // Execute against the block resolved once above; the boundary rechecks its hash.
  const execution = await executePlan({
    client,
    plan,
    stateBlock: pinnedBlock,
  });

  const userCalls = execution.calls
    .filter((call) => call.planned.type === "transaction")
    .map((call) => call.result);
  if (userCalls.length !== request.transactions.length)
    throw new InvalidSimulationResponseError(
      `Execution returned ${userCalls.length} user call result(s) for ${request.transactions.length} transaction(s)`,
    );

  const decodePhase = (phase: "before" | "after") =>
    new Map(
      execution.stateReads
        .filter((read) => read.phase === phase)
        .map(
          (read) =>
            [
              read.read.id,
              decodeStateRead(read.read, read.returnData),
            ] as const,
        ),
    );
  const transfers = parseTransfers(userCalls, {
    wNative: addresses === undefined ? undefined : (addresses.wNative ?? null),
    logger: config.logger,
  });

  const assetChanges = groupAssetChanges(
    transfers.flatMap(({ token, from, to, amount }) => [
      { account: to, token, diff: amount },
      { account: from, token, diff: -amount },
    ]),
  );

  const ctx: CheckContext = {
    chainId: request.chainId,
    mode: request.mode,
    block: execution.block,
    owner,
    limits,
  };

  const authorizations = request.authorizations.map(
    (authorization, authorizationIndex) => ({
      authorizationIndex,
      authorization,
      calls: execution.calls.flatMap(({ planned, result }) =>
        planned.type === "preparation" &&
        planned.authorizationIndex === authorizationIndex
          ? [{ transaction: planned.transaction, result }]
          : [],
      ),
    }),
  );

  const checked = verifySlippage({
    ctx,
    operations: observations.operations,
    before: decodePhase("before"),
    after: decodePhase("after"),
    transfers,
    requestTransactions: request.transactions,
  });

  assertNoBundlesRetention({
    chainId: request.chainId,
    transfers,
    assetChanges,
    logger: config.logger,
  });

  return assembleResult({
    ctx,
    request,
    operations: checked,
    authorizations,
    userCalls,
    transfers,
    assetChanges,
  });
}
