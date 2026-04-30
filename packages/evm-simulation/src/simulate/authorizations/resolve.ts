import { type Address, encodeFunctionData, erc20Abi, maxUint256 } from "viem";

import type {
  SimulationAuthorization,
  SimulationTransaction,
} from "../../types.js";

/**
 * Resolve SimulationAuthorization[] into SimulationTransaction[].
 *
 * - "approval" → use authorization.transaction as-is
 * - "signature" → encode approve(spender, amount) on the token contract
 */
export function resolveAuthorizations(
  authorizations: SimulationAuthorization[],
  sender: Address,
): SimulationTransaction[] {
  return authorizations.map((auth) => {
    if (auth.type === "approval") {
      return auth.transaction;
    }

    const amount = auth.amount ?? maxUint256;
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [auth.spender, amount],
    });

    return {
      from: sender,
      to: auth.token,
      data,
      value: 0n,
    };
  });
}
