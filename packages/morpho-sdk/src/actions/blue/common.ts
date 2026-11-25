import {
  MarketParams,
  MathLib,
  VaultV2BluePublicAllocatorConfigUtils,
} from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  isAddressEqual,
  zeroAddress,
  zeroHash,
} from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import type { BlueMarket } from "../../helpers/parse.js";
import {
  parseBlueMarket,
  parseDeadline,
  parseReferralFee,
} from "../../helpers/parse.js";
import { validateVaultV2BlueReallocations } from "../../helpers/validate.js";
import {
  AmbiguousRequirementSignaturesError,
  type AuthorizationRequirementSignature,
  type BaseAction,
  BundlesRequirementSignatureMismatchError,
  type BundlesTokenRequirementSignature,
  DepositOwnerMismatchError,
  type Metadata,
  ReallocationLoanTokenMismatchError,
  type RequirementSignature,
  selectRequirementSignatures,
  type Transaction,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { normalizeBundlesSignature } from "../bundles/common.js";
import {
  type BundlesTokenPermit,
  getBundlesTokenPermit,
} from "../bundles/index.js";

/** Normalized clock-free common fields; only complete operations carry a witness. @internal */
interface BlueCommonInput {
  readonly deadline: bigint;
  readonly referralFeePct: bigint;
  readonly referralFeeRecipient: Address;
}
/** Immutable market snapshots and normalized public allocation calls. @internal */
export interface BlueAllocations {
  readonly publicAllocations: readonly {
    readonly vault: Address;
    readonly adapter: Address;
    readonly marketParams: BlueMarket;
    readonly fromIdle: boolean;
    readonly sourceAdapter: Address;
    readonly sourceMarketParams: BlueMarket;
    readonly assets: bigint;
    readonly penalty: bigint;
  }[];
  readonly penaltyAssets: bigint;
}
/** Shared fields of a completed Blue write input. @internal */
export interface BlueOperationInput extends BlueCommonInput {
  readonly chainId: number;
  readonly userAddress: Address;
  readonly marketParams: BlueMarket;
  readonly metadata?: Metadata;
}

/** @internal */
export interface BlueBundlesV1CommonParams {
  chainId: number;
  userAddress: Address;
  deadline: bigint;
  referralFeePct?: bigint;
  referralFeeRecipient?: Address;
  metadata?: Metadata;
}

type BlueBundlesV1TokenPermit = BundlesTokenPermit;

/** Normalized authorization consumed by the encode-only builders. @internal */
export interface BlueBundlesV1SignedAuthorization {
  signature: { v: number; r: Hex; s: Hex };
  nonce: bigint;
  deadline: bigint;
}

const EMPTY_SIGNED_AUTHORIZATION: BlueBundlesV1SignedAuthorization = {
  signature: { v: 0, r: zeroHash, s: zeroHash },
  nonce: 0n,
  deadline: 0n,
};

/** Parses deadline shape and the normalized referral pair without checking expiry. @internal */
export const parseBlueBundlesV1Common = (params: BlueBundlesV1CommonParams) => {
  const deadline = parseDeadline(params.deadline);
  const { referralFeePct, referralFeeRecipient } = parseReferralFee(params);
  const result = { referralFeePct, referralFeeRecipient, deadline } as const;
  return result;
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
  if (authorizationSignature == null) {
    return EMPTY_SIGNED_AUTHORIZATION;
  }

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

  const signature = normalizeBundlesSignature(
    authorizationSignature.args.signature,
    (details) =>
      new BundlesRequirementSignatureMismatchError({
        field: "signature",
        ...details,
      }),
  );
  return {
    signature,
    nonce: authorizationSignature.args.nonce,
    deadline: authorizationSignature.args.deadline,
  };
};

/** Parses an ordered reallocation plan and its aggregate penalty once. @internal */
export const parseBlueAllocations = (
  reallocations: readonly VaultV2BlueReallocation[],
  targetMarketParams: BlueMarket,
) => {
  // Reject malformed plans before constructing allocation calls.
  validateVaultV2BlueReallocations(reallocations, targetMarketParams.id);
  // Hoisted out of the map: idle sources all reference the same synthetic idle market, whose
  // construction eagerly hashes the market id — computing it once per call instead of per entry.
  const idleMarketParams = parseBlueMarket(
    MarketParams.idle(targetMarketParams.loanToken),
  );
  const publicAllocations: BlueAllocations["publicAllocations"] =
    reallocations.map((reallocation) => {
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
            ? parseBlueMarket(reallocation.from.marketParams)
            : idleMarketParams,
        assets: reallocation.assets,
        penalty: reallocation.penalty,
      };
    });
  const result = {
    publicAllocations,
    penaltyAssets: getBlueBundlesV1PenaltyAssets(publicAllocations),
  } as const;
  return result;
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
  if (permit != null && permit2SignatureTransfer != null) {
    throw new AmbiguousRequirementSignaturesError("permit", 2);
  }
  return {
    token: permit ?? permit2SignatureTransfer,
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
