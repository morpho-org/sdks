import { concat, type Hash, keccak256 } from "viem";

/**
 * Hashes EIP-712 digest parts as `keccak256(0x1901 || domainSeparator || structHash)`.
 *
 * Use this when the domain separator and struct hash are already available and
 * rebuilding full typed-data values would duplicate protocol-specific type maps.
 *
 * @param domainSeparator - EIP-712 domain separator hash.
 * @param structHash - EIP-712 struct hash.
 * @returns Canonical EIP-712 digest.
 * @example
 * ```ts
 * import { eip712Digest } from "@morpho-org/morpho-sdk";
 *
 * const digest = eip712Digest(
 *   "0x0000000000000000000000000000000000000000000000000000000000000001",
 *   "0x0000000000000000000000000000000000000000000000000000000000000002",
 * );
 * console.log(digest);
 * ```
 */
export const eip712Digest = (domainSeparator: Hash, structHash: Hash): Hash =>
  keccak256(concat(["0x1901", domainSeparator, structHash]));
