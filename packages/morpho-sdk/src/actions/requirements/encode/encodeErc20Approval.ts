import { type Address, MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { MAX_TOKEN_APPROVALS } from "@morpho-org/simulation-sdk";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { ERC20ApprovalAction, Transaction } from "../../../types/index.js";

interface EncodeErc20ApprovalParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: number;
}

export const encodeErc20Approval = (
  params: EncodeErc20ApprovalParams,
): Transaction<ERC20ApprovalAction> => {
  const { token, spender, amount, chainId } = params;

  const amountValue = MathLib.min(
    amount,
    MAX_TOKEN_APPROVALS[chainId]?.[token] ?? maxUint256,
  );

  return deepFreeze({
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amountValue],
    }),
    value: 0n,
    action: {
      type: "erc20Approval" as const,
      args: { spender: spender, amount: amountValue },
    },
  });
};
