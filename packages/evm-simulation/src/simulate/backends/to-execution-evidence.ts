import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import {
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
} from "../../errors.js";
import type { SimulationCall } from "../../types.js";
import {
  type At,
  preparationContext,
  verificationContext,
} from "../internal/error-context.js";
import type {
  DecodedProbeRead,
  ExecutionEvidence,
  ObservedSnapshot,
} from "../internal/stages.js";
import { brandExecuted } from "../internal/stages.js";
import { decodeProbeResult } from "../plan/probes.js";
import type { SimulationExecution } from "./parse-response.js";

/**
 * Normalize a {@link SimulationExecution} into branded
 * {@link ExecutionEvidence}: call results keep their planned identities,
 * probe returns are decoded into phase buckets, preparation calls are grouped
 * by `authorizationIndex`, and native-balance readings seed the observed
 * wallet snapshots.
 *
 * @param execution - The boundary output pairing every planned call with its
 *   result.
 * @returns Deep-frozen, stage-branded evidence ready for authorization proof.
 * @throws {PermissionChangeMismatchError} When a preparation call reverted.
 * @throws {MissingVerificationEvidenceError} When a planned probe produced no
 *   successful observation or returned undecodable data.
 * @internal
 */
export function toExecutionEvidence(
  execution: SimulationExecution,
): ExecutionEvidence {
  const { plan, block, calls } = execution;
  const context = {
    chainId: block.chainId,
    stateBlockNumber: block.stateBlockNumber,
    stateBlockHash: block.stateBlockHash,
    stateBlockTimestamp: block.stateBlockTimestamp,
    blockNumber: block.blockNumber,
    blockTimestamp: block.blockTimestamp,
  };
  const at: At = { context, mode: plan.request.mode };

  const probeReads: {
    [Phase in keyof ExecutionEvidence["probeReads"]]: DecodedProbeRead[];
  } = {
    before: [],
    prepared: [],
    intermediate: [],
    after: [],
  };
  const preparations = new Map<number, SimulationCall[]>();
  const seenPreparations = new Set<string>();
  const snapshots: ObservedSnapshot[] = [];
  const observed = new Set<string>();

  for (const { planned, result } of calls) {
    const { identity } = planned;
    if (identity.type === "authorization") {
      seenPreparations.add(
        `${identity.authorizationIndex}:${identity.preparationCallIndex}`,
      );
      if (!result.status) {
        throw new PermissionChangeMismatchError(
          `Preparation call ${identity.preparationCallIndex} for authorization ${identity.authorizationIndex} reverted`,
          {
            context: preparationContext(
              at.context,
              at.mode,
              identity.authorizationIndex,
              { preparationCallIndex: identity.preparationCallIndex },
            ),
          },
        );
      }
      const list = preparations.get(identity.authorizationIndex) ?? [];
      list.push(result);
      preparations.set(identity.authorizationIndex, list);
      continue;
    }
    if (identity.type !== "probe" || !("read" in planned)) continue;
    observed.add(`${identity.phase}:${identity.probeId}`);
    if (!result.status) {
      throw new MissingVerificationEvidenceError(
        `Probe "${identity.probeId}" failed during simulation. Re-submit the bundle; if it persists, check that the endpoint honors stateOverrides code.`,
        {
          context: verificationContext(at.context, at.mode, {
            field: "probeObservation",
          }),
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
          context: verificationContext(at.context, at.mode, {
            field: "probeReturnData",
          }),
          cause: error,
        },
      );
    }
    probeReads[identity.phase].push(decoded);
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

  // Reverted preparations are dropped by the boundary; a planned preparation
  // call with no result is a failed approval either way.
  for (const planned of plan.calls) {
    const { identity } = planned;
    if (
      identity.type === "authorization" &&
      !seenPreparations.has(
        `${identity.authorizationIndex}:${identity.preparationCallIndex}`,
      )
    ) {
      throw new PermissionChangeMismatchError(
        `Preparation call ${identity.preparationCallIndex} for authorization ${identity.authorizationIndex} reverted`,
        {
          context: preparationContext(
            at.context,
            at.mode,
            identity.authorizationIndex,
            { preparationCallIndex: identity.preparationCallIndex },
          ),
        },
      );
    }
  }

  // Failed non-native probes are dropped by the boundary; a planned probe
  // with no observation is missing evidence either way.
  for (const planned of plan.calls) {
    if (planned.identity.type !== "probe") continue;
    const { identity } = planned;
    if (observed.has(`${identity.phase}:${identity.probeId}`)) continue;
    throw new MissingVerificationEvidenceError(
      `Probe "${identity.probeId}" produced no observation. Re-submit the bundle; if it persists, check that the endpoint honors stateOverrides code.`,
      {
        context: verificationContext(at.context, at.mode, {
          field: "probeCoverage",
        }),
      },
    );
  }

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
