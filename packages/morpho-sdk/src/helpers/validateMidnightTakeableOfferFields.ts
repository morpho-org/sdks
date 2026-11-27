import type { OfferStruct } from "@morpho-org/midnight-sdk";
import {
  AbiEncodingBytesSizeMismatchError,
  BaseError,
  type Hex,
  IntegerOutOfRangeError,
  InvalidHexValueError,
  isHex,
  maxUint256,
} from "viem";
import { MidnightCalldataEncodingError } from "../types/index.js";
import { validateMidnightAddress } from "./validateMidnightAccount.js";

const OFFER_ADDRESS_FIELDS = [
  "maker",
  "callback",
  "receiverIfMakerIsSeller",
  "ratifier",
] as const;
const OFFER_UINT256_FIELDS = [
  "start",
  "expiry",
  "tick",
  "continuousFeeCap",
] as const;
const OFFER_CAP_FIELDS = ["maxUnits", "maxAssets"] as const;

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const validateUint256 = (field: string, value: bigint): void => {
  if (typeof value !== "bigint") {
    throw new MidnightCalldataEncodingError(
      field,
      new BaseError(`Invalid bigint value: "${String(value)}".`),
    );
  }
  if (value < 0n || value > maxUint256) {
    throw new MidnightCalldataEncodingError(
      field,
      new IntegerOutOfRangeError({
        max: `${maxUint256}n`,
        min: "0n",
        signed: false,
        size: 32,
        value: `${value}n`,
      }),
    );
  }
};

const validateBytes = (field: string, value: Hex): void => {
  if (!isHex(value) || value.length % 2 !== 0) {
    throw new MidnightCalldataEncodingError(
      field,
      new InvalidHexValueError(value),
    );
  }
};

/**
 * Parses the fields of each taken offer fill that `MidnightBundlesV2` ABI-encodes and that the
 * side, market and cap guards do not already check, so a malformed offer is rejected before any
 * read or encoding.
 *
 * Integer and address bounds are the ABI's: `start`, `expiry`, `tick`, `continuousFeeCap` and
 * the fill's `units` are `uint256` bigints; the `maxUnits` and `maxAssets` caps are bigints whose
 * `uint128` bounds the action parser checks; `maker`, `callback`, `receiverIfMakerIsSeller` and
 * `ratifier` are addresses (checksummed when mixed-case); `group` is exactly 32 bytes of `0x` hex;
 * `reduceOnly` is a boolean. `callbackData` and `ratifierData` must be even-length `0x` hex.
 *
 * @param takeableOffers - Offers selected for a Midnight take.
 * @returns Nothing when every offer field can be encoded.
 * @throws {MidnightCalldataEncodingError} when a field is malformed; `input` is its path, such as
 *   `"takeableOffers[0].offer.maker"`.
 * @internal
 */
export const validateMidnightTakeableOfferFields = (
  takeableOffers: readonly {
    readonly units: bigint;
    readonly offer: Pick<
      OfferStruct,
      | (typeof OFFER_ADDRESS_FIELDS)[number]
      | (typeof OFFER_UINT256_FIELDS)[number]
      | (typeof OFFER_CAP_FIELDS)[number]
      | "group"
      | "callbackData"
      | "reduceOnly"
    >;
    readonly ratifierData: Hex;
  }[],
): void => {
  for (const [
    index,
    { units, offer, ratifierData },
  ] of takeableOffers.entries()) {
    const path = `takeableOffers[${index}]`;
    for (const field of OFFER_ADDRESS_FIELDS) {
      validateMidnightAddress(`${path}.offer.${field}`, offer[field]);
    }
    for (const field of OFFER_UINT256_FIELDS) {
      validateUint256(`${path}.offer.${field}`, offer[field]);
    }
    for (const field of OFFER_CAP_FIELDS) {
      validateUint256(`${path}.offer.${field}`, offer[field]);
    }
    if (typeof offer.group !== "string" || !BYTES32_PATTERN.test(offer.group)) {
      throw new MidnightCalldataEncodingError(
        `${path}.offer.group`,
        isHex(offer.group, { strict: true })
          ? new AbiEncodingBytesSizeMismatchError({
              expectedSize: 32,
              value: offer.group,
            })
          : new InvalidHexValueError(offer.group),
      );
    }
    validateBytes(`${path}.offer.callbackData`, offer.callbackData);
    if (typeof offer.reduceOnly !== "boolean") {
      throw new MidnightCalldataEncodingError(
        `${path}.offer.reduceOnly`,
        new BaseError(`Invalid boolean value: "${offer.reduceOnly}".`),
      );
    }
    validateBytes(`${path}.ratifierData`, ratifierData);
    validateUint256(`${path}.units`, units);
  }
};
