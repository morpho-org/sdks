import {
  ChainId,
  getChainAddress,
  registerCustomAddresses,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  DETERMINISTIC_DEPLOYER_ADDRESS,
  deployVaultExitBundlesV1,
  getVaultExitBundlesV1Address,
  MissingDeterministicDeployerError,
} from "./deployVaultExitBundlesV1.js";
import { abi } from "./VaultExitBundlesV1.js";

const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});

const blue = getChainAddress(ChainId.EthMainnet, "blue");

describe("deployVaultExitBundlesV1", () => {
  test("default", async ({ client }) => {
    const vaultExitBundles = await deployVaultExitBundlesV1(client);

    expect(vaultExitBundles).toBe(getVaultExitBundlesV1Address({ blue }));

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

    registerCustomAddresses({
      addresses: { [ChainId.EthMainnet]: { vaultExitBundles } },
    });

    expect(getChainAddress(ChainId.EthMainnet, "vaultExitBundles")).toBe(
      vaultExitBundles,
    );
  });

  test("behavior: returns the existing address when already deployed", async ({
    client,
  }) => {
    const vaultExitBundles = await deployVaultExitBundlesV1(client);

    // A second CREATE2 to the same address would revert, so this proves the early return.
    expect(await deployVaultExitBundlesV1(client)).toBe(vaultExitBundles);
  });

  test("behavior: binds a custom blue address", async ({ client }) => {
    const customBlue = randomAddress();

    const vaultExitBundles = await deployVaultExitBundlesV1(client, {
      blue: customBlue,
    });

    expect(vaultExitBundles).not.toBe(getVaultExitBundlesV1Address({ blue }));
    expect(
      await client.readContract({
        address: vaultExitBundles,
        abi,
        functionName: "BLUE",
      }),
    ).toBe(customBlue);
  });

  test("error: MissingDeterministicDeployerError", async ({ client }) => {
    await client.setCode({
      address: DETERMINISTIC_DEPLOYER_ADDRESS,
      bytecode: "0x",
    });

    await expect(deployVaultExitBundlesV1(client)).rejects.toBeInstanceOf(
      MissingDeterministicDeployerError,
    );
  });
});
