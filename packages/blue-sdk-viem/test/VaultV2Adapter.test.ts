import { VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
import { zeroAddress } from "viem";
import { describe, expect } from "vitest";
import { fetchVaultV2Adapter } from "../src";
import { vaultV2Test } from "./setup";

const vaultV2AdapterAddress = "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F";

describe("VaultV2Adapter", () => {
  describe("should fetch vaultV1 adapter", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const expectedData = new VaultV2MorphoVaultV1Adapter({
        morphoVaultV1: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
        address: vaultV2AdapterAddress,
        parentVault: "0xfDE48B9B8568189f629Bc5209bf5FA826336557a",
        adapterId:
          "0xbd5376ffee54bf29509fe2422697ad0303a0cde85d9f6bf2b14c67f455a216a5",
        skimRecipient: zeroAddress,
      });

      const value = await fetchVaultV2Adapter(vaultV2AdapterAddress, client, {
        deployless: true,
      });

      expect(value).toStrictEqual(expectedData);
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const expectedData = new VaultV2MorphoVaultV1Adapter({
        morphoVaultV1: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
        address: vaultV2AdapterAddress,
        parentVault: "0xfDE48B9B8568189f629Bc5209bf5FA826336557a",
        adapterId:
          "0xbd5376ffee54bf29509fe2422697ad0303a0cde85d9f6bf2b14c67f455a216a5",
        skimRecipient: zeroAddress,
      });

      const value = await fetchVaultV2Adapter(vaultV2AdapterAddress, client, {
        deployless: false,
      });

      expect(value).toStrictEqual(expectedData);
    });
  });
});
