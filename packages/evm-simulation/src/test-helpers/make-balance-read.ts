import { type Address, encodeFunctionData, erc20Abi } from "viem";
import type { StateRead } from "../simulate/state/contract.js";

/** Build a balance observation for execution-boundary tests. */
export function makeBalanceRead(token: Address, account: Address): StateRead {
  return {
    kind: "erc20.balance",
    id: `balance:${token}:${account}`.toLowerCase(),
    to: token,
    token,
    account,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
  };
}
