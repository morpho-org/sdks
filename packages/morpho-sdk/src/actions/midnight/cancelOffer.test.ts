import { midnightAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData, type Hex, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../test/fixtures/midnight.js";
import { midnightCancelOffer } from "./cancelOffer.js";

describe("midnightCancelOffer", () => {
  test("default", () => {
    const group =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    const tx = midnightCancelOffer({
      chainId: midnightChainId,
      group,
      onBehalf: midnightAddresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args.group).toBe(group);
    expect(tx.action.args.amount).toBe(maxUint256);
    expect(decoded.functionName).toBe("setConsumed");
    expect(decoded.args[0]).toBe(group);
  });

  test("behavior: uses explicit amount and appends metadata", () => {
    const group =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    const tx = midnightCancelOffer({
      chainId: midnightChainId,
      group,
      amount: 42n,
      onBehalf: midnightAddresses.taker,
      metadata: { origin: "a1b2c3d4" },
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.action.args.amount).toBe(42n);
    expect(decoded.args[1]).toBe(42n);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });
});
