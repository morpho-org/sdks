import { deepFreeze } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import {
  brandPlanned,
  type ExecutionPlan,
  type ParsedRequest,
  type PlannedCall,
} from "../../domain/stages.js";
import {
  encodeNativeBalanceProbe,
  NATIVE_BALANCE_PROBE_ADDRESS,
  NATIVE_BALANCE_PROBE_BYTECODE,
} from "./native-balance-probe.js";

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
 * @param request - The branded, normalized request produced by `parseRequest`.
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
    identity: { type: "probe", probeId, phase },
    transaction: {
      from: zeroAddress,
      to: NATIVE_BALANCE_PROBE_ADDRESS,
      data: encodeNativeBalanceProbe(owner),
      value: 0n,
    },
    read: { type: "nativeBalance", account: owner },
  });

  const calls: PlannedCall[] = [probe("native-balance:before", "before")];
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
      probe(`native-balance:after:${i}`, i === last ? "after" : "intermediate"),
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
