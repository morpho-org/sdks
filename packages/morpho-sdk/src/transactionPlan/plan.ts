import { deepFreeze } from "@morpho-org/morpho-ts";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  type Address,
  concatHex,
  type Hex,
  hashTypedData,
  isAddressEqual,
  serializeSignature,
  toHex,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";
import { normalizeBundlesSignature } from "../actions/bundles/common.js";
import { encodeErc20Approval } from "../actions/index.js";
import { InvalidSignatureError } from "../types/error.js";
import type { Transaction } from "../types/index.js";
import {
  IncompleteTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "./error.js";
import { validateSignatureRequest } from "./permit.js";
import type {
  Action,
  SignatureRequest,
  Step,
  TransactionPlan,
} from "./types.js";
import { validateTransactionPlanActions } from "./validateActions.js";
import { buildVaultV2Deposit } from "./vaultv2/deposit.js";
import { buildVaultV2Withdraw } from "./vaultv2/withdraw.js";
import { validateTransactionPlanVersion } from "./version.js";

/**
 * Validates every request against its actions, verifies supplied ECDSA signatures synchronously,
 * and attaches serialized signatures by request ID. No client or RPC is used; the EIP-712 domain
 * binds the signature to its chain. Only low-s compact or serialized ECDSA permits are supported.
 * Contract wallets should use `supportSignature: false` for direct approvals: deployed bundles
 * consume ECDSA `v/r/s`, not arbitrary ERC-1271 or ERC-6492 signatures.
 * Stored inputs remain trusted; verification does not establish the integrator's intent or protect
 * a plan changed afterwards. Builders do not reverify signatures in restored plans.
 * @param plan - Plan to update without mutating its requests or steps.
 * @param signatures - Compact or serialized ECDSA signatures, each naming a unique existing request ID.
 * @returns A new plan sharing steps and unpatched requests; omitted IDs are preserved. Empty input validates all requests and returns the original plan.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported, including when no signatures are supplied.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step names an unsupported action type, before reading requests or updates.
 * @throws {TransactionPlanSignatureMismatchError} If a request disagrees with its actions, an ID is unknown, or an input ID is duplicated (`field: "duplicate"`).
 * @throws {BundlesPermitMismatchError} If a supplied signature cannot be parsed by the bundle permit builders.
 * @throws {InvalidSignatureError} If a signature has high s, cannot recover a public key, or does not match the permit owner and typed data.
 * @example
 * ```ts
 * import { applySignatures, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * import type { Hex } from "viem";
 * const complete = (plan: TransactionPlan, signature: Hex) =>
 *   applySignatures(plan, [{ id: "vaultV2Deposit:tokenPermit", signature }]);
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export function applySignatures(
  plan: TransactionPlan,
  signatures: readonly {
    readonly id: string;
    readonly signature: Hex;
  }[],
): TransactionPlan {
  // Reject unknown formats before interpreting stored fields or signature updates.
  validateTransactionPlanVersion(plan.version);
  // Reject unknown actions before reading signature requests or updates.
  validateTransactionPlanActions(plan.steps);
  const requests = getPendingSignatureRequests({
    ...plan,
    signatureRequests: plan.signatureRequests.map((request) => ({
      ...request,
      signature: undefined,
    })),
  });
  const updates = new Map<string, Hex>();
  for (const { id, signature } of signatures) {
    if (!requests.some((request) => request.id === id))
      throw new TransactionPlanSignatureMismatchError(id, "reference");
    if (updates.has(id))
      throw new TransactionPlanSignatureMismatchError(id, "duplicate");
    updates.set(id, signature);
  }
  if (updates.size === 0) return plan;
  for (const [id, signature] of updates) {
    const request = requests.find((candidate) => candidate.id === id);
    if (request === undefined)
      throw new TransactionPlanSignatureMismatchError(id, "reference");
    const normalized = normalizeBundlesSignature(signature);
    let recovered: Address;
    try {
      const ecdsa = new secp256k1.Signature(
        BigInt(normalized.r),
        BigInt(normalized.s),
      );
      if (ecdsa.hasHighS()) throw new InvalidSignatureError();
      const publicKey = ecdsa
        .addRecoveryBit(normalized.v - 27)
        .recoverPublicKey(hashTypedData(request.typedData).slice(2));
      recovered = publicKeyToAddress(toHex(publicKey.toRawBytes(false)));
    } catch {
      throw new InvalidSignatureError();
    }
    if (!isAddressEqual(recovered, request.typedData.message.owner as Address))
      throw new InvalidSignatureError();
    updates.set(
      id,
      serializeSignature({ ...normalized, v: BigInt(normalized.v) }),
    );
  }
  return {
    ...plan,
    signatureRequests: plan.signatureRequests.map((request) => {
      const signature = updates.get(request.id);
      return signature === undefined ? request : { ...request, signature };
    }),
  };
}

/** @internal Lists the signature request IDs a step's action names, in role order. */
function getStepSignatureRequestIds(step: Step): readonly string[] {
  const { action } = step;
  if (!("signatureRequestIds" in action)) return [];
  return Object.values(action.signatureRequestIds).filter(
    (id): id is string => id !== undefined,
  );
}

/**
 * Lists pending signature requests once per request ID after checking each against every referencing action.
 * Sign each request's typed data with your wallet stack, then verify and attach the results with
 * {@link applySignatures}.
 * @param plan - Plan to inspect without changing it.
 * @returns Pending requests in first-reference order, each carrying its `id`, `kind` and validated `typedData`. Dangling IDs are omitted. The SDK never signs.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported, including empty plans.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step names an unsupported action type, before reading requests.
 * @throws {TransactionPlanSignatureMismatchError} If a pending permit disagrees with its action or arguments, including the action deadline, or any request has no referencing step.
 * @example
 * ```ts
 * import { getPendingSignatureRequests, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * const prompts = (plan: TransactionPlan) =>
 *   getPendingSignatureRequests(plan).map(({ id, kind, typedData }) => ({ id, kind, typedData }));
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export function getPendingSignatureRequests(
  plan: TransactionPlan,
): readonly SignatureRequest[] {
  // Reject unknown formats before interpreting stored fields.
  validateTransactionPlanVersion(plan.version);
  // Reject unknown actions before exposing signature requests.
  validateTransactionPlanActions(plan.steps);
  const referenced = new Map<string, Action[]>();
  for (const step of plan.steps) {
    for (const id of getStepSignatureRequestIds(step)) {
      referenced.set(id, [...(referenced.get(id) ?? []), step.action]);
    }
  }
  for (const request of plan.signatureRequests) {
    const actions = referenced.get(request.id);
    if (actions === undefined)
      throw new TransactionPlanSignatureMismatchError(request.id, "reference");
    if (request.signature === undefined) {
      for (const action of actions) {
        validateSignatureRequest(request, action);
        if (
          action.type !== "erc20Approval" &&
          request.args.deadline !== action.inputs.deadline
        )
          throw new TransactionPlanSignatureMismatchError(
            request.id,
            "args.deadline",
          );
      }
    }
  }
  return [...referenced.keys()].flatMap((id) => {
    const request = plan.signatureRequests.find(
      (candidate) => candidate.id === id,
    );
    return request && request.signature === undefined ? [request] : [];
  });
}

function encodeStep(action: Action, requests: readonly SignatureRequest[]) {
  switch (action.type) {
    case "erc20Approval":
      return encodeErc20Approval(action.inputs);
    case "vaultV2Deposit":
      return buildVaultV2Deposit(action, requests);
    case "vaultV2Withdraw":
      return buildVaultV2Withdraw(action, requests);
  }
}

/**
 * Builds one transaction from a step, its fixed inputs and the signatures its action names.
 * Plans are trusted as given, whether restored or supplied directly. Signature checks establish
 * only request/action consistency; they do not validate stored fees, recipients, share-price bounds,
 * vaults or amounts against the intended operation. Integrators must protect stored plans from tampering.
 * This builder does not verify signature ownership; use {@link applySignatures} to verify and attach signatures.
 * @param plan - Plan supplying referenced signature requests and the calldata origin; chain and account come from the action inputs.
 * @param step - Recipe to encode; missing signatures on unrelated supported steps do not block it.
 * @returns A frozen `{ to, data, value, action }`, ready to simulate or submit. `data` ends with the plan's `calldataOrigin` when one was set.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step or the selected step names an unsupported action type.
 * @throws {UnsupportedErc20ApprovalSpenderError} If an approval names an unregistered spender.
 * @throws {NonPositiveInputError} If a deposit or withdrawal amount, deposit share-price bound or deadline is not positive.
 * @throws {ReferralFeePctExceededError} If the action's referral fee is at least WAD.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no nonzero recipient.
 * @throws {IncompleteTransactionPlanError} If a referenced signature request or its signature is missing.
 * @throws {TransactionPlanSignatureMismatchError} If a referenced permit disagrees with the step's action or its encoding arguments.
 * @example
 * ```ts
 * import { buildTransaction, parseTransactionPlan } from "@morpho-org/morpho-sdk";
 * const resume = (saved: string) => {
 *   const plan = parseTransactionPlan(saved);
 *   return plan.steps.map((step) => buildTransaction(plan, step));
 * };
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export function buildTransaction(
  plan: TransactionPlan,
  step: Step,
): Readonly<Transaction> {
  // Reject unknown formats before interpreting stored fields.
  validateTransactionPlanVersion(plan.version);
  // Check the whole plan and any separately selected step before reading requests.
  validateTransactionPlanActions([...plan.steps, step]);
  const requests = getStepSignatureRequestIds(step).map((id) => {
    const request = plan.signatureRequests.find(
      (candidate) => candidate.id === id,
    );
    if (request === undefined) throw new IncompleteTransactionPlanError(id);
    validateSignatureRequest(request, step.action);
    return request;
  });
  const { to, value, data, action } = encodeStep(step.action, requests);
  return deepFreeze({
    to,
    value,
    data:
      plan.calldataOrigin === undefined
        ? data
        : concatHex([data, plan.calldataOrigin]),
    action,
  });
}

/**
 * Builds every step of the plan in order.
 * @param plan - Plan whose referenced signature requests all carry a signature.
 * @returns Frozen SDK transactions in step order; discriminate on `action.type` for per-step handling.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported, including empty plans.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step names an unsupported action type, before reading requests.
 * @throws {UnsupportedErc20ApprovalSpenderError} If an approval names an unregistered spender.
 * @throws {NonPositiveInputError} If a deposit or withdrawal amount, deposit share-price bound or deadline is not positive.
 * @throws {ReferralFeePctExceededError} If an action's referral fee is at least WAD.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no nonzero recipient.
 * @throws {IncompleteTransactionPlanError} If any step references a signature request or signature that is missing.
 * @throws {TransactionPlanSignatureMismatchError} If a referenced permit disagrees with its action or encoding arguments.
 * @example
 * ```ts
 * import { buildTransactions, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * const submit = (plan: TransactionPlan) => buildTransactions(plan);
 * // Simulate and send in order from plan.account on plan.chainId.
 * ```
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 */
export function buildTransactions(
  plan: TransactionPlan,
): readonly Readonly<Transaction>[] {
  // Reject unknown formats even when there are no steps to build.
  validateTransactionPlanVersion(plan.version);
  // Validate every action before the first step can interpret requests.
  validateTransactionPlanActions(plan.steps);
  return plan.steps.map((step) => buildTransaction(plan, step));
}
