import { type Address, isAddressEqual } from "viem";
import { validateApprovalPlanAction } from "./approval.js";
import {
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "./error.js";
import { validatePermitPlanRequest } from "./permit.js";
import { getPendingSignatureRequests } from "./plan.js";
import type { Action, Step, TransactionPlan } from "./types.js";
import { validateTransactionPlanActions } from "./validateActions.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
} from "./validation.js";
import { validateDepositPlanAction } from "./vaultv2/deposit.js";
import { validateWithdrawPlanAction } from "./vaultv2/withdraw.js";
import { validateTransactionPlanVersion } from "./version.js";

const actionValidators = {
  erc20Approval: validateApprovalPlanAction,
  vaultV2Deposit: validateDepositPlanAction,
  vaultV2Withdraw: validateWithdrawPlanAction,
} satisfies Record<
  Action["type"],
  (action: Record<string, unknown>, path: string) => void
>;

/**
 * Serializes plan data with a bigint replacer. No validation is performed.
 * @param plan - Plan to save.
 * @returns JSON with `$bigint` tags for bigint quantities.
 * @example
 * ```ts
 * import { serializeTransactionPlan, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * const save = (plan: TransactionPlan) => serializeTransactionPlan(plan);
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export function serializeTransactionPlan(plan: TransactionPlan): string {
  return JSON.stringify(
    plan,
    function (this: Record<string, unknown>, key: string) {
      // Read the original value even when the host has installed BigInt.prototype.toJSON.
      const value = this[key];
      return typeof value === "bigint" ? { $bigint: value.toString() } : value;
    },
  );
}

/**
 * Restores bigint fields and validates version, action/request shapes, uint256 ranges, unique IDs,
 * references, per-action chain/account and permit/action consistency, including signed requests.
 * Extra keys are allowed. No clock or RPC is used: expiry, live state, signature ownership and
 * action-layer business constraints are not checked. Parsing does not prove authenticity or intent;
 * tampered but well-formed, internally consistent plans pass. Integrators must protect stored plans.
 * Use `applySignatures` to verify new signatures; existing restored signatures remain trusted.
 * @param json - JSON previously returned by `serializeTransactionPlan`.
 * @returns The restored plan.
 * @throws {InvalidTransactionPlanError} At the first malformed JSON, field shape or consistency failure, exposing its JSON `path` and `reason`.
 * @throws {UnsupportedTransactionPlanVersionError} If the stored integer version is unsupported.
 * @throws {UnsupportedTransactionPlanActionError} If a step names an unsupported action type.
 * @example
 * ```ts
 * import { parseTransactionPlan } from "@morpho-org/morpho-sdk";
 * const restore = (saved: string) => parseTransactionPlan(saved);
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export function parseTransactionPlan(json: string): TransactionPlan {
  let restored: unknown;
  try {
    restored = JSON.parse(json, (_key, field: unknown) =>
      typeof field === "object" &&
      field !== null &&
      "$bigint" in field &&
      typeof field.$bigint === "string"
        ? BigInt(field.$bigint)
        : field,
    );
  } catch (cause) {
    throw new InvalidTransactionPlanError({
      path: "$",
      reason: "expected JSON with valid bigint tags",
      cause,
    });
  }
  const plan = getPlanObject(restored, "$");
  validatePlanField(plan.version, { path: "$.version", type: "safe integer" });
  validateTransactionPlanVersion(plan.version as number);
  validatePlanFields(plan, {
    path: "$",
    fields: {
      chainId: "positive safe integer",
      account: "address",
      expiresAt: "safe integer",
      steps: "array",
      signatureRequests: "array",
    },
  });
  if (plan.calldataOrigin !== undefined)
    validatePlanField(plan.calldataOrigin, {
      path: "$.calldataOrigin",
      type: "hex",
    });
  const steps = plan.steps as unknown[];
  const requests = plan.signatureRequests as unknown[];
  const stepIds = new Set<string>();
  for (const [index, value] of steps.entries()) {
    const path = `$.steps[${index}]`;
    const step = getPlanObject(value, path);
    validatePlanFields(step, {
      path,
      fields: { id: "string", label: "string" },
    });
    if (stepIds.has(step.id as string))
      throw new InvalidTransactionPlanError({
        path: `${path}.id`,
        reason: "expected a unique step ID",
      });
    stepIds.add(step.id as string);
    const action = getPlanObject(step.action, `${path}.action`);
    validatePlanField(action.type, {
      path: `${path}.action.type`,
      type: "string",
    });
  }
  // Preserve the existing action-type guard before dispatching action schemas.
  validateTransactionPlanActions(steps as readonly Step[]);
  for (const [index, step] of (steps as readonly Step[]).entries()) {
    const path = `$.steps[${index}].action`;
    const action = getPlanObject(step.action, path);
    const inputs = getPlanObject(action.inputs, `${path}.inputs`);
    validatePlanFields(inputs, {
      path: `${path}.inputs`,
      fields: { chainId: "positive safe integer", account: "address" },
    });
    actionValidators[step.action.type](action, path);
    if (inputs.chainId !== plan.chainId)
      throw new InvalidTransactionPlanError({
        path: `${path}.inputs.chainId`,
        reason: "expected the plan chainId",
      });
    if (!isAddressEqual(inputs.account as Address, plan.account as Address))
      throw new InvalidTransactionPlanError({
        path: `${path}.inputs.account`,
        reason: "expected the plan account",
      });
  }
  const requestIds = new Set<string>();
  for (const [index, value] of requests.entries()) {
    const path = `$.signatureRequests[${index}]`;
    const request = getPlanObject(value, path);
    validatePlanFields(request, {
      path,
      fields: { id: "string", kind: "string" },
    });
    if (requestIds.has(request.id as string))
      throw new InvalidTransactionPlanError({
        path: `${path}.id`,
        reason: "expected a unique signature request ID",
      });
    requestIds.add(request.id as string);
    if (request.kind !== "permit")
      throw new InvalidTransactionPlanError({
        path: `${path}.kind`,
        reason: "expected a supported signature request kind (permit)",
      });
    validatePermitPlanRequest(request, path);
  }
  for (const [index, step] of (steps as readonly Step[]).entries()) {
    if (!("signatureRequestIds" in step.action)) continue;
    const path = `$.steps[${index}].action.signatureRequestIds`;
    const ids = getPlanObject(step.action.signatureRequestIds, path);
    for (const [role, id] of Object.entries(ids)) {
      validatePlanField(id, { path: `${path}.${role}`, type: "string" });
      if (!requestIds.has(id as string))
        throw new InvalidTransactionPlanError({
          path: `${path}.${role}`,
          reason: "expected an existing signature request ID",
        });
    }
  }
  const result = restored as TransactionPlan;
  try {
    // Clear signatures so the existing pure consistency check validates every request.
    getPendingSignatureRequests({
      ...result,
      signatureRequests: result.signatureRequests.map((request) => ({
        ...request,
        signature: undefined,
      })),
    });
  } catch (cause) {
    if (cause instanceof TransactionPlanSignatureMismatchError) {
      const index = result.signatureRequests.findIndex(
        (request) => request.id === cause.id,
      );
      let field = `typedData.${cause.field}`;
      if (cause.field === "reference") field = "id";
      else if (cause.field === "value") field = "args.amount";
      else if (cause.field.startsWith("args.")) field = cause.field;
      throw new InvalidTransactionPlanError({
        path: `$.signatureRequests[${index}].${field}`,
        reason: "expected agreement with every referencing action",
        cause,
      });
    }
    throw new InvalidTransactionPlanError({
      path: "$.signatureRequests",
      reason: "expected requests consistent with supported action chains",
      cause,
    });
  }
  return result;
}
