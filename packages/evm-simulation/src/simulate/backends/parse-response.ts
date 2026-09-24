import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, ethAddress, type Hex } from "viem";
import { z } from "zod";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type { ExecutionContext } from "../../domain/evidence.js";
import {
  brandExecuted,
  type ExecutionEvidence,
  type ExecutionPlan,
  type ObservedSnapshot,
} from "../../domain/stages.js";
import {
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  SimulationRevertedError,
} from "../../errors.js";
import type { RawLog, SimulationCall } from "../../types.js";
import { decodeNativeBalanceProbe } from "../plan/native-balance-probe.js";

const hexString = z.string().regex(/^0x[0-9a-fA-F]*$/);

const responseSchema = z
  .array(
    z.object({
      number: hexString,
      timestamp: hexString,
      hash: hexString,
      calls: z.array(
        z.object({
          status: hexString,
          returnData: hexString,
          gasUsed: hexString,
          logs: z
            .array(
              z.object({
                address: hexString,
                topics: z.array(hexString),
                data: hexString.optional(),
              }),
            )
            .optional(),
          error: z
            .object({
              code: z.number().optional(),
              message: z.string().optional(),
              data: z.unknown().optional(),
            })
            .optional(),
        }),
      ),
    }),
  )
  .length(1);

/**
 * Parse a raw `eth_simulateV1` response into {@link ExecutionEvidence}.
 *
 * The response must be exactly one block at a height at or above the pinned
 * state block. Block advancement is node-specific: geth-style nodes simulate
 * on top of `base + 1` while Anvil reports the base block itself — this parser
 * records whatever the node reports in {@link ExecutionContext} and only
 * rejects a block that lies *behind* the pinned state. Consumers must read
 * `context.blockNumber`/`context.blockTimestamp` and never assume +1.
 *
 * @param params - The plan, the raw RPC `result`, and the resolved state block.
 * @returns Deep-frozen evidence: tagged calls plus one {@link ObservedSnapshot}
 *   per successful probe.
 * @throws {InvalidSimulationResponseError} On any shape violation, a call-count
 *   mismatch, or a simulated block behind the pinned state block.
 * @throws {SimulationRevertedError} When a user-transaction call failed; the
 *   `details` payload carries the tagged user call results only.
 * @throws {MissingVerificationEvidenceError} When a probe call failed or its
 *   return data cannot be decoded.
 * @internal
 */
export function parseSimulationResponse(params: {
  readonly plan: ExecutionPlan;
  readonly response: unknown;
  readonly stateBlockNumber: bigint;
  readonly stateBlockHash: Hex;
  readonly stateBlockTimestamp: bigint;
}): ExecutionEvidence {
  const { plan, response } = params;
  const errorContext: SimulationErrorContext = {
    stage: "evidence",
    chainId: plan.request.chainId,
    mode: plan.request.mode,
  };

  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) {
    throw new InvalidSimulationResponseError(
      "eth_simulateV1 returned an unexpected response shape. Check that the configured endpoint implements eth_simulateV1.",
      errorContext,
    );
  }

  const block = parsed.data[0]!;
  const blockNumber = BigInt(block.number);
  const blockTimestamp = BigInt(block.timestamp);
  if (blockNumber < params.stateBlockNumber) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 simulated at block ${blockNumber}, behind the pinned state block ${params.stateBlockNumber}. Check that the endpoint executes on top of the requested block.`,
      errorContext,
    );
  }
  if (blockTimestamp < params.stateBlockTimestamp) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 reported block timestamp ${blockTimestamp}, behind the pinned state block timestamp ${params.stateBlockTimestamp}. Check that the endpoint executes on top of the requested block.`,
      errorContext,
    );
  }

  if (block.calls.length !== plan.calls.length) {
    throw new InvalidSimulationResponseError(
      `eth_simulateV1 returned ${block.calls.length} call result(s) for ${plan.calls.length} planned call(s). Refusing to map evidence with mismatched lengths.`,
      errorContext,
    );
  }

  const context: ExecutionContext = {
    chainId: plan.request.chainId,
    stateBlockNumber: params.stateBlockNumber,
    stateBlockHash: params.stateBlockHash,
    stateBlockTimestamp: params.stateBlockTimestamp,
    blockNumber,
    blockTimestamp,
  };

  const calls = block.calls.map((call, index) => {
    const planned = plan.calls[index]!;
    const logs: RawLog[] = (call.logs ?? []).map((log) => ({
      address: log.address as Address,
      topics: log.topics as readonly Hex[],
      data: (log.data ?? "0x") as Hex,
    }));
    const result: SimulationCall = {
      logs,
      status: call.status === "0x1",
      returnData: call.returnData as Hex,
      gasUsed: BigInt(call.gasUsed),
    };
    return { planned, result, call };
  });

  // A user-transaction revert belongs to the bundle, not the boundary.
  const failedUserCall = calls.find(
    ({ planned, result }) =>
      planned.identity.type === "transaction" && !result.status,
  );
  if (failedUserCall) {
    throw new SimulationRevertedError(
      failedUserCall.call.error?.message ?? "Simulation failed",
      deepFreeze(
        calls
          .filter(({ planned }) => planned.identity.type === "transaction")
          .map(({ planned, result }) => ({
            identity: planned.identity,
            result,
          })),
      ),
    );
  }

  const snapshots: ObservedSnapshot[] = [];
  for (const { planned, result, call } of calls) {
    if (!("read" in planned)) continue;
    const { identity } = planned;
    if (!result.status) {
      throw new MissingVerificationEvidenceError(
        `Native balance probe "${identity.probeId}" failed during simulation. Re-submit the bundle; if it persists, check that the endpoint honors stateOverrides code.`,
        {
          ...errorContext,
          location: { type: "probe", probeId: identity.probeId },
        },
      );
    }
    let assets: bigint;
    try {
      assets = decodeNativeBalanceProbe(call.returnData as Hex);
    } catch {
      throw new MissingVerificationEvidenceError(
        `Native balance probe "${identity.probeId}" returned undecodable data. Check that the endpoint honors the probe code override.`,
        {
          ...errorContext,
          location: { type: "probe", probeId: identity.probeId },
        },
      );
    }
    snapshots.push({
      identity,
      context,
      snapshot: {
        wallet: [{ account: planned.read.account, token: ethAddress, assets }],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
    });
  }

  return brandExecuted(
    deepFreeze({
      plan,
      context,
      calls: calls.map(({ planned, result }) => ({
        identity: planned.identity,
        result,
      })),
      snapshots,
    }),
  );
}
