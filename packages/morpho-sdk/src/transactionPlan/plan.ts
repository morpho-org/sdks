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
  buildMorphoAuthorization,
  validateMorphoAuthorizationRequest,
} from "./blue/authorization.js";
import { buildBlueBorrow } from "./blue/borrow.js";
import { buildBlueRefinance } from "./blue/refinance.js";
import { buildBlueRepay, validateBlueRepayPermit } from "./blue/repay.js";
import {
  buildBlueRepayWithdrawCollateral,
  validateRepayWithdrawCollateralRequest,
} from "./blue/repayWithdrawCollateral.js";
import {
  buildBlueSupply,
  validateBlueSupplyPermitRequest,
} from "./blue/supply.js";
import {
  buildBlueSupplyCollateral,
  validateSupplyCollateralPermitRequest,
} from "./blue/supplyCollateral.js";
import {
  buildBlueSupplyCollateralBorrow,
  validateSupplyCollateralBorrowRequest,
} from "./blue/supplyCollateralBorrow.js";
import {
  buildBlueWithdraw,
  validateBlueWithdrawAuthorizationRequest,
} from "./blue/withdraw.js";
import { buildBlueWithdrawBuyCallback } from "./blue/withdrawBuyCallback.js";
import {
  buildBlueWithdrawCollateral,
  validateBlueWithdrawCollateralAuthorizationRequest,
} from "./blue/withdrawCollateral.js";
import {
  IncompleteTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "./error.js";
import { buildMidnightAuthorization } from "./midnight/authorization.js";
import { buildMidnightCancelOffers } from "./midnight/cancelOffers.js";
import { buildMidnightMakerPublication } from "./midnight/makerPublication.js";
import { buildMidnightRedeem } from "./midnight/redeem.js";
import { buildMidnightRepayWithdrawCollateral } from "./midnight/repayWithdrawCollateral.js";
import { buildMidnightSupplyCollateral } from "./midnight/supplyCollateral.js";
import { buildMidnightSupplyCollateralBatch } from "./midnight/supplyCollateralBatch.js";
import { buildMidnightSupplyCollateralWithNative } from "./midnight/supplyCollateralWithNative.js";
import { buildMidnightTakeBorrow } from "./midnight/takeBorrow.js";
import { buildMidnightTakeLend } from "./midnight/takeLend.js";
import { buildMidnightTakeRepayWithdrawCollateral } from "./midnight/takeRepayWithdrawCollateral.js";
import { buildMidnightTakeWithdraw } from "./midnight/takeWithdraw.js";
import { buildMidnightWithdrawCollateral } from "./midnight/withdrawCollateral.js";
import { buildMidnightWithdrawCollateralBatch } from "./midnight/withdrawCollateralBatch.js";
import { validateVaultPermitRequest } from "./permit.js";
import type {
  Action,
  SignatureRequest,
  Step,
  TransactionPlan,
} from "./types.js";
import { validateTransactionPlanActions } from "./validateActions.js";
import { validateTransactionPlanHeader } from "./validation.js";
import { buildVaultV1Deposit } from "./vaultv1/deposit.js";
import { buildVaultV1InKindRedeem } from "./vaultv1/inKindRedeem.js";
import { buildVaultV1MigrateToV2 } from "./vaultv1/migrateToV2.js";
import { buildVaultV1Redeem } from "./vaultv1/redeem.js";
import { buildVaultV1Withdraw } from "./vaultv1/withdraw.js";
import { buildVaultV2Deposit } from "./vaultv2/deposit.js";
import { buildVaultV2ForceRedeem } from "./vaultv2/forceRedeem.js";
import { buildVaultV2ForceWithdraw } from "./vaultv2/forceWithdraw.js";
import { buildVaultV2InKindRedeem } from "./vaultv2/inKindRedeem.js";
import { buildVaultV2Redeem } from "./vaultv2/redeem.js";
import { buildVaultV2Withdraw } from "./vaultv2/withdraw.js";
import { validateTransactionPlanVersion } from "./version.js";

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Validates every request against its actions, verifies supplied ECDSA signatures synchronously,
 * and attaches serialized signatures by request ID. No client or RPC is used; the EIP-712 domain
 * binds the signature to its chain. Only low-s compact or serialized ECDSA signatures are supported.
 * Contract wallets should use `supportSignature: false` for direct approvals: deployed bundles
 * consume ECDSA `v/r/s`, not arbitrary ERC-1271 or ERC-6492 signatures.
 * Stored inputs remain trusted; verification does not establish the integrator's intent or protect
 * unsigned fields from tampering. Stored signatures are reverified offline at parse, inspection and build.
 * Permits bind owner, token, spender, value, nonce, deadline and chain; Morpho authorizations bind
 * owner, authorized address, nonce, deadline and chain, not operation amounts, markets or referral fees/recipients.
 * @param plan - Plan to update without mutating its requests or steps.
 * @param signatures - Compact or serialized ECDSA signatures, each naming a unique existing request ID.
 * @returns A new plan sharing steps and unpatched requests; omitted IDs are preserved. Empty input validates all requests and returns the original plan.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported, including when no signatures are supplied.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step names an unsupported action type, before reading requests or updates.
 * @throws {TransactionPlanSignatureMismatchError} If a request disagrees with its actions, an ID is unknown, or an input ID is duplicated (`field: "duplicate"`).
 * @throws {BundlesPermitMismatchError} If a supplied signature cannot be parsed by the bundle permit builders.
 * @throws {InvalidTransactionPlanError} If the plan header, action context, IDs or deadlines are inconsistent.
 * @throws {InvalidSignatureError} If a signature has high s, cannot recover a public key, or does not match the request owner and typed data.
 * @example
 * ```ts
 * import { applySignatures, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * import type { Hex } from "viem";
 * const complete = (plan: TransactionPlan, signature: Hex) =>
 *   applySignatures(plan, [{ id: "vaultV2Deposit:tokenPermit", signature }]);
 * ```
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
  const updatedIds = new Set(signatures.map(({ id }) => id));
  // Validate all requests and stored signatures that are not being replaced.
  getPendingSignatureRequests({
    ...plan,
    signatureRequests: plan.signatureRequests.map((request) =>
      updatedIds.has(request.id)
        ? { ...request, signature: undefined }
        : request,
    ),
  });
  const requests = plan.signatureRequests;
  const updates = new Map<string, Hex>();
  for (const { id, signature } of signatures) {
    if (!requests.some((request) => request.id === id)) {
      throw new TransactionPlanSignatureMismatchError(id, "reference");
    }
    if (updates.has(id)) {
      throw new TransactionPlanSignatureMismatchError(id, "duplicate");
    }
    updates.set(id, signature);
  }
  if (updates.size === 0) {
    return plan;
  }
  for (const [id, signature] of updates) {
    const request = requests.find((candidate) => candidate.id === id);
    if (request === undefined) {
      throw new TransactionPlanSignatureMismatchError(id, "reference");
    }
    updates.set(id, verifyPlanSignature(request, signature));
  }
  return {
    ...plan,
    signatureRequests: plan.signatureRequests.map((request) => {
      const signature = updates.get(request.id);
      return signature === undefined ? request : { ...request, signature };
    }),
  };
}

