import { ChainId } from "@morpho-org/blue-sdk";
import { getErpcForkUrl, MAINNET_FORK_BLOCK } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc20Abi, erc4626Abi, isAddressEqual } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { vaults } from "../src/fixtures/vaults.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: MAINNET_FORK_BLOCK,
});

describe("mainnet vault fixture metadata", () => {
  test.for(Object.entries(vaults[ChainId.EthMainnet]))(
    "%s matches the onchain asset and decimals offset",
    async ([, vault], { client }) => {
      const asset = await client.readContract({
        address: vault.address,
        abi: erc4626Abi,
        functionName: "asset",
      });
      const decimals = await client.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: "decimals",
      });

      expect.soft(vault.decimalsOffset).toBe(BigInt(18 - decimals));
      expect(
        isAddressEqual(vault.asset, asset),
        `Fixture asset ${vault.asset} does not match vault asset ${asset}`,
      ).toBe(true);
    },
  );
});
