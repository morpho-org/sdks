import {
  MarketParams,
  MathLib,
  VaultV2BluePublicAllocatorConfigUtils,
} from "@morpho-org/blue-sdk";
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
import {
  addTransactionMetadata,
  validateNativeAsset,
} from "../../helpers/index.js";
import { validateVaultV2BlueReallocations } from "../../helpers/validate.js";
import {
  AmbiguousRequirementSignaturesError,
  type AuthorizationRequirementSignature,
  type BaseAction,
  BlueBundlesV1RequirementSignatureMismatchError,
  type BlueBundlesV1TokenRequirementSignature,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  type Erc2612RequirementSignature,
  InputExceedsMaxError,
  type Metadata,
  MissingReferralFeeRecipientError,
  NativeFundingAmountMismatchError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationLoanTokenMismatchError,
  type RequirementSignature,
  selectRequirementSignatures,
  type TokenRequirementSignature,
  type Transaction,
  UnexpectedRequirementSignatureError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";

/** @internal */
export interface BlueBundlesV1CommonParams {
  chainId: number;
  userAddress: Address;
  deadline: bigint;
  referralFeePct?: bigint;
  referralFeeRecipient?: Address;
  metadata?: Metadata;
}

/** @internal */
export interface NormalizedBlueBundlesV1CommonParams {
  referralFeePct: bigint;
  referralFeeRecipient: Address;
}

/**
 * BlueBundlesV1 token-permit discriminator carried in the encoded permit struct: `none` (0) skips
 * the pull, `erc2612` (1) is an ERC-2612 permit, `permit2TransferFrom` (2) is a Permit2
 * SignatureTransfer. Named so a transposed literal can't silently route a permit to the wrong branch.
 * @internal
 */
const BLUE_BUNDLES_V1_TOKEN_PERMIT_KIND = {
  none: 0,
  erc2612: 1,
  permit2TransferFrom: 2,
} as const;

interface BlueBundlesV1TokenPermit {
  kind: (typeof BLUE_BUNDLES_V1_TOKEN_PERMIT_KIND)[keyof typeof BLUE_BUNDLES_V1_TOKEN_PERMIT_KIND];
  data: Hex;
}

interface BlueBundlesV1SignedAuthorization {
  signature: { v: number; r: Hex; s: Hex };
  nonce: bigint;
  deadline: bigint;
}

const EMPTY_TOKEN_PERMIT: BlueBundlesV1TokenPermit = {
  kind: BLUE_BUNDLES_V1_TOKEN_PERMIT_KIND.none,
  data: "0x",
};

const EMPTY_SIGNED_AUTHORIZATION: BlueBundlesV1SignedAuthorization = {
  signature: { v: 0, r: zeroHash, s: zeroHash },
  nonce: 0n,
  deadline: 0n,
};

/** @internal */
export const normalizeBlueBundlesV1CommonParams = (
  params: BlueBundlesV1CommonParams,
): NormalizedBlueBundlesV1CommonParams => {
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
    throw new InputExceedsMaxError({
      field: "referralFeePct",
      value: referralFeePct,
      max: MathLib.WAD - 1n,
    });
  }
  if (
    referralFeePct > 0n &&
    (params.referralFeeRecipient == null ||
      isAddressEqual(params.referralFeeRecipient, zeroAddress))
  ) {
    throw new MissingReferralFeeRecipientError();
  }
  return {
    referralFeePct,
    referralFeeRecipient: params.referralFeeRecipient ?? zeroAddress,
  };
};

/** @internal */
export const validateBlueBundlesV1NativeFunding = (params: {
  chainId: number;
  token: Address;
  fundedAmount: bigint;
  nativeAmount?: bigint;
  requirementSignature?: BlueBundlesV1TokenRequirementSignature;
}): bigint => {
  const nativeAmount = params.nativeAmount ?? 0n;
  if (nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }
  if (nativeAmount === 0n) return 0n;

  validateNativeAsset(params.chainId, params.token);
  if (nativeAmount !== params.fundedAmount) {
    throw new NativeFundingAmountMismatchError(
      nativeAmount,
      params.fundedAmount,
    );
  }
  if (params.requirementSignature != null) {
    throw new UnexpectedRequirementSignatureError(
      params.requirementSignature.action.type,
    );
  }
  return nativeAmount;
};

