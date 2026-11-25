import {
  MarketUtils,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, maxUint128, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  MidnightCalldataEncodingError,
  MidnightZeroOnBehalfError,
  NegativeInputError,
  NonPositiveInputError,
} from "../types/index.js";
import {
  parseMidnightAccount,
  parseMidnightAddress,
  parseMidnightCollateral,
  parseMidnightMarket,
  parseMidnightNativeFunding,
  parseMidnightOwner,
  parseMidnightPositiveAmount,
  parseMidnightUint128,
} from "./parseMidnight.js";

describe("Midnight parsed contracts", () => {
  test.each([0n, maxUint128])("uint128 accepts %s", (value) => {
    expect(parseMidnightUint128("amount", value)).toBe(value);
  });

  test.each([-1n, maxUint128 + 1n])("uint128 rejects %s", (value) => {
    expect(() => parseMidnightUint128("amount", value)).toThrow(
      value < 0n ? NegativeInputError : InputExceedsMaxError,
    );
  });

  test.each([0n, -1n])("positive amount rejects %s", (value) => {
    expect(() => parseMidnightPositiveAmount("amount", value)).toThrow(
      NonPositiveInputError,
    );
  });

  test("positive amount retains its label and upper bound", () => {
    expect(parseMidnightPositiveAmount("assets", maxUint128)).toBe(maxUint128);
    expect(() =>
      parseMidnightPositiveAmount("assets", maxUint128 + 1n),
    ).toThrow(
      new InputExceedsMaxError({
        field: "assets",
        value: maxUint128 + 1n,
        max: maxUint128,
      }),
    );
  });

  test("address and owner errors remain distinct", () => {
    expect(() => parseMidnightAddress("owner", "0x1234" as Address)).toThrow(
      MidnightCalldataEncodingError,
    );
    expect(
      parseMidnightAccount("accountAddress", midnightAddresses.taker),
    ).toBe(midnightAddresses.taker);
    expect(() =>
      parseMidnightOwner(parseMidnightAddress("owner", zeroAddress)),
    ).toThrow(MidnightZeroOnBehalfError);
  });

  test("market owns its nested tuple without freezing the input", () => {
    const input = MarketUtils.toStruct(midnightMarket);
    const parsed = parseMidnightMarket(input, midnightChainId);
    const expected = MarketUtils.toStruct(midnightMarket);
    Object.assign(input.collateralParams[0]!, { token: midnightAddresses.dai });
    Object.assign(input, { loanToken: midnightAddresses.dai });
    expect(parsed.struct).toEqual(expected);
    expect(parsed.id).toBe(MarketUtils.toId(expected));
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(parsed.struct.collateralParams[0])).toBe(true);
  });

  test("deployment errors precede normalization of malformed raw market fields", () => {
    expect(() =>
      parseMidnightMarket(
        { ...MarketUtils.toStruct(midnightMarket), collateralParams: [] },
        1,
      ),
    ).toThrow(ChainIdMismatchError);
  });

  test("market deployment and configured indexes remain checked", () => {
    expect(() => parseMidnightMarket(midnightMarket, 1)).toThrow(
      ChainIdMismatchError,
    );
    expect(() =>
      parseMidnightMarket(
        {
          ...MarketUtils.toStruct(midnightMarket),
          midnight: "0x1234" as Address,
        },
        midnightChainId,
      ),
    ).toThrow(MidnightCalldataEncodingError);
    const parsed = parseMidnightMarket(midnightMarket, midnightChainId);
    expect(parseMidnightCollateral(parsed, 0n)).toMatchObject({
      index: 0n,
      token: midnightAddresses.collateralToken,
    });
    for (const index of [-1n, 1n, maxUint256]) {
      expect(() => parseMidnightCollateral(parsed, index)).toThrow(
        UnknownCollateralIndexError,
      );
    }
  });

  test("native funding accepts partial and full pulls, not excess or negatives", () => {
    const token = getChainAddress(midnightChainId, "wNative");
    const params = {
      chainId: midnightChainId,
      pulls: [{ token, assets: 10n }],
    };
    expect(parseMidnightNativeFunding(params)).toMatchObject({
      value: 0n,
      wrappedNative: zeroAddress,
    });
    for (const nativeAmount of [0n, 1n, 10n]) {
      expect(
        parseMidnightNativeFunding({ ...params, nativeAmount }).value,
      ).toBe(nativeAmount);
    }
    expect(() =>
      parseMidnightNativeFunding({ ...params, nativeAmount: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      parseMidnightNativeFunding({ ...params, nativeAmount: 11n }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      parseMidnightNativeFunding({ ...params, pulls: [], nativeAmount: 1n }),
    ).toThrow(InputExceedsMaxError);
  });
});
