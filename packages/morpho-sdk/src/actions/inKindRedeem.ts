import {
  type Address,
  isAddressEqual,
  maxUint256,
  parseSignature,
  zeroHash,
} from "viem";
import {
  InKindRedeemPermitMismatchError,
  type PermitRequirementSignature,
} from "../types/index.js";

/** Permit tuple consumed by VaultExitBundlesV1. @internal */
export interface VaultExitBundlesV1Permit {
  readonly value: bigint;
  readonly nonce: bigint;
  readonly deadline: bigint;
  readonly v: number;
  readonly r: `0x${string}`;
  readonly s: `0x${string}`;
}

/** Builds and validates the permit tuple embedded in an in-kind redemption. @internal */
export const getVaultExitBundlesV1Permit = (params: {
  readonly vault: Address;
  readonly deadline: bigint;
  readonly requirementSignature?: PermitRequirementSignature;
}): VaultExitBundlesV1Permit => {
  const { requirementSignature } = params;
  if (requirementSignature == null) {
    return {
      value: maxUint256,
      nonce: 0n,
      deadline: params.deadline,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    };
  }

  if (requirementSignature.action.type !== "permit") {
    throw new InKindRedeemPermitMismatchError({
      field: "type",
      expected: "permit",
      actual: requirementSignature.action.type,
    });
  }
  if (!isAddressEqual(requirementSignature.args.asset, params.vault)) {
    throw new InKindRedeemPermitMismatchError({
      field: "asset",
      expected: params.vault,
      actual: requirementSignature.args.asset,
    });
  }
  if (requirementSignature.args.amount !== maxUint256) {
    throw new InKindRedeemPermitMismatchError({
      field: "amount",
      expected: String(maxUint256),
      actual: String(requirementSignature.args.amount),
    });
  }
  const signature = (() => {
    try {
      return parseSignature(requirementSignature.args.signature);
    } catch {
      throw new InKindRedeemPermitMismatchError({
        field: "signature",
        expected: "a 64-byte compact or 65-byte serialized ECDSA signature",
        actual: requirementSignature.args.signature,
      });
    }
  })();

  const { r, s, v, yParity } = signature;
  return {
    value: maxUint256,
    nonce: requirementSignature.args.nonce,
    deadline: requirementSignature.args.deadline,
    v: Number(v ?? BigInt(yParity + 27)),
    r,
    s,
  };
};
