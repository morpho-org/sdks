import { keccak_256 } from "@noble/hashes/sha3.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

import { InvalidAddressError } from "./errors.js";

/**
 * Checks whether a string has the syntactic shape of an EVM address
 * (`0x` followed by 40 hexadecimal characters), without verifying its
 * EIP-55 checksum.
 *
 * @param value - The string to test.
 * @returns `true` when the value is a 20-byte hex address string.
 * @example
 * ```ts
 * import { isAddress } from "@morpho-org/morpho-ts";
 *
 * isAddress("0x0000000000000000000000000000000000000001"); // true
 * isAddress("0x1234"); // false
 * ```
 */
export const isAddress = (value: string): value is `0x${string}` =>
  /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * Returns the EIP-55 checksummed form of an EVM address.
 *
 * The input is returned unchanged when it is already canonical. All-lowercase
 * and all-uppercase inputs are always accepted; a mixed-case input must match
 * its own checksum form, otherwise the function throws `InvalidAddressError`.
 *
 * @param address - The address to checksum (any hex casing).
 * @returns The same address in EIP-55 mixed-case checksum form.
 * @throws InvalidAddressError when the input is not a 20-byte hex address, or
 *         when it carries an invalid mixed-case checksum.
 * @example
 * ```ts
 * import { getChecksumAddress } from "@morpho-org/morpho-ts";
 *
 * getChecksumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed".toLowerCase());
 * // "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
 * ```
 */
export function getChecksumAddress(address: string): `0x${string}` {
  if (!isAddress(address)) throw new InvalidAddressError(address);

  const lowerHex = address.slice(2).toLowerCase();
  const hash = keccak_256(utf8ToBytes(lowerHex));
  let checksum = "0x";

  for (let i = 0; i < 40; i++) {
    const char = lowerHex[i]!;
    const nibble = (hash[i >> 1]! >> (i % 2 === 0 ? 4 : 0)) & 0x0f;
    checksum += nibble >= 8 ? char.toUpperCase() : char;
  }

  const hex = address.slice(2);
  if (/[a-f]/.test(hex) && /[A-F]/.test(hex) && address !== checksum)
    throw new InvalidAddressError(address);

  return checksum as `0x${string}`;
}

/**
 * Checks whether a string is a valid EIP-55 checksummed EVM address.
 *
 * @param address - The string to test.
 * @returns `true` when the value is a 20-byte hex address in canonical
 *          EIP-55 casing.
 * @example
 * ```ts
 * import { isChecksumAddress } from "@morpho-org/morpho-ts";
 *
 * isChecksumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"); // true
 * isChecksumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed".toLowerCase()); // false
 * ```
 */
export const isChecksumAddress = (address: string): boolean =>
  isAddress(address) && getChecksumAddress(address.toLowerCase()) === address;
