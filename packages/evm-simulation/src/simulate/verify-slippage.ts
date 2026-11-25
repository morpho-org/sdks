import { MathLib } from "@morpho-org/blue-sdk";
import { type Address, ethAddress, isAddressEqual, zeroAddress } from "viem";
import {
  type ConsumerLimitViolation,
  ConsumerLimitViolationError,
  InvalidSimulationResponseError,
  SimulationPackageError,
  SlippageCheckUnavailableError,
} from "../errors.js";
import {
  type InKindPositionQuote,
  QUOTE_FIELD_DIRECTION,
  type SimulationOperationSubject,
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

type OperationSlippageParams = Parameters<
  typeof findOperationSlippageFailures
>[0];
type SlippageMeasurement = SlippageOperationReads["measurements"][number];
type CollateralRead = NonNullable<
  SlippageOperationReads["collateralReads"]
>[number];
type CollateralWithdrawalQuote = NonNullable<
  SlippageQuote["collateralWithdrawals"]
>[number];
type ObservedQuote = { -readonly [K in keyof SlippageQuote]: SlippageQuote[K] };
type RecordableFailure =
  | ConsumerLimitViolationError
  | SlippageCheckUnavailableError
  | InvalidSimulationResponseError;

/** One operation's checks: its planned reads, plus the label, failure sink and missing-read bookkeeping they share. */
interface OperationCheck {
  readonly params: OperationSlippageParams;
  readonly reads: SlippageOperationReads;
  readonly index: number;
  readonly derivationSkipped: boolean;
  readonly label: string;
  readonly subject: SimulationOperationSubject;
  /** Failures of the whole call so far, in check order. */
  readonly failures: readonly SimulationPackageError[];
  readonly unavailableReadIds: Set<string>;
  readonly unavailableFields: (keyof SlippageQuote)[];
  readonly recordFailure: (failure: RecordableFailure) => void;
  /** Record a missing-read failure unless every read it names was already reported. */
  readonly recordMissingRead: (
    failure: SlippageCheckUnavailableError,
    readIds: readonly (string | undefined)[],
  ) => void;
  readonly violation: (
    message: string,
    facts: Omit<ConsumerLimitViolation, "operationIndex" | "operationType">,
  ) => ConsumerLimitViolationError;
}

function createOperationCheck({
  params,
  reads,
  index,
  failures,
  reportedMissingReadIds,
  recordFailure,
}: {
  readonly params: OperationSlippageParams;
  readonly reads: SlippageOperationReads;
  readonly index: number;
  readonly failures: readonly SimulationPackageError[];
  readonly reportedMissingReadIds: Set<string>;
  readonly recordFailure: (failure: RecordableFailure) => void;
}): OperationCheck {
  const { limit } = reads;
  const derivationSkipped = params.skippedOperationIndices?.has(index) === true;
  let label = `Limit operation ${index} (${limit.type})`;
  if (limit.type === "midnightSupplyCollateralTakeBorrow") {
    label = `Limit operation ${index} (${limit.type}, marketId "${limit.marketId}")`;
  } else if (limit.type === "midnightSupplyBlueMakeLend") {
    label = `Limit operation ${index} (${limit.type}, loanToken "${limit.loanToken}")`;
  }
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
    if (ids.length === 0 || ids.some((id) => !reportedMissingReadIds.has(id))) {
      recordFailure(failure);
    }
    for (const id of ids) {
      reportedMissingReadIds.add(id);
    }
  };
  return {
    params,
    reads,
    index,
    derivationSkipped,
    label,
    subject,
    failures,
    unavailableReadIds,
    unavailableFields,
    recordFailure,
    recordMissingRead,
    violation,
  };
}

