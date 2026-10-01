import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";
import { zeroAddress } from "viem";
import type { SimulationRequest, SimulationTransaction } from "../../types.js";
import type { ReadPhase, StateRead } from "../state/contract.js";
import {
  NATIVE_BALANCE_PROBE_ADDRESS,
  NATIVE_BALANCE_PROBE_BYTECODE,
} from "./native-balance-probe.js";

/** One call planned inside the single `eth_simulateV1` run. @internal */
export type PlannedCall = {
  /** What the call carries on the wire. */
  readonly transaction: SimulationTransaction & { readonly value: bigint };
} & (
  | {
      /** A caller transaction. */
      readonly type: "transaction";
      readonly transactionIndex: number;
    }
  | {
      /** A preview-authorization preparation call. */
      readonly type: "preparation";
      readonly authorizationIndex: number;
      readonly callIndex: number;
    }
  | {
      /** A state read-back call at the `before`/`after` phase. */
      readonly type: "stateRead";
      readonly phase: ReadPhase;
      readonly read: StateRead;
    }
);

/** The ordered call plan for one simulation. @internal */
export interface ExecutionPlan {
  readonly request: SimulationRequest;
  readonly owner: Address;
  readonly calls: readonly PlannedCall[];
  readonly stateOverrides: readonly {
    readonly address: Address;
    readonly code: Hex;
  }[];
}

/**
 * Plan the execution of a request as ordered `eth_simulateV1` calls.
 *
 * Sequence (design §plan order): every `before` state read → preparation
 * calls → for each user tx: `tx` then the native-balance reads of every
 * account (intermediate phase) → every `after` state read.
 *
 * Preparation calls run `from` the owner; state reads run `from`
 * `zeroAddress` and never receive a public `txIdx`.
 *
 * @param request - The parsed request.
 * @param owner - The bundle owner; sender of preparation calls.
 * @param preparations - Ordered authorization preparations to simulate.
 * @param reads - The full state-read list, replayed at `before` and `after`.
 * @param intermediateReads - The reads replayed after each non-final
 *   transaction (native balances of observed accounts).
 * @returns A deep-frozen {@link ExecutionPlan}; pure — equal inputs produce
 *   structurally equal plans.
 * @internal
 */
export function planExecution(params: {
  readonly request: SimulationRequest;
  readonly owner: Address;
  readonly preparations: readonly {
    readonly authorizationIndex: number;
    readonly calls: readonly (SimulationTransaction & {
      readonly value: bigint;
    })[];
  }[];
  readonly reads: readonly StateRead[];
  readonly intermediateReads: readonly StateRead[];
}): ExecutionPlan {
  const { request, owner, preparations, reads, intermediateReads } = params;

  const calls: PlannedCall[] = [];

  for (const read of reads) {
    calls.push({
      type: "stateRead",
      phase: "before",
      read,
      transaction: {
        from: zeroAddress,
        to: read.to,
        data: read.data,
        value: 0n,
      },
    });
  }

  for (const preparation of preparations) {
    preparation.calls.forEach((transaction, callIndex) => {
      calls.push({
        type: "preparation",
        authorizationIndex: preparation.authorizationIndex,
        callIndex,
        transaction: { ...transaction, from: owner },
      });
    });
  }

  const last = request.transactions.length - 1;
  for (let i = 0; i <= last; i++) {
    const transaction = request.transactions[i]!;
    calls.push({
      type: "transaction",
      transactionIndex: i,
      transaction: {
        from: transaction.from,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value ?? 0n,
      },
    });
    for (const read of intermediateReads) {
      calls.push({
        type: "stateRead",
        phase: "intermediate",
        read: {
          ...read,
          id: `${read.id}#tx${i}`,
        },
        transaction: {
          from: zeroAddress,
          to: read.to,
          data: read.data,
          value: 0n,
        },
      });
    }
  }

  for (const read of reads) {
    calls.push({
      type: "stateRead",
      phase: "after",
      read,
      transaction: {
        from: zeroAddress,
        to: read.to,
        data: read.data,
        value: 0n,
      },
    });
  }

  return deepFreeze({
    request,
    owner,
    calls,
    stateOverrides: [
      {
        address: NATIVE_BALANCE_PROBE_ADDRESS,
        code: NATIVE_BALANCE_PROBE_BYTECODE,
      },
    ],
  });
}
