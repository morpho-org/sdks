import { MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  compactSignatureToSignature,
  encodeAbiParameters,
  type Hex,
  isAddressEqual,
  maxUint256,
  parseCompactSignature,
  parseSignature,
  type Signature,
  size,
  zeroAddress,
  zeroHash,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  AmbiguousRequirementSignaturesError,
  type BaseAction,
  BlueBundlesV1RequirementSignatureMismatchError,
  type BlueBundlesV1TokenRequirementSignature,
  type BundlesFundingArgs,
  BundlesPermitMismatchError,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  InputExceedsMaxError,
  type Metadata,
  MixedBundlesFundingError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
  type RequirementSignature,
  type TokenRequirementSignature,
  type Transaction,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";

/** Numeric permit kinds consumed by `TokenLib.pullToken`. */
export const BundlesPermitKind = {
  None: 0,
  ERC2612: 1,
  Permit2: 2,
} as const;

/** A numeric permit kind consumed by `TokenLib.pullToken`. */
export type BundlesPermitKind =
  (typeof BundlesPermitKind)[keyof typeof BundlesPermitKind];

/** ABI-ready token permit consumed by fixed bundles deposit and funding entrypoints. */
export interface BundlesTokenPermit {
  /** TokenLib permit dispatch kind. */
  readonly kind: BundlesPermitKind;
  /** ABI-encoded permit payload, or empty bytes for classic allowance funding. */
  readonly data: Hex;
}

/** ABI-ready ERC-2612 share permit consumed by vault bundles. */
export interface BundlesSharesPermit {
  /** Exact vault-share allowance authorized by the permit. */
  readonly value: bigint;
  /** Vault permit nonce signed by the owner. */
  readonly nonce: bigint;
  /** Permit signature deadline. */
  readonly deadline: bigint;
  /** ECDSA recovery identifier, or zero for the empty sentinel. */
  readonly v: number;
  /** ECDSA signature `r`, or zero for the empty sentinel. */
  readonly r: Hex;
  /** ECDSA signature `s`, or zero for the empty sentinel. */
  readonly s: Hex;
}

/** Common deadline and referral fields shared by fixed bundles calls. */
export interface BundlesCommonParams {
  /** Contract execution deadline. */
  readonly deadline: bigint;
  /** Optional WAD-scaled referral fee percentage. */
  readonly referralFeePct?: bigint;
  /** Recipient required when `referralFeePct` is positive. */
  readonly referralFeeRecipient?: Address;
}

/** Normalized deadline and referral fields encoded by fixed bundles calls. */
export interface NormalizedBundlesCommonParams {
  /** Validated contract execution deadline. */
  readonly deadline: bigint;
  /** Validated WAD-scaled referral fee percentage. */
  readonly referralFeePct: bigint;
  /** Referral recipient, or the zero address when fees are disabled. */
  readonly referralFeeRecipient: Address;
}

const EMPTY_TOKEN_PERMIT: BundlesTokenPermit = {
  kind: BundlesPermitKind.None,
  data: "0x",
};

/**
 * Validates and normalizes a bundles deadline and referral fee configuration.
 *
 * @internal
 *
 * @param params - Common bundles parameters.
 * @returns Validated values with explicit zero defaults.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {InputExceedsMaxError} when `deadline` exceeds uint256.
 * @throws {NegativeInputError} when `referralFeePct` is negative.
 * @throws {ReferralFeePctExceededError} when `referralFeePct >= WAD`.
 * @throws {ReferralFeeRecipientMissingError} when a positive fee has no recipient.
 */
export const normalizeBundlesCommonParams = (
  params: BundlesCommonParams,
): NormalizedBundlesCommonParams => {
  if (params.deadline <= 0n) {
    throw new NonPositiveInputError("deadline", params.deadline);
  }
  if (params.deadline > maxUint256) {
    throw new InputExceedsMaxError({
      field: "deadline",
      value: params.deadline,
      max: maxUint256,
    });
  }
  const referralFeePct = params.referralFeePct ?? 0n;
  if (referralFeePct < 0n) {
    throw new NegativeInputError("referralFeePct", referralFeePct);
  }
  if (referralFeePct >= MathLib.WAD) {
    throw new ReferralFeePctExceededError(referralFeePct);
  }
  if (
    referralFeePct > 0n &&
    (params.referralFeeRecipient == null ||
      isAddressEqual(params.referralFeeRecipient, zeroAddress))
  ) {
    throw new ReferralFeeRecipientMissingError();
  }
  return {
    deadline: params.deadline,
    referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient ?? zeroAddress,
  };
};

/**
 * Resolves mutually exclusive ERC-20/native funding into the entrypoint amount and transaction value.
 *
 * @param params - Exclusive bundles funding.
 * @returns The gross ABI asset amount and native transaction value.
 * @throws {MixedBundlesFundingError} when both funding keys are present.
 * @throws {NonPositiveInputError} when the selected amount is not positive.
 * @example
 * ```ts
 * import { resolveBundlesFunding } from "@morpho-org/morpho-sdk";
 *
 * const funding = resolveBundlesFunding({ amount: 1_000_000n });
 * // funding is { assets: 1_000_000n, value: 0n }
 * ```
 */
export const resolveBundlesFunding = (
  params: BundlesFundingArgs,
): { readonly assets: bigint; readonly value: bigint } => {
  const amount = "amount" in params ? params.amount : undefined;
  const nativeAmount =
    "nativeAmount" in params ? params.nativeAmount : undefined;
  if (amount != null && nativeAmount != null) {
    throw new MixedBundlesFundingError();
  }
  const assets = amount ?? nativeAmount ?? 0n;
  if (assets < 0n) {
    throw new NegativeInputError(
      amount != null ? "amount" : "nativeAmount",
      assets,
    );
  }
  if (assets === 0n) {
    throw new NonPositiveInputError(
      amount != null ? "amount" : "nativeAmount",
      assets,
    );
  }
  return { assets, value: nativeAmount ?? 0n };
};

/**
 * Converts an optional signed token requirement into the ABI-ready TokenLib permit tuple.
 *
 * @param params - Expected funding values and optional signed requirement.
 * @returns An empty, ERC-2612, or Permit2 SignatureTransfer token permit.
 * @throws {UnexpectedRequirementSignatureError} when Permit2 AllowanceTransfer is supplied.
 * @throws {DepositOwnerMismatchError} when the signature owner differs from `userAddress`.
 * @throws {DepositAssetMismatchError} when the signed token differs from `token`.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `amount`.
 * @throws {DepositSpenderMismatchError} when the signed spender differs from `spender`.
 * @throws {BlueBundlesV1RequirementSignatureMismatchError} when signature metadata is malformed.
 * @example
 * ```ts
 * import { getBundlesTokenPermit } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const permit = getBundlesTokenPermit({
 *   userAddress: zeroAddress,
 *   token: zeroAddress,
 *   spender: zeroAddress,
 *   amount: 1n,
 * });
 * // permit is { kind: 0, data: "0x" }
 * ```
 */
export const getBundlesTokenPermit = (params: {
  readonly userAddress: Address;
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly requirementSignature?: TokenRequirementSignature;
}): BundlesTokenPermit => {
  const { requirementSignature } = params;
  if (requirementSignature == null) return { ...EMPTY_TOKEN_PERMIT };
  if (requirementSignature.action.type === "permit2") {
    throw new UnexpectedRequirementSignatureError("permit");
  }
  if (!isAddressEqual(requirementSignature.args.owner, params.userAddress)) {
    throw new DepositOwnerMismatchError(
      params.userAddress,
      requirementSignature.args.owner,
    );
  }
  if (!isAddressEqual(requirementSignature.args.asset, params.token)) {
    throw new DepositAssetMismatchError(
      params.token,
      requirementSignature.args.asset,
    );
  }
  if (
    requirementSignature.args.amount !== params.amount ||
    requirementSignature.action.args.amount !== params.amount
  ) {
    throw new DepositAmountMismatchError(
      params.amount,
      requirementSignature.args.amount,
    );
  }
  if (
    !isAddressEqual(requirementSignature.action.args.spender, params.spender)
  ) {
    throw new DepositSpenderMismatchError(
      params.spender,
      requirementSignature.action.args.spender,
    );
  }
  if (
    requirementSignature.action.args.deadline !==
    requirementSignature.args.deadline
  ) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "deadline",
      expected: String(requirementSignature.args.deadline),
      actual: String(requirementSignature.action.args.deadline),
    });
  }
  if (requirementSignature.action.type === "permit2TransferFrom") {
    return {
      kind: BundlesPermitKind.Permit2,
      data: encodeAbiParameters(
        [
          { type: "uint256", name: "nonce" },
          { type: "uint256", name: "deadline" },
          { type: "bytes", name: "signature" },
        ],
        [
          requirementSignature.args.nonce,
          requirementSignature.args.deadline,
          requirementSignature.args.signature,
        ],
      ),
    };
  }

  let signature: { readonly v: number; readonly r: Hex; readonly s: Hex };
  try {
    signature = normalizeBundlesSignature(requirementSignature.args.signature);
  } catch (cause) {
    if (cause instanceof BundlesPermitMismatchError) {
      throw new BlueBundlesV1RequirementSignatureMismatchError({
        field: "signature",
        expected: cause.expected,
        actual: cause.actual,
        cause,
      });
    }
    throw cause;
  }
  return {
    kind: BundlesPermitKind.ERC2612,
    data: encodeAbiParameters(
      [
        { type: "uint256", name: "deadline" },
        { type: "uint8", name: "v" },
        { type: "bytes32", name: "r" },
        { type: "bytes32", name: "s" },
      ],
      [
        requirementSignature.args.deadline,
        signature.v,
        signature.r,
        signature.s,
      ],
    ),
  };
};

