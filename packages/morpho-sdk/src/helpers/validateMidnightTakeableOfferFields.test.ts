import { maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import { midnightApiTake } from "../../test/fixtures/midnight.js";
import { validateMidnightTakeableOfferFields } from "./validateMidnightTakeableOfferFields.js";

type TakeableOffers = Parameters<typeof validateMidnightTakeableOfferFields>[0];

describe("validateMidnightTakeableOfferFields", () => {
  const take = midnightApiTake();
  const cases: readonly {
    readonly field: string;
    readonly override: object;
    readonly cause: string;
  }[] = [
    {
      field: "offer.maker",
      override: { offer: { ...take.offer, maker: "0x123" } },
      cause: "InvalidAddressError",
    },
    {
      field: "offer.ratifier",
      override: { offer: { ...take.offer, ratifier: "0x123" } },
      cause: "InvalidAddressError",
    },
    {
      field: "offer.start",
      override: { offer: { ...take.offer, start: -1n } },
      cause: "IntegerOutOfRangeError",
    },
    {
      field: "offer.tick",
      override: { offer: { ...take.offer, tick: maxUint256 + 1n } },
      cause: "IntegerOutOfRangeError",
    },
    {
      field: "offer.expiry",
      override: { offer: { ...take.offer, expiry: 2_000_000_000 } },
      cause: "BaseError",
    },
    {
      field: "offer.group",
      override: { offer: { ...take.offer, group: "0x01" } },
      cause: "AbiEncodingBytesSizeMismatchError",
    },
    {
      field: "offer.group",
      override: { offer: { ...take.offer, group: `0x${"1".repeat(63)}` } },
      cause: "AbiEncodingBytesSizeMismatchError",
    },
    {
      field: "offer.group",
      override: { offer: { ...take.offer, group: `0x${"z".repeat(64)}` } },
      cause: "InvalidHexValueError",
    },
    {
      field: "offer.group",
      override: { offer: { ...take.offer, group: [`0x${"1".repeat(64)}`] } },
      cause: "InvalidHexValueError",
    },
    {
      field: "offer.maxUnits",
      override: { offer: { ...take.offer, maxUnits: 100 } },
      cause: "BaseError",
    },
    {
      field: "offer.maxAssets",
      override: { offer: { ...take.offer, maxAssets: 100 } },
      cause: "BaseError",
    },
    {
      field: "offer.callbackData",
      override: { offer: { ...take.offer, callbackData: "0xzz" } },
      cause: "InvalidHexValueError",
    },
    {
      field: "offer.reduceOnly",
      override: { offer: { ...take.offer, reduceOnly: "true" } },
      cause: "BaseError",
    },
    {
      field: "ratifierData",
      override: { ratifierData: "0x123" },
      cause: "InvalidHexValueError",
    },
    {
      field: "units",
      override: { units: -1n },
      cause: "IntegerOutOfRangeError",
    },
  ];

  test("behavior: accepts well-formed offer fields", () => {
    expect(() =>
      validateMidnightTakeableOfferFields([take, take]),
    ).not.toThrow();
  });

  test.each(cases)(
    "error: a malformed $field is rejected with its path",
    ({ field, override, cause }) => {
      expect(() =>
        validateMidnightTakeableOfferFields([
          take,
          { ...take, ...override },
        ] as unknown as TakeableOffers),
      ).toThrow(
        expect.objectContaining({
          name: "MidnightCalldataEncodingError",
          input: `takeableOffers[1].${field}`,
          cause: expect.objectContaining({ name: cause }),
        }),
      );
    },
  );
});
