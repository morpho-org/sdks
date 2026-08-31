import { setterRatifierAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData, type Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../test/fixtures/midnight.js";
import { setterRatifierRatifyRoot } from "./setterRatifierRatifyRoot.js";

const root =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

describe("setterRatifierRatifyRoot", () => {
  test("default", () => {
    const tx = setterRatifierRatifyRoot({
      chainId: midnightChainId,
      maker: midnightAddresses.maker,
      root,
    });
    const decoded = decodeFunctionData({
      abi: setterRatifierAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.setterRatifier);
    expect(tx.action.args).toEqual({
      maker: midnightAddresses.maker,
      root,
      isRootRatified: true,
    });
    expect(decoded.functionName).toBe("setIsRootRatified");
    expect(decoded.args).toEqual([midnightAddresses.maker, root, true]);
  });

  test("behavior: unratifies root and appends metadata", () => {
    const tx = setterRatifierRatifyRoot({
      chainId: midnightChainId,
      maker: midnightAddresses.maker,
      root,
      isRootRatified: false,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.args.isRootRatified).toBe(false);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });
});
