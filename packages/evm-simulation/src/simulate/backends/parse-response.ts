import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, isAddress, isHex } from "viem";
import { z } from "zod";
import type { SimulationErrorContext } from "../../domain/diagnostics.js";
import type { ExecutionContext } from "../../domain/evidence.js";
import {
  brandExecuted,
  type DecodedProbeRead,
  type ExecutionEvidence,
  type ExecutionPlan,
  type ObservedSnapshot,
} from "../../domain/stages.js";
import {
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
  SimulationRevertedError,
} from "../../errors.js";
import type { RawLog, SimulationCall } from "../../types.js";
import { decodeProbeResult } from "../plan/probes.js";

// RPC quantities are never the empty "0x" — BigInt("0x") would throw.
const quantity = z.string().regex(/^0x[0-9a-fA-F]+$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const hexData = z.string().refine(isHex);
const address = z.string().refine(isAddress);

const responseSchema = z
  .array(
    z.object({
      number: quantity,
      timestamp: quantity,
      hash: bytes32,
      calls: z.array(
        z.object({
          status: z.enum(["0x0", "0x1"]),
          returnData: hexData,
          gasUsed: quantity,
          logs: z
            .array(
              z.object({
                address,
                topics: z.array(bytes32),
                data: hexData.optional(),
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
 * Every planned probe call is decoded through {@link decodeProbeResult} and
 * grouped by phase in `probeReads`; every preparation call's result is grouped
 * by `authorizationIndex` in `preparations`. User `calls` keep the caller's
 * `transactionIndex`.
 *
 * @param params - The plan, the raw RPC `result`, and the resolved state block.
 * @returns Deep-frozen evidence.
 * @throws {InvalidSimulationResponseError} On any shape violation, a call-count
 *   mismatch, or a simulated block behind the pinned state block.
 * @throws {SimulationRevertedError} When a user-transaction call failed; the
 *   `details` payload carries the tagged user call results only.
 * @throws {MissingVerificationEvidenceError} When a probe call failed or its
 *   return data cannot be decoded.
 * @throws {PermissionChangeMismatchError} When a preparation call reverted.
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
      { cause: parsed.error },
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

  const probeBuckets = {
    before: [] as DecodedProbeRead[],
    prepared: [] as DecodedProbeRead[],
    intermediate: [] as DecodedProbeRead[],
    after: [] as DecodedProbeRead[],
  };
  const preparations = new Map<number, SimulationCall[]>();
  const snapshots: ObservedSnapshot[] = [];

  for (const { planned, result, call } of calls) {
    if (planned.identity.type === "authorization") {
      const { authorizationIndex } = planned.identity;
      if (!result.status) {
        throw new PermissionChangeMismatchError(
          `Preparation call ${planned.identity.preparationCallIndex} for authorization ${authorizationIndex} reverted${call.error?.message !== undefined ? `: ${call.error.message}` : ""}`,
          {
            ...errorContext,
            location: { type: "authorization", authorizationIndex },
          },
        );
      }
      const list = preparations.get(authorizationIndex) ?? [];
      list.push(result);
      preparations.set(authorizationIndex, list);
      continue;
    }
    if (!("read" in planned) || planned.identity.type !== "probe") continue;
    const { identity } = planned;
    if (identity.type !== "probe") continue;
    if (!result.status) {
      throw new MissingVerificationEvidenceError(
        `Probe "${identity.probeId}" failed during simulation${call.error?.message !== undefined ? `: ${call.error.message}` : ""}. Re-submit the bundle; if it persists, check that the endpoint honors stateOverrides code.`,
        {
          ...errorContext,
          location: { type: "probe", probeId: identity.probeId },
        },
      );
    }
    let decoded: DecodedProbeRead;
    try {
      decoded = decodeProbeResult(planned.read, result.returnData);
    } catch (error) {
      throw new MissingVerificationEvidenceError(
        `Probe "${identity.probeId}" returned undecodable data. Check that the endpoint returns valid contract views.`,
        {
          ...errorContext,
          location: { type: "probe", probeId: identity.probeId },
        },
        { cause: error },
      );
    }
    probeBuckets[identity.phase].push(decoded);
    if (decoded.type === "nativeBalance") {
      snapshots.push({
        identity,
        context,
        snapshot: {
          wallet: [
            {
              account: decoded.account,
              token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address,
              assets: decoded.value,
            },
          ],
          permissions: [],
          positions: [],
          vaults: [],
          markets: [],
        },
      });
    }
  }

  const probeReads: ExecutionEvidence["probeReads"] = probeBuckets;

  return brandExecuted(
    deepFreeze({
      plan,
      context,
      calls: calls.map(({ planned, result }) => ({
        identity: planned.identity,
        result,
      })),
      probeReads,
      preparations: [...preparations.entries()].map(
        ([authorizationIndex, prepCalls]) => ({
          authorizationIndex,
          calls: prepCalls,
        }),
      ),
      snapshots,
    }),
  );
}
