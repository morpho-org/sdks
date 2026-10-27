import { MarketUtils, midnightAbi } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeFunctionData,
  InvalidAddressError,
  maxUint128,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  InputExceedsMaxError,
  MidnightCalldataEncodingError,
  MidnightContractReceiverError,
  MidnightZeroOnBehalfError,
  MidnightZeroReceiverError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightRedeem } from "./redeem.js";

describe("midnightRedeem", () => {
  test("default", () => {
    const tx = midnightRedeem({
      chainId: midnightChainId,
      market: midnightMarket,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
    });
    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.taker,
    });
    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "withdraw",
      args: [
        MarketUtils.toStruct(midnightMarket),
        1_000n,
        midnightAddresses.taker,
        midnightAddresses.taker,
      ],
    });
  });

  test("behavior: encodes explicit receiver", () => {
    const tx = midnightRedeem({
      chainId: midnightChainId,
      market: midnightMarket,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.maker,
    });

    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.maker,
    });
    expect(decodeFunctionData({ abi: midnightAbi, data: tx.data })).toEqual({
      functionName: "withdraw",
      args: [
        MarketUtils.toStruct(midnightMarket),
        1_000n,
        midnightAddresses.taker,
        midnightAddresses.maker,
      ],
    });
  });

  test("behavior: appends metadata", () => {
    const tx = midnightRedeem({
      chainId: midnightChainId,
      market: midnightMarket,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightRedeem({
        chainId: midnightChainId,
        market: midnightMarket,
        units: 0n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: MidnightZeroOnBehalfError for zero onBehalf", () => {
    const buildTx = () =>
      midnightRedeem({
        chainId: midnightChainId,
        market: midnightMarket,
        units: 1_000n,
        onBehalf: zeroAddress,
      });

    expect(buildTx).toThrow(MidnightZeroOnBehalfError);
    expect(buildTx).toThrow(expect.objectContaining({ field: "onBehalf" }));
  });

  test("error: units above the uint128 credit balance", () => {
    expect(() =>
      midnightRedeem({
        chainId: midnightChainId,
        market: midnightMarket,
        units: maxUint128 + 1n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightRedeem({
        chainId: midnightChainId,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
        units: 1_000n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  const params = {
    chainId: midnightChainId,
    market: midnightMarket,
    units: 1_000n,
    onBehalf: midnightAddresses.taker,
  } as const;

  test("error: MidnightZeroReceiverError for a zero receiver", () => {
    const call = () => midnightRedeem({ ...params, receiver: zeroAddress });

    expect(call).toThrow(MidnightZeroReceiverError);
    expect(call).toThrow(expect.objectContaining({ field: "receiver" }));
  });

  test("error: a malformed receiver throws a typed encoding error", () => {
    const call = () =>
      midnightRedeem({ ...params, receiver: "0x123" as Address });

    expect(call).toThrow(MidnightCalldataEncodingError);
    expect(call).toThrow(
      expect.objectContaining({
        input: "receiver",
        cause: expect.any(InvalidAddressError),
      }),
    );
  });

  test("error: MidnightContractReceiverError for protocol receivers", () => {
    for (const receiver of [
      midnightAddresses.midnight,
      getChainAddress(midnightChainId, "midnightBundlesV2"),
    ]) {
      const call = () => midnightRedeem({ ...params, receiver });

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({ field: "receiver", receiver }),
      );
    }
  });
});
