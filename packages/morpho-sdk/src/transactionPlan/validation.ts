import { isAddress, maxUint256 } from "viem";
import { InvalidTransactionPlanError } from "./error.js";

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
  if (!valid)
    throw new InvalidTransactionPlanError({ path, reason: `expected ${type}` });
}

/** @internal Requires a non-null, non-array JSON object. */
export function getPlanObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new InvalidTransactionPlanError({
      path,
      reason: "expected an object",
    });
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
  for (const [key, type] of Object.entries(options.fields))
    validatePlanField(value[key], { path: `${options.path}.${key}`, type });
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
