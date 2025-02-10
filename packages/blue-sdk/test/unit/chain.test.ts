import { entries } from "@morpho-org/morpho-ts";

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

  test("should support chain id", () => {
    expect(ChainUtils.isSupported(ChainId.EthMainnet)).toBe(true);
    expect(ChainUtils.isSupported(ChainId.BaseMainnet)).toBe(true);
  });
});
