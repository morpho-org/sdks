import { VaultV2 } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { encodeFunctionData, parseUnits, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { describe, expect } from "vitest";
import { vaultV2Abi } from "../src";
import { fetchAccrualVaultV2, fetchVaultV2 } from "../src/fetch/v2/VaultV2";
import { vaultV2Test } from "./setup";

const vaultV2Address = "0xfAD637e9900d2FD140d791db0a72C84bF26f4fF8";

describe("AccrualVaultV2", () => {
  vaultV2Test("should accrue interest", async ({ client }) => {
    const owner = await readContract(client, {
      address: vaultV2Address,
      abi: vaultV2Abi,
      functionName: "owner",
    });
    await client.deal({ account: owner, amount: BigInt(1e18) });

    const timelockedMulticall = [
      {
        functionName: "setCurator",
        args: [owner],
      },
      {
        functionName: "setManagementFeeRecipient",
        args: [owner],
      },
      {
        functionName: "setPerformanceFeeRecipient",
        args: [owner],
      },
      {
        functionName: "setManagementFee",
        args: [parseUnits("2", 16) / Time.s.from.y(1n)],
      },
      {
        functionName: "setPerformanceFee",
        args: [parseUnits("5", 16)],
      },
    ] as const;

    await client.writeContract({
      address: vaultV2Address,
      abi: vaultV2Abi,
      functionName: "multicall",
      account: owner,
      args: [
        timelockedMulticall.flatMap((timelockedCall) => {
          const encoded = encodeFunctionData({
            abi: vaultV2Abi,
            ...timelockedCall,
          });

          return [
            encodeFunctionData({
              abi: vaultV2Abi,
              functionName: "submit",
              args: [encoded],
            }),
            encoded,
          ];
        }),
      ],
    });

    const vaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

    expect(vaultV2.managementFee).not.toEqual(0n);
    expect(vaultV2.performanceFee).not.toEqual(0n);

    await client.mine({ blocks: 1_000_000 });

    const block = await client.getBlock({ blockTag: "latest" });

    const { vault: accruedVaultV2 } = vaultV2.accrueInterest(block.timestamp);
    const [expectedTotalAssets, performanceFeeShares, managementFeeShares] =
      await readContract(client, {
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "accrueInterestView",
        blockNumber: block.number,
      });

    expect(accruedVaultV2.totalAssets).toEqual(expectedTotalAssets);
    expect(accruedVaultV2.totalSupply).toEqual(
      vaultV2.totalSupply + performanceFeeShares + managementFeeShares,
    );
    expect(accruedVaultV2.lastUpdate).toEqual(block.timestamp);
  });

  describe("should fetch vault V2", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const expectedData = new VaultV2({
        adapters: ["0x193Fcd9AA26A6A5472B9855dF0d0866C15D0f3a0"],
        address: vaultV2Address,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 18,
        lastUpdate: 1754641739n,
        liquidityAdapter: "0x193Fcd9AA26A6A5472B9855dF0d0866C15D0f3a0",
        managementFee: 0n,
        managementFeeRecipient: zeroAddress,
        maxRate: 63419583967n,
        name: "Test USDC V2",
        performanceFee: 0n,
        performanceFeeRecipient: zeroAddress,
        symbol: "morphoTestUSDCV2",
        totalAssets: 2005725n,
        totalSupply: 2005725000000000000n,
        virtualShares: 1000000000000n,
      });

      const value = await fetchVaultV2(vaultV2Address, client, {
        deployless: true,
      });

      expect(value).toStrictEqual(expectedData);
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const expectedData = new VaultV2({
        adapters: ["0x193Fcd9AA26A6A5472B9855dF0d0866C15D0f3a0"],
        address: vaultV2Address,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 18,
        lastUpdate: 1754641739n,
        liquidityAdapter: "0x193Fcd9AA26A6A5472B9855dF0d0866C15D0f3a0",
        managementFee: 0n,
        managementFeeRecipient: zeroAddress,
        maxRate: 63419583967n,
        name: "Test USDC V2",
        performanceFee: 0n,
        performanceFeeRecipient: zeroAddress,
        symbol: "morphoTestUSDCV2",
        totalAssets: 2005725n,
        totalSupply: 2005725000000000000n,
        virtualShares: 1000000000000n,
      });

      const value = await fetchVaultV2(vaultV2Address, client, {
        deployless: false,
      });

      expect(value).toStrictEqual(expectedData);
    });
  });
});
