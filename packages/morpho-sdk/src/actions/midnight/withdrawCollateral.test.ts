import {
  MarketUtils,
  midnightAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint128, zeroAddress } from "viem";
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
  MidnightContractReceiverError,
  MidnightZeroOnBehalfError,
  MidnightZeroReceiverError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightWithdrawCollateral } from "./withdrawCollateral.js";

describe("midnightWithdrawCollateral", () => {
  test.each([
    [zeroAddress, MidnightZeroReceiverError],
    [midnightAddresses.midnight, MidnightContractReceiverError],
    [midnightMarket.loanToken, MidnightContractReceiverError],
    [midnightMarket.collateralParams[0]!.token, MidnightContractReceiverError],
  ])("rejects unsafe receiver %s", (receiver, error) => {
    expect(() =>
      midnightWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1n,
        onBehalf: midnightAddresses.taker,
        receiver,
      }),
    ).toThrow(error);
  });
  test("freezes transaction and metadata", () => {
    const tx = midnightWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.maker,
    });
    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
  test("default", () => {
    const tx = midnightWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.maker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      collateralIndex: 0n,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.maker,
    });
    expect(decoded).toEqual({
      functionName: "withdrawCollateral",
      args: [
        MarketUtils.toStruct(midnightMarket),
        0n,
        2_000n,
        midnightAddresses.taker,
        midnightAddresses.maker,
      ],
    });
  });

  test("behavior: uses explicit collateral index and appends metadata", () => {
    const tx = midnightWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightTwoCollateralMarket,
      collateralIndex: 1n,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.maker,
      metadata: { origin: "a1b2c3d4" },
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.action.args.collateralIndex).toBe(1n);
    expect(decoded.args[1]).toBe(1n);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 0n,
        onBehalf: midnightAddresses.taker,
        receiver: midnightAddresses.maker,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: MidnightZeroOnBehalfError for zero onBehalf", () => {
    const buildTx = () =>
      midnightWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 2_000n,
        onBehalf: zeroAddress,
        receiver: midnightAddresses.maker,
      });

    expect(buildTx).toThrow(MidnightZeroOnBehalfError);
    expect(buildTx).toThrow(expect.objectContaining({ field: "onBehalf" }));
  });

  test("error: assets above the uint128 collateral balance", () => {
    expect(() =>
      midnightWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: maxUint128 + 1n,
        onBehalf: midnightAddresses.taker,
        receiver: midnightAddresses.maker,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralIndex: 1n,
        assets: 2_000n,
        onBehalf: midnightAddresses.taker,
        receiver: midnightAddresses.maker,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightWithdrawCollateral({
        chainId: midnightChainId,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
        assets: 2_000n,
        onBehalf: midnightAddresses.taker,
        receiver: midnightAddresses.maker,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});
