import { midnightAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import { NonPositiveMidnightAmountError } from "../../types/index.js";
import { midnightRedeem } from "./redeem.js";

describe("midnightRedeem", () => {
  test("default", () => {
    const tx = midnightRedeem({
      chainId: midnightChainId,
      market: midnightMarket,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.taker,
    });
    expect(decoded.functionName).toBe("withdraw");
    expect(decoded.args[1]).toBe(1_000n);
  });

  test("behavior: uses explicit receiver and appends metadata", () => {
    const tx = midnightRedeem({
      chainId: midnightChainId,
      market: midnightMarket,
      units: 1_000n,
      onBehalf: midnightAddresses.taker,
      receiver: midnightAddresses.maker,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.args.receiver).toBe(midnightAddresses.maker);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: NonPositiveMidnightAmountError", () => {
    expect(() =>
      midnightRedeem({
        chainId: midnightChainId,
        market: midnightMarket,
        units: 0n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(NonPositiveMidnightAmountError);
  });
});
