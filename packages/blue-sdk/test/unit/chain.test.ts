import { entries } from "@morpho-org/morpho-ts";

import { describe, expect, test } from "vitest";
import { ChainId, ChainUtils } from "../../src";

describe("Network", () => {
  test("Should have consistent chainIds", () => {
    entries(ChainUtils.CHAIN_METADATA).forEach(([chainId, { id }]) => {
      expect(+chainId).toEqual(id);
    });
  });

  test("Should have Testnet in the name for testnet chains", () => {
    Object.values(ChainUtils.CHAIN_METADATA)
      .filter(({ isTestnet }) => isTestnet)
      .forEach(({ name }) => {
        expect(name).toMatch(/Testnet/);
      });
  });

  test("Should convert correctly a chainId to hexChainId", () => {
    expect(ChainUtils.toHexChainId(ChainId.BaseMainnet)).toEqual("0x2105");
  });
});
