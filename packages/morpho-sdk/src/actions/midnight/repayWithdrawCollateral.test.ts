import {
  midnightBundlesAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightMultiCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  DuplicateMidnightCollateralIndexError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { PermitKind } from "./types.js";

describe("midnightRepayWithdrawCollateral", () => {
  test("default", () => {
    const tx = midnightRepayWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      repayAssets: 1_000n,
      withdrawCollateralAssets: 2_000n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      repayAssets: 1_000n,
      collateralWithdrawals: 1,
      onBehalf: midnightAddresses.taker,
      collateralReceiver: midnightAddresses.taker,
      deadline: maxUint256,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV1RepayAndWithdrawCollateral",
    );
    expect(decoded.args[1]).toBe(1_000n);
    expect(decoded.args?.[3]).toEqual({
      kind: PermitKind.None,
      data: "0x",
    });
    expect(decoded.args?.[6]).toBe(0n);
    expect(decoded.args?.[7]).toBe(zeroAddress);
  });

  test("behavior: encodes every collateral withdrawal in order", () => {
    const tx = midnightRepayWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMultiCollateralMarket,
      repayAssets: 0n,
      collateralWithdrawals: [
        { collateralIndex: 1n, assets: 300n },
        { collateralIndex: 0n, assets: 2_000n },
      ],
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(tx.action.args.collateralWithdrawals).toBe(2);
    expect(decoded.args[4]).toEqual([
      { collateralIndex: 1n, assets: 300n },
      { collateralIndex: 0n, assets: 2_000n },
    ]);
  });

  test("behavior: single-collateral input encodes the same calldata as a one-entry list", () => {
    const params = {
      chainId: midnightChainId,
      market: midnightMultiCollateralMarket,
      repayAssets: 1_000n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
    } as const;

    expect(
      midnightRepayWithdrawCollateral({
        ...params,
        withdrawCollateralAssets: 300n,
        collateralIndex: 1n,
      }),
    ).toEqual(
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 1n, assets: 300n }],
      }),
    );
    expect(
      midnightRepayWithdrawCollateral({
        ...params,
        withdrawCollateralAssets: 0n,
      }),
    ).toEqual(
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [],
      }),
    );
  });

  test("error: invalid collateralWithdrawals", () => {
    const params = {
      chainId: midnightChainId,
      market: midnightMultiCollateralMarket,
      repayAssets: 1_000n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
    } as const;

    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        repayAssets: 0n,
        collateralWithdrawals: [],
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [
          { collateralIndex: 1n, assets: 1n },
          { collateralIndex: 1n, assets: 2n },
        ],
      }),
    ).toThrow(DuplicateMidnightCollateralIndexError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }],
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: -1n, assets: 1n }],
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        collateralWithdrawals: [{ collateralIndex: 2n, assets: 1n }],
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("behavior: repays without collateral withdrawals and appends metadata", () => {
    const tx = midnightRepayWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      repayAssets: 1_000n,
      withdrawCollateralAssets: 0n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
      metadata: { origin: "a1b2c3d4" },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.action.args.collateralWithdrawals).toBe(0);
    expect(decoded.args[4]).toEqual([]);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: NegativeInputError", () => {
    const params = {
      chainId: midnightChainId,
      market: midnightMarket,
      repayAssets: 1_000n,
      withdrawCollateralAssets: 0n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
    } as const;

    expect(() =>
      midnightRepayWithdrawCollateral({ ...params, repayAssets: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        withdrawCollateralAssets: -1n,
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({ ...params, deadline: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      midnightRepayWithdrawCollateral({
        ...params,
        withdrawCollateralAssets: 1n,
        collateralIndex: -1n,
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        repayAssets: 0n,
        withdrawCollateralAssets: 0n,
        onBehalf: midnightAddresses.taker,
        deadline: maxUint256,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: UnknownCollateralIndexError for default withdrawal", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        repayAssets: 0n,
        withdrawCollateralAssets: 2_000n,
        collateralIndex: 1n,
        onBehalf: midnightAddresses.taker,
        deadline: maxUint256,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        chainId: midnightChainId,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
        repayAssets: 1_000n,
        withdrawCollateralAssets: 0n,
        onBehalf: midnightAddresses.taker,
        deadline: maxUint256,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});
