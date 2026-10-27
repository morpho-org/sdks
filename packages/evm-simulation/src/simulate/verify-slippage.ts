import { MathLib } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, isAddressEqual } from "viem";
import {
  ConsumerLimitViolationError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import {
  type InKindPositionQuote,
  QUOTE_FIELD_DIRECTION,
  type SlippageQuote,
} from "../limits.js";
import type { SimulatedOperation } from "../result.js";
import type { RawLog, Transfer } from "../types.js";
import type { CheckContext } from "./context.js";
import { operationMeasurementPlan } from "./measurement-plan.js";
import { countPrecedingBlueSupplies } from "./parsing/blue-supply-rounding.js";
import { measureForceExit } from "./parsing/index.js";
import { checkSlippage } from "./slippage.js";
import type { SlippageOperationReads, StateValue } from "./state/read-state.js";

/**
 * Measure caller-quoted amounts and check their slippage, share-price bounds,
 * and absolute post-bundle Blue position bounds.
 * @param params - Planned observations, decoded before/after values, and user transfer traces.
 * @returns Each caller subject and its checked quote, tolerance, and optional bounds.
 * @throws {ConsumerLimitViolationError} When adverse slippage, a share-price or
 *   absolute position bound, or a reduce-only Midnight debt invariant is violated,
 *   including a debt increase on a repay-withdraw without a `debtRepaid` quote
 *   (withdraw-only or full repay).
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
  /** User-call logs for force-exit and Blue supply-rounding evidence. */
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
    (
      {
        limit,
        measurements,
        positionBoundsReadId,
        debtReadId,
        creditReadId,
        collateralReads,
        collateralSupplyReads,
        walletBounds,
        counterSide,
      },
      index,
    ) => {
      const label =
        limit.type === "midnightSupplyCollateralTakeBorrow"
          ? `Limit operation ${index} (${limit.type}, marketId "${limit.marketId}")`
          : limit.type === "midnightSupplyBlueMakeLend"
            ? `Limit operation ${index} (${limit.type}, loanToken "${limit.loanToken}")`
            : `Limit operation ${index} (${limit.type})`;
      const subject = operationMeasurementPlan(limit).subject;
      if (counterSide !== undefined) {
        const b = before.get(counterSide.readId);
        const a = after.get(counterSide.readId);
        if (typeof b !== "object" || typeof a !== "object")
          throw new SlippageCheckUnavailableError(
            `${label}: missing counter-side position observation. Check the selected subject.`,
          );
        for (const guard of counterSide.guards) {
          const previous = b[guard.field];
          const current = a[guard.field];
          if (
            guard.direction === "increase"
              ? current > previous
              : current < previous
          )
            throw new ConsumerLimitViolationError(
              `${label}: undeclared ${guard.field} ${guard.direction} from "${previous}" to "${current}". Use a combined operation or quote-only limits for multi-operation bundles.`,
            );
        }
      }
      if (limit.type === "midnightTakeWithdraw") {
        const beforeDebt =
          debtReadId === undefined ? undefined : before.get(debtReadId);
        const afterDebt =
          debtReadId === undefined ? undefined : after.get(debtReadId);
        if (typeof beforeDebt !== "bigint" || typeof afterDebt !== "bigint")
          throw new SlippageCheckUnavailableError(
            `${label}: missing observation for Midnight debt. Check the selected subject.`,
          );
        if (beforeDebt !== afterDebt)
          throw new ConsumerLimitViolationError(
            `${label}: Midnight debt changed from "${beforeDebt}" to "${afterDebt}"; a reduce-only sell must leave debt unchanged. Remove the debt-changing transaction from the bundle or use midnightTakeBorrow limits.`,
          );
      }
      if (
        limit.type === "midnightRepayWithdrawCollateral" ||
        limit.type === "midnightTakeRepayWithdrawCollateral"
      ) {
        if (limit.quote.debtRepaid === undefined) {
          const beforeDebt =
            debtReadId === undefined ? undefined : before.get(debtReadId);
          const afterDebt =
            debtReadId === undefined ? undefined : after.get(debtReadId);
          if (typeof beforeDebt !== "bigint" || typeof afterDebt !== "bigint")
            throw new SlippageCheckUnavailableError(
              `${label}: missing observation for Midnight debt. Check the selected subject.`,
            );
          if (afterDebt > beforeDebt)
            throw new ConsumerLimitViolationError(
              `${label}: Midnight debt increased from "${beforeDebt}" to "${afterDebt}"; a repay-withdraw without a debtRepaid quote must not increase debt. Remove the debt-increasing transaction from the bundle.`,
            );
        }
      }
      if (
        limit.type === "midnightRepayWithdrawCollateral" ||
        limit.type === "midnightTakeRepayWithdrawCollateral"
      ) {
        const beforeCredit =
          creditReadId === undefined ? undefined : before.get(creditReadId);
        const afterCredit =
          creditReadId === undefined ? undefined : after.get(creditReadId);
        if (typeof beforeCredit !== "bigint" || typeof afterCredit !== "bigint")
          throw new SlippageCheckUnavailableError(
            `${label}: missing observation for Midnight credit. Check the selected subject.`,
          );
        if (beforeCredit !== afterCredit)
          throw new ConsumerLimitViolationError(
            `${label}: Midnight credit changed from "${beforeCredit}" to "${afterCredit}"; a repay-withdraw must leave credit unchanged. Remove the credit-creating step from the bundle.`,
          );
      }
      const observed: {
        -readonly [K in keyof SlippageQuote]: SlippageQuote[K];
      } = {};
      const observedPositions: InKindPositionQuote[] = [];
      for (const measurement of measurements) {
        let delta: bigint;
        if (measurement.type === "midnightNet") {
          const creditBefore = before.get(measurement.creditReadId);
          const creditAfter = after.get(measurement.creditReadId);
          const debtBefore = before.get(measurement.debtReadId);
          const debtAfter = after.get(measurement.debtReadId);
          if (
            typeof creditBefore !== "bigint" ||
            typeof creditAfter !== "bigint" ||
            typeof debtBefore !== "bigint" ||
            typeof debtAfter !== "bigint"
          )
            throw new SlippageCheckUnavailableError(
              `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
            );
          delta = creditAfter - debtAfter - (creditBefore - debtBefore);
        } else if (measurement.type === "midnightDebt") {
          const b = before.get(measurement.readId);
          const a = after.get(measurement.readId);
          if (typeof b !== "bigint" || typeof a !== "bigint")
            throw new SlippageCheckUnavailableError(
              `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
            );
          delta = b - a;
        } else if (measurement.type === "native") {
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
          if (measurement.readId !== undefined) {
            const wrappedBefore = before.get(measurement.readId);
            const wrappedAfter = after.get(measurement.readId);
            if (
              typeof wrappedBefore !== "bigint" ||
              typeof wrappedAfter !== "bigint"
            )
              throw new SlippageCheckUnavailableError(
                `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
              );
            delta += wrappedAfter - wrappedBefore;
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
        observed[field] = QUOTE_FIELD_DIRECTION[field].output
          ? delta
          : MathLib.max(0n, -delta);
      }
      if (limit.quote.positions !== undefined)
        observed.positions = observedPositions;
      if (limit.type === "midnightSupplyCollateralTakeBorrow") {
        if (
          limit.quote.collateralSupplies === undefined ||
          limit.quote.collateralSupplies.length === 0
        )
          throw new SlippageCheckUnavailableError(
            `${label}: no collateral supply quote is available to verify.`,
          );
        if (walletBounds === undefined || walletBounds.length === 0)
          throw new SlippageCheckUnavailableError(
            `${label}: no wallet bounds are available to verify.`,
          );
        const observedSupplies = [];
        for (const expected of limit.quote.collateralSupplies) {
          const reads = collateralSupplyReads?.find(
            (entry) => entry.collateralIndex === expected.collateralIndex,
          );
          const positionBefore =
            reads === undefined ? undefined : before.get(reads.readId);
          const positionAfter =
            reads === undefined ? undefined : after.get(reads.readId);
          if (
            typeof positionBefore !== "bigint" ||
            typeof positionAfter !== "bigint"
          )
            throw new SlippageCheckUnavailableError(
              `${label}: missing observation for collateral index "${expected.collateralIndex}".`,
            );
          observedSupplies.push({
            collateralIndex: expected.collateralIndex,
            assets: positionAfter - positionBefore,
          });
        }
        observed.collateralSupplies = observedSupplies;
        for (const bound of walletBounds) {
          const balanceBefore = before.get(bound.readId);
          const balanceAfter = after.get(bound.readId);
          if (
            typeof balanceBefore !== "bigint" ||
            typeof balanceAfter !== "bigint"
          )
            throw new SlippageCheckUnavailableError(
              `${label}: missing wallet balance observation for token "${bound.token}" and account "${bound.account}".`,
            );
          const net = balanceAfter - balanceBefore;
          const maxPulls = bound.maxPulls;
          const minProceeds = MathLib.wMulUp(
            bound.minProceeds,
            MathLib.WAD - limit.slippageTolerance,
          );
          const minimumNet = minProceeds - maxPulls;
          if (net < minimumNet)
            throw new ConsumerLimitViolationError(
              `${label}: net spend for token "${bound.token}" and account "${bound.account}" exceeds tolerance "${limit.slippageTolerance}"; minimum net change "${minimumNet}", got "${net}".`,
            );
        }
      }
      const finalCollateral = new Map<bigint, bigint>();
      if (
        limit.type === "midnightRepayWithdrawCollateral" ||
        limit.type === "midnightTakeRepayWithdrawCollateral"
      ) {
        const observedWithdrawals = [];
        for (const expected of limit.quote.collateralWithdrawals ?? []) {
          const reads = collateralReads?.find(
            (entry) => entry.collateralIndex === expected.collateralIndex,
          );
          const positionBefore =
            reads === undefined ? undefined : before.get(reads.positionReadId);
          const positionAfter =
            reads === undefined ? undefined : after.get(reads.positionReadId);
          const receiverBefore =
            reads?.receiverBalanceReadId === undefined
              ? undefined
              : before.get(reads.receiverBalanceReadId);
          const receiverAfter =
            reads?.receiverBalanceReadId === undefined
              ? undefined
              : after.get(reads.receiverBalanceReadId);
          if (
            typeof positionBefore !== "bigint" ||
            typeof positionAfter !== "bigint" ||
            typeof receiverBefore !== "bigint" ||
            typeof receiverAfter !== "bigint"
          )
            throw new SlippageCheckUnavailableError(
              `${label}: missing observation for collateral index "${expected.collateralIndex}".`,
            );
          finalCollateral.set(expected.collateralIndex, positionAfter);
          const decrease = MathLib.max(0n, positionBefore - positionAfter);
          const cap = MathLib.wMulDown(
            expected.assets,
            MathLib.WAD + limit.slippageTolerance,
          );
          if (decrease > cap)
            throw new ConsumerLimitViolationError(
              `${label}: collateral index "${expected.collateralIndex}" withdrawal exceeds tolerance against quote "${expected.assets}"; allowed bound "${cap}", got "${decrease}".`,
            );
          const delivered = receiverAfter - receiverBefore;
          const minimum = MathLib.wMulUp(
            expected.assets,
            MathLib.WAD - limit.slippageTolerance,
          );
          if (delivered < minimum)
            throw new ConsumerLimitViolationError(
              `${label}: collateral index "${expected.collateralIndex}" delivery is below tolerance against quote "${expected.assets}"; minimum "${minimum}", got "${delivered}".`,
            );
          observedWithdrawals.push({
            collateralIndex: expected.collateralIndex,
            assets: delivered,
          });
        }
        if (observedWithdrawals.length > 0)
          observed.collateralWithdrawals = observedWithdrawals;
      }
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
      const value =
        debtReadId === undefined ? undefined : after.get(debtReadId);
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
          derivedFields: limit.derivedFields,
          exactFields: limit.exactFields,
          inactiveFields: limit.inactiveFields,
          debtShares: measurements.some(
            (measurement) =>
              measurement.type === "position" &&
              measurement.shares === "borrowShares",
          ),
          position,
          credit: typeof afterPosition === "bigint" ? afterPosition : undefined,
          midnightDebt: typeof value === "bigint" ? value : undefined,
          midnightCollateral: finalCollateral,
          skipFields:
            limit.type === "midnightSupplyCollateralTakeBorrow"
              ? ["assetsReceived"]
              : undefined,
          subjectShareRoundingAllowance:
            limit.type === "blueWithdraw" &&
            typeof limit.inputs === "object" &&
            "assets" in limit.inputs &&
            limit.inputs.assets !== undefined
              ? countPrecedingBlueSupplies({
                  logs,
                  morpho,
                  marketId: limit.marketId,
                  account: limit.account ?? ctx.owner,
                })
              : undefined,
        }),
      };
    },
  );
}
