import {
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { decodeFunctionData, getAddress, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
const borrower = getAddress("0x00000000000000000000000000000000000b0b00");
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

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

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 1n, assets: 1n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({ ...params, chainId: 1 }),
    ).toThrow(ChainIdMismatchError);
  });
});
