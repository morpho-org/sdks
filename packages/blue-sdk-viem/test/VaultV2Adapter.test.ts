import { VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
import { zeroAddress } from "viem";
import { describe, expect } from "vitest";
import { fetchVaultV2Adapter } from "../src";
import { vaultV2Test } from "./setup";

const vaultV2AdapterAddress = "0x193Fcd9AA26A6A5472B9855dF0d0866C15D0f3a0";

describe("VaultV2Adapter", () => {
  describe("should fetch vaultV1 adapter", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const expectedData = new VaultV2MorphoVaultV1Adapter({
        morphoVaultV1: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
        address: vaultV2AdapterAddress,
        parentVault: "0xfAD637e9900d2FD140d791db0a72C84bF26f4fF8",
        adapterId:
          "0xe368c0b93175c7536364395c1444389c95d3fccfc109fe612cc0cb31b615366d",
        skimRecipient: zeroAddress,
      });

      const value = await fetchVaultV2Adapter(vaultV2AdapterAddress, client, {
        deployless: true,
      });

      expect(value).toStrictEqual(expectedData);
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const expectedData = new VaultV2MorphoVaultV1Adapter({
        morphoVaultV1: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca",
        address: vaultV2AdapterAddress,
        parentVault: "0xfAD637e9900d2FD140d791db0a72C84bF26f4fF8",
        adapterId:
          "0xe368c0b93175c7536364395c1444389c95d3fccfc109fe612cc0cb31b615366d",
        skimRecipient: zeroAddress,
      });

      const value = await fetchVaultV2Adapter(vaultV2AdapterAddress, client, {
        deployless: false,
      });

      expect(value).toStrictEqual(expectedData);
    });
  });
});
