import { MathLib } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, isAddressEqual, zeroAddress } from "viem";
import {
  type ConsumerLimitViolation,
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
import { findForceExitFailures } from "./parsing/index.js";
import { findSlippageFailures } from "./slippage.js";
import type { SlippageOperationReads, StateValue } from "./state/read-state.js";

/**
 * Find failures for caller-quoted amounts, slippage, share-price bounds,
 * and absolute post-bundle Blue position bounds.
 * Collect mode reports each missing read once across checks and operations,
 * while retaining bounds backed by an available final-state observation.
 * Typed-input vault burns add back share mints to the account and reject its
 * outgoing non-burn share transfers; quote-only limits retain net balances.
 * @param params - Planned observations, decoded before/after values, and user transfer traces.
 * @param stopOnFirstFailure - Optional compatibility mode that rejects the first failure before later checks run.
 * @returns Failures in operation and check order, and checked operations for the success path.
 * @throws {InvalidSimulationResponseError} When a matching `ForceDeallocate`/
 *   `Withdraw` event log fails to decode.
 * @throws {ConsumerLimitViolationError} When compatibility mode encounters a limit failure.
 * @throws {SlippageCheckUnavailableError} When compatibility mode encounters unavailable evidence.
 * @internal
 */
export function findOperationSlippageFailures(
  params: {
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
  },
  stopOnFirstFailure = false,
): {
  readonly failures: readonly (
    | ConsumerLimitViolationError
    | SlippageCheckUnavailableError
  )[];
  readonly checked: readonly SimulatedOperation[];
} {
  const failures: (
    | ConsumerLimitViolationError
    | SlippageCheckUnavailableError
  )[] = [];
  const reportedMissingReadIds = new Set<string>();
  const recordFailure = (
    failure: ConsumerLimitViolationError | SlippageCheckUnavailableError,
  ) => {
    if (stopOnFirstFailure) throw failure;
    failures.push(failure);
  };
  const { ctx, before, after, transfers, logs, morpho, requestTransactions } =
    params;
  const checked = params.operations.map(
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
      const violation = (
        message: string,
        facts: Omit<ConsumerLimitViolation, "operationIndex" | "operationType">,
      ) =>
        new ConsumerLimitViolationError(message, {
          operationIndex: index,
          operationType: limit.type,
          ...facts,
        });
      const subject = operationMeasurementPlan(limit).subject;
      const unavailableReadIds = new Set<string>();
      const unavailableFields: (keyof SlippageQuote)[] = [];
      const recordMissingRead = (
        failure: SlippageCheckUnavailableError,
        readIds: readonly (string | undefined)[],
      ) => {
        unavailableFields.push(failure.field as keyof SlippageQuote);
        const ids = readIds.filter((id) => id !== undefined);
        if (
          stopOnFirstFailure ||
          ids.length === 0 ||
          ids.some((id) => !reportedMissingReadIds.has(id))
        )
          recordFailure(failure);
        for (const id of ids) reportedMissingReadIds.add(id);
      };
      if (counterSide !== undefined) {
        const b = before.get(counterSide.readId);
        const a = after.get(counterSide.readId);
        if (typeof b !== "object" || typeof a !== "object") {
          if (typeof a !== "object") unavailableReadIds.add(counterSide.readId);
          recordMissingRead(
            new SlippageCheckUnavailableError(
              `${label}: missing counter-side position observation. Check the selected subject.`,
              {
                operationIndex: index,
                operationType: limit.type,
                field: "position",
                reason: "missingRead",
              },
            ),
            [counterSide.readId],
          );
        } else
          for (const guard of counterSide.guards) {
            const previous = b[guard.field];
            const current = a[guard.field];
            if (
              guard.direction === "increase"
                ? current > previous
                : current < previous
            )
              recordFailure(
                violation(
                  `${label}: undeclared ${guard.field} ${guard.direction} from "${previous}" to "${current}". Use a combined operation or quote-only limits for multi-operation bundles.`,
                  {
                    field: guard.field,
                    check: "unchangedState",
                    expected: previous,
                    observed: current,
                    bound: previous,
                  },
                ),
              );
          }
      }
      if (limit.type === "midnightTakeWithdraw") {
        const beforeDebt =
          debtReadId === undefined ? undefined : before.get(debtReadId);
        const afterDebt =
          debtReadId === undefined ? undefined : after.get(debtReadId);
        if (typeof beforeDebt !== "bigint" || typeof afterDebt !== "bigint") {
          if (debtReadId !== undefined && typeof afterDebt !== "bigint")
            unavailableReadIds.add(debtReadId);
          recordMissingRead(
            new SlippageCheckUnavailableError(
              `${label}: missing observation for Midnight debt. Check the selected subject.`,
              {
                operationIndex: index,
                operationType: limit.type,
                field: "debt",
                reason: "missingRead",
              },
            ),
            [debtReadId],
          );
        } else if (beforeDebt !== afterDebt)
          recordFailure(
            violation(
              `${label}: Midnight debt changed from "${beforeDebt}" to "${afterDebt}"; a reduce-only sell must leave debt unchanged. Remove the debt-changing transaction from the bundle or use midnightTakeBorrow limits.`,
              {
                field: "debt",
                check: "unchangedState",
                expected: beforeDebt,
                observed: afterDebt,
              },
            ),
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
          if (typeof beforeDebt !== "bigint" || typeof afterDebt !== "bigint") {
            if (debtReadId !== undefined && typeof afterDebt !== "bigint")
              unavailableReadIds.add(debtReadId);
            recordMissingRead(
              new SlippageCheckUnavailableError(
                `${label}: missing observation for Midnight debt. Check the selected subject.`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: "debt",
                  reason: "missingRead",
                },
              ),
              [debtReadId],
            );
          } else if (afterDebt > beforeDebt)
            recordFailure(
              violation(
                `${label}: Midnight debt increased from "${beforeDebt}" to "${afterDebt}"; a repay-withdraw without a debtRepaid quote must not increase debt. Remove the debt-increasing transaction from the bundle.`,
                {
                  field: "debt",
                  check: "unchangedState",
                  expected: beforeDebt,
                  observed: afterDebt,
                  bound: beforeDebt,
                },
              ),
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
        if (
          typeof beforeCredit !== "bigint" ||
          typeof afterCredit !== "bigint"
        ) {
          if (creditReadId !== undefined && typeof afterCredit !== "bigint")
            unavailableReadIds.add(creditReadId);
          recordMissingRead(
            new SlippageCheckUnavailableError(
              `${label}: missing observation for Midnight credit. Check the selected subject.`,
              {
                operationIndex: index,
                operationType: limit.type,
                field: "credit",
                reason: "missingRead",
              },
            ),
            [creditReadId],
          );
        } else if (beforeCredit !== afterCredit)
          recordFailure(
            violation(
              `${label}: Midnight credit changed from "${beforeCredit}" to "${afterCredit}"; a repay-withdraw must leave credit unchanged. Remove the credit-creating step from the bundle.`,
              {
                field: "credit",
                check: "unchangedState",
                expected: beforeCredit,
                observed: afterCredit,
              },
            ),
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
          ) {
            if (typeof creditAfter !== "bigint")
              unavailableReadIds.add(measurement.creditReadId);
            if (typeof debtAfter !== "bigint")
              unavailableReadIds.add(measurement.debtReadId);
            recordMissingRead(
              new SlippageCheckUnavailableError(
                `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: measurement.field,
                  reason: "missingRead",
                },
              ),
              [measurement.creditReadId, measurement.debtReadId].filter(
                (readId) =>
                  typeof before.get(readId) !== "bigint" ||
                  typeof after.get(readId) !== "bigint",
              ),
            );
            continue;
          }
          delta = creditAfter - debtAfter - (creditBefore - debtBefore);
        } else if (measurement.type === "midnightDebt") {
          const b = before.get(measurement.readId);
          const a = after.get(measurement.readId);
          if (typeof b !== "bigint" || typeof a !== "bigint") {
            if (typeof a !== "bigint")
              unavailableReadIds.add(measurement.readId);
            recordMissingRead(
              new SlippageCheckUnavailableError(
                `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: measurement.field,
                  reason: "missingRead",
                },
              ),
              [measurement.readId],
            );
            continue;
          }
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
            recordFailure(
              new SlippageCheckUnavailableError(
                `${label}: missing native transfer evidence for "${measurement.field}" from a transaction with value.`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: measurement.field,
                  reason: "missingEvent",
                },
              ),
            );
            continue;
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
            ) {
              if (typeof wrappedAfter !== "bigint")
                unavailableReadIds.add(measurement.readId);
              recordMissingRead(
                new SlippageCheckUnavailableError(
                  `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
                  {
                    operationIndex: index,
                    operationType: limit.type,
                    field: measurement.field,
                    reason: "missingRead",
                  },
                ),
                [measurement.readId],
              );
              continue;
            }
            delta += wrappedAfter - wrappedBefore;
          }
        } else {
          const b = before.get(measurement.readId);
          const a = after.get(measurement.readId);
          if (
            measurement.type === "balance" &&
            typeof b === "bigint" &&
            typeof a === "bigint"
          ) {
            delta = a - b;
            if (
              limit.inputs !== undefined &&
              measurement.field === "sharesBurned" &&
              measurement.token !== undefined &&
              measurement.account !== undefined
            ) {
              const { token, account } = measurement;
              const outgoing = transfers.filter(
                (transfer) =>
                  isAddressEqual(transfer.token, token) &&
                  isAddressEqual(transfer.from, account) &&
                  !isAddressEqual(transfer.to, zeroAddress) &&
                  !isAddressEqual(transfer.to, account),
              );
              if (outgoing.length > 0)
                recordFailure(
                  violation(
                    `${label}: outgoing vault-share transfer for token "${token}" and account "${account}" cannot count toward exact "sharesBurned". Remove the share transfer or use quote-only limits for net balance changes.`,
                    {
                      field: "sharesBurned",
                      check: "shareTransfer",
                      expected: 0n,
                      observed: outgoing.reduce(
                        (total, transfer) => total + transfer.amount,
                        0n,
                      ),
                    },
                  ),
                );
              delta -= transfers.reduce(
                (total, transfer) =>
                  isAddressEqual(transfer.token, token) &&
                  isAddressEqual(transfer.from, zeroAddress) &&
                  isAddressEqual(transfer.to, account)
                    ? total + transfer.amount
                    : total,
                0n,
              );
            }
          } else if (
            measurement.type === "position" &&
            typeof b === "object" &&
            typeof a === "object"
          )
            delta = a[measurement.shares] - b[measurement.shares];
          else {
            if (
              measurement.type === "position"
                ? typeof a !== "object"
                : typeof a !== "bigint"
            )
              unavailableReadIds.add(measurement.readId);
            recordMissingRead(
              new SlippageCheckUnavailableError(
                `${label}: missing observation for "${measurement.field}". Check the selected subject.`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: measurement.field,
                  reason: "missingRead",
                },
              ),
              [measurement.readId],
            );
            continue;
          }
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
      if (
        limit.type === "midnightSupplyCollateralTakeBorrow" ||
        limit.type === "midnightSupplyCollateralBatch"
      ) {
        if (
          limit.quote.collateralSupplies === undefined ||
          limit.quote.collateralSupplies.length === 0
        )
          recordFailure(
            new SlippageCheckUnavailableError(
              `${label}: no collateral supply quote is available to verify.`,
              {
                operationIndex: index,
                operationType: limit.type,
                field: "collateralSupplies",
                reason: "missingRead",
              },
            ),
          );
        if (walletBounds === undefined || walletBounds.length === 0)
          recordFailure(
            new SlippageCheckUnavailableError(
              `${label}: no wallet bounds are available to verify.`,
              {
                operationIndex: index,
                operationType: limit.type,
                field: "walletBalance",
                reason: "missingRead",
              },
            ),
          );
        const observedSupplies = [];
        for (const expected of limit.quote.collateralSupplies ?? []) {
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
          ) {
            recordMissingRead(
              new SlippageCheckUnavailableError(
                `${label}: missing observation for collateral index "${expected.collateralIndex}".`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: "collateralSupplies",
                  reason: "missingRead",
                },
              ),
              [reads?.readId],
            );
            continue;
          }
          observedSupplies.push({
            collateralIndex: expected.collateralIndex,
            assets: positionAfter - positionBefore,
          });
        }
        observed.collateralSupplies = observedSupplies;
        for (const bound of walletBounds ?? []) {
          const balanceBefore = before.get(bound.readId);
          const balanceAfter = after.get(bound.readId);
          if (
            typeof balanceBefore !== "bigint" ||
            typeof balanceAfter !== "bigint"
          ) {
            recordMissingRead(
              new SlippageCheckUnavailableError(
                `${label}: missing wallet balance observation for token "${bound.token}" and account "${bound.account}".`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: "walletBalance",
                  reason: "missingRead",
                },
              ),
              [bound.readId],
            );
            continue;
          }
          const net = balanceAfter - balanceBefore;
          const maxPulls = bound.maxPulls;
          const minProceeds = MathLib.wMulUp(
            bound.minProceeds,
            MathLib.WAD - limit.slippageTolerance,
          );
          const minimumNet = minProceeds - maxPulls;
          if (net < minimumNet)
            recordFailure(
              violation(
                `${label}: net spend for token "${bound.token}" and account "${bound.account}" exceeds tolerance "${limit.slippageTolerance}"; minimum net change "${minimumNet}", got "${net}".`,
                {
                  field: "walletBalance",
                  check: "slippageTolerance",
                  expected: bound.minProceeds - maxPulls,
                  observed: net,
                  tolerance: limit.slippageTolerance,
                  bound: minimumNet,
                  entry: { token: bound.token, account: bound.account },
                },
              ),
            );
        }
      }
      const finalCollateral = new Map<bigint, bigint>();
      if (
        limit.type === "midnightWithdrawCollateralBatch" ||
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
          ) {
            recordMissingRead(
              new SlippageCheckUnavailableError(
                `${label}: missing observation for collateral index "${expected.collateralIndex}".`,
                {
                  operationIndex: index,
                  operationType: limit.type,
                  field: "collateralWithdrawals",
                  reason: "missingRead",
                },
              ),
              [reads?.positionReadId, reads?.receiverBalanceReadId].filter(
                (readId) =>
                  readId !== undefined &&
                  (typeof before.get(readId) !== "bigint" ||
                    typeof after.get(readId) !== "bigint"),
              ),
            );
          }
          if (typeof positionAfter === "bigint")
            finalCollateral.set(expected.collateralIndex, positionAfter);
          const decrease =
            typeof positionBefore === "bigint" &&
            typeof positionAfter === "bigint"
              ? MathLib.max(0n, positionBefore - positionAfter)
              : undefined;
          const cap = MathLib.wMulDown(
            expected.assets,
            MathLib.WAD + limit.slippageTolerance,
          );
          if (decrease !== undefined && decrease > cap)
            recordFailure(
              violation(
                `${label}: collateral index "${expected.collateralIndex}" withdrawal exceeds tolerance against quote "${expected.assets}"; allowed bound "${cap}", got "${decrease}".`,
                {
                  field: "collateralWithdrawals",
                  check: "slippageTolerance",
                  expected: expected.assets,
                  observed: decrease,
                  tolerance: limit.slippageTolerance,
                  bound: cap,
                  entry: { collateralIndex: expected.collateralIndex },
                },
              ),
            );
          const delivered =
            typeof receiverAfter === "bigint" &&
            typeof receiverBefore === "bigint"
              ? receiverAfter - receiverBefore
              : undefined;
          const expectedDelivery =
            limit.type === "midnightWithdrawCollateralBatch"
              ? (limit.quote.collateralWithdrawals ?? []).reduce(
                  (sum, entry) =>
                    collateralReads?.find(
                      (read) => read.collateralIndex === entry.collateralIndex,
                    )?.receiverBalanceReadId === reads?.receiverBalanceReadId
                      ? sum + entry.assets
                      : sum,
                  0n,
                )
              : expected.assets;
          const minimum = MathLib.wMulUp(
            expectedDelivery,
            MathLib.WAD - limit.slippageTolerance,
          );
          if (delivered !== undefined && delivered < minimum)
            recordFailure(
              violation(
                `${label}: collateral index "${expected.collateralIndex}" delivery is below tolerance against quote "${expected.assets}"; minimum "${minimum}", got "${delivered}".`,
                {
                  field: "collateralWithdrawals",
                  check: "slippageTolerance",
                  expected: expectedDelivery,
                  observed: delivered,
                  tolerance: limit.slippageTolerance,
                  bound: minimum,
                  entry: { collateralIndex: expected.collateralIndex },
                },
              ),
            );
          const amount =
            limit.type === "midnightWithdrawCollateralBatch"
              ? decrease
              : delivered;
          if (amount !== undefined)
            observedWithdrawals.push({
              collateralIndex: expected.collateralIndex,
              assets: amount,
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
        const forceExitResult = findForceExitFailures({
          logs,
          vault: limit.vault,
          morpho,
          account: limit.account ?? ctx.owner,
          operationType: limit.type,
          requireDeallocations: limit.quote.deallocations !== undefined,
          operationIndex: index,
        });
        for (const failure of forceExitResult.failures) recordFailure(failure);
        const forceExit = forceExitResult.checked;
        if (
          limit.quote.penalty !== undefined &&
          !forceExitResult.failures.some(
            (failure) => failure.field === "penalty",
          )
        )
          observed.penalty = forceExit.penalty;
        if (
          limit.quote.deallocations !== undefined &&
          !forceExitResult.failures.some(
            (failure) => failure.field === "deallocations",
          )
        )
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
      const result = findSlippageFailures({
        unavailableFields: [
          ...unavailableFields,
          ...failures
            .filter(
              (failure) =>
                failure instanceof SlippageCheckUnavailableError &&
                failure.operationIndex === index,
            )
            .map((failure) => failure.field as keyof SlippageQuote),
        ],
        label,
        operationIndex: index,
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
        unavailableBounds: [
          ...(positionBoundsReadId !== undefined &&
          unavailableReadIds.has(positionBoundsReadId)
            ? (["position", "position.maxCredit"] as const)
            : []),
          ...(debtReadId !== undefined && unavailableReadIds.has(debtReadId)
            ? (["position.maxDebt"] as const)
            : []),
        ],
        unavailableCollateralIndices: (collateralReads ?? [])
          .filter(
            (read) =>
              typeof after.get(read.positionReadId) !== "bigint" &&
              (limit.quote.collateralWithdrawals ?? []).some(
                (entry) => entry.collateralIndex === read.collateralIndex,
              ),
          )
          .map((read) => read.collateralIndex),
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
      });
      for (const failure of result.failures) {
        if (
          failure instanceof SlippageCheckUnavailableError &&
          failure.reason === "missingRead"
        )
          recordMissingRead(failure, [
            failure.field === "position" ||
            failure.field === "position.maxCredit"
              ? positionBoundsReadId
              : failure.field === "position.maxDebt"
                ? debtReadId
                : undefined,
          ]);
        else recordFailure(failure);
      }
      return {
        ...subject,
        account: limit.account ?? ctx.owner,
        receiver: limit.receiver ?? ctx.owner,
        checkedLimits: result.checked,
      };
    },
  );
  return { failures, checked };
}

/**
 * Reject the first slippage failure before evaluating later checks.
 * @param params - Planned observations, decoded values, and user transfer traces.
 * @returns Each subject and its checked limits.
 * @throws {ConsumerLimitViolationError} When a quoted limit is violated.
 * @throws {SlippageCheckUnavailableError} When required evidence is unavailable.
 * @throws {InvalidSimulationResponseError} When a matching force-exit event log cannot be decoded.
 * @internal
 */
export function verifySlippage(
  params: Parameters<typeof findOperationSlippageFailures>[0],
): readonly SimulatedOperation[] {
  return findOperationSlippageFailures(params, true).checked;
}
