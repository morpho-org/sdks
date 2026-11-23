import { type Address, isAddress, isAddressEqual, maxUint256 } from "viem";
import { InvalidTransactionPlanError } from "./error.js";
import type { TransactionPlan } from "./types.js";

/** @internal Maximum calldata-origin length in bytes. */
const MAX_CALLDATA_ORIGIN_BYTES = 1024 * 1024;

/** @internal Rejects attribution bytes above the preparation and stored-plan limit. */
export function validateCalldataOriginLength(calldataOrigin: string): void {
  if (calldataOrigin.length > 2 + MAX_CALLDATA_ORIGIN_BYTES * 2) {
    throw new InvalidTransactionPlanError({
      path: "$.calldataOrigin",
      reason: "expected at most 1 MiB",
    });
  }
}

/** @internal Validates shared plan context without reading a clock or live state. */
export function validateTransactionPlanHeader(plan: TransactionPlan): void {
  validatePlanField(plan.chainId, {
    path: "$.chainId",
    type: "positive safe integer",
  });
  validatePlanField(plan.account, { path: "$.account", type: "address" });
  validatePlanField(plan.expiresAt, {
    path: "$.expiresAt",
    type: "safe integer",
  });
  if (plan.calldataOrigin !== undefined) {
    validatePlanField(plan.calldataOrigin, {
      path: "$.calldataOrigin",
      type: "hex",
    });
    validateCalldataOriginLength(plan.calldataOrigin);
  }
  const stepIds = new Set<string>();
  for (const [index, step] of plan.steps.entries()) {
    const path = `$.steps[${index}]`;
    if (stepIds.has(step.id)) {
      throw new InvalidTransactionPlanError({
        path: `${path}.id`,
        reason: "expected a unique step ID",
      });
    }
    stepIds.add(step.id);
    const { inputs } = step.action;
    if (inputs.chainId !== plan.chainId) {
      throw new InvalidTransactionPlanError({
        path: `${path}.action.inputs.chainId`,
        reason: "expected the plan chainId",
      });
    }
    if (!matchesAddress(inputs.account, plan.account)) {
      throw new InvalidTransactionPlanError({
        path: `${path}.action.inputs.account`,
        reason: "expected the plan account",
      });
    }
    if (
      "deadline" in inputs &&
      typeof inputs.deadline === "bigint" &&
      inputs.deadline > 0n &&
      inputs.deadline < BigInt(plan.expiresAt)
    ) {
      throw new InvalidTransactionPlanError({
        path: `${path}.action.inputs.deadline`,
        reason: "expected a deadline no earlier than expiresAt",
      });
    }
  }
  const requestIds = new Set<string>();
  for (const [index, request] of plan.signatureRequests.entries()) {
    const path = `$.signatureRequests[${index}]`;
    if (requestIds.has(request.id)) {
      throw new InvalidTransactionPlanError({
        path: `${path}.id`,
        reason: "expected a unique signature request ID",
      });
    }
    requestIds.add(request.id);
    if (request.args.deadline < BigInt(plan.expiresAt)) {
      throw new InvalidTransactionPlanError({
        path: `${path}.args.deadline`,
        reason: "expected a deadline no earlier than expiresAt",
      });
    }
  }
}

/** @internal Compares an untrusted address without throwing on malformed input. */
export function matchesAddress(value: unknown, expected: Address): boolean {
  return (
    typeof value === "string" &&
    isAddress(value, { strict: false }) &&
    isAddress(expected, { strict: false }) &&
    isAddressEqual(value, expected)
  );
}

/** @internal Scalar and collection shapes used by stored plan fields. */
type PlanFieldType =
  | "string"
  | "address"
  | "hex"
  | "safe integer"
  | "positive safe integer"
  | "uint256 bigint"
  | "array";

/** @internal Validates one restored field without coercing it. */
export function validatePlanField(
  value: unknown,
  options: { readonly path: string; readonly type: PlanFieldType },
): void {
  const { path, type } = options;
  let valid: boolean;
  switch (type) {
    case "string":
      valid = typeof value === "string";
      break;
    case "address":
      valid = typeof value === "string" && isAddress(value);
      break;
    case "hex":
      valid =
        typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
      break;
    case "safe integer":
      valid = typeof value === "number" && Number.isSafeInteger(value);
      break;
    case "positive safe integer":
      valid =
        typeof value === "number" && Number.isSafeInteger(value) && value > 0;
      break;
    case "uint256 bigint":
      valid = typeof value === "bigint" && value >= 0n && value <= maxUint256;
      break;
    case "array":
      valid = Array.isArray(value);
      break;
  }
  if (!valid) {
    throw new InvalidTransactionPlanError({ path, reason: `expected ${type}` });
  }
}

/** @internal Requires a non-null, non-array JSON object. */
export function getPlanObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidTransactionPlanError({
      path,
      reason: "expected an object",
    });
  }
  return value as Record<string, unknown>;
}

/** @internal Validates required fields while permitting additional keys. */
export function validatePlanFields(
  value: Record<string, unknown>,
  options: {
    readonly path: string;
    readonly fields: Readonly<Record<string, PlanFieldType>>;
  },
): void {
  for (const [key, type] of Object.entries(options.fields)) {
    validatePlanField(value[key], { path: `${options.path}.${key}`, type });
  }
}

/** @internal Validates the shared stored vault-action fields and role map. */
export function validateVaultPlanAction(
  action: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  const inputs = getPlanObject(action.inputs, `${path}.inputs`);
  validatePlanFields(inputs, {
    path: `${path}.inputs`,
    fields: {
      vault: "address",
      deadline: "uint256 bigint",
      referralFeePct: "uint256 bigint",
      referralFeeRecipient: "address",
    },
  });
  // Vault actions require a role map even when no permit is needed.
  getPlanObject(action.signatureRequestIds, `${path}.signatureRequestIds`);
  return inputs;
}
