import { MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { maxUint256, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  InputExceedsMaxError,
  MarketIdMismatchError,
  NativeFundingAmountMismatchError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeeRecipientMissingError,
} from "../types/index.js";
import {
  parseBlueMarket,
  parseDeadline,
  parseNativeFunding,
  parseNonnegative,
  parseReferralFee,
  parseUint256,
  parseUint256Max,
} from "./parse.js";

describe("shared parser boundaries", () => {
  test("validates the exact owned tuple even when caller fields are getters", () => {
    const market = new MarketParams({
      loanToken: zeroAddress,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    });
    let reads = 0;
    Object.defineProperty(market, "oracle", {
      get: () =>
        ++reads === 1
          ? zeroAddress
          : "0x0000000000000000000000000000000000000001",
    });
    const snapshot = parseBlueMarket(market);
    expect(reads).toBe(1);
    expect(MarketUtils.getMarketId(snapshot)).toBe(snapshot.id);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(market)).toBe(false);
  });

  test("owns a frozen plain market snapshot without freezing the caller", () => {
    const market = new MarketParams({
      loanToken: zeroAddress,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    });
    const snapshot = parseBlueMarket(market);
    expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype);
    expect(Object.keys(snapshot).sort()).toEqual([
      "collateralToken",
      "id",
      "irm",
      "lltv",
      "loanToken",
      "oracle",
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(market)).toBe(false);
    Object.assign(market, {
      oracle: "0x0000000000000000000000000000000000000001",
    });
    expect(snapshot.oracle).toBe(zeroAddress);
    expect(() => parseBlueMarket(market)).toThrow(MarketIdMismatchError);
  });

  test("validates primitive values without creating separate witnesses", () => {
    expect(parseUint256("assets", 0n)).toBe(0n);
    expect(parseUint256("assets", maxUint256)).toBe(maxUint256);
    expect(parseDeadline(1n)).toBe(1n);
    expectTypeOf<ReturnType<typeof parseUint256>>().toEqualTypeOf<bigint>();
    expectTypeOf<ReturnType<typeof parseDeadline>>().toEqualTypeOf<bigint>();
    expectTypeOf<{ referralFeePct: bigint }>().not.toExtend<
      ReturnType<typeof parseReferralFee>
    >();
  });

  test("splits nonnegative and ABI upper bounds without changing their errors", () => {
    expect(parseUint256Max("assets", parseNonnegative("assets", 0n))).toBe(0n);
    expect(
      parseUint256Max("assets", parseNonnegative("assets", maxUint256)),
    ).toBe(maxUint256);
    expect(() => parseNonnegative("assets", -1n)).toThrow(
      expect.objectContaining({
        constructor: NegativeInputError,
        field: "assets",
      }),
    );
    expect(() =>
      parseUint256Max("assets", parseNonnegative("assets", maxUint256 + 1n)),
    ).toThrow(
      expect.objectContaining({
        constructor: InputExceedsMaxError,
        field: "assets",
      }),
    );
    expectTypeOf<
      Parameters<typeof parseUint256Max>[1]
    >().toEqualTypeOf<bigint>();
  });

  test("preserves typed primitive failures", () => {
    expect(() => parseUint256("assets", -1n)).toThrow(NegativeInputError);
    expect(() => parseUint256("assets", maxUint256 + 1n)).toThrow(
      InputExceedsMaxError,
    );
    expect(() => parseDeadline(0n)).toThrow(NonPositiveInputError);
    expect(() => parseDeadline(maxUint256 + 1n)).toThrow(InputExceedsMaxError);
  });

  test("normalizes the referral pair and rejects a missing recipient", () => {
    expect(parseReferralFee({})).toEqual({
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
    });
    expect(() => parseReferralFee({ referralFeePct: 1n })).toThrow(
      ReferralFeeRecipientMissingError,
    );
    expect(() => parseReferralFee({ referralFeePct: -1n })).toThrow(
      NegativeInputError,
    );
  });

  test("parses native shape independently of signatures", () => {
    const params = {
      chainId: mainnet.id,
      token: getChainAddress(mainnet.id, "wNative"),
      fundedAmount: 2n,
    };
    expect(parseNativeFunding(params)).toBe(0n);
    expect(parseNativeFunding({ ...params, nativeAmount: 2n })).toBe(2n);
    expect(() => parseNativeFunding({ ...params, nativeAmount: -1n })).toThrow(
      NegativeInputError,
    );
    expect(() => parseNativeFunding({ ...params, nativeAmount: 1n })).toThrow(
      NativeFundingAmountMismatchError,
    );
    expectTypeOf<
      ReturnType<typeof parseNativeFunding>
    >().toEqualTypeOf<bigint>();
  });
});
