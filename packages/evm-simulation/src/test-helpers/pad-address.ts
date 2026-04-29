import type { Hex } from "viem";

/**
 * Left-pad a 20-byte EVM address to a 32-byte hex word (the form used in
 * ERC20 log topics). Lowercases the address before padding so equality
 * comparisons against other padded forms are stable.
 */
export function padAddress(addr: string): Hex {
  return `0x${addr.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
}
