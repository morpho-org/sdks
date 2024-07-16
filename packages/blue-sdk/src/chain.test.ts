import { entries, keys, values } from "@morpho-org/morpho-ts";

import { ChainId, ChainUtils } from "./chain";

describe("Network", () => {
  it("Should have consistent chainIds", () => {
    entries(ChainUtils.CHAIN_METADATA).forEach(([chainId, { id }]) => {
      expect(+chainId).toEqual(id);
    });
  });

  it("Should have Testnet in the name for testnet chains", () => {
    Object.values(ChainUtils.CHAIN_METADATA)
      .filter(({ isTestnet }) => isTestnet)
      .forEach(({ name }) => {
        expect(name).toMatch(/Testnet/);
      });
  });
  it("Should convert correctly a chainId to hexChainId", () => {
    expect(ChainUtils.toHexChainId(ChainId.EthGoerliTestnet)).toEqual("0x5");
    expect(ChainUtils.toHexChainId(ChainId.BaseMainnet)).toEqual("0x2105");
  });
});