/** @internal */
export const getBlueBundlesV1TokenPermit = (params: {
  chainId: number;
  userAddress: Address;
  token: Address;
  amount: bigint;
  requirementSignature?: TokenRequirementSignature;
}): BlueBundlesV1TokenPermit => {
  const { requirementSignature } = params;
  if (requirementSignature == null) return EMPTY_TOKEN_PERMIT;

  const spender = getChainAddress(params.chainId, "bundles.blueBundlesV1");
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
  if (requirementSignature.args.amount !== params.amount) {
    throw new DepositAmountMismatchError(
      params.amount,
      requirementSignature.args.amount,
    );
  }
  if (!isAddressEqual(requirementSignature.action.args.spender, spender)) {
    throw new DepositSpenderMismatchError(
      spender,
      requirementSignature.action.args.spender,
    );
  }
  if (requirementSignature.action.args.amount !== params.amount) {
    throw new DepositAmountMismatchError(
      params.amount,
      requirementSignature.action.args.amount,
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
      kind: BLUE_BUNDLES_V1_TOKEN_PERMIT_KIND.permit2TransferFrom,
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
  if (requirementSignature.action.type !== "permit") {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "type",
      expected: "permit or permit2TransferFrom",
      actual: requirementSignature.action.type,
    });
  }

  const serializedSignature = requirementSignature.args.signature;
  let parsed: Signature;
  try {
    parsed =
      size(serializedSignature) === 64
        ? compactSignatureToSignature(
            parseCompactSignature(serializedSignature),
          )
        : parseSignature(serializedSignature);
  } catch (cause) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "signature",
      expected: "a 64-byte compact or 65-byte serialized ECDSA signature",
      actual: serializedSignature,
      cause,
    });
  }
  const v =
    parsed.v ??
    (parsed.yParity == null ? undefined : BigInt(parsed.yParity + 27));
  if (v == null) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "signature",
      expected: "a signature containing v or yParity",
      actual: serializedSignature,
    });
  }
  return {
    kind: BLUE_BUNDLES_V1_TOKEN_PERMIT_KIND.erc2612,
    data: encodeAbiParameters(
      [
        { type: "uint256", name: "deadline" },
        { type: "uint8", name: "v" },
        { type: "bytes32", name: "r" },
        { type: "bytes32", name: "s" },
      ],
      [requirementSignature.args.deadline, Number(v), parsed.r, parsed.s],
    ),
  };
};

/** @internal */
export const getBlueBundlesV1SignedAuthorization = (params: {
  chainId: number;
  userAddress: Address;
  authorizationSignature?: AuthorizationRequirementSignature;
}): BlueBundlesV1SignedAuthorization => {
  const { authorizationSignature } = params;
  if (authorizationSignature == null) return EMPTY_SIGNED_AUTHORIZATION;

  const authorized = getChainAddress(params.chainId, "bundles.blueBundlesV1");
  if (!isAddressEqual(authorizationSignature.args.owner, params.userAddress)) {
    throw new DepositOwnerMismatchError(
      params.userAddress,
      authorizationSignature.args.owner,
    );
  }
  if (!isAddressEqual(authorizationSignature.args.authorized, authorized)) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "authorized",
      expected: authorized,
      actual: authorizationSignature.args.authorized,
    });
  }
  if (
    !isAddressEqual(authorizationSignature.action.args.authorized, authorized)
  ) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "authorized",
      expected: authorized,
      actual: authorizationSignature.action.args.authorized,
    });
  }
  if (!authorizationSignature.args.isAuthorized) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "isAuthorized",
      expected: "true",
      actual: String(authorizationSignature.args.isAuthorized),
    });
  }
  if (!authorizationSignature.action.args.isAuthorized) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "isAuthorized",
      expected: "true",
      actual: String(authorizationSignature.action.args.isAuthorized),
    });
  }
  if (
    authorizationSignature.action.args.deadline !==
    authorizationSignature.args.deadline
  ) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "deadline",
      expected: String(authorizationSignature.args.deadline),
      actual: String(authorizationSignature.action.args.deadline),
    });
  }

  const serializedSignature = authorizationSignature.args.signature;
  let parsed: Signature;
  try {
    parsed =
      size(serializedSignature) === 64
        ? compactSignatureToSignature(
            parseCompactSignature(serializedSignature),
          )
        : parseSignature(serializedSignature);
  } catch (cause) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "signature",
      expected: "a 64-byte compact or 65-byte serialized ECDSA signature",
      actual: serializedSignature,
      cause,
    });
  }
  const v =
    parsed.v ??
    (parsed.yParity == null ? undefined : BigInt(parsed.yParity + 27));
  if (v == null) {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "signature",
      expected: "a signature containing v or yParity",
      actual: serializedSignature,
    });
  }
  return {
    signature: { v: Number(v), r: parsed.r, s: parsed.s },
    nonce: authorizationSignature.args.nonce,
    deadline: authorizationSignature.args.deadline,
  };
};