/** @internal Verifies and normalizes a signature offline after the request has been validated against its action. */
export function verifyPlanSignature(
  request: SignatureRequest,
  signature: Hex,
): Hex {
  const normalized = normalizeBundlesSignature(signature);
  let recovered: Address;
  try {
    const ecdsa = new secp256k1.Signature(
      BigInt(normalized.r),
      BigInt(normalized.s),
    );
    if (ecdsa.hasHighS()) {
      throw new InvalidSignatureError();
    }
    const publicKey = ecdsa
      .addRecoveryBit(normalized.v - 27)
      .recoverPublicKey(hashTypedData(request.typedData).slice(2));
    recovered = publicKeyToAddress(toHex(publicKey.toRawBytes(false)));
  } catch {
    throw new InvalidSignatureError();
  }
  const signer =
    request.kind === "permit"
      ? (request.typedData.message.owner as Address)
      : request.args.owner;
  if (!isAddressEqual(recovered, signer)) {
    throw new InvalidSignatureError();
  }
  return serializeSignature({ ...normalized, v: BigInt(normalized.v) });
}

/** @internal Lists the signature request IDs a step's action names, in role order. */
function getStepSignatureRequestIds(step: Step): readonly string[] {
  const { action } = step;
  if (!("signatureRequestIds" in action)) {
    return [];
  }
  return Object.values(action.signatureRequestIds).filter(
    (id): id is string => id !== undefined,
  );
}

function actionDataKeys(value: Record<string, unknown>): string[] {
  const keys = Object.keys(value);
  return Array.isArray(value)
    ? keys
    : keys.filter((key) => value[key] !== undefined);
}

