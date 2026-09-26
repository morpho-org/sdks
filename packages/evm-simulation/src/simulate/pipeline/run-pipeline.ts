import { decodeOperations } from "../../decode/operations.js";
import type { VerifiedSimulationResult } from "../../domain/result.js";
import type { CompleteEvidence, ParsedRequest } from "../../domain/stages.js";
import { brandDecoded } from "../../domain/stages.js";
import { InvalidSimulationResponseError } from "../../errors.js";
import type { SimulationConfig, Transfer } from "../../types.js";
import { checkRequests } from "../authorization/policy.js";
import { proveAuthorizations } from "../authorization/prove.js";
import {
  createSimulationClient,
  executePlan,
  readBindings,
  readPinnedInputs,
  resolvePinnedBlock,
} from "../backends/index.js";
import { verifyEffects } from "../effects/verify-effects.js";
import { enforceLimits } from "../limits/enforce-limits.js";
import { parseTransfers } from "../parsing/index.js";
import { planExecution, planProbeReads } from "../plan/index.js";
import { resolveEffectiveLimits } from "../request/effective-limits.js";
import { assembleResult } from "../result/assemble-result.js";
import { resolveChain } from "./resolve-chain.js";

/** Total execution budget for a single `simulate()` call. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Run the full verification pipeline:
 * `parseRequest → decodeAndBind → resolvePinnedBlock → readPinnedInputs →
 * checkRequests → planProbeReads → planExecution → executePlan →
 * parseEvidence → proveAuthorizations → verifyEffects → enforceLimits →
 * assembleResult`.
 *
 * One `AbortSignal` (the request timeout) covers every RPC step: the chain
 * identity check, bindings reads, the pinned block resolution, pinned-state
 * reads, and `eth_simulateV1` itself.
 *
 * @internal
 * @param params - The simulation config and raw caller params.
 * @returns The deep-frozen {@link VerifiedSimulationResult}.
 */
export async function runPipeline(params: {
  readonly config: SimulationConfig;
  readonly request: ParsedRequest;
}): Promise<VerifiedSimulationResult> {
  const { config, request } = params;
  const chain = resolveChain(config, request.chainId);
  const signal = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const client = createSimulationClient(chain.simulateV1Url, signal);

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

  const decoded = decodeOperations({
    chainId: request.chainId,
    mode: request.mode,
    transactions: request.transactions,
    vaults: bindings.vaults,
    preLiquidations: bindings.preLiquidations,
  });
  const bundle = brandDecoded({ request, ...decoded });

  const inputs = await readPinnedInputs({
    client,
    bundle,
    pinnedBlock,
    vaults: bindings.vaults,
    preLiquidations: bindings.preLiquidations,
  });

  const limits = resolveEffectiveLimits(request.limits);
  const validated = checkRequests({ inputs, limits });

  const reads = planProbeReads(bundle, inputs.before, validated.preparations);
  const plan = planExecution(validated, reads);

  // executePlan performs the boundary: chain-id check, reorg re-check, and
  // evidence parsing (probe decode, preparation pairing, revert mapping).
  const evidence = await executePlan({
    rpcUrl: chain.simulateV1Url,
    plan,
    pinnedBlock,
    signal,
  });

  const complete = proveAuthorizations(evidence, validated);

  const transfers = extractUserTransfers(complete);
  const effects = verifyEffects(complete, validated, transfers, config.logger);
  const constrained = enforceLimits(effects);
  return assembleResult(constrained);
}

/** Parse transfers from user calls only; probes/preparations never surface. */
function extractUserTransfers(evidence: CompleteEvidence): readonly Transfer[] {
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

  if (userCalls.length !== evidence.plan.request.transactions.length) {
    throw new InvalidSimulationResponseError(
      `Evidence contains ${userCalls.length} user call result(s) for ${evidence.plan.request.transactions.length} transaction(s) — refusing to map transfers with mismatched lengths`,
      {
        stage: "evidence",
        chainId: evidence.plan.request.chainId,
        mode: evidence.plan.request.mode,
      },
    );
  }
  return parseTransfers(userCalls);
}
