import { MathLib } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, isAddressEqual } from "viem";
import { MissingVerificationEvidenceError } from "../errors.js";
import type { SlippageQuote } from "../limits.js";
import type { SimulatedOperation } from "../result.js";
import type { Transfer } from "../types.js";
import type { CheckContext } from "./context.js";
import { operationMeasurementPlan } from "./measurement-plan.js";
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
  readonly requestTransactions: readonly {
    readonly from: Address;
    readonly value?: bigint;
  }[];
}): readonly SimulatedOperation[] {
  const { ctx, before, after, transfers, requestTransactions } = params;
  return params.operations.map(({ limit, measurements }) => {
    const subject = operationMeasurementPlan(limit).subject;
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
        const tracedOutgoing = transfers.reduce(
          (total, transfer) =>
            isAddressEqual(transfer.token, ethAddress) &&
            isAddressEqual(transfer.from, measurement.account)
              ? total + transfer.amount
              : total,
          0n,
        );
        const sentValue = requestTransactions.reduce(
          (total, transaction) =>
            isAddressEqual(transaction.from, measurement.account)
              ? total + (transaction.value ?? 0n)
              : total,
          0n,
        );
        if (tracedOutgoing < sentValue) {
          throw new MissingVerificationEvidenceError(
            `Missing native transfer evidence for "${measurement.field}" from a transaction with value.`,
            { context: { ...context, field: measurement.field } },
          );
        }
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
      checkedLimits: checkSlippage({
        limits: limit,
        observed,
        context,
        debtShares: measurements.some(
          (measurement) =>
            measurement.type === "position" &&
            measurement.shares === "borrowShares",
        ),
      }),
    };
  });
}
