import { MathLib } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, isAddressEqual } from "viem";
import { SlippageCheckUnavailableError } from "../errors.js";
import type { InKindPositionQuote, SlippageQuote } from "../limits.js";
import type { SimulatedOperation } from "../result.js";
import type { RawLog, Transfer } from "../types.js";
import type { CheckContext } from "./context.js";
import { operationMeasurementPlan } from "./measurement-plan.js";
import { measureForceExit } from "./parsing/index.js";
import { checkSlippage } from "./slippage.js";
import type { SlippageOperationReads, StateValue } from "./state/read-state.js";

/**
 * Measure caller-quoted amounts and check their slippage, share-price bounds,
 * and absolute post-bundle Blue position bounds.
 * @param params - Planned observations, decoded before/after values, and user transfer traces.
 * @returns Each caller subject and its checked quote, tolerance, and optional bounds.
 * @throws {ConsumerLimitViolationError} When adverse slippage exceeds tolerance
 *   or a share-price or absolute position bound is violated.
 * @throws {SlippageCheckUnavailableError} When a requested observation or
 *   post-bundle position read is absent, a
 *   quoted force exit has no vault `Withdraw` for the account, or a
 *   `ForceDeallocate` cannot be paired with a Blue `Withdraw` while
 *   `deallocations` is quoted (for example a non-Blue adapter), or when a
 *   `ForceDeallocate` charges a penalty to another account.
 * @throws {InvalidSimulationResponseError} When a matching `ForceDeallocate`/
 *   `Withdraw` event log fails to decode.
 * @internal
 */
export function verifySlippage(params: {
  readonly ctx: CheckContext;
  readonly operations: readonly SlippageOperationReads[];
  readonly before: ReadonlyMap<string, StateValue>;
  readonly after: ReadonlyMap<string, StateValue>;
  readonly transfers: readonly Transfer[];
  /** Raw logs emitted by each user transaction, for force-exit event evidence. */
  readonly logs: readonly (readonly RawLog[])[];
  /** Canonical Morpho Blue address, emitter of the `Withdraw` events counted
   * toward `deallocations` quotes. */
  readonly morpho: Address;
  readonly requestTransactions: readonly {
    readonly from: Address;
    readonly value?: bigint;
  }[];
}): readonly SimulatedOperation[] {
  const { ctx, before, after, transfers, logs, morpho, requestTransactions } =
    params;
  return params.operations.map(
    ({ limit, measurements, positionBoundsReadId }, index) => {
      const label = `Limit operation ${index} (${limit.type})`;
      const subject = operationMeasurementPlan(limit).subject;
      const observed: {
        -readonly [K in keyof SlippageQuote]: SlippageQuote[K];
      } = {};
      const observedPositions: InKindPositionQuote[] = [];
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
            throw new SlippageCheckUnavailableError(
              `${label}: missing native transfer evidence for "${measurement.field}" from a transaction with value.`,
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
            throw new SlippageCheckUnavailableError(
              `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
            );
        }
        const field = measurement.field;
        if (field === "positions") {
          if (measurement.type === "position")
            observedPositions.push({
              marketId: measurement.marketId,
              supplyShares: delta,
            });
          continue;
        }
        observed[field] =
          field === "assetsPaid" || field === "sharesBurned"
            ? MathLib.max(0n, -delta)
            : delta;
      }
      if (limit.quote.positions !== undefined)
        observed.positions = observedPositions;
      if (
        (limit.type === "vaultV2ForceWithdraw" ||
          limit.type === "vaultV2ForceRedeem") &&
        (limit.quote.penalty !== undefined ||
          limit.quote.deallocations !== undefined)
      ) {
        const forceExit = measureForceExit({
          logs,
          vault: limit.vault,
          morpho,
          account: limit.account ?? ctx.owner,
          operationType: limit.type,
          requireDeallocations: limit.quote.deallocations !== undefined,
        });
        if (limit.quote.penalty !== undefined)
          observed.penalty = forceExit.penalty;
        if (limit.quote.deallocations !== undefined)
          observed.deallocations = forceExit.deallocations;
      }
      const afterPosition =
        positionBoundsReadId === undefined
          ? undefined
          : after.get(positionBoundsReadId);
      const position =
        typeof afterPosition === "object" ? afterPosition : undefined;
      return {
        ...subject,
        account: limit.account ?? ctx.owner,
        receiver: limit.receiver ?? ctx.owner,
        checkedLimits: checkSlippage({
          label,
          limits: limit,
          observed,
          debtShares: measurements.some(
            (measurement) =>
              measurement.type === "position" &&
              measurement.shares === "borrowShares",
          ),
          position,
        }),
      };
    },
  );
}