/** @internal */
export const getBlueBundlesV1PublicAllocations = (
  reallocations: readonly VaultV2BlueReallocation[],
  targetMarketParams: MarketParams,
) => {
  validateVaultV2BlueReallocations(reallocations, targetMarketParams.id);
  // Hoisted out of the map: idle sources all reference the same synthetic idle market, whose
  // construction eagerly hashes the market id — computing it once per call instead of per entry.
  const idleMarketParams = MarketParams.idle(targetMarketParams.loanToken);
  return reallocations.map((reallocation) => {
    if (
      reallocation.from.type === "market" &&
      !isAddressEqual(
        reallocation.from.marketParams.loanToken,
        targetMarketParams.loanToken,
      )
    ) {
      throw new ReallocationLoanTokenMismatchError(
        targetMarketParams.loanToken,
        reallocation.from.marketParams.loanToken,
      );
    }
    return {
      vault: reallocation.vault,
      adapter: reallocation.to.adapter,
      marketParams: targetMarketParams,
      fromIdle: reallocation.from.type === "idle",
      sourceAdapter:
        reallocation.from.type === "market"
          ? reallocation.from.adapter
          : zeroAddress,
      sourceMarketParams:
        reallocation.from.type === "market"
          ? reallocation.from.marketParams
          : idleMarketParams,
      assets: reallocation.assets,
      penalty: reallocation.penalty,
    };
  });
};

/** @internal */
export const getBlueBundlesV1PenaltyAssets = (
  reallocations: readonly {
    assets: bigint;
    penalty: bigint;
  }[],
): bigint =>
  reallocations.reduce(
    (total, reallocation) =>
      total +
      VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
        reallocation,
        reallocation.assets,
      ),
    0n,
  );

/** @internal */
export const getBlueBundlesV1ReferralFeeAssets = (
  assets: bigint,
  referralFeePct: bigint,
): bigint =>
  referralFeePct === 0n
    ? 0n
    : MathLib.mulDivDown(assets, referralFeePct, MathLib.WAD - referralFeePct);

/** @internal */
export const selectBlueBundlesV1RequirementSignatures = (
  signatures: readonly RequirementSignature[] | undefined,
  accepts: { token?: boolean; authorization?: boolean },
): {
  token?: BlueBundlesV1TokenRequirementSignature;
  authorization?: AuthorizationRequirementSignature;
} => {
  const { permit, permit2TransferFrom, authorization } =
    selectRequirementSignatures(signatures, {
      permit: accepts.token,
      permit2TransferFrom: accepts.token,
      authorization: accepts.authorization,
    });
  if (permit?.action.type === "permit2") {
    throw new BlueBundlesV1RequirementSignatureMismatchError({
      field: "type",
      expected: "permit or permit2TransferFrom",
      actual: permit.action.type,
    });
  }
  if (permit != null && permit2TransferFrom != null) {
    throw new AmbiguousRequirementSignaturesError("permit", 2);
  }
  return {
    token:
      (permit as Erc2612RequirementSignature | undefined) ??
      permit2TransferFrom,
    authorization,
  };
};

/** @internal */
export const finalizeBlueBundlesV1Transaction = <
  TAction extends BaseAction,
>(params: {
  common: BlueBundlesV1CommonParams;
  value: bigint;
  data: Hex;
  action: TAction;
}): Readonly<Transaction<TAction>> => {
  let transaction = {
    to: getChainAddress(params.common.chainId, "bundles.blueBundlesV1"),
    value: params.value,
    data: params.data,
  };
  if (params.common.metadata != null) {
    transaction = addTransactionMetadata(transaction, params.common.metadata);
  }
  return deepFreeze({ ...transaction, action: params.action });
};
