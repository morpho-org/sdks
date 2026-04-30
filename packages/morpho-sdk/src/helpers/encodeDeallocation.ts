import { marketParamsAbi } from "@morpho-org/blue-sdk";
import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeFunctionData,
} from "viem";
import {
  type Deallocation,
  NonPositiveAssetAmountError,
} from "../types/index.js";

/**
 * Encodes the adapter-specific `data` bytes for a `forceDeallocate` call.
 *
 * @param deallocation - A deallocation entry.
 * @returns The ABI-encoded bytes to pass as `data` to VaultV2.forceDeallocate.
 */
function encodeDeallocateData(deallocation: Deallocation): Hex {
  if (deallocation.marketParams) {
    return encodeAbiParameters([marketParamsAbi], [deallocation.marketParams]);
  }

  return "0x";
}

/**
 * Encodes a single `forceDeallocate` call as ABI-encoded calldata.
 *
 * @param deallocation - A deallocation entry.
 * @param onBehalf - The address from which the penalty is taken (share owner).
 * @returns The ABI-encoded calldata for `VaultV2.forceDeallocate`.
 */
export function encodeForceDeallocateCall(
  deallocation: Deallocation,
  onBehalf: Address,
): Hex {
  if (deallocation.amount <= 0n) {
    throw new NonPositiveAssetAmountError(deallocation.adapter);
  }

  const data = encodeDeallocateData(deallocation);

  return encodeFunctionData({
    abi: vaultV2Abi,
    functionName: "forceDeallocate",
    args: [deallocation.adapter, data, deallocation.amount, onBehalf],
  });
}
