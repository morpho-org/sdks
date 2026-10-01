import { deepFreeze } from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import type { SimulationTransaction } from "../../types.js";
import type { ParsedRequest } from "../request/parse-request.js";
import type { ReadPhase, StateRead } from "../state/contract.js";

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
  readonly request: ParsedRequest;
  readonly owner: Address;
  readonly calls: readonly PlannedCall[];
}

/**
 * Plan the execution of a request as ordered `eth_simulateV1` calls.
 *
 * Sequence (design §plan order): every `before` state read → preparation
 * calls → every user transaction → every `after` state read.
 *
 * Preparation calls run `from` the owner; state reads run `from`
 * `zeroAddress` and never receive a public `txIdx`.
 *
 * @param request - The parsed request.
 * @param owner - The bundle owner; sender of preparation calls.
 * @param preparations - Ordered authorization preparations to simulate.
 * @param reads - The full state-read list, replayed at `before` and `after`.
 * @returns A deep-frozen {@link ExecutionPlan}; pure — equal inputs produce
 *   structurally equal plans.
 * @internal
 */
export function planExecution(params: {
  readonly request: ParsedRequest;
  readonly owner: Address;
  readonly preparations: readonly {
    readonly authorizationIndex: number;
    readonly calls: readonly (SimulationTransaction & {
      readonly value: bigint;
    })[];
  }[];
  readonly reads: readonly StateRead[];
}): ExecutionPlan {
  const { request, owner, preparations, reads } = params;

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

  request.transactions.forEach((transaction, i) => {
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
  });

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

  return deepFreeze({ request, owner, calls });
}
