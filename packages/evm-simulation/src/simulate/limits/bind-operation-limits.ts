import { MathLib } from "@morpho-org/blue-sdk";
import type { DecodedOperation } from "../../decode/operation.js";
import { SimulationValidationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import type { BoundOperationLimit } from "../internal/stages.js";
import type { EffectiveSimulationLimits } from "../request/effective-limits.js";

const RAY = 10n ** 27n;

/** Lower-cased identity keys (market ids, vault/authorized addresses) declared by a limit. */
const limitSubject = (limit: OperationLimit): readonly string[] => {
  switch (limit.type) {
    case "blueRefinance":
      return [limit.sourceMarketId, limit.targetMarketId];
    case "blueAuthorization":
      return [limit.authorized];
    case "vaultV1MigrateToV2":
      return [limit.sourceVault, limit.targetVault];
    default:
      return "marketId" in limit ? [limit.marketId] : [limit.vault];
  }
};

/** Lower-cased identity keys carried by a decoded operation, in the same order as {@link limitSubject}. */
const operationSubject = (op: DecodedOperation): readonly string[] => {
  switch (op.type) {
    case "blueRefinance":
      return [op.sourceMarket.marketId, op.targetMarket.marketId];
    case "blueAuthorization":
      return [op.authorized];
    case "vaultV1MigrateToV2":
      return [op.sourceVault, op.targetVault];
    default:
      return "market" in op ? [op.market.marketId] : [op.vault];
  }
};

const sameSubject = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length &&
  a.every((key, i) => key.toLowerCase() === b[i]?.toLowerCase());

/**
 * A consumer bound weaker than the protection already encoded in the calldata
 * (or below zero) can never tighten the result; name the offending field.
 */
const widening = (
  op: DecodedOperation,
  limit: OperationLimit,
): string | undefined => {
  for (const [field, value] of Object.entries(limit)) {
    if (typeof value === "bigint" && value < 0n)
      return `${field} must be >= 0 (got ${value})`;
  }
  if (
    "maxLtvAfterWad" in limit &&
    limit.maxLtvAfterWad !== undefined &&
    "maxLtvWad" in op &&
    limit.maxLtvAfterWad > op.maxLtvWad
  )
    return `maxLtvAfterWad ${limit.maxLtvAfterWad} is weaker than the calldata maxLtvWad ${op.maxLtvWad}`;
  if (
    limit.type === "blueRefinance" &&
    op.type === "blueRefinance" &&
    limit.maxTargetLtvAfterWad !== undefined &&
    limit.maxTargetLtvAfterWad > op.maxLtvWad
  )
    return `maxTargetLtvAfterWad ${limit.maxTargetLtvAfterWad} is weaker than the calldata maxLtvWad ${op.maxLtvWad}`;
  if (
    "maxAssetsPaid" in limit &&
    limit.maxAssetsPaid !== undefined &&
    "maxRepayAssets" in op &&
    limit.maxAssetsPaid > op.maxRepayAssets
  )
    return `maxAssetsPaid ${limit.maxAssetsPaid} is weaker than the calldata maxRepayAssets ${op.maxRepayAssets}`;
  if (
    "minSharesMinted" in limit &&
    limit.minSharesMinted !== undefined &&
    "maxSharePriceE27" in op &&
    "funding" in op
  ) {
    if (op.maxSharePriceE27 <= 0n)
      return `calldata maxSharePriceE27 ${op.maxSharePriceE27} is not positive; minSharesMinted has no floor`;
    // maxSharePriceE27 bounds the net deposit, after the referral fee is taken.
    const gross = op.funding.assets;
    const net = gross - MathLib.wMulDown(gross, op.referralFee.rateWad);
    const floor = (net * RAY) / op.maxSharePriceE27;
    if (limit.minSharesMinted < floor)
      return `minSharesMinted ${limit.minSharesMinted} is weaker than the calldata share floor ${floor}`;
  }
  return undefined;
};

/** Deterministic operation order: original transaction index, then nested call path. */
export const compareOperationIdentity = (
  a: DecodedOperation,
  b: DecodedOperation,
): number => {
  if (a.transactionIndex !== b.transactionIndex)
    return a.transactionIndex - b.transactionIndex;
  const length = Math.max(a.callPath.length, b.callPath.length);
  for (let i = 0; i < length; i++) {
    const delta = (a.callPath[i] ?? -1) - (b.callPath[i] ?? -1);
    if (delta !== 0) return delta;
  }
  return 0;
};

/**
 * Bind every consumer operation limit to exactly one decoded operation, purely
 * from calldata, before anything executes.
 *
 * A limit matches an operation when the `type` tag and the identity fields
 * (`marketId`, `sourceMarketId`/`targetMarketId`, `vault`,
 * `sourceVault`/`targetVault`, `authorized`) agree and, when declared,
 * `transactionIndex` equals the operation's original user index. Binding
 * rejects, in one {@link SimulationValidationError} listing every offender:
 *
 * - **unknown** — no decoded operation carries the limit's `type`;
 * - **inapplicable** — operations of that type exist, but none carries the
 *   declared subject (or the declared `transactionIndex` holds none);
 * - **ambiguous** — several operations match; add `transactionIndex`;
 * - **duplicate** — two limits bind the same operation; merge their fields;
 * - **widening** — a bound weaker than the calldata protection or below zero.
 *
 * @param operations - The decoded operations of the bundle.
 * @param limits - Effective limits whose `operations` list is bound.
 * @returns Bound pairs sorted by {@link compareOperationIdentity}, then by the
 *   caller's limit order.
 * @throws {SimulationValidationError} With one `fieldErrors` entry per
 *   rejected limit, keyed `limits.operations[<index>]`.
 * @internal
 */
export function bindOperationLimits(
  operations: readonly DecodedOperation[],
  limits: Pick<EffectiveSimulationLimits, "operations">,
): readonly BoundOperationLimit[] {
  const fieldErrors: string[] = [];
  const bound: {
    readonly index: number;
    readonly pair: BoundOperationLimit;
  }[] = [];

  for (const [index, limit] of limits.operations.entries()) {
    const key = `limits.operations[${index}]`;
    const where =
      limit.transactionIndex === undefined
        ? ""
        : ` at transaction ${limit.transactionIndex}`;
    const subject = limitSubject(limit);
    const sameType = operations.filter((op) => op.type === limit.type);
    if (sameType.length === 0) {
      fieldErrors.push(
        `${key}: no decoded operation has type "${limit.type}" (unknown limit)`,
      );
      continue;
    }
    const matches = sameType.filter(
      (op) =>
        sameSubject(operationSubject(op), subject) &&
        (limit.transactionIndex === undefined ||
          op.transactionIndex === limit.transactionIndex),
    );
    if (matches.length === 0) {
      fieldErrors.push(
        `${key}: no "${limit.type}" operation with subject [${subject.join(", ")}]${where} (inapplicable limit)`,
      );
      continue;
    }
    if (matches.length > 1) {
      fieldErrors.push(
        `${key}: ${matches.length} "${limit.type}" operations match subject [${subject.join(", ")}]${where}; declare transactionIndex (ambiguous limit)`,
      );
      continue;
    }
    const operation = matches[0]!;
    const duplicate = bound.find((b) => b.pair.operation === operation);
    if (duplicate !== undefined) {
      fieldErrors.push(
        `${key}: binds the same operation as limits.operations[${duplicate.index}]; merge the fields (duplicate limit)`,
      );
      continue;
    }
    const weaker = widening(operation, limit);
    if (weaker !== undefined) {
      fieldErrors.push(`${key}: ${weaker} (widening limit)`);
      continue;
    }
    // `operation.type === limit.type` held in the filter above; TypeScript
    // cannot narrow two unions in lockstep, so the pair is asserted once here.
    bound.push({ index, pair: { operation, limit } as BoundOperationLimit });
  }

  if (fieldErrors.length > 0)
    throw new SimulationValidationError(
      "Invalid operation limits",
      fieldErrors,
    );

  return bound
    .sort(
      (a, b) =>
        compareOperationIdentity(a.pair.operation, b.pair.operation) ||
        a.index - b.index,
    )
    .map((b) => b.pair);
}
