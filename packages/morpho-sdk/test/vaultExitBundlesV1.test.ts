import { getChainAddress, registerCustomAddresses } from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { toFunctionSelector, toFunctionSignature } from "viem";
import { describe, expect } from "vitest";
import { abi, code } from "./fixtures/vaultExitBundlesV1.js";
import { test } from "./setup.js";

// VaultExitBundlesV1 is not deployed on any live chain yet, so it has to be put on the fork before
// vault-exit flows can be exercised against it. Once deployed, its address is registered into the
// address registry under `bundles.vaultExitBundlesV1` so lookups resolve just like a live chain.
const deployVaultExitBundlesV1 = async (client: AnvilTestClient) => {
  const { contractAddress } = await client.deployContractWait({
    abi,
    bytecode: code,
    args: [getChainAddress(client.chain.id, "blue")],
  });

  registerCustomAddresses({
    addresses: {
      [client.chain.id]: { bundles: { vaultExitBundlesV1: contractAddress } },
    },
  });

  return contractAddress;
};

const functions = abi
  .filter((entry) => entry.type === "function")
  .map((entry) => ({
    signature: toFunctionSignature(entry),
    selector: toFunctionSelector(entry),
  }));

describe("VaultExitBundlesV1", () => {
  test("default", async ({ client }) => {
    const address = await deployVaultExitBundlesV1(client);

    // The contract is really on the fork: it has code...
    expect(await client.getCode({ address })).toBeDefined();
    // ...and that code runs, exposing the Blue address baked in at construction.
    expect(
      await client.readContract({ address, abi, functionName: "BLUE" }),
    ).toBe(getChainAddress(client.chain.id, "blue"));
    // ...and the deploy is registered, so registry lookups resolve it like a live chain.
    expect(getChainAddress(client.chain.id, "bundles.vaultExitBundlesV1")).toBe(
      address,
    );
  });

  test("behavior: the deployed code exposes every declared function", async ({
    client,
  }) => {
    const address = await deployVaultExitBundlesV1(client);

    const deployed = await client.getCode({ address });

    // Every selector the ABI declares must be routable by the deployed dispatcher, otherwise the
    // artifact and the contract it claims to be have drifted apart.
    expect(functions.map(({ signature }) => signature)).toEqual([
      "BLUE()",
      "onMorphoFlashLoan(uint256,bytes)",
      "onMorphoSupply(uint256,bytes)",
      "vaultExitBundlesV1ForceWithdrawVaultV2(address,address,uint256,uint256,(uint256,uint256,uint256,uint8,bytes32,bytes32),uint256,address,uint256)",
      "vaultExitBundlesV1InKindRedemptionVaultV1(address,(address,address,address,address,uint256)[],uint256,(uint256,uint256,uint256,uint8,bytes32,bytes32),uint256)",
      "vaultExitBundlesV1InKindRedemptionVaultV2(address,address,(address,address,address,address,uint256)[],uint256,(uint256,uint256,uint256,uint8,bytes32,bytes32),uint256)",
    ]);
    for (const { signature, selector } of functions)
      expect(deployed, signature).toContain(selector.slice(2));
  });
});
