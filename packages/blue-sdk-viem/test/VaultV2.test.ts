import {
  CapacityLimitReason,
  VaultV2,
  VaultV2MorphoVaultV1Adapter,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { encodeFunctionData, parseUnits, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { describe, expect } from "vitest";
import {
  fetchAccrualVaultV2,
  fetchVaultV2,
} from "../src/fetch/vault-v2/VaultV2.js";
import { vaultV2Abi } from "../src/index.js";
import { vaultV2Test } from "./setup.js";
import { deployVaultV2 } from "./utils.js";

const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
const allocator = "0xc0267A5Fa9aaaf1694283c013CBFA925BCdb5dE8";

describe("AccrualVaultV2", () => {
  vaultV2Test("should accrue interest", async ({ client }) => {
    const managementFee = parseUnits("2", 16) / Time.s.from.y(1n);
    const performanceFee = parseUnits("5", 16);

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
        args: [managementFee],
      },
      {
        functionName: "setPerformanceFee",
        args: [performanceFee],
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

    expect(vaultV2.managementFee).toEqual(managementFee);
    expect(vaultV2.performanceFee).toEqual(performanceFee);

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
        adapters: ["0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F"],
        address: vaultV2Address,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 18,
        lastUpdate: 1763994035n,
        liquidityAdapter: "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F",
        liquidityData: "0x",
        liquidityAllocations: [
          {
            id: VaultV2MorphoVaultV1Adapter.adapterId(
              "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F",
            ),
            absoluteCap: 1000000000000n,
            relativeCap: 1000000000000000000n,
            allocation: 16624313n,
          },
        ],
        managementFee: 0n,
        managementFeeRecipient: zeroAddress,
        maxRate: 0n,
        name: "test Vault USDC",
        performanceFee: 0n,
        performanceFeeRecipient: zeroAddress,
        symbol: "tvUSDC",
        totalAssets: 16474000n,
        _totalAssets: 16474000n,
        totalSupply: 16474000000000000000n,
        virtualShares: 1000000000000n,
      });

      const value = await fetchVaultV2(vaultV2Address, client, {
        deployless: true,
      });

      expect(value).toStrictEqual(expectedData);
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const expectedData = new VaultV2({
        adapters: ["0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F"],
        address: vaultV2Address,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 18,
        lastUpdate: 1763994035n,
        liquidityAdapter: "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F",
        liquidityData: "0x",
        liquidityAllocations: [
          {
            id: VaultV2MorphoVaultV1Adapter.adapterId(
              "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F",
            ),
            absoluteCap: 1000000000000n,
            relativeCap: 1000000000000000000n,
            allocation: 16624313n,
          },
        ],
        managementFee: 0n,
        managementFeeRecipient: zeroAddress,
        maxRate: 0n,
        name: "test Vault USDC",
        performanceFee: 0n,
        performanceFeeRecipient: zeroAddress,
        symbol: "tvUSDC",
        totalAssets: 16474000n,
        _totalAssets: 16474000n,
        totalSupply: 16474000000000000000n,
        virtualShares: 1000000000000n,
      });

      const value = await fetchVaultV2(vaultV2Address, client, {
        deployless: false,
      });

      expect(value).toStrictEqual(expectedData);
    });
  });
});

describe("maxWithdraw", () => {
  describe("vaultV1 adapter", () => {
    vaultV2Test(
      "should be limited by liquidity when assets > liquidity",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("1000000", 18);
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: 16733835n,
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

        const shares = parseUnits("10", 18);
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: accrualVaultV2.toAssets(shares),
          limiter: CapacityLimitReason.balance,
        });
      },
    );
  });

  describe("marketV1 adapter", () => {
    vaultV2Test("should be limited by balance", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultAddress, client);

      const shares = parseUnits("100000", 6);
      const result = accrualVaultV2.maxWithdraw(shares);
      expect(result).toStrictEqual({
        value: 0n,
        limiter: CapacityLimitReason.balance,
      });
    });
  });

  describe("zero address adapter", () => {
    vaultV2Test(
      "should withdraw full amount when liquidityAdapter is zero address",
      async ({ client }) => {
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

describe("maxForceWithdraw", () => {
  vaultV2Test(
    "should be limited by balance when assets <= liquidity",
    async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const shares = parseUnits("10", 18);
      const result = accrualVaultV2.maxForceWithdraw(shares);

      expect(result).toStrictEqual({
        value: accrualVaultV2.toAssets(shares),
        limiter: CapacityLimitReason.balance,
      });
    },
  );

  vaultV2Test(
    "should be limited by VaultV2_ForceLiquidity when no extra adapters available",
    async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const shares = parseUnits("1000000", 18);
      const result = accrualVaultV2.maxForceWithdraw(shares);

      expect(result).toStrictEqual({
        value: 16733835n,
        limiter: CapacityLimitReason.VaultV2_ForceLiquidity,
      });
    },
  );

  vaultV2Test(
    "should withdraw full amount when liquidityAdapter is zero address",
    async ({ client }) => {
      await client.writeContract({
        account: allocator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [zeroAddress, "0x"],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const shares = parseUnits("100", 18);
      const result = accrualVaultV2.maxForceWithdraw(shares);

      expect(result).toStrictEqual({
        value: accrualVaultV2.toAssets(shares),
        limiter: CapacityLimitReason.balance,
      });
    },
  );
});
