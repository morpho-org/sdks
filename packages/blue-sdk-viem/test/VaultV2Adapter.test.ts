import {
  AccrualVaultV2,
  CapacityLimitReason,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import {
  encodeAbiParameters,
  encodeFunctionData,
  maxInt256,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { readContract } from "viem/actions";
import { describe, expect } from "vitest";
import { fetchAccrualVaultV2, fetchVaultV2Adapter, vaultV2Abi } from "../src";
import { vaultV2Test } from "./setup";

const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
const vaultV2AdapterAddress = "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F";
const allocator = "0xc0267A5Fa9aaaf1694283c013CBFA925BCdb5dE8";
const curator = "0xc0267A5Fa9aaaf1694283c013CBFA925BCdb5dE8";

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

describe("LiquidityAdapter", () => {
  describe("maxDeposit function", () => {
    vaultV2Test("should be limited by absolute cap", async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const [absoluteCap, allocation] = await Promise.all([
        readContract(client, {
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "absoluteCap",
          args: [VaultV2MorphoVaultV1Adapter.adapterId(vaultV2AdapterAddress)],
        }),
        readContract(client, {
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "allocation",
          args: [VaultV2MorphoVaultV1Adapter.adapterId(vaultV2AdapterAddress)],
        }),
      ]);

      const depositAmount = parseUnits("2000000", 6); // 1M
      const result = accrualVaultV2.maxDeposit(depositAmount);

      expect(result).toStrictEqual({
        value: absoluteCap - allocation,
        limiter: CapacityLimitReason.vaultV2_absoluteCap,
      });
    });

    vaultV2Test("should be limited by relative cap", async ({ client }) => {
      await client.deal({
        account: curator,
        amount: parseEther("1"),
      });
      const idData = encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", vaultV2AdapterAddress],
      );
      const data = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "decreaseRelativeCap",
        args: [idData, parseEther("200000")],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "submit",
        args: [data],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "decreaseRelativeCap",
        args: [idData, 1n],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const depositAmount = parseUnits("100000", 6); // 100K
      const result = accrualVaultV2.maxDeposit(depositAmount);

      expect(result).toStrictEqual({
        value: 0n,
        limiter: CapacityLimitReason.vaultV2_relativeCap,
      });
    });

    vaultV2Test("should be limited by metamorpho", async ({ client }) => {
      await client.deal({
        account: curator,
        amount: parseEther("1"),
      });
      const idData = encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", vaultV2AdapterAddress],
      );
      const data = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, parseEther("200000")],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "submit",
        args: [data],
      });

      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, parseEther("200000")],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const result = accrualVaultV2.maxDeposit(maxInt256);
      const maxDepositMetaMorphoVaultV1 =
        accrualVaultV2.accrualLiquidityAdapter?.maxDeposit(
          accrualVaultV2.liquidityData,
          maxInt256,
        );
      expect(result).toStrictEqual(maxDepositMetaMorphoVaultV1);
    });

    vaultV2Test(
      "should throw error for undefined liquidity allocations",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const modified1AccrualVaultV2 = new AccrualVaultV2(
          {
            ...accrualVaultV2,
            liquidityAllocations: undefined,
          },
          accrualVaultV2.accrualLiquidityAdapter,
          accrualVaultV2.accrualAdapters,
          accrualVaultV2.assetBalance,
        );

        const depositAmount = parseUnits("1000", 6);
        expect(() => modified1AccrualVaultV2.maxDeposit(depositAmount)).toThrow(
          "unsupported liquidity adapter",
        );
      },
    );

    vaultV2Test(
      "should throw error for undefined liquidity adapter",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const modified1AccrualVaultV2 = new AccrualVaultV2(
          accrualVaultV2,
          undefined,
          accrualVaultV2.accrualAdapters,
          accrualVaultV2.assetBalance,
        );

        const depositAmount = parseUnits("1000", 6);
        expect(() => modified1AccrualVaultV2.maxDeposit(depositAmount)).toThrow(
          "unsupported liquidity adapter",
        );
      },
    );

    vaultV2Test(
      "should return full amount when liquidityAdapter is zero address",
      async ({ client }) => {
        // Set liquidity adapter to zero address
        await client.writeContract({
          account: allocator,
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "setLiquidityAdapterAndData",
          args: [zeroAddress, "0x"],
        });

        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const result = accrualVaultV2.maxDeposit(maxInt256);
        expect(result).toStrictEqual({
          value: maxInt256,
          limiter: CapacityLimitReason.balance,
        });
      },
    );
  });

  describe("maxWithdraw function", () => {
    vaultV2Test(
      "should be limited by liquidity when assets > liquidity",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("1000000", 18); // 1M shares
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: accrualVaultV2.accrualLiquidityAdapter?.maxWithdraw(
            accrualVaultV2.liquidityData,
          ).value,
          limiter: CapacityLimitReason.liquidity,
        });
      },
    );

    vaultV2Test(
      "should be limited by balance when assets <= liquidity",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("10", 18); // 10 shares
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: accrualVaultV2.toAssets(shares),
          limiter: CapacityLimitReason.balance,
        });
      },
    );

    vaultV2Test(
      "should work when liquidityAdapter is zero address",
      async ({ client }) => {
        // Set liquidity adapter to zero address
        await client.writeContract({
          account: allocator,
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "setLiquidityAdapterAndData",
          args: [zeroAddress, "0x"],
        });

        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("100", 18);
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: accrualVaultV2.toAssets(shares),
          limiter: CapacityLimitReason.balance,
        });
      },
    );
  });
});
