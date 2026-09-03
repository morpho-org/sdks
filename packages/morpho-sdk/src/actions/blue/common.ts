import {
  MarketParams,
  MathLib,
  VaultV2BluePublicAllocatorConfigUtils,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  compactSignatureToSignature,
  type Hex,
  isAddressEqual,
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
  BundlesRequirementSignatureMismatchError,
  type BundlesTokenRequirementSignature,
  DepositOwnerMismatchError,
  type Erc2612RequirementSignature,
  type Metadata,
  NativeFundingAmountMismatchError,
  NegativeInputError,
  ReallocationLoanTokenMismatchError,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  UnexpectedRequirementSignatureError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import {
  type BundlesTokenPermit,
  getBundlesTokenPermit,
  normalizeBundlesCommonParams,
} from "../bundles/index.js";

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

type BlueBundlesV1TokenPermit = BundlesTokenPermit;

interface BlueBundlesV1SignedAuthorization {
  signature: { v: number; r: Hex; s: Hex };
  nonce: bigint;
  deadline: bigint;
}

const EMPTY_SIGNED_AUTHORIZATION: BlueBundlesV1SignedAuthorization = {
  signature: { v: 0, r: zeroHash, s: zeroHash },
  nonce: 0n,
  deadline: 0n,
};

/** @internal */
export const normalizeBlueBundlesV1CommonParams = (
  params: BlueBundlesV1CommonParams,
): NormalizedBlueBundlesV1CommonParams => {
  const normalized = normalizeBundlesCommonParams(params);
  return {
    referralFeePct: normalized.referralFeePct,
    referralFeeRecipient: normalized.referralFeeRecipient,
  };
};

/** @internal */
export const validateBlueBundlesV1NativeFunding = (params: {
  chainId: number;
  token: Address;
  fundedAmount: bigint;
  nativeAmount?: bigint;
  requirementSignature?: BundlesTokenRequirementSignature;
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
      params.requirementSignature.action.type === "permit2SignatureTransfer"
        ? "permit2SignatureTransfer"
        : "permit",
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
  requirementSignature?: BundlesTokenRequirementSignature;
}): BlueBundlesV1TokenPermit => {
  return getBundlesTokenPermit({
    userAddress: params.userAddress,
    token: params.token,
    spender: getChainAddress(params.chainId, "bundles.blueBundlesV1"),
    amount: params.amount,
    requirementSignature: params.requirementSignature,
  });
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
    throw new BundlesRequirementSignatureMismatchError({
      field: "authorized",
      expected: authorized,
      actual: authorizationSignature.args.authorized,
    });
  }
  if (
    !isAddressEqual(authorizationSignature.action.args.authorized, authorized)
  ) {
    throw new BundlesRequirementSignatureMismatchError({
      field: "authorized",
      expected: authorized,
      actual: authorizationSignature.action.args.authorized,
    });
  }
  if (!authorizationSignature.args.isAuthorized) {
    throw new BundlesRequirementSignatureMismatchError({
      field: "isAuthorized",
      expected: "true",
      actual: String(authorizationSignature.args.isAuthorized),
    });
  }
  if (!authorizationSignature.action.args.isAuthorized) {
    throw new BundlesRequirementSignatureMismatchError({
      field: "isAuthorized",
      expected: "true",
      actual: String(authorizationSignature.action.args.isAuthorized),
    });
  }
  if (
    authorizationSignature.action.args.deadline !==
    authorizationSignature.args.deadline
  ) {
    throw new BundlesRequirementSignatureMismatchError({
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
    throw new BundlesRequirementSignatureMismatchError({
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
    throw new BundlesRequirementSignatureMismatchError({
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
          : MarketParams.idle(targetMarketParams.loanToken),
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
  token?: BundlesTokenRequirementSignature;
  authorization?: AuthorizationRequirementSignature;
} => {
  const { permit, permit2SignatureTransfer, authorization } =
    selectRequirementSignatures(signatures, {
      permit: accepts.token,
      permit2SignatureTransfer: accepts.token,
      authorization: accepts.authorization,
    });
  if (permit?.action.type === "permit2") {
    throw new BundlesRequirementSignatureMismatchError({
      field: "type",
      expected: "permit or permit2SignatureTransfer",
      actual: permit.action.type,
    });
  }
  if (permit != null && permit2SignatureTransfer != null) {
    throw new AmbiguousRequirementSignaturesError("permit", 2);
  }
  return {
    token:
      (permit as Erc2612RequirementSignature | undefined) ??
      permit2SignatureTransfer,
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
