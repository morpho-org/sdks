export { deepFreeze } from "@morpho-org/morpho-ts";

import { type Address, getAddress, type Hex, isAddress, isHex } from "viem";

import {
  InvalidMidnightAddressError,
  InvalidMidnightBigIntError,
  InvalidMidnightHexError,
  UnsafeNumberError,
} from "./errors.js";
import type { BigIntish } from "./types.js";

export const normalizeAddress = (
  value: Address | string,
  field = "address",
): Address => {
  if (!isAddress(value)) throw new InvalidMidnightAddressError(field, value);

  return getAddress(value);
};

export const toBigInt = (value: BigIntish, field: string): bigint => {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new UnsafeNumberError(field, value);
  }

  try {
    return BigInt(value);
  } catch (error) {
    throw new InvalidMidnightBigIntError({ field, value, cause: error });
  }
};

export const normalizeHex = (value: Hex | string, field = "hex"): Hex => {
  if (!isHex(value)) {
    throw new InvalidMidnightHexError({ field, value });
  }

  return value.toLowerCase() as Hex;
};

export const normalizeBytes32 = (
  value: Hex | string,
  field = "bytes32",
): Hex => {
  const hex = normalizeHex(value, field);
  if (hex.length !== 66) {
    throw new InvalidMidnightHexError({
      field,
      value,
      expected: "32-byte hex string",
    });
  }

  return hex;
};

export const zeroFloorSub = (x: bigint, y: bigint) => (x <= y ? 0n : x - y);

// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity mulDiv helper shape.
export const mulDivDown = (x: bigint, y: bigint, denominator: bigint) =>
  (x * y) / denominator;

// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity mulDiv helper shape.
export const mulDivUp = (x: bigint, y: bigint, denominator: bigint) => {
  const product = x * y;
  return product / denominator + (product % denominator === 0n ? 0n : 1n);
};
