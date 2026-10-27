import {
  type Address,
  InvalidAddressError,
  isAddress,
  isAddressEqual,
  zeroAddress,
} from "viem";
import {
  MidnightCalldataEncodingError,
  MidnightZeroAccountError,
} from "../types/index.js";

/**
 * Rejects the zero address as the account a Midnight flow prepares or encodes for.
 *
 * @internal
 * @param field - Account field name reported by the error.
 * @param account - Account to validate.
 * @returns Nothing; returns normally when `account` is a well-formed non-zero address.
 * @throws {MidnightCalldataEncodingError} when `account` is not a 20-byte hex address with a valid
 *   checksum when mixed-case.
 * @throws {MidnightZeroAccountError} when `account` is the zero address.
 * @example
 * ```ts
 * validateMidnightAccount("accountAddress", "0x0000000000000000000000000000000000000001");
 * ```
 */
export function validateMidnightAccount(
  field: MidnightZeroAccountError["field"],
  account: Address,
): void {
  validateMidnightAddress(field, account);
  if (isAddressEqual(account, zeroAddress)) {
    throw new MidnightZeroAccountError(field);
  }
}

/**
 * Rejects a malformed address before a Midnight builder compares or encodes it, so callers get the
 * typed encoding error instead of viem's `InvalidAddressError`.
 *
 * @internal
 * @param field - Input name reported as the error's `input`, such as `"receiver"`.
 * @param address - Address to validate.
 * @returns Nothing; returns normally for a 20-byte hex address with a valid checksum when mixed-case.
 * @throws {MidnightCalldataEncodingError} when `address` is not a 20-byte hex address with a valid
 *   checksum when mixed-case.
 * @example
 * ```ts
 * validateMidnightAddress("receiver", "0x0000000000000000000000000000000000000001");
 * ```
 */
export function validateMidnightAddress(field: string, address: Address): void {
  if (!isAddress(address)) {
    throw new MidnightCalldataEncodingError(
      field,
      new InvalidAddressError({ address }),
    );
  }
}
