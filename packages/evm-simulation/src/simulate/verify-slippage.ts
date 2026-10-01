import { MathLib } from "@morpho-org/blue-sdk";
import { ethAddress, isAddressEqual } from "viem";
import { MissingVerificationEvidenceError } from "../errors.js";
import type { SlippageQuote } from "../limits.js";
import type { SimulatedOperation } from "../result.js";
import type { Transfer } from "../types.js";
import { type CheckContext, operationSubject } from "./context.js";
import { checkSlippage } from "./slippage.js";
import type { SlippageOperationReads, StateValue } from "./state/read-state.js";

/**
 * Measure only caller-quoted amounts and compare their percentage slippage.
 * @param params - Planned observations, decoded before/after values, and user transfer traces.
 * @returns Each caller subject and its checked quote/tolerance.
 * @throws {ConsumerLimitViolationError} When adverse slippage exceeds tolerance.
 * @throws {MissingVerificationEvidenceError} When a requested observation is absent.
 * @internal
 */
export function verifySlippage(params: {
  readonly ctx: CheckContext;
  readonly operations: readonly SlippageOperationReads[];
  readonly before: ReadonlyMap<string, StateValue>;
  readonly after: ReadonlyMap<string, StateValue>;
  readonly transfers: readonly Transfer[];
}): readonly SimulatedOperation[] {
  const { ctx, before, after, transfers } = params;
  return params.operations.map(({ limit, measurements }) => {
    const subject = operationSubject(limit);
    const context = {
      stage: "verification" as const,
      chainId: ctx.chainId,
      mode: ctx.mode,
      blockNumber: ctx.block.blockNumber,
      ...subject,
    };
    const observed: { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] } =
      {};
    for (const measurement of measurements) {
      let delta: bigint;
      if (measurement.type === "native") {
        delta = 0n;
        for (const transfer of transfers) {
          if (!isAddressEqual(transfer.token, ethAddress)) continue;
          if (isAddressEqual(transfer.to, measurement.account))
            delta += transfer.amount;
          if (isAddressEqual(transfer.from, measurement.account))
            delta -= transfer.amount;
        }
      } else {
        const b = before.get(measurement.readId);
        const a = after.get(measurement.readId);
        if (
          measurement.type === "balance" &&
          typeof b === "bigint" &&
          typeof a === "bigint"
        )
          delta = a - b;
        else if (
          measurement.type === "position" &&
          typeof b === "object" &&
          typeof a === "object"
        )
          delta = a[measurement.shares] - b[measurement.shares];
        else
          throw new MissingVerificationEvidenceError(
            `Missing observation for "${measurement.field}". Check the selected subject.`,
            { context: { ...context, field: measurement.field } },
          );
      }
      observed[measurement.field] =
        measurement.field === "assetsPaid" ||
        measurement.field === "sharesBurned"
          ? MathLib.max(0n, -delta)
          : delta;
    }
    return {
      ...subject,
      account: limit.account ?? ctx.owner,
      receiver: limit.receiver ?? ctx.owner,
      checkedLimits: checkSlippage({ limits: limit, observed, context }),
    };
  });
}
