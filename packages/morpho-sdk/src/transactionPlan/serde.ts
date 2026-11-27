import {
  BundlesPermitMismatchError,
  InvalidSignatureError,
} from "../types/error.js";
import { validateApprovalPlanAction } from "./approval.js";
import {
  validateMorphoAuthorizationPlanAction,
  validateMorphoAuthorizationPlanRequest,
} from "./blue/authorization.js";
import { validateBorrowPlanAction } from "./blue/borrow.js";
import { validateRefinancePlanAction } from "./blue/refinance.js";
import { validateBlueRepayPlanAction } from "./blue/repay.js";
import { validateRepayWithdrawCollateralPlanAction } from "./blue/repayWithdrawCollateral.js";
import { validateBlueSupplyPlanAction } from "./blue/supply.js";
import { validateSupplyCollateralPlanAction } from "./blue/supplyCollateral.js";
import { validateSupplyCollateralBorrowPlanAction } from "./blue/supplyCollateralBorrow.js";
import { validateBlueWithdrawPlanAction } from "./blue/withdraw.js";
import { validateBlueWithdrawBuyCallbackPlanAction } from "./blue/withdrawBuyCallback.js";
import { validateBlueWithdrawCollateralPlanAction } from "./blue/withdrawCollateral.js";
import { validateDepositPlanAction } from "./deposit.js";
import {
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "./error.js";
import { validateSignaturelessMidnightAction } from "./midnight/authorization.js";
import { validateMidnightCancelOffersPlanAction } from "./midnight/cancelOffers.js";
import { validateMidnightMakerPublicationPlanAction } from "./midnight/makerPublication.js";
import { validateMidnightRedeemPlanAction } from "./midnight/redeem.js";
import { validateMidnightRepayWithdrawCollateralPlanAction } from "./midnight/repayWithdrawCollateral.js";
import { validateMidnightSupplyCollateralPlanAction } from "./midnight/supplyCollateral.js";
import { validateMidnightSupplyCollateralBatchPlanAction } from "./midnight/supplyCollateralBatch.js";
import { validateMidnightSupplyCollateralWithNativePlanAction } from "./midnight/supplyCollateralWithNative.js";
import { validateMidnightSupplyCollateralTakeBorrowPlanAction } from "./midnight/takeBorrow.js";
import { validateMidnightTakeLendPlanAction } from "./midnight/takeLend.js";
import { validateMidnightTakeRepayWithdrawCollateralPlanAction } from "./midnight/takeRepayWithdrawCollateral.js";
import { validateMidnightSellPlanAction } from "./midnight/validation.js";
import { validateMidnightWithdrawCollateralPlanAction } from "./midnight/withdrawCollateral.js";
import { validateMidnightWithdrawCollateralBatchPlanAction } from "./midnight/withdrawCollateralBatch.js";
import { validatePermitPlanRequest } from "./permit.js";
import { getPendingSignatureRequests, verifyPlanSignature } from "./plan.js";
import { validateRedeemPlanAction } from "./redeem.js";
import type { Action, Step, TransactionPlan } from "./types.js";
import { validateTransactionPlanActions } from "./validateActions.js";
import {
  getPlanObject,
  validatePlanField,
  validatePlanFields,
  validateTransactionPlanHeader,
} from "./validation.js";
import { validateInKindRedeemPlanAction as validateVaultV1InKindRedeemPlanAction } from "./vaultv1/inKindRedeem.js";
import { validateMigrateToV2PlanAction } from "./vaultv1/migrateToV2.js";
import { validateForceRedeemPlanAction } from "./vaultv2/forceRedeem.js";
import { validateForceWithdrawPlanAction } from "./vaultv2/forceWithdraw.js";
import { validateInKindRedeemPlanAction } from "./vaultv2/inKindRedeem.js";
import { validateTransactionPlanVersion } from "./version.js";
import { validateWithdrawPlanAction } from "./withdraw.js";

const actionValidators = {
  vaultV1InKindRedeem: validateVaultV1InKindRedeemPlanAction,
  blueSupply: validateBlueSupplyPlanAction,
  blueSupplyCollateral: validateSupplyCollateralPlanAction,
  blueBorrow: validateBorrowPlanAction,
  blueSupplyCollateralBorrow: validateSupplyCollateralBorrowPlanAction,
  blueRepay: validateBlueRepayPlanAction,
  blueWithdraw: validateBlueWithdrawPlanAction,
  blueWithdrawCollateral: validateBlueWithdrawCollateralPlanAction,
  blueWithdrawBuyCallback: validateBlueWithdrawBuyCallbackPlanAction,
  blueRepayWithdrawCollateral: validateRepayWithdrawCollateralPlanAction,
  blueRefinance: validateRefinancePlanAction,
  erc20Approval: validateApprovalPlanAction,
  vaultV2Redeem: validateRedeemPlanAction,
  vaultV2ForceWithdraw: validateForceWithdrawPlanAction,
  vaultV1Deposit: validateDepositPlanAction,
  vaultV1Redeem: validateRedeemPlanAction,
  vaultV1MigrateToV2: validateMigrateToV2PlanAction,
  morphoAuthorization: validateMorphoAuthorizationPlanAction,
  midnightAuthorization: validateSignaturelessMidnightAction,
  midnightMakeBorrow: validateMidnightMakerPublicationPlanAction,
  midnightMakeLend: validateMidnightMakerPublicationPlanAction,
  midnightMakeRepay: validateMidnightMakerPublicationPlanAction,
  midnightMakeWithdraw: validateMidnightMakerPublicationPlanAction,
  midnightSupplyBlueMakeLend: validateMidnightMakerPublicationPlanAction,
  midnightSupplyCollateralMakeBorrow:
    validateMidnightMakerPublicationPlanAction,
  midnightTakeBorrow: validateMidnightSellPlanAction,
  midnightSupplyCollateralTakeBorrow:
    validateMidnightSupplyCollateralTakeBorrowPlanAction,
  midnightTakeLend: validateMidnightTakeLendPlanAction,
  midnightSupplyCollateral: validateMidnightSupplyCollateralPlanAction,
  midnightSupplyCollateralBatch:
    validateMidnightSupplyCollateralBatchPlanAction,
  midnightSupplyCollateralWithNative:
    validateMidnightSupplyCollateralWithNativePlanAction,
  midnightWithdrawCollateral: validateMidnightWithdrawCollateralPlanAction,
  midnightWithdrawCollateralBatch:
    validateMidnightWithdrawCollateralBatchPlanAction,
  midnightRedeem: validateMidnightRedeemPlanAction,
  midnightTakeRepayWithdrawCollateral:
    validateMidnightTakeRepayWithdrawCollateralPlanAction,
  midnightTakeWithdraw: validateMidnightSellPlanAction,
  midnightRepayWithdrawCollateral:
    validateMidnightRepayWithdrawCollateralPlanAction,
  midnightCancelOffers: validateMidnightCancelOffersPlanAction,
  vaultV2Deposit: validateDepositPlanAction,
  vaultV2Withdraw: validateWithdrawPlanAction,
  vaultV2ForceRedeem: validateForceRedeemPlanAction,
  vaultV1Withdraw: validateWithdrawPlanAction,
  vaultV2InKindRedeem: validateInKindRedeemPlanAction,
} satisfies Record<
  Action["type"],
  (action: Record<string, unknown>, path: string) => void
>;

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Serializes plan data with a bigint replacer. No validation is performed.
 * @param plan - Plan to save.
 * @returns JSON with `$bigint` tags for bigint quantities.
 * @example
 * ```ts
 * import { serializeTransactionPlan, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * const save = (plan: TransactionPlan) => serializeTransactionPlan(plan);
 * ```
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
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Restores bigint fields and validates version, action/request shapes, uint256 ranges, unique IDs,
 * references, per-action chain/account and signature-request consistency, including signed requests.
 * Extra keys are allowed. Midnight maker publications, `midnightSupplyCollateralTakeBorrow`,
 * `midnightTakeRepayWithdrawCollateral` and `midnightSupplyCollateralWithNative` also rerun their
 * builders' static input checks, so a stored recipe that fails those checks throws here. Restore compares the stored market of
 * `midnightSupplyCollateralMakeBorrow`, `midnightSupplyCollateralTakeBorrow` and
 * `midnightTakeRepayWithdrawCollateral` with the registered Midnight deployment, and each maker
 * publication's ratifier with the registry. It does not decode maker offer payloads, so their offer
 * markets are not checked, and other Midnight actions check only the stored market's shape and
 * chain. Restoring `midnightSupplyCollateralWithNative` also looks up the chain's Midnight core,
 * wNative and MidnightBundlesV2 registry entries, so register custom deployments before parsing.
 * Building can still fail: other deployment lookups, such as the Midnight bundle address of other
 * actions, run only in `buildTransactions`. No clock or RPC is used:
 * current expiry, live state and other action-layer business constraints are not checked. Stored
 * signatures are recovered offline.
 * Permits bind owner, token, spender, value, nonce, deadline and chain; Morpho authorizations bind
 * owner, authorized address, nonce, deadline and chain, not operation amounts, markets or referral fees/recipients.
 * Parsing does not prove authenticity or intent for unsigned fields;
 * tampered but well-formed, internally consistent plans pass. Integrators must protect stored plans.
 * Integrators must protect unsigned stored fields even when all signatures verify.
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
  const steps = plan.steps as unknown[];
  const requests = plan.signatureRequests as unknown[];
  for (const [index, value] of steps.entries()) {
    const path = `$.steps[${index}]`;
    const step = getPlanObject(value, path);
    validatePlanFields(step, {
      path,
      fields: { id: "string", label: "string" },
    });
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
  }
  const requestIds = new Set<string>();
  for (const [index, value] of requests.entries()) {
    const path = `$.signatureRequests[${index}]`;
    const request = getPlanObject(value, path);
    validatePlanFields(request, {
      path,
      fields: { id: "string", kind: "string" },
    });
    requestIds.add(request.id as string);
    validatePlanRequest(request, path);
  }
  for (const [index, step] of (steps as readonly Step[]).entries()) {
    if (!("signatureRequestIds" in step.action)) {
      continue;
    }
    const path = `$.steps[${index}].action.signatureRequestIds`;
    const ids = getPlanObject(step.action.signatureRequestIds, path);
    for (const [role, id] of Object.entries(ids)) {
      validatePlanField(id, { path: `${path}.${role}`, type: "string" });
      if (!requestIds.has(id as string)) {
        throw new InvalidTransactionPlanError({
          path: `${path}.${role}`,
          reason: "expected an existing signature request ID",
        });
      }
    }
  }
  const result = restored as TransactionPlan;
  // Apply the same context and deadline rules as direct builders.
  validateTransactionPlanHeader(result);
  try {
    // Check references and request/action consistency, including restored signatures.
    getPendingSignatureRequests(result);
  } catch (cause) {
    if (
      cause instanceof InvalidSignatureError ||
      cause instanceof BundlesPermitMismatchError
    ) {
      const index = result.signatureRequests.findIndex((request) => {
        if (request.signature === undefined) {
          return false;
        }
        try {
          // Locate the failed stored signature without duplicating recovery logic.
          verifyPlanSignature(request, request.signature);
          return false;
        } catch {
          return true;
        }
      });
      throw new InvalidTransactionPlanError({
        path: `$.signatureRequests[${index}].signature`,
        reason:
          cause instanceof InvalidSignatureError
            ? "expected a valid low-s signature from the request owner"
            : "expected a compact or serialized ECDSA signature",
        cause,
      });
    }
    if (cause instanceof TransactionPlanSignatureMismatchError) {
      const index = result.signatureRequests.findIndex(
        (request) => request.id === cause.id,
      );
      let field = `typedData.${cause.field}`;
      if (cause.field === "reference") {
        field = "id";
      } else if (cause.field === "value") {
        field = "args.amount";
      } else if (cause.field.startsWith("args.")) {
        field = cause.field;
      }
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

function validatePlanRequest(request: Record<string, unknown>, path: string) {
  switch (request.kind) {
    case "permit":
      validatePermitPlanRequest(request, path);
      break;
    case "morphoAuthorization":
      validateMorphoAuthorizationPlanRequest(request, path);
      break;
    default:
      throw new InvalidTransactionPlanError({
        path: `${path}.kind`,
        reason:
          "expected a supported signature request kind (permit or morphoAuthorization)",
      });
  }
}