/** @internal Normalizes a compact or serialized ECDSA signature for bundles permit tuples. */
export const normalizeBundlesSignature = (
  serializedSignature: Hex,
): { readonly v: number; readonly r: Hex; readonly s: Hex } => {
  let parsed: Signature;
  try {
    parsed =
      size(serializedSignature) === 64
        ? compactSignatureToSignature(
            parseCompactSignature(serializedSignature),
          )
        : parseSignature(serializedSignature);
  } catch (cause) {
    throw new BundlesPermitMismatchError({
      field: "signature",
      expected: "a 64-byte compact or 65-byte serialized ECDSA signature",
      actual: serializedSignature,
      cause,
    });
  }
  const normalizedV =
    parsed.v ??
    (parsed.yParity == null ? undefined : BigInt(parsed.yParity + 27));
  if (normalizedV == null) {
    throw new BundlesPermitMismatchError({
      field: "signature",
      expected: "a signature containing v or yParity",
      actual: serializedSignature,
    });
  }
  return { v: Number(normalizedV), r: parsed.r, s: parsed.s };
};

/**
 * Converts an optional vault-share ERC-2612 requirement into the ABI-ready Permit tuple.
 *
 * @param params - Vault token, empty-sentinel deadline, and optional signed requirement.
 * @returns The signed share permit or the contract's empty-permit sentinel.
 * @throws {BundlesPermitMismatchError} when the requirement kind, token, or signature is invalid.
 * @example
 * ```ts
 * import { getBundlesSharesPermit } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 *
 * const permit = getBundlesSharesPermit({
 *   vault: zeroAddress,
 *   deadline: 1_900_000_000n,
 * });
 * // permit.value === 0n
 * ```
 */
