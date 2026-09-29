import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, type Hex, zeroAddress } from "viem";
import type {
  ParsedRequest,
  ParsedTransaction,
} from "../request/parse-request.js";
import {
  encodeNativeBalanceProbe,
  NATIVE_BALANCE_PROBE_ADDRESS,
  NATIVE_BALANCE_PROBE_BYTECODE,
} from "./native-balance-probe.js";

/** One call of an {@link ExecutionPlan}: either a user transaction or a synthetic native-balance probe.
 * @internal
 */
export type PlannedCall =
  | {
      readonly type: "transaction";
      readonly transactionIndex: number;
      readonly transaction: ParsedTransaction;
    }
  | {
      readonly type: "nativeBalanceProbe";
      readonly probeId: string;
      readonly phase: "before" | "intermediate" | "after";
      readonly account: Address;
      readonly transaction: ParsedTransaction;
    };

/** The output of {@link planExecution}: ordered calls plus the `stateOverrides` the probe code needs.
 * @internal
 */
export interface ExecutionPlan {
  readonly request: ParsedRequest;
  readonly owner: Address;
  readonly calls: readonly PlannedCall[];
  readonly stateOverrides: readonly {
    readonly address: Address;
    readonly code: Hex;
  }[];
}

/**
 * Plan the execution of a parsed request as ordered `eth_simulateV1` calls.
 *
 * The sequence interleaves a synthetic native-balance probe between every user
 * transaction: one `before` probe, then for each user transaction the
 * transaction itself followed by a probe (phase `intermediate`, or `after`
 * after the last transaction). Probe identities carry their own index space —
 * user `transactionIndex` values match the caller's transaction positions and
 * never shift with the plan's array offsets.
 *
 * Probe calls are sent `from` the zero address against
 * {@link NATIVE_BALANCE_PROBE_ADDRESS}, whose minimal `BALANCE`-reading
 * bytecode is injected through `stateOverrides`, so the plan depends on no
 * deployed helper contract. The parser rejects transactions targeting the
 * probe address — it is reserved for injected code, not real calls.
 *
 * @param request - The normalized request produced by `parseRequest`.
 * @returns A deep-frozen {@link ExecutionPlan}; pure — equal inputs produce
 *   structurally equal plans.
 * @internal
 */
export function planExecution(request: ParsedRequest): ExecutionPlan {
  const owner = request.transactions[0]!.from;

  const probe = (
    probeId: string,
    phase: "before" | "intermediate" | "after",
  ): PlannedCall => ({
    type: "nativeBalanceProbe",
    probeId,
    phase,
    account: owner,
    transaction: {
      from: zeroAddress,
      to: NATIVE_BALANCE_PROBE_ADDRESS,
      data: encodeNativeBalanceProbe(owner),
      value: 0n,
    },
  });

  const calls: PlannedCall[] = [probe("native-balance:before", "before")];
  const last = request.transactions.length - 1;
  for (let i = 0; i <= last; i++) {
    const transaction = request.transactions[i]!;
    calls.push({
      type: "transaction",
      transactionIndex: i,
      transaction,
    });
    calls.push(
      probe(`native-balance:after:${i}`, i === last ? "after" : "intermediate"),
    );
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
