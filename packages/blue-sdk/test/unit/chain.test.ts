import { entries } from "@gfxlabs/morpho-ts";

import { describe, expect, test } from "vitest";
import { ChainId, ChainUtils } from "../../src/index.js";

describe("ChainUtils", () => {
  test("should have consistent chainIds", () => {
    entries(ChainUtils.CHAIN_METADATA).forEach(([chainId, { id }]) => {
      expect(+chainId).toEqual(id);
    });
  });

  test("should convert correctly a chainId to hexChainId", () => {
    expect(ChainUtils.toHexChainId(ChainId.BaseMainnet)).toEqual("0x2105");
  });

  test("should report unreliable native balance for Tempo", () => {
    expect(ChainUtils.hasReliableNativeBalance(ChainId.TempoMainnet)).toBe(
      false,
    );
  });

  test("should report reliable native balance for Ethereum", () => {
    expect(ChainUtils.hasReliableNativeBalance(ChainId.EthMainnet)).toBe(true);
  });

  test("should default to reliable native balance for unknown chains", () => {
    expect(ChainUtils.hasReliableNativeBalance(99999)).toBe(true);
  });
});
