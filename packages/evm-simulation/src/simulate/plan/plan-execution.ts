import { deepFreeze } from "@morpho-org/morpho-ts";
import type { ProbeIdentity } from "../../domain/evidence.js";
import {
  brandPlanned,
  type ExecutionPlan,
  type PlannedCall,
  type ProbeRead,
  type ValidatedAuthorizations,
} from "../../domain/stages.js";
import {
  NATIVE_BALANCE_PROBE_ADDRESS,
  NATIVE_BALANCE_PROBE_BYTECODE,
} from "./native-balance-probe.js";
import { encodeProbeCall, probeId } from "./probes.js";

const NATIVE_READ = (owner: `0x${string}`): ProbeRead => ({
  type: "nativeBalance",
  account: owner,
});

/**
 * Plan the execution of a validated request as ordered `eth_simulateV1` calls.
 *
 * Sequence (design §9):
 * `[before probes]` → preparation calls → `[prepared probes]` →
 * for each user tx: `tx` then `[intermediate probes]`, except the last tx is
 * followed by the full `[after probes]`.
 *
 * - `before`/`after` carry every {@link ProbeRead} in `reads.full` plus the
 *   owner's native-balance probe.
 * - `prepared` (emitted only when preparations exist) and `intermediate`
 *   carry `reads.permissions` plus the owner's native-balance probe.
 * - Preparation calls run `from` the owner; probes run `from` `zeroAddress`.
 *
 * Identities are independent of array offsets: user calls keep the caller's
 * `transactionIndex`; preparation calls carry
 * `{ type: "authorization", authorizationIndex, preparationCallIndex }`;
 * probes carry `{ type: "probe", probeId, phase }`.
 *
 * @param validated - Policy-checked request with ordered preparations.
 * @param reads - The planned probe reads, `full` for boundary snapshots and
 *   `permissions` for the read-back phases between state changes.
 * @returns A deep-frozen {@link ExecutionPlan}; pure — equal inputs produce
 *   structurally equal plans.
 * @internal
 */
export function planExecution(
  validated: ValidatedAuthorizations,
  reads: {
    readonly full: readonly ProbeRead[];
    readonly permissions: readonly ProbeRead[];
  },
): ExecutionPlan {
  const { inputs, preparations } = validated;
  const { bundle } = inputs;
  const request = bundle.request;
  const owner = bundle.owner;

  const seen = new Set<string>();
  const probe = (
    read: ProbeRead,
    phase: ProbeIdentity["phase"],
  ): PlannedCall => {
    seen.add(`${phase}:${probeId(read)}`);
    return {
      identity: { type: "probe", probeId: probeId(read), phase },
      transaction: encodeProbeCall(read),
      read,
    };
  };

  const probeSet = (
    list: readonly ProbeRead[],
    phase: ProbeIdentity["phase"],
  ): PlannedCall[] => {
    const calls: PlannedCall[] = [];
    const native = NATIVE_READ(owner);
    calls.push(probe(native, phase));
    for (const read of list) {
      const id = probeId(read);
      if (seen.has(`${phase}:${id}`)) continue;
      calls.push(probe(read, phase));
    }
    return calls;
  };

  const calls: PlannedCall[] = [...probeSet(reads.full, "before")];

  for (const preparation of preparations) {
    preparation.calls.forEach((transaction, preparationCallIndex) => {
      calls.push({
        identity: {
          type: "authorization",
          authorizationIndex: preparation.authorizationIndex,
          preparationCallIndex,
        },
        transaction,
      });
    });
  }

  if (preparations.length > 0) {
    calls.push(...probeSet(reads.permissions, "prepared"));
  }

  const last = request.transactions.length - 1;
  for (let i = 0; i <= last; i++) {
    const transaction = request.transactions[i]!;
    calls.push({
      identity: { type: "transaction", transactionIndex: i },
      transaction: {
        from: transaction.from,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value ?? 0n,
      },
    });
    calls.push(
      ...probeSet(
        i === last ? reads.full : reads.permissions,
        i === last ? "after" : "intermediate",
      ),
    );
  }

  return brandPlanned(
    deepFreeze({
      request,
      owner,
      calls,
      stateOverrides: [
        {
          address: NATIVE_BALANCE_PROBE_ADDRESS,
          code: NATIVE_BALANCE_PROBE_BYTECODE,
        },
      ],
    }),
  );
}
