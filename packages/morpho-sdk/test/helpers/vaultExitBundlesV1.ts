import { getChainAddress, registerCustomAddresses } from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { vaultExitBundlesV1Abi } from "../../src/abis.js";
import { code } from "../fixtures/vaultExitBundlesV1.js";

export const deployVaultExitBundlesV1 = async (client: AnvilTestClient) => {
  const { contractAddress } = await client.deployContractWait({
    abi: vaultExitBundlesV1Abi,
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