/** Guard the counter-side position against undeclared movement. */
function checkCounterSide(check: OperationCheck): void {
  const {
    label,
    index,
    violation,
    recordFailure,
    recordMissingRead,
    unavailableReadIds,
  } = check;
  const { limit, counterSide } = check.reads;
  const { before, after } = check.params;
  if (counterSide !== undefined) {
    const b = before.get(counterSide.readId);
    const a = after.get(counterSide.readId);
    if (typeof b !== "object" || typeof a !== "object") {
      if (typeof a !== "object") {
        unavailableReadIds.add(counterSide.readId);
      }
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
    } else {
      for (const guard of counterSide.guards) {
        const previous = b[guard.field];
        const current = a[guard.field];
        if (
          guard.direction === "increase"
            ? current > previous
            : current < previous
        ) {
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
    }
  }
}

/** A reduce-only Midnight sell must leave debt unchanged. */
function checkTakeWithdrawDebt(check: OperationCheck): void {
  const {
    label,
    index,
    violation,
    recordFailure,
    recordMissingRead,
    unavailableReadIds,
  } = check;
  const { limit, debtReadId } = check.reads;
  const { before, after } = check.params;
  if (limit.type === "midnightTakeWithdraw") {
    const beforeDebt =
      debtReadId === undefined ? undefined : before.get(debtReadId);
    const afterDebt =
      debtReadId === undefined ? undefined : after.get(debtReadId);
    if (typeof beforeDebt !== "bigint" || typeof afterDebt !== "bigint") {
      if (debtReadId !== undefined && typeof afterDebt !== "bigint") {
        unavailableReadIds.add(debtReadId);
      }
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
    } else if (beforeDebt !== afterDebt) {
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
  }
}

/** A Midnight repay-withdraw without a `debtRepaid` quote must not increase debt. */
function checkRepayWithdrawDebt(check: OperationCheck): void {
  const {
    label,
    index,
    violation,
    recordFailure,
    recordMissingRead,
    unavailableReadIds,
    derivationSkipped,
  } = check;
  const { limit, debtReadId } = check.reads;
  const { before, after } = check.params;
  if (
    limit.type === "midnightRepayWithdrawCollateral" ||
    limit.type === "midnightTakeRepayWithdrawCollateral"
  ) {
    if (!derivationSkipped && limit.quote.debtRepaid === undefined) {
      const beforeDebt =
        debtReadId === undefined ? undefined : before.get(debtReadId);
      const afterDebt =
        debtReadId === undefined ? undefined : after.get(debtReadId);
      if (typeof beforeDebt !== "bigint" || typeof afterDebt !== "bigint") {
        if (debtReadId !== undefined && typeof afterDebt !== "bigint") {
          unavailableReadIds.add(debtReadId);
        }
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
      } else if (afterDebt > beforeDebt) {
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
  }
}

/** A Midnight repay-withdraw must leave credit unchanged. */
function checkRepayWithdrawCredit(check: OperationCheck): void {
  const {
    label,
    index,
    violation,
    recordFailure,
    recordMissingRead,
    unavailableReadIds,
  } = check;
  const { limit, creditReadId } = check.reads;
  const { before, after } = check.params;
  if (
    limit.type === "midnightRepayWithdrawCollateral" ||
    limit.type === "midnightTakeRepayWithdrawCollateral"
  ) {
    const beforeCredit =
      creditReadId === undefined ? undefined : before.get(creditReadId);
    const afterCredit =
      creditReadId === undefined ? undefined : after.get(creditReadId);
    if (typeof beforeCredit !== "bigint" || typeof afterCredit !== "bigint") {
      if (creditReadId !== undefined && typeof afterCredit !== "bigint") {
        unavailableReadIds.add(creditReadId);
      }
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
    } else if (beforeCredit !== afterCredit) {
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
  }
}

/** Check only the position bounds, which read ordinary observations, of an operation without derivation data. */
function checkSkippedDerivationBounds(check: OperationCheck): void {
  const { label, index, recordFailure } = check;
  const { limit, positionBoundsReadId, debtReadId, collateralReads } =
    check.reads;
  const { after } = check.params;
  const afterPosition =
    positionBoundsReadId === undefined
      ? undefined
      : after.get(positionBoundsReadId);
  const debt = debtReadId === undefined ? undefined : after.get(debtReadId);
  const { failures: boundFailures } = findSlippageFailures({
    label,
    operationIndex: index,
    limits: {
      type: limit.type,
      quote: {},
      slippageTolerance: 0n,
      ...(limit.position === undefined ? {} : { position: limit.position }),
    },
    observed: {},
    position: typeof afterPosition === "object" ? afterPosition : undefined,
    credit: typeof afterPosition === "bigint" ? afterPosition : undefined,
    midnightDebt: typeof debt === "bigint" ? debt : undefined,
    midnightCollateral: new Map(
      (collateralReads ?? []).flatMap((read) => {
        const value = after.get(read.positionReadId);
        return typeof value === "bigint"
          ? [[read.collateralIndex, value] as const]
          : [];
      }),
    ),
    unavailableCollateralIndices: (collateralReads ?? [])
      .filter((read) => typeof after.get(read.positionReadId) !== "bigint")
      .map((read) => read.collateralIndex),
    unavailableBounds: ["position", "position.maxDebt", "position.maxCredit"],
  });
  for (const failure of boundFailures) {
    recordFailure(failure);
  }
}

/** Net Midnight credit minus debt change. */
function midnightNetDelta(
  check: OperationCheck,
  measurement: Extract<SlippageMeasurement, { readonly type: "midnightNet" }>,
): bigint | undefined {
  const { label, index, recordMissingRead, unavailableReadIds } = check;
  const { limit } = check.reads;
  const { before, after } = check.params;
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
    if (typeof creditAfter !== "bigint") {
      unavailableReadIds.add(measurement.creditReadId);
    }
    if (typeof debtAfter !== "bigint") {
      unavailableReadIds.add(measurement.debtReadId);
    }
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
    return undefined;
  }
  return creditAfter - debtAfter - (creditBefore - debtBefore);
}

/** Midnight debt decrease. */
function midnightDebtDelta(
  check: OperationCheck,
  measurement: Extract<SlippageMeasurement, { readonly type: "midnightDebt" }>,
): bigint | undefined {
  const { label, index, recordMissingRead, unavailableReadIds } = check;
  const { limit } = check.reads;
  const { before, after } = check.params;
  const b = before.get(measurement.readId);
  const a = after.get(measurement.readId);
  if (typeof b !== "bigint" || typeof a !== "bigint") {
    if (typeof a !== "bigint") {
      unavailableReadIds.add(measurement.readId);
    }
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
    return undefined;
  }
  return b - a;
}

/** Traced native movement plus the wrapped-native balance change. */
function nativeDelta(
  check: OperationCheck,
  measurement: Extract<SlippageMeasurement, { readonly type: "native" }>,
): bigint | undefined {
  const { label, index, recordFailure, recordMissingRead, unavailableReadIds } =
    check;
  const { limit } = check.reads;
  const { before, after, transfers, requestTransactions } = check.params;
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
    return undefined;
  }
  let delta = 0n;
  for (const transfer of transfers) {
    if (!isAddressEqual(transfer.token, ethAddress)) {
      continue;
    }
    if (isAddressEqual(transfer.to, measurement.account)) {
      delta += transfer.amount;
    }
    if (isAddressEqual(transfer.from, measurement.account)) {
      delta -= transfer.amount;
    }
  }
  if (measurement.readId !== undefined) {
    const wrappedBefore = before.get(measurement.readId);
    const wrappedAfter = after.get(measurement.readId);
    if (typeof wrappedBefore !== "bigint" || typeof wrappedAfter !== "bigint") {
      if (typeof wrappedAfter !== "bigint") {
        unavailableReadIds.add(measurement.readId);
      }
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
      return undefined;
    }
    const wrappedDelta = wrappedAfter - wrappedBefore;
    delta += measurement.wrappedDebitOnly
      ? MathLib.min(0n, wrappedDelta)
      : wrappedDelta;
  }
  return delta;
}

/** Balance or position change between the before and after reads. */
function stateReadDelta(
  check: OperationCheck,
  measurement: Exclude<
    SlippageMeasurement,
    { readonly type: "midnightNet" | "midnightDebt" | "native" }
  >,
): bigint | undefined {
  const {
    label,
    index,
    violation,
    recordFailure,
    recordMissingRead,
    unavailableReadIds,
  } = check;
  const { limit } = check.reads;
  const { before, after, transfers } = check.params;
  const b = before.get(measurement.readId);
  const a = after.get(measurement.readId);
  if (
    measurement.type === "balance" &&
    typeof b === "bigint" &&
    typeof a === "bigint"
  ) {
    let delta = a - b;
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
      if (outgoing.length > 0) {
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
      }
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
    return delta;
  }
  if (
    measurement.type === "position" &&
    typeof b === "object" &&
    typeof a === "object"
  ) {
    return a[measurement.shares] - b[measurement.shares];
  }

  if (
    measurement.type === "position"
      ? typeof a !== "object"
      : typeof a !== "bigint"
  ) {
    unavailableReadIds.add(measurement.readId);
  }
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
  return undefined;
}

/** Signed change of one measurement, or `undefined` once its missing evidence is recorded. */
function measurementDelta(
  check: OperationCheck,
  measurement: SlippageMeasurement,
): bigint | undefined {
  if (measurement.type === "midnightNet") {
    return midnightNetDelta(check, measurement);
  }
  if (measurement.type === "midnightDebt") {
    return midnightDebtDelta(check, measurement);
  }
  if (measurement.type === "native") {
    return nativeDelta(check, measurement);
  }
  return stateReadDelta(check, measurement);
}

/** Observed quote sides from the planned measurements. */
function observeMeasurements(check: OperationCheck): ObservedQuote {
  const { limit, measurements } = check.reads;
  const observed: {
    -readonly [K in keyof SlippageQuote]: SlippageQuote[K];
  } = {};
  const observedPositions: InKindPositionQuote[] = [];
  for (const measurement of measurements) {
    const delta = measurementDelta(check, measurement);
    if (delta === undefined) {
      continue;
    }
    const field = measurement.field;
    if (field === "positions") {
      if (measurement.type === "position") {
        observedPositions.push({
          marketId: measurement.marketId,
          supplyShares: delta,
        });
      }
      continue;
    }
    observed[field] = QUOTE_FIELD_DIRECTION[field].output
      ? delta
      : MathLib.max(0n, -delta);
  }
  if (limit.quote.positions !== undefined) {
    observed.positions = observedPositions;
  }
  return observed;
}

/** Check each net wallet change against its composed bound. */
function checkWalletBounds(check: OperationCheck): void {
  const { label, index, violation, recordFailure, recordMissingRead } = check;
  const { limit, walletBounds } = check.reads;
  const { before, after } = check.params;
  for (const bound of walletBounds ?? []) {
    const balanceBefore = before.get(bound.readId);
    const balanceAfter = after.get(bound.readId);
    if (typeof balanceBefore !== "bigint" || typeof balanceAfter !== "bigint") {
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
    if (net < minimumNet) {
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
}

/** Observe per-index collateral supplies and check wallet bounds. */
function observeCollateralSupplies(
  check: OperationCheck,
  observed: ObservedQuote,
): void {
  const { label, index, recordFailure, recordMissingRead } = check;
  const { limit, collateralSupplyReads, walletBounds } = check.reads;
  const { before, after } = check.params;
  if (
    limit.type === "midnightSupplyCollateralTakeBorrow" ||
    limit.type === "midnightSupplyCollateralBatch"
  ) {
    if (
      limit.quote.collateralSupplies === undefined ||
      limit.quote.collateralSupplies.length === 0
    ) {
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
    }
    if (walletBounds === undefined || walletBounds.length === 0) {
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
    }
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
    // Record any wallet cap violations after observing the position credits.
    checkWalletBounds(check);
  }
}

/** Check the receiver delivery of a collateral withdrawal and return it. */
function checkCollateralDelivery(
  check: OperationCheck,
  {
    expected,
    reads,
    receiverBefore,
    receiverAfter,
  }: {
    readonly expected: CollateralWithdrawalQuote;
    readonly reads: CollateralRead | undefined;
    readonly receiverBefore: StateValue | undefined;
    readonly receiverAfter: StateValue | undefined;
  },
): bigint | undefined {
  const { label, violation, recordFailure } = check;
  const { limit, collateralReads } = check.reads;
  const delivered =
    typeof receiverAfter === "bigint" && typeof receiverBefore === "bigint"
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
  if (delivered !== undefined && delivered < minimum) {
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
  }
  return delivered;
}

/** Check one quoted collateral withdrawal, record its final collateral and return its observed amount. */
function observeCollateralWithdrawal(
  check: OperationCheck,
  {
    expected,
    finalCollateral,
  }: {
    readonly expected: CollateralWithdrawalQuote;
    readonly finalCollateral: Map<bigint, bigint>;
  },
): { readonly collateralIndex: bigint; readonly assets: bigint } | undefined {
  const { label, index, violation, recordFailure, recordMissingRead } = check;
  const { limit, collateralReads } = check.reads;
  const { before, after } = check.params;
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
  if (typeof positionAfter === "bigint") {
    finalCollateral.set(expected.collateralIndex, positionAfter);
  }
  const decrease =
    typeof positionBefore === "bigint" && typeof positionAfter === "bigint"
      ? MathLib.max(0n, positionBefore - positionAfter)
      : undefined;
  const cap = MathLib.wMulDown(
    expected.assets,
    MathLib.WAD + limit.slippageTolerance,
  );
  if (decrease !== undefined && decrease > cap) {
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
  }
  const delivered = checkCollateralDelivery(check, {
    expected,
    reads,
    receiverBefore,
    receiverAfter,
  });
  const amount =
    limit.type === "midnightWithdrawCollateralBatch" ? decrease : delivered;
  return amount === undefined
    ? undefined
    : { collateralIndex: expected.collateralIndex, assets: amount };
}

/** Observe quoted collateral withdrawals and return final collateral by index. */
function observeCollateralWithdrawals(
  check: OperationCheck,
  observed: ObservedQuote,
): Map<bigint, bigint> {
  const { limit } = check.reads;
  const finalCollateral = new Map<bigint, bigint>();
  if (
    limit.type === "midnightWithdrawCollateralBatch" ||
    limit.type === "midnightRepayWithdrawCollateral" ||
    limit.type === "midnightTakeRepayWithdrawCollateral"
  ) {
    const observedWithdrawals = [];
    for (const expected of limit.quote.collateralWithdrawals ?? []) {
      const withdrawal = observeCollateralWithdrawal(check, {
        expected,
        finalCollateral,
      });
      if (withdrawal !== undefined) {
        observedWithdrawals.push(withdrawal);
      }
    }
    if (observedWithdrawals.length > 0) {
      observed.collateralWithdrawals = observedWithdrawals;
    }
  }
  return finalCollateral;
}

/** Observe the force-exit penalty and deallocations from the call logs. */
function observeForceExit(
  check: OperationCheck,
  observed: ObservedQuote,
): void {
  const { index, recordFailure, unavailableFields } = check;
  const { limit } = check.reads;
  const { ctx, logs, morpho } = check.params;
  if (
    (limit.type === "vaultV2ForceWithdraw" ||
      limit.type === "vaultV2ForceRedeem") &&
    (limit.quote.penalty !== undefined ||
      limit.quote.deallocations !== undefined)
  ) {
    const forceExitResult = (() => {
      try {
        return findForceExitFailures({
          logs,
          vault: limit.vault,
          morpho,
          account: limit.account ?? ctx.owner,
          operationType: limit.type,
          requireDeallocations: limit.quote.deallocations !== undefined,
          operationIndex: index,
        });
      } catch (error) {
        if (!(error instanceof InvalidSimulationResponseError)) {
          throw error;
        }
        return {
          failures: [error],
          checked: { penalty: 0n, deallocations: [] },
        };
      }
    })();
    for (const failure of forceExitResult.failures) {
      recordFailure(failure);
    }
    if (
      forceExitResult.failures.some(
        (failure) => failure instanceof InvalidSimulationResponseError,
      )
    ) {
      unavailableFields.push("penalty", "deallocations");
    }
    const forceExit = forceExitResult.checked;
    if (
      limit.quote.penalty !== undefined &&
      !forceExitResult.failures.some(
        (failure) =>
          failure instanceof InvalidSimulationResponseError ||
          failure.field === "penalty",
      )
    ) {
      observed.penalty = forceExit.penalty;
    }
    if (
      limit.quote.deallocations !== undefined &&
      !forceExitResult.failures.some(
        (failure) =>
          failure instanceof InvalidSimulationResponseError ||
          failure.field === "deallocations",
      )
    ) {
      observed.deallocations = forceExit.deallocations;
    }
  }
}

/** Share-rounding allowance from earlier subject-market supplies. */
function subjectShareRounding(check: OperationCheck): {
  readonly subjectShareRoundingAllowance: bigint | undefined;
  readonly roundingUnavailable: boolean;
} {
  const { recordFailure } = check;
  const { limit } = check.reads;
  const { ctx, logs, morpho } = check.params;
  // A malformed Blue event voids only the share-rounding allowance; the
  // operation's other bounds still run.
  let subjectShareRoundingAllowance: bigint | undefined;
  let roundingUnavailable = false;
  if (
    limit.type === "blueWithdraw" &&
    typeof limit.inputs === "object" &&
    "assets" in limit.inputs &&
    limit.inputs.assets !== undefined
  ) {
    try {
      subjectShareRoundingAllowance = countPrecedingBlueSupplies({
        logs,
        morpho,
        marketId: limit.marketId,
        account: limit.account ?? ctx.owner,
      });
    } catch (error) {
      if (!(error instanceof InvalidSimulationResponseError)) {
        throw error;
      }
      recordFailure(error);
      roundingUnavailable = true;
    }
  }
  return { subjectShareRoundingAllowance, roundingUnavailable };
}

/** Check the observed quote, positions and bounds, then return the checked operation. */
function checkObservedSlippage(
  check: OperationCheck,
  {
    observed,
    finalCollateral,
    rounding,
  }: {
    readonly observed: ObservedQuote;
    readonly finalCollateral: ReadonlyMap<bigint, bigint>;
    readonly rounding: ReturnType<typeof subjectShareRounding>;
  },
): SimulatedOperation {
  const {
    subject,
    label,
    index,
    recordFailure,
    recordMissingRead,
    unavailableReadIds,
    unavailableFields,
    failures,
  } = check;
  const {
    limit,
    measurements,
    positionBoundsReadId,
    debtReadId,
    collateralReads,
  } = check.reads;
  const { ctx, after } = check.params;
  const value = debtReadId === undefined ? undefined : after.get(debtReadId);
  const afterPosition =
    positionBoundsReadId === undefined
      ? undefined
      : after.get(positionBoundsReadId);
  const position =
    typeof afterPosition === "object" ? afterPosition : undefined;
  const { subjectShareRoundingAllowance, roundingUnavailable } = rounding;
  const result = findSlippageFailures({
    unavailableFields: [
      ...unavailableFields,
      ...failures
        .filter(
          (failure): failure is SlippageCheckUnavailableError =>
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
    skipFields: [
      ...(limit.type === "midnightSupplyCollateralTakeBorrow"
        ? (["assetsReceived"] as const)
        : []),
      ...(roundingUnavailable ? (["sharesBurned"] as const) : []),
    ],
    subjectShareRoundingAllowance,
  });
  for (const failure of result.failures) {
    if (
      failure instanceof SlippageCheckUnavailableError &&
      failure.reason === "missingRead"
    ) {
      let readId: string | undefined;
      if (
        failure.field === "position" ||
        failure.field === "position.maxCredit"
      ) {
        readId = positionBoundsReadId;
      } else if (failure.field === "position.maxDebt") {
        readId = debtReadId;
      }
      recordMissingRead(failure, [readId]);
    } else {
      recordFailure(failure);
    }
  }
  return {
    ...subject,
    account: limit.account ?? ctx.owner,
    receiver: limit.receiver ?? ctx.owner,
    checkedLimits: result.checked,
  };
}

function checkOperation(check: OperationCheck): SimulatedOperation | undefined {
  // Record balance and position failures before checking the quote.
  checkCounterSide(check);
  checkTakeWithdrawDebt(check);
  checkRepayWithdrawDebt(check);
  checkRepayWithdrawCredit(check);
  // Without derivation data only the position bounds, which read ordinary observations, still run.
  if (check.derivationSkipped) {
    checkSkippedDerivationBounds(check);
    return undefined;
  }
  const observed = observeMeasurements(check);
  // Add collateral supplies and any measurement failures to the result.
  observeCollateralSupplies(check, observed);
  const finalCollateral = observeCollateralWithdrawals(check, observed);
  // Add force-exit evidence and any failures before comparing the quote.
  observeForceExit(check, observed);
  const rounding = subjectShareRounding(check);
  return checkObservedSlippage(check, { observed, finalCollateral, rounding });
}

/**
 * Find failures for caller-quoted amounts, slippage, share-price bounds,
 * and absolute post-bundle Blue position bounds.
 * Collect mode reports each missing read once across checks and operations,
 * while retaining bounds backed by an available final-state observation.
 * Typed-input vault burns add back share mints to the account and reject its
 * outgoing non-burn share transfers; quote-only limits retain net balances.
 * @param params - Planned observations, decoded before/after values, and user transfer traces.
 * @returns Failures in operation and check order, and checked operations for the success path.
 * @internal
 */
export function findOperationSlippageFailures(params: {
  readonly ctx: CheckContext;
  readonly reportedMissingReadIds?: ReadonlySet<string>;
  readonly skippedOperationIndices?: ReadonlySet<number>;
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
}): {
  readonly failures: readonly SimulationPackageError[];
  readonly checked: readonly SimulatedOperation[];
} {
  const failures: SimulationPackageError[] = [];
  const reportedMissingReadIds = new Set(params.reportedMissingReadIds);
  const recordFailure = (
    failure:
      | ConsumerLimitViolationError
      | SlippageCheckUnavailableError
      | InvalidSimulationResponseError,
  ) => {
    failures.push(failure);
  };
  const checked = params.operations.map((operation, index) => {
    try {
      return checkOperation(
        createOperationCheck({
          params,
          reads: operation,
          index,
          failures,
          reportedMissingReadIds,
          recordFailure,
        }),
      );
    } catch (error) {
      if (!(error instanceof SimulationPackageError)) {
        throw error;
      }
      failures.push(error);
      return undefined;
    }
  });
  return {
    failures,
    checked: checked.filter((operation) => operation !== undefined),
  };
}
