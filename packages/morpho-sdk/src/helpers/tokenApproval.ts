import { type Address, MathLib } from "@morpho-org/blue-sdk";
import { getAddress, isAddressEqual, maxUint256 } from "viem";
import { APPROVE_ONLY_ONCE_TOKENS, MAX_TOKEN_APPROVALS } from "./constant.js";

/** @internal Returns the requested approval amounts in execution order. */
export function getTokenApprovalAmounts({
  token,
  chainId,
  allowance,
  spendAmount,
}: {
  readonly token: Address;
  readonly chainId: number;
  readonly allowance: bigint;
  readonly spendAmount: bigint;
}): readonly bigint[] {
  if (allowance >= spendAmount) {
    return [];
  }
  const needsReset =
    allowance > 0n &&
    APPROVE_ONLY_ONCE_TOKENS[chainId]?.some((address) =>
      isAddressEqual(token, address),
    );
  return needsReset ? [0n, maxUint256] : [maxUint256];
}

/** @internal Caps a requested approval at the token's supported maximum. */
export function capTokenApproval({
  token,
  chainId,
  amount,
}: {
  readonly token: Address;
  readonly chainId: number;
  readonly amount: bigint;
}): bigint {
  return MathLib.min(
    amount,
    MAX_TOKEN_APPROVALS[chainId]?.[getAddress(token)] ?? maxUint256,
  );
}
