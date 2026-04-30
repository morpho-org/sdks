import type { Hex } from "viem";

/**
 * Encode a bigint as a 32-byte big-endian hex word — the `data` shape used in
 * ERC20 Transfer log entries. Handles the full uint256 range without overflow
 * because input is already `bigint`.
 */
export function encodeUint256(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}