export const getBundlesSharesPermit = (params: {
  readonly vault: Address;
  readonly deadline: bigint;
  readonly owner?: Address;
  readonly spender?: Address;
  readonly amount?: bigint;
  readonly requirementSignature?: PermitRequirementSignature;
}): BundlesSharesPermit => {
  const { requirementSignature } = params;
  if (requirementSignature == null) {
    return {
      value: 0n,
      nonce: 0n,
      deadline: params.deadline,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    };
  }
  if (requirementSignature.action.type !== "permit") {
    throw new BundlesPermitMismatchError({
      field: "type",
      expected: "permit",
      actual: requirementSignature.action.type,
    });
  }
  if (!isAddressEqual(requirementSignature.args.asset, params.vault)) {
    throw new BundlesPermitMismatchError({
      field: "asset",
      expected: params.vault,
      actual: requirementSignature.args.asset,
    });
  }
  if (
    params.owner != null &&
    !isAddressEqual(requirementSignature.args.owner, params.owner)
  ) {
    throw new BundlesPermitMismatchError({
      field: "owner",
      expected: params.owner,
      actual: requirementSignature.args.owner,
    });
  }
  if (
    params.spender != null &&
    !isAddressEqual(requirementSignature.action.args.spender, params.spender)
  ) {
    throw new BundlesPermitMismatchError({
      field: "spender",
      expected: params.spender,
      actual: requirementSignature.action.args.spender,
    });
  }
  if (
    params.amount != null &&
    (requirementSignature.args.amount !== params.amount ||
      requirementSignature.action.args.amount !== params.amount)
  ) {
    throw new BundlesPermitMismatchError({
      field: "amount",
      expected: String(params.amount),
      actual: String(requirementSignature.args.amount),
    });
  }
  if (
    (params.owner != null || params.spender != null || params.amount != null) &&
    requirementSignature.action.args.deadline !==
      requirementSignature.args.deadline
  ) {
    throw new BundlesPermitMismatchError({
      field: "deadline",
      expected: String(requirementSignature.args.deadline),
      actual: String(requirementSignature.action.args.deadline),
    });
  }
  const signature = normalizeBundlesSignature(
    requirementSignature.args.signature,
  );
  return {
    value: requirementSignature.args.amount,
    nonce: requirementSignature.args.nonce,
    deadline: requirementSignature.args.deadline,
    ...signature,
  };
};

