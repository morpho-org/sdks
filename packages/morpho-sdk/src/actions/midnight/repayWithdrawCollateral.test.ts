import {
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  registerCustomAddresses,
  UnknownAddressError,
} from "@morpho-org/morpho-ts";
import type { Address } from "viem";
import {
  decodeFunctionData,
  getAddress,
  IntegerOutOfRangeError,
  InvalidAddressError,
  maxUint256,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  MidnightCalldataEncodingError,
  MidnightContractReceiverError,
  MidnightZeroReceiverError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const wNative = getChainAddress(midnightChainId, "wNative");
const borrower = getAddress("0x00000000000000000000000000000000000B0b00");

const params = {
  chainId: midnightChainId,
  market: midnightMarket,
  repay: { type: "full", maxBuyerAssets: 1_010n },
  collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
  collateralReceiver: borrower,
  deadline: maxUint256,
} as const;

const decode = (data: `0x${string}`) =>
  decodeFunctionData({ abi: midnightBundlesV2Abi, data });

describe("midnightRepayWithdrawCollateral", () => {
  test("error: MidnightZeroReceiverError", () => {
    const build = () =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralReceiver: zeroAddress,
      });

    expect(build).toThrow(MidnightZeroReceiverError);
    expect(build).toThrow(
      expect.objectContaining({ field: "collateralReceiver" }),
    );
  });

  test("behavior: accepts zero collateralReceiver without withdrawals", () => {
    const tx = midnightRepayWithdrawCollateral({
      ...params,
      repay: { type: "assets", assets: 500n },
      collateralWithdrawals: [],
      collateralReceiver: zeroAddress,
    });

    expect(decode(tx.data).args[7]).toBe(zeroAddress);
  });

  test("behavior: does not freeze the caller's repay input", () => {
    const repay = { type: "full", maxBuyerAssets: 1_010n } as const;
    midnightRepayWithdrawCollateral({ ...params, repay });

    expect(Object.isFrozen(repay)).toBe(false);
  });

  test("default", () => {
    const tx = midnightRepayWithdrawCollateral(params);
    const decoded = decode(tx.data);

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx.action).toEqual({
      type: "midnightRepayWithdrawCollateral",
      args: {
        market: midnightMarketId,
        repay: { type: "full", maxBuyerAssets: 1_010n },
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
        collateralReceiver: borrower,
        deadline: maxUint256,
      },
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
    );
    // targetUnits, maxBuyerAssets, reduceOnly, repayEnabled, offerFills, withdrawals, receiver
    expect(decoded.args.slice(1, 8)).toEqual([
      maxUint256,
      1_010n,
      true,
      true,
      [],
      [{ collateralIndex: 0n, assets: maxUint256 }],
      borrower,
    ]);
    expect(decoded.args.at(-1)).toBe(zeroAddress);
  });

  test("behavior: accepts deadline = maxUint256 because no offers are taken", () => {
    const tx = midnightRepayWithdrawCollateral({
      ...params,
      deadline: maxUint256,
    });

    expect(decode(tx.data).args.at(-2)).toBe(maxUint256);
  });

  test("behavior: wraps native ETH for the wNative loan-token pull", () => {
    const nativeAmount = 500n;
    const tx = midnightRepayWithdrawCollateral({
      ...params,
      market: { ...midnightMarket, loanToken: wNative },
      nativeAmount,
    });
    const decoded = decode(tx.data);

    expect(tx.value).toBe(nativeAmount);
    expect(decoded.args.at(-1)).toBe(wNative);
  });

  test("behavior: assets repay encodes the assets target with minUnits = assets", () => {
    const tx = midnightRepayWithdrawCollateral({
      ...params,
      repay: { type: "assets", assets: 500n },
      collateralWithdrawals: [],
    });

    expect(decode(tx.data).functionName).toBe(
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
    );
    expect(tx.action.args.repay).toEqual({ type: "assets", assets: 500n });
    // targetBuyerAssets, minUnits
    expect(decode(tx.data).args.slice(1, 3)).toEqual([500n, 500n]);
    expect(decode(tx.data).args[6]).toEqual([]);
  });

  test("behavior: withdraw-only flow encodes a zero assets target", () => {
    const tx = midnightRepayWithdrawCollateral({
      ...params,
      repay: { type: "assets", assets: 0n },
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: 2_000n },
        { collateralIndex: 0n, assets: maxUint256 },
      ],
    });

    expect(decode(tx.data).functionName).toBe(
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
    );
    expect(decode(tx.data).args.slice(1, 3)).toEqual([0n, 0n]);
    expect(decode(tx.data).args[6]).toEqual([
      { collateralIndex: 0n, assets: 2_000n },
      { collateralIndex: 0n, assets: maxUint256 },
    ]);
  });

  test("behavior: encodes collateral withdrawal at index 1", () => {
    const tx = midnightRepayWithdrawCollateral({
      ...params,
      market: midnightTwoCollateralMarket,
      collateralWithdrawals: [{ collateralIndex: 1n, assets: 2_000n }],
    });

    expect(decode(tx.data).args[6]).toEqual([
      { collateralIndex: 1n, assets: 2_000n },
    ]);
  });

  test("error: native funding exceeds a withdraw-only wNative pull", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        market: { ...midnightMarket, loanToken: wNative },
        repay: { type: "assets", assets: 0n },
        nativeAmount: 1n,
      }),
    ).toThrow(
      new InputExceedsMaxError({ field: "nativeAmount", value: 1n, max: 0n }),
    );
  });

  test("behavior: appends metadata", () => {
    const tx = midnightRepayWithdrawCollateral({
      ...params,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        repay: { type: "assets", assets: 0n },
        collateralWithdrawals: [],
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        repay: { type: "full", maxBuyerAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }],
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({ ...params, deadline: 0n }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NegativeInputError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        repay: { type: "assets", assets: -1n },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError when the full-repay cap is unbounded", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        repay: { type: "full", maxBuyerAssets: maxUint256 },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: InputExceedsMaxError when an amount exceeds uint256", () => {
    for (const overrides of [
      { repay: { type: "assets", assets: maxUint256 } },
      { repay: { type: "full", maxBuyerAssets: maxUint256 + 1n } },
      {
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: maxUint256 + 1n },
        ],
      },
    ] as const) {
      expect(() =>
        midnightRepayWithdrawCollateral({ ...params, ...overrides }),
      ).toThrow(InputExceedsMaxError);
    }
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 1n, assets: 1n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: UnknownAddressError without a midnightBundlesV2 deployment", () => {
    const chainId = 999_001;
    registerCustomAddresses({
      addresses: {
        [chainId]: {
          blue: getAddress("0x0000000000000000000000000000000000000B01"),
          adaptiveCurveIrm: getAddress(
            "0x0000000000000000000000000000000000000B02",
          ),
          midnight: midnightMarket.midnight,
        },
      },
    });

    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        chainId,
        market: { ...midnightMarket, chainId: BigInt(chainId) },
      }),
    ).toThrow(UnknownAddressError);
  });

  test("error: an unencodable market throws a typed encoding error", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        market: { ...midnightMarket, maturity: maxUint256 + 1n },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightCalldataEncodingError",
        cause: expect.any(IntegerOutOfRangeError),
      }),
    );
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({ ...params, chainId: 1 }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: MidnightContractReceiverError for protocol collateral receivers", () => {
    for (const collateralReceiver of [
      midnightAddresses.midnight,
      midnightBundlesV2,
    ]) {
      const call = () =>
        midnightRepayWithdrawCollateral({ ...params, collateralReceiver });

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({
          field: "collateralReceiver",
          receiver: collateralReceiver,
        }),
      );
    }
  });

  test("behavior: a contract collateralReceiver builds with no withdrawals", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [],
        collateralReceiver: midnightBundlesV2,
      }),
    ).not.toThrow();
  });
});

describe("midnightRepayWithdrawCollateral malformed address", () => {
  test("error: a malformed market loanToken throws a typed encoding error", () => {
    const call = () =>
      midnightRepayWithdrawCollateral({
        ...params,
        market: { ...midnightMarket, loanToken: "0x123" as Address },
      });

    expect(call).toThrow(MidnightCalldataEncodingError);
    expect(call).toThrow(
      expect.objectContaining({
        input: "market.loanToken",
        cause: expect.any(InvalidAddressError),
      }),
    );
  });

  test("error: a malformed collateralReceiver throws a typed encoding error", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralReceiver: "0x123" as Address,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightCalldataEncodingError",
        input: "collateralReceiver",
        cause: expect.objectContaining({ name: "InvalidAddressError" }),
      }),
    );
  });

  test("error: a malformed native-funded loanToken throws a typed encoding error", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        market: { ...midnightMarket, loanToken: "0x123" as Address },
        collateralWithdrawals: [],
        nativeAmount: 1n,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightCalldataEncodingError",
        input: "token",
        cause: expect.objectContaining({ name: "InvalidAddressError" }),
      }),
    );
  });
});
