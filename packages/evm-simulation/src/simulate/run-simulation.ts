import { UnsupportedChainIdError } from "@morpho-org/blue-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { _try } from "@morpho-org/morpho-ts";
import { decodeOperations } from "../decode/operations.js";
import {
  InvalidSimulationResponseError,
  UnsupportedChainError,
} from "../errors.js";
import type { VerifiedSimulationResult } from "../result.js";
import type { SimulationConfig } from "../types.js";
import { groupAssetChanges } from "./asset-changes.js";
import { createSimulationClient } from "./backends/client.js";
import { executePlan } from "./backends/index.js";
import { readBindings, readVaultEntities } from "./backends/read-bindings.js";
import { resolvePinnedBlock } from "./backends/resolve-pinned-block.js";
import { checkAuthorizations } from "./check/authorizations.js";
import { fundingDebitOverrides } from "./check/blue.js";
import type { CheckContext } from "./check/helpers.js";
import { checkOperations } from "./check/index.js";
import { checkUnrelatedState } from "./check/unrelated.js";
import { checkWallet } from "./check/wallet.js";
import { parseTransfers } from "./parsing/index.js";
import { assertNoBundlesRetention } from "./pipeline/bundles-retention.js";
import { resolveChain } from "./pipeline/resolve-chain.js";
import { planExecution } from "./plan/plan-execution.js";
import { prepareAuthorizations } from "./prepare.js";
import { resolveEffectiveLimits } from "./request/effective-limits.js";
import type { ParsedRequest } from "./request/parse-request.js";
import { assembleResult } from "./result.js";
import { accrue } from "./state/accrue.js";
import { diffState } from "./state/diff.js";
import { nativeReads } from "./state/native.js";
import {
  collectSubjects,
  decodeStateRead,
  parseState,
  planStateReads,
} from "./state/read-state.js";

/** Total execution budget for a single `simulate()` call. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Run the verified simulation pipeline in a single `eth_simulateV1` call:
 * pinned-state reads → request bindings → operation decode → read planning
 * (`before` reads, preparations, user txs with intermediate native reads,
 * `after` reads) → execution → per-phase state parse → accrual → diffs →
 * authorization/state-diff verification → per-operation economic checks with
 * inlined consumer limits → wallet/unrelated-state guards → bundle-retention
 * assertion → result assembly.
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

  const addresses = _try(
    () => getChainAddresses(request.chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) throw new UnsupportedChainError(request.chainId);
  if (addresses.blue == null) throw new UnsupportedChainError(request.chainId);

  const pinnedBlock = await resolvePinnedBlock({
    client,
    blockNumber: request.blockNumber,
    signal,
  });

  const bindings = await readBindings({
    client,
    chainId: request.chainId,
    transactions: request.transactions,
    blockNumber: pinnedBlock.number,
  });

  const { owner, operations } = decodeOperations({
    chainId: request.chainId,
    mode: request.mode,
    blockNumber: pinnedBlock.number,
    transactions: request.transactions,
    vaults: bindings.vaults,
    preLiquidations: bindings.preLiquidations,
  });

  const limits = resolveEffectiveLimits(request.limits);
  const preview = request.mode === "preview";

  const subjects = collectSubjects({
    owner,
    operations,
    authorizations: preview ? request.authorizations : [],
    vaults: bindings.vaults,
    preLiquidations: bindings.preLiquidations,
    addresses,
  });

  // Vault entity handles carry accrual state and cap tables the view calls
  // do not expose; the in-block reads still verify every public field.
  const vaultData = await readVaultEntities({
    client,
    vaults: bindings.vaults,
    blockNumber: pinnedBlock.number,
  });

  const reads = planStateReads({
    subjects,
    owner,
    morpho: addresses.blue,
    permit2: addresses.permit2,
    vaultData,
  });
  const intermediateReads = nativeReads([
    ...subjects.accounts,
    ...subjects.bundles,
  ]);

  const preparations = preview
    ? prepareAuthorizations({
        authorizations: request.authorizations,
        owner,
        morpho: addresses.blue,
      })
    : [];

  const plan = planExecution({
    request,
    owner,
    preparations,
    reads,
    intermediateReads,
  });

  // executePlan performs the boundary: chain-id check, single block
  // resolution + reorg re-check, and the single eth_simulateV1 call.
  const execution = await executePlan({
    rpcUrl: chain.simulateV1Url,
    plan,
    blockNumber: pinnedBlock.number,
    signal,
  });

  const userCalls = execution.calls
    .filter((call) => call.planned.type === "transaction")
    .map((call) => call.result);
  if (userCalls.length !== request.transactions.length)
    throw new InvalidSimulationResponseError(
      `Execution returned ${userCalls.length} user call result(s) for ${request.transactions.length} transaction(s)`,
    );

  const decodePhase = (phase: "before" | "after") =>
    execution.stateReads
      .filter((read) => read.phase === phase)
      .map((read) => decodeStateRead(read.read, read.returnData));

  const parse = (phase: "before" | "after") =>
    parseState({
      reads: decodePhase(phase),
      subjects,
      owner,
      morpho: addresses.blue!,
      vaultData,
      marketBindings: new Map(
        subjects.markets.map((binding) => [binding.marketId, binding]),
      ),
    });

  const before = parse("before");
  const after = parse("after");

  // Interest accrual isolates economic effects: `diff` is the raw change,
  // `actionDiff` is what the user actions explain (before accrued to the
  // simulated block's timestamp).
  const accruedBefore = accrue(before, execution.block.blockTimestamp);
  const diff = diffState(before, after);
  const actionDiff = diffState(accruedBefore, after);

  const transfers = parseTransfers(userCalls);
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
    addresses,
  };

  const authorizations = checkAuthorizations({
    ctx,
    authorizations: preview ? request.authorizations : [],
    operations,
    before,
    after,
    executedCalls: execution.calls,
    transfers,
  });

  const {
    operations: checked,
    fees,
    touchedMarketIds,
  } = checkOperations({
    ctx,
    operations,
    accruedBefore,
    after,
    diff,
    actionDiff,
    transfers,
  });

  checkWallet({
    ctx,
    operations,
    actionDiff,
    transfers,
    logger: config.logger,
    fundingDebitOverrides: fundingDebitOverrides(
      operations,
      accruedBefore,
      owner,
    ),
  });

  checkUnrelatedState({ ctx, accruedBefore, after, touchedMarketIds });

  assertNoBundlesRetention({
    chainId: request.chainId,
    transfers,
    assetChanges,
    logger: config.logger,
  });

  return assembleResult({
    ctx,
    request,
    before,
    after,
    diff,
    actionDiff,
    operations: checked,
    authorizations,
    fees,
    userCalls,
  });
}
