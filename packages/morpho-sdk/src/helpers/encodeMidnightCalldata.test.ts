import { midnightAbi } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Hex,
  IntegerOutOfRangeError,
  maxUint256,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import { midnightCancelAndMake } from "../actions/midnight/cancelAndMake.js";
import { midnightSupplyCollateral } from "../actions/midnight/supplyCollateral.js";
import {
  InvalidMidnightHexInputError,
  MidnightCalldataEncodingError,
} from "../types/index.js";
import { encodeMidnightCalldata } from "./encodeMidnightCalldata.js";
import { validateTakeableOffers } from "./validateTakeableOffers.js";

const rateRatifierV1 = getChainAddress(midnightChainId, "rateRatifierV1");
const bytes32 = (byte: string) => `0x${byte.repeat(32)}` as Hex;

describe("encodeMidnightCalldata", () => {
  test("default: encodes like encodeFunctionData", () => {
    const owner = getChainAddress(midnightChainId, "midnightBundlesV2");

    expect(
      encodeMidnightCalldata({
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [owner, true, owner],
      }),
    ).toMatch(/^0x[0-9a-f]+$/);
  });

  test("behavior: a malformed cancellation group throws the publication hex error", () => {
    const build = () =>
      midnightCancelAndMake({
        chainId: midnightChainId,
        cancellations: [{ group: "0x01", maxConsumed: 5n }],
        deadline: maxUint256,
      });

    expect(build).toThrow(InvalidMidnightHexInputError);
    try {
      build();
    } catch (error) {
      expect(error).toMatchObject({
        name: "InvalidMidnightHexInputError",
        field: "cancellations[0].group",
        reason: "wrongSize",
      });
    }
  });

  test("behavior: a malformed publication root throws a typed error", () => {
    expect(() =>
      midnightCancelAndMake({
        chainId: midnightChainId,
        cancellations: [],
        deadline: maxUint256,
        publication: {
          ratifier: rateRatifierV1,
          root: "0x01",
          groups: [bytes32("11")],
          payload: "0x1234",
        },
      }),
    ).toThrow(InvalidMidnightHexInputError);
  });

  test("behavior: an unencodable market throws a typed error before calldata encoding", () => {
    const market = { ...midnightMarket, maturity: maxUint256 + 1n };
    const builders = [
      () =>
        midnightSupplyCollateral({
          chainId: midnightChainId,
          market,
          assets: 1n,
          onBehalf: midnightAddresses.taker,
        }),
      () =>
        validateTakeableOffers({
          market,
          takeableOffers: [
            {
              offer: {
                buy: true,
                market,
                receiverIfMakerIsSeller: zeroAddress,
              },
            },
          ],
          expectedBuy: true,
        }),
    ];

    for (const build of builders) {
      expect(build).toThrow(MidnightCalldataEncodingError);
      try {
        build();
      } catch (error) {
        expect((error as MidnightCalldataEncodingError).input).toBe("marketId");
        expect((error as Error).cause).toBeInstanceOf(IntegerOutOfRangeError);
      }
    }
  });
});