function equalActionData(left: Action, right: Action): boolean {
  const pending: [unknown, unknown][] = [[left, right]];
  const compared = new WeakMap<object, WeakSet<object>>();
  for (const [a, b] of pending) {
    if (Object.is(a, b)) {
      continue;
    }
    if (
      typeof a !== "object" ||
      a === null ||
      typeof b !== "object" ||
      b === null
    ) {
      return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
      }
    } else {
      const prototype = Object.getPrototypeOf(a);
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        prototype !== Object.getPrototypeOf(b)
      ) {
        return false;
      }
    }
    const matches = compared.get(a) ?? new WeakSet<object>();
    if (matches.has(b)) {
      continue;
    }
    matches.add(b);
    compared.set(a, matches);

    const aFields = a as Record<string, unknown>;
    const bFields = b as Record<string, unknown>;
    const keys = actionDataKeys(aFields);
    if (keys.length !== actionDataKeys(bFields).length) {
      return false;
    }
    for (const key of keys) {
      if (!Object.prototype.propertyIsEnumerable.call(b, key)) {
        return false;
      }
      pending.push([aFields[key], bFields[key]]);
    }
  }
  return true;
}

function validateSignatureRequest(request: SignatureRequest, action: Action) {
  if (action.type === "blueSupplyCollateralBorrow") {
    return validateSupplyCollateralBorrowRequest(request, action);
  }
  if (
    request.kind === "morphoAuthorization" &&
    action.type === "blueWithdraw"
  ) {
    return validateBlueWithdrawAuthorizationRequest(request, action);
  }
  if (
    request.kind === "morphoAuthorization" &&
    action.type === "blueWithdrawCollateral"
  ) {
    return validateBlueWithdrawCollateralAuthorizationRequest(request, action);
  }
  if (
    request.kind === "morphoAuthorization" &&
    action.type === "blueBorrow" &&
    action.signatureRequestIds.morphoAuthorization === request.id
  ) {
    return validateMorphoAuthorizationRequest(request, {
      ...action.inputs,
      nonce: action.inputs.authorizationNonce,
    });
  }
  if (request.kind === "permit" && action.type === "blueSupplyCollateral") {
    return validateSupplyCollateralPermitRequest(request, action);
  }
  if (
    request.kind === "permit" &&
    action.type === "blueSupply" &&
    action.signatureRequestIds.tokenPermit === request.id
  ) {
    return validateBlueSupplyPermitRequest(request, action);
  }
  if (request.kind === "permit" && action.type === "blueRepay") {
    return validateBlueRepayPermit(request, action);
  }
  if (action.type === "blueRepayWithdrawCollateral") {
    return validateRepayWithdrawCollateralRequest(request, action);
  }
  if (
    request.kind === "morphoAuthorization" &&
    action.type === "blueRefinance" &&
    action.signatureRequestIds.morphoAuthorization === request.id &&
    action.inputs.authorizationNonce !== undefined
  ) {
    return validateMorphoAuthorizationRequest(request, {
      ...action.inputs,
      nonce: action.inputs.authorizationNonce,
    });
  }
  if (
    request.kind === "permit" &&
    (action.type === "vaultV2Deposit" ||
      action.type === "vaultV1Deposit" ||
      action.type === "vaultV1Withdraw" ||
      action.type === "vaultV2Withdraw" ||
      action.type === "vaultV2Redeem" ||
      action.type === "vaultV1Redeem" ||
      action.type === "vaultV2ForceWithdraw" ||
      action.type === "vaultV1MigrateToV2" ||
      action.type === "vaultV2InKindRedeem" ||
      action.type === "vaultV1InKindRedeem")
  ) {
    validateVaultPermitRequest(request, action);
    return;
  }
  throw new TransactionPlanSignatureMismatchError(request.id, "reference");
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Lists pending signature requests once per request ID and validates them against their referencing actions.
 * Signed requests are also checked and their signers recovered offline.
 * Sign each request's typed data with your wallet stack, then verify and attach the results with
 * {@link applySignatures}.
 * @param plan - Plan to inspect without changing it.
 * @returns Pending requests in first-reference order, each carrying its `id`, `kind` and validated `typedData`. Dangling IDs are omitted. The SDK never signs.
 * @throws {InvalidTransactionPlanError} If the plan header, action context, IDs or deadlines are inconsistent.
 * @throws {InvalidSignatureError} If a stored signature has high s, cannot recover a public key or does not match the request owner.
 * @throws {BundlesPermitMismatchError} If a stored signature cannot be parsed as a compact or serialized ECDSA signature.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported, including empty plans.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step names an unsupported action type, before reading requests.
 * @throws {TransactionPlanSignatureMismatchError} If a pending request or Morpho authorization disagrees with its action or arguments, or any request has no referencing step.
 * @example
 * ```ts
 * import { getPendingSignatureRequests, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * const prompts = (plan: TransactionPlan) =>
 *   getPendingSignatureRequests(plan).map(({ id, kind, typedData }) => ({ id, kind, typedData }));
 * ```
 */
export function getPendingSignatureRequests(
  plan: TransactionPlan,
): readonly SignatureRequest[] {
  // Reject unknown formats before interpreting stored fields.
  validateTransactionPlanVersion(plan.version);
  // Reject unknown actions before exposing signature requests.
  validateTransactionPlanActions(plan.steps);
  // Validate shared context before resolving requests.
  validateTransactionPlanHeader(plan);
  const referenced = new Map<string, Action[]>();
  for (const step of plan.steps) {
    for (const id of getStepSignatureRequestIds(step)) {
      if (referenced.has(id)) {
        throw new TransactionPlanSignatureMismatchError(id, "reference");
      }
      referenced.set(id, [...(referenced.get(id) ?? []), step.action]);
    }
  }
  for (const request of plan.signatureRequests) {
    const actions = referenced.get(request.id);
    if (actions === undefined) {
      throw new TransactionPlanSignatureMismatchError(request.id, "reference");
    }
    for (const action of actions) {
      validateSignatureRequest(request, action);
    }
    if (request.signature !== undefined) {
      // Recover only after the request has been bound to its action account.
      verifyPlanSignature(request, request.signature);
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
    case "vaultV2ForceRedeem":
      return buildVaultV2ForceRedeem(action);
    case "vaultV1MigrateToV2":
      return buildVaultV1MigrateToV2(action, requests);
    case "vaultV1InKindRedeem":
      return buildVaultV1InKindRedeem(action, requests);
    case "blueSupply":
      return buildBlueSupply(action, requests);
    case "blueSupplyCollateral":
      return buildBlueSupplyCollateral(action, requests);
    case "blueBorrow":
      return buildBlueBorrow(action, requests);
    case "blueSupplyCollateralBorrow":
      return buildBlueSupplyCollateralBorrow(action, requests);
    case "blueRepay":
      return buildBlueRepay(action, requests);
    case "blueWithdraw":
      return buildBlueWithdraw(action, requests);
    case "blueWithdrawCollateral":
      return buildBlueWithdrawCollateral(action, requests);
    case "blueWithdrawBuyCallback":
      return buildBlueWithdrawBuyCallback(action);
    case "blueRepayWithdrawCollateral":
      return buildBlueRepayWithdrawCollateral(action, requests);
    case "blueRefinance":
      return buildBlueRefinance(action, requests);
    case "erc20Approval":
      return encodeErc20Approval({
        ...action.inputs,
        amount: action.inputs.assets ?? action.inputs.shares,
      });
    case "vaultV1Deposit":
      return buildVaultV1Deposit(action, requests);
    case "morphoAuthorization":
      return buildMorphoAuthorization(action);
    case "midnightAuthorization":
      return buildMidnightAuthorization(action);
    case "midnightMakeBorrow":
    case "midnightMakeLend":
    case "midnightMakeRepay":
    case "midnightMakeWithdraw":
    case "midnightSupplyCollateralMakeBorrow":
    case "midnightSupplyBlueMakeLend":
      return buildMidnightMakerPublication(action);
    case "midnightTakeBorrow":
    case "midnightSupplyCollateralTakeBorrow":
      return buildMidnightTakeBorrow(action);
    case "midnightTakeWithdraw":
      return buildMidnightTakeWithdraw(action);
    case "midnightRepayWithdrawCollateral":
      return buildMidnightRepayWithdrawCollateral(action);
    case "midnightTakeLend":
      return buildMidnightTakeLend(action);
    case "midnightSupplyCollateral":
      return buildMidnightSupplyCollateral(action);
    case "midnightSupplyCollateralBatch":
      return buildMidnightSupplyCollateralBatch(action);
    case "midnightSupplyCollateralWithNative":
      return buildMidnightSupplyCollateralWithNative(action);
    case "midnightWithdrawCollateral":
      return buildMidnightWithdrawCollateral(action);
    case "midnightWithdrawCollateralBatch":
      return buildMidnightWithdrawCollateralBatch(action);
    case "midnightRedeem":
      return buildMidnightRedeem(action);
    case "midnightTakeRepayWithdrawCollateral":
      return buildMidnightTakeRepayWithdrawCollateral(action);
    case "midnightCancelOffers":
      return buildMidnightCancelOffers(action);
    case "vaultV2Deposit":
      return buildVaultV2Deposit(action, requests);
    case "vaultV2Withdraw":
      return buildVaultV2Withdraw(action, requests);
    case "vaultV2Redeem":
      return buildVaultV2Redeem(action, requests);
    case "vaultV2ForceWithdraw":
      return buildVaultV2ForceWithdraw(action, requests);
    case "vaultV1Withdraw":
      return buildVaultV1Withdraw(action, requests);
    case "vaultV1Redeem":
      return buildVaultV1Redeem(action, requests);
    case "vaultV2InKindRedeem":
      return buildVaultV2InKindRedeem(action, requests);
  }
}

/**
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Builds one transaction from a step, its fixed inputs and the signatures its action names.
 * Plans are trusted as given, whether restored or supplied directly. Signature checks establish
 * only request/action consistency; they do not validate stored fees, recipients, share-price bounds,
 * vaults or amounts against the intended operation. Integrators must protect stored plans from tampering.
 * Stored signatures are verified offline. Permits bind owner, token, spender, value, nonce, deadline
 * and chain; Morpho authorizations bind owner, authorized address, nonce, deadline and chain,
 * not operation amounts, market parameters or referral fees/recipients. Protect those unsigned fields.
 * @param plan - Plan supplying referenced signature requests and the calldata origin; chain and account come from the action inputs.
 * @param step - Recipe to encode; missing signatures on unrelated supported steps do not block it.
 * @returns A frozen `{ to, data, value, action }`, ready to simulate or submit. `data` ends with the plan's `calldataOrigin` when one was set.
 * @throws {InvalidTransactionPlanError} If the plan header, action context, IDs or deadlines are inconsistent, a Midnight repayment type is unsupported, a Midnight market lists its collateral out of ascending token order, a Midnight single-collateral step has no bigint `collateralIndex`, or a Midnight collateral batch's list is not an array or holds a non-object entry (path under `$.inputs`).
 * @throws {InvalidBigIntInputError} If a supplied Blue maxPenalty, or a Midnight collateral batch entry's `collateralIndex` or `assets`, is not a bigint; uint256 schema validation is performed by parseTransactionPlan, not this builder.
 * @throws {InvalidSignatureError} If a stored signature has high s, cannot recover a public key or does not match the request owner.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step or the selected step names an unsupported action type.
 * @throws {UnsupportedErc20ApprovalSpenderError} If an approval names an unregistered spender.
 * @throws {SameVaultMigrationError} If a migration's source and destination vaults are identical.
 * @throws {AmountAndSharesExclusiveError} If a migration supplies both `assets` and `shares`, or neither.
 * @throws {NonPositiveInputError} If a deposit, withdrawal or migration amount, a deposit or migration destination share-price bound, a collateral amount, Midnight redeem units, a deadline, force-redeem shares or deallocation amount is not positive, or a Midnight repayment step has a nonpositive full repayment cap or neither repays nor withdraws.
 * @throws {MarketIdMismatchError} If a Blue collateral step's market ID doesn't match its market parameters.
 * @throws {MidnightMarketAddressMismatchError} If a Midnight collateral, redeem or repayment step's market targets another Midnight deployment.
 * @throws {ChainIdMismatchError} If a Midnight redeem or repayment step's market targets another chain.
 * @throws {MidnightZeroOnBehalfError} If a Midnight redeem, `midnightWithdrawCollateral`, `midnightWithdrawCollateralBatch` or `midnightSupplyCollateralWithNative` step names the zero address as its account.
 * @throws {MidnightZeroReceiverError} If a Midnight redeem, `midnightWithdrawCollateral` or `midnightWithdrawCollateralBatch` step, or a `midnightRepayWithdrawCollateral` step that withdraws collateral, names the zero address as its receiver.
 * @throws {MidnightContractReceiverError} If a Midnight redeem, `midnightWithdrawCollateral` or `midnightWithdrawCollateralBatch` step, or a `midnightRepayWithdrawCollateral` step that withdraws collateral, names a blocked protocol or token contract as its receiver.
 * @throws {MidnightCalldataEncodingError} If the market tuple or withdrawal arguments cannot be encoded for a Midnight redeem step, or a Midnight repayment step has malformed addresses or other unencodable inputs.
 * @throws {InvalidMarketParameterError} If a Midnight collateral, redeem, take or repayment step has an invalid market configuration.
 * @throws {UnknownCollateralIndexError} If a Midnight collateral or repayment step targets an index not configured on its market.
 * @throws {NativeAmountOnNonWNativeAssetError} If a native-funded Blue collateral step targets a token other than wNative.
 * @throws {ChainWNativeMissingError} If a native-funded Blue collateral step targets a chain without registered wNative.
 * @throws {EmptyDeallocationsError} If a force-redeem step has no deallocations.
 * @throws {EmptyMarketParamsListError} If a Vault V1 in-kind redemption step has no markets.
 * @throws {ReferralFeePctExceededError} If the action's referral fee is at least WAD.
 * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no nonzero recipient.
 * @throws {IncompleteTransactionPlanError} If a referenced signature request or its signature is missing.
 * @throws {TransactionPlanSignatureMismatchError} If a referenced request disagrees with the step's action or its encoding arguments.
 * @throws {BundlesPermitMismatchError} If a stored signature cannot be parsed or a signed permit's encoding arguments do not match the step.
 * @throws {MarketIdMismatchError} If a Blue market ID differs from its parameter tuple.
 * @throws {NegativeInputError} If a Blue amount, native value, LTV bound, maxPenalty or referral fee is negative, or a Midnight repayment's exact asset amount or native funding is negative.
 * @throws {InputExceedsMaxError} If a Blue amount, bound or deadline exceeds uint256, maxPenalty exceeds WAD, a reallocation penalty exceeds maxPenalty (default zero, rejecting any positive penalty), withdrawal-only funding is nonzero, Midnight redeem units exceed uint128, or a Midnight batch collateral supply amount exceeds uint128.
 *   For `midnightRepayWithdrawCollateral`, if `repay.assets` or `repay.maxBuyerAssets` is at least `maxUint256`,
 *   a withdrawal amount or deadline exceeds uint256, or native funding exceeds the repayment pull.
 * @throws {MutuallyExclusiveRepayAmountsError} If a Blue repayment specifies both nonzero assets and shares.
 * @throws {MaxRepayAssetsBelowRepayAssetsError} If exact-asset funding cannot cover repayment plus referral fees.
 * @throws {NativeFundingAmountMismatchError} If Blue native funding does not equal the full repayment cap.
 * @throws {ChainWNativeMissingError} If native funding targets a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding targets a loan token other than wNative.
 * @throws {UnexpectedRequirementSignatureError} If a Blue signature targets an inactive leg or native-funded token pull.
 * @throws {DepositOwnerMismatchError} If a Blue signature belongs to another account.
 * @throws {DepositAssetMismatchError} If a token signature names another loan token.
 * @throws {DepositAmountMismatchError} If a token signature does not cover the repayment cap.
 * @throws {DepositSpenderMismatchError} If a token signature names another spender.
 * @throws {UnsupportedRequirementSignatureError} If a token signature has an unsupported action type.
 * @throws {BundlesRequirementSignatureMismatchError} If a Blue signature cannot be bound or parsed safely.
 * @throws {UnsupportedChainIdError} If a Blue or Midnight action's chain is absent from the registry.
 * @throws {UnknownAddressError} If BlueBundlesV1, Midnight core, or MidnightBundlesV2 for a Midnight repayment step is not registered on the action's chain.
 * @throws {EmptyMidnightGroupCancellationsError} If a Midnight cancellation lists no groups.
 * @throws {InvalidMidnightHexInputError} If a Midnight cancellation group is not 32 bytes.
 * @throws {DuplicateMidnightGroupCancellationError} If a Midnight cancellation lists a group twice.
 * @throws {EmptyMidnightCollateralWithdrawalsError} If a Midnight batch collateral withdrawal lists no withdrawals.
 * @throws {EmptyMidnightCollateralSuppliesError} If a Midnight batch collateral supply lists no supplies.
 * @throws {DuplicateMidnightCollateralIndexError} If a Midnight batch collateral supply or withdrawal repeats a collateral index.
 * @throws {MidnightZeroOnBehalfError} If a Midnight cancellation's account is the zero address.
 * @example
 * ```ts
 * import { buildTransaction, parseTransactionPlan } from "@morpho-org/morpho-sdk";
 * const resume = (saved: string) => {
 *   const plan = parseTransactionPlan(saved);
 *   return plan.steps.map((step) => buildTransaction(plan, step));
 * };
 * ```
 */
export function buildTransaction(
  plan: TransactionPlan,
  step: Step,
): Readonly<Transaction> {
  // Reject unknown formats before interpreting stored fields.
  validateTransactionPlanVersion(plan.version);
  // Check the whole plan and any separately selected step before reading requests.
  const isOriginalStep = plan.steps.includes(step);
  const steps = isOriginalStep ? plan.steps : [...plan.steps, step];
  validateTransactionPlanActions(steps);
  // Validate the plan and the separately selected step without requiring unrelated signatures.
  validateTransactionPlanHeader(plan);
  const referencedIds = new Set(plan.steps.flatMap(getStepSignatureRequestIds));
  getPendingSignatureRequests({
    ...plan,
    signatureRequests: plan.signatureRequests.filter((request) =>
      referencedIds.has(request.id),
    ),
  });
  if (
    !isOriginalStep &&
    !plan.steps.some(
      (candidate) =>
        candidate.id === step.id &&
        equalActionData(candidate.action, step.action),
    )
  ) {
    for (const id of getStepSignatureRequestIds(step)) {
      if (referencedIds.has(id)) {
        throw new TransactionPlanSignatureMismatchError(id, "reference");
      }
      referencedIds.add(id);
    }
  }
  validateTransactionPlanHeader({ ...plan, steps: [step] });
  const requests = getStepSignatureRequestIds(step).map((id) => {
    const request = plan.signatureRequests.find(
      (candidate) => candidate.id === id,
    );
    if (request === undefined) {
      throw new IncompleteTransactionPlanError(id);
    }
    validateSignatureRequest(request, step.action);
    if (request.signature !== undefined) {
      // The selected step may not be present in the plan's step list.
      verifyPlanSignature(request, request.signature);
    }
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
 * @experimental TransactionPlan is in beta; breaking changes may ship in minor releases.
 * Builds every step of the plan in order.
 * @param plan - Plan whose referenced signature requests all carry a signature.
 * @returns Frozen SDK transactions in step order; discriminate on `action.type` for per-step handling.
 * @throws {InvalidTransactionPlanError} If the plan header, action context, IDs or deadlines are inconsistent, a Midnight repayment type is unsupported, a Midnight market lists its collateral out of ascending token order, a Midnight single-collateral step has no bigint `collateralIndex`, or a Midnight collateral batch's list is not an array or holds a non-object entry (path under `$.inputs`).
 * @throws {InvalidBigIntInputError} If a supplied Blue maxPenalty, or a Midnight collateral batch entry's `collateralIndex` or `assets`, is not a bigint; uint256 schema validation is performed by parseTransactionPlan, not this builder.
 * @throws {InvalidSignatureError} If a stored signature has high s, cannot recover a public key or does not match the request owner.
 * @throws {UnsupportedTransactionPlanVersionError} If the plan version is unsupported, including empty plans.
 * @throws {UnsupportedTransactionPlanActionError} If any plan step names an unsupported action type, before reading requests.
 * @throws {UnsupportedErc20ApprovalSpenderError} If an approval names an unregistered spender.
 * @throws {SameVaultMigrationError} If a migration's source and destination vaults are identical.
 * @throws {AmountAndSharesExclusiveError} If a migration supplies both `assets` and `shares`, or neither.
 * @throws {NonPositiveInputError} If a deposit, withdrawal or migration amount, a deposit or migration destination share-price bound, a collateral amount, Midnight redeem units, a deadline, force-redeem shares or deallocation amount is not positive, or a Midnight repayment step has a nonpositive full repayment cap or neither repays nor withdraws.
 * @throws {MarketIdMismatchError} If a Blue collateral step's market ID doesn't match its market parameters.
 * @throws {MidnightMarketAddressMismatchError} If a Midnight collateral, redeem or repayment step's market targets another Midnight deployment.
 * @throws {ChainIdMismatchError} If a Midnight redeem or repayment step's market targets another chain.
 * @throws {MidnightZeroOnBehalfError} If a Midnight redeem, `midnightWithdrawCollateral`, `midnightWithdrawCollateralBatch` or `midnightSupplyCollateralWithNative` step names the zero address as its account.
 * @throws {MidnightZeroReceiverError} If a Midnight redeem, `midnightWithdrawCollateral` or `midnightWithdrawCollateralBatch` step, or a `midnightRepayWithdrawCollateral` step that withdraws collateral, names the zero address as its receiver.
 * @throws {MidnightContractReceiverError} If a Midnight redeem, `midnightWithdrawCollateral` or `midnightWithdrawCollateralBatch` step, or a `midnightRepayWithdrawCollateral` step that withdraws collateral, names a blocked protocol or token contract as its receiver.
 * @throws {MidnightCalldataEncodingError} If the market tuple or withdrawal arguments cannot be encoded for a Midnight redeem step, or a Midnight repayment step has malformed addresses or other unencodable inputs.
 * @throws {UnknownCollateralIndexError} If a Midnight collateral or repayment step targets an index not configured on its market.
 * @throws {NativeAmountOnNonWNativeAssetError} If a native-funded Blue collateral step targets a token other than wNative.
 * @throws {ChainWNativeMissingError} If a native-funded Blue collateral step targets a chain without registered wNative.
 * @throws {EmptyDeallocationsError} If a force-redeem step has no deallocations.
 * @throws {EmptyMarketParamsListError} If a Vault V1 in-kind redemption step has no markets.
 * @throws {ReferralFeePctExceededError} If an action's referral fee is at least WAD.
 * @throws {MidnightReferralFeePctExceededError} when the referral fee is above 10% but below WAD.
 * @throws {ReferralFeeRecipientMissingError} If a positive referral fee has no nonzero recipient.
 * @throws {IncompleteTransactionPlanError} If any step references a signature request or signature that is missing.
 * @throws {InvalidMarketParameterError} If a Midnight collateral, redeem, take or repayment step has an invalid market configuration.
 * @throws {TransactionPlanSignatureMismatchError} If a referenced request disagrees with its action or encoding arguments.
 * @throws {BundlesPermitMismatchError} If a stored signature cannot be parsed or a signed permit's encoding arguments do not match the step.
 * @throws {MarketIdMismatchError} If a Blue market ID differs from its parameter tuple.
 * @throws {NegativeInputError} If a Blue amount, native value, LTV bound, maxPenalty or referral fee is negative, or a Midnight repayment's exact asset amount or native funding is negative.
 * @throws {InputExceedsMaxError} If a Blue amount, bound or deadline exceeds uint256, maxPenalty exceeds WAD, a reallocation penalty exceeds maxPenalty (default zero, rejecting any positive penalty), withdrawal-only funding is nonzero, Midnight redeem units exceed uint128, or a Midnight batch collateral supply amount exceeds uint128.
 *   For `midnightRepayWithdrawCollateral`, if `repay.assets` or `repay.maxBuyerAssets` is at least `maxUint256`,
 *   a withdrawal amount or deadline exceeds uint256, or native funding exceeds the repayment pull.
 * @throws {MutuallyExclusiveRepayAmountsError} If a Blue repayment specifies both nonzero assets and shares.
 * @throws {MaxRepayAssetsBelowRepayAssetsError} If exact-asset funding cannot cover repayment plus referral fees.
 * @throws {NativeFundingAmountMismatchError} If Blue native funding does not equal the full repayment cap.
 * @throws {ChainWNativeMissingError} If native funding targets a chain without wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} If native funding targets a loan token other than wNative.
 * @throws {UnexpectedRequirementSignatureError} If a Blue signature targets an inactive leg or native-funded token pull.
 * @throws {DepositOwnerMismatchError} If a Blue signature belongs to another account.
 * @throws {DepositAssetMismatchError} If a token signature names another loan token.
 * @throws {DepositAmountMismatchError} If a token signature does not cover the repayment cap.
 * @throws {DepositSpenderMismatchError} If a token signature names another spender.
 * @throws {UnsupportedRequirementSignatureError} If a token signature has an unsupported action type.
 * @throws {BundlesRequirementSignatureMismatchError} If a Blue signature cannot be bound or parsed safely.
 * @throws {UnsupportedChainIdError} If a Blue or Midnight action's chain is absent from the registry.
 * @throws {UnknownAddressError} If BlueBundlesV1, Midnight core, or MidnightBundlesV2 for a Midnight repayment step is not registered on the action's chain.
 * @throws {EmptyMidnightGroupCancellationsError} If a Midnight cancellation lists no groups.
 * @throws {InvalidMidnightHexInputError} If a Midnight cancellation group is not 32 bytes.
 * @throws {DuplicateMidnightGroupCancellationError} If a Midnight cancellation lists a group twice.
 * @throws {EmptyMidnightCollateralWithdrawalsError} If a Midnight batch collateral withdrawal lists no withdrawals.
 * @throws {EmptyMidnightCollateralSuppliesError} If a Midnight batch collateral supply lists no supplies.
 * @throws {DuplicateMidnightCollateralIndexError} If a Midnight batch collateral supply or withdrawal repeats a collateral index.
 * @throws {MidnightZeroOnBehalfError} If a Midnight cancellation's account is the zero address.
 * @example
 * ```ts
 * import { buildTransactions, type TransactionPlan } from "@morpho-org/morpho-sdk";
 * const submit = (plan: TransactionPlan) => buildTransactions(plan);
 * // Simulate and send in order from plan.account on plan.chainId.
 * ```
 */
export function buildTransactions(
  plan: TransactionPlan,
): readonly Readonly<Transaction>[] {
  // Reject unknown formats even when there are no steps to build.
  validateTransactionPlanVersion(plan.version);
  // Validate every action before the first step can interpret requests.
  validateTransactionPlanActions(plan.steps);
  // Reject malformed headers even for empty plans.
  validateTransactionPlanHeader(plan);
  return plan.steps.map((step) => buildTransaction(plan, step));
}