/**
 * Selects the one token signature accepted by a bundles-funded call.
 *
 * @internal
 *
 * @param signatures - Signatures passed to `buildTx`.
 * @returns The selected ERC-2612 or Permit2 SignatureTransfer signature.
 * @throws {UnexpectedRequirementSignatureError} when a non-token signature is supplied.
 * @throws {AmbiguousRequirementSignaturesError} when both token signature kinds are supplied.
 */
export const selectBlueBundlesV1TokenRequirementSignature = (
  signatures: readonly RequirementSignature[] | undefined,
): BlueBundlesV1TokenRequirementSignature | undefined => {
  if (signatures == null || signatures.length === 0) return undefined;
  const selected = signatures.filter(
    (signature): signature is BlueBundlesV1TokenRequirementSignature =>
      signature.action.type === "permit" ||
      signature.action.type === "permit2TransferFrom",
  );
  if (selected.length !== signatures.length) {
    const unexpected = signatures.find(
      (signature) =>
        signature.action.type !== "permit" &&
        signature.action.type !== "permit2TransferFrom",
    );
    throw new UnexpectedRequirementSignatureError(
      unexpected?.action.type === "authorization"
        ? "authorization"
        : unexpected?.action.type === "midnightOfferRootSignature"
          ? "midnightOfferRootSignature"
          : "permit",
    );
  }
  if (selected.length > 1) {
    throw new AmbiguousRequirementSignaturesError("permit", selected.length);
  }
  return selected[0];
};

/** @internal Returns the exact referral fee deducted from a fixed gross asset amount. */
export const getBundlesReferralFeeAssets = (
  assets: bigint,
  referralFeePct: bigint,
): bigint => MathLib.mulDivDown(assets, referralFeePct, MathLib.WAD);

/** @internal Finalizes a direct VaultBundlesV1 transaction with metadata and immutable action data. */
export const finalizeVaultBundlesV1Transaction = <
  TAction extends BaseAction,
>(params: {
  readonly chainId: number;
  readonly value: bigint;
  readonly data: Hex;
  readonly action: TAction;
  readonly metadata?: Metadata;
}): Readonly<Transaction<TAction>> => {
  let transaction = {
    to: getChainAddress(params.chainId, "bundles.vaultBundlesV1"),
    value: params.value,
    data: params.data,
  };
  if (params.metadata != null) {
    transaction = addTransactionMetadata(transaction, params.metadata);
  }
  return deepFreeze({ ...transaction, action: params.action });
};
