import { ChainId, getChainAddress } from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { deployVaultExitBundlesV1 } from "./deployVaultExitBundlesV1.js";
import { abi } from "./VaultExitBundlesV1.js";

const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});

const blue = getChainAddress(ChainId.EthMainnet, "blue");

describe("deployVaultExitBundlesV1", () => {
  test("default", async ({ client }) => {
    const vaultExitBundles = await deployVaultExitBundlesV1(client);

    // The contract is really on the fork: it has code...
    expect(await client.getCode({ address: vaultExitBundles })).toBeDefined();
    // ...and that code runs, exposing the `blue` address baked in at construction.
    expect(
      await client.readContract({
        address: vaultExitBundles,
        abi,
        functionName: "BLUE",
      }),
    ).toBe(blue);
  });

  test("behavior: binds a custom blue address", async ({ client }) => {
    const customBlue = randomAddress();

    const vaultExitBundles = await deployVaultExitBundlesV1(client, customBlue);

    expect(
      await client.readContract({
        address: vaultExitBundles,
        abi,
        functionName: "BLUE",
      }),
    ).toBe(customBlue);
  });

  test("behavior: each call deploys a distinct instance", async ({
    client,
  }) => {
    const first = await deployVaultExitBundlesV1(client);
    const second = await deployVaultExitBundlesV1(client);

    expect(second).not.toBe(first);
    expect(await client.getCode({ address: second })).toBeDefined();
  });
});
