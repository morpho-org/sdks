import { VaultV2, VaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  createPublicClient,
  custom,
  encodeFunctionData,
  isAddressEqual,
  parseUnits,
  zeroAddress,
} from "viem";
import { getBlockNumber, readContract } from "viem/actions";
import { describe, expect } from "vitest";
import {
  fetchAccrualVaultV2,
  fetchVaultV2,
} from "../src/fetch/vault-v2/VaultV2.js";
import { vaultV2Abi } from "../src/index.js";
import { vaultV2Test } from "./setup.js";

const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";

describe("AccrualVaultV2", () => {
  vaultV2Test(
    "pins sequential reads to one block when state changes mid-fetch",
    async ({ client }) => {
      const asset = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const depositedAssets = parseUnits("1", 6);
      const totalSupplyCallData = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "totalSupply",
      });
      const approval = await client.approve({
        address: asset,
        args: [vaultV2Address, depositedAssets],
      });
      await client.waitForTransactionReceipt({ hash: approval });
      await client.deal({ erc20: asset, amount: depositedAssets });

      let triggered = false;
      let totalSupplyRead = false;
      const wrappedClient = createPublicClient({
        chain: client.chain,
        transport: custom({
          async request({ method, params }) {
            const [call] = params ?? [];
            const isTotalSupplyCall =
              method === "eth_call" &&
              call !== null &&
              typeof call === "object" &&
              "to" in call &&
              "data" in call &&
              typeof call.to === "string" &&
              typeof call.data === "string" &&
              isAddressEqual(call.to as Address, vaultV2Address) &&
              call.data === totalSupplyCallData;

            if (!triggered && totalSupplyRead && method === "eth_call") {
              triggered = true;
              const hash = await client.writeContract({
                address: vaultV2Address,
                abi: vaultV2Abi,
                functionName: "deposit",
                args: [depositedAssets, client.account.address],
              });
              await client.waitForTransactionReceipt({ hash });
            }

            const result = await client.request({ method, params });
            if (isTotalSupplyCall) totalSupplyRead = true;
            return result;
          },
        }),
      });

      const before = await getBlockNumber(client);
      const result = await fetchAccrualVaultV2(vaultV2Address, wrappedClient, {
        deployless: false,
      });
      const expected = await fetchAccrualVaultV2(vaultV2Address, client, {
        deployless: false,
        blockNumber: before,
      });
      const latest = await fetchAccrualVaultV2(vaultV2Address, client, {
        deployless: false,
      });

      expect(triggered).toBe(true);
      expect(result).toStrictEqual(expected);
      expect(latest.totalSupply).not.toBe(result.totalSupply);
    },
  );

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

    const currentBlock = await client.getBlock({ blockTag: "latest" });
    await client.setNextBlockTimestamp({
      timestamp: currentBlock.timestamp + 1_000_000n,
    });
    await client.mine({ blocks: 1 });

    const block = await client.getBlock({ blockTag: "latest" });

    const { vault: accruedVaultV2 } = vaultV2.accrueInterest(block.timestamp);
    const [expectedTotalAssets, performanceFeeShares, managementFeeShares] =
      await readContract(client, {
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "accrueInterestView",
        blockNumber: block.number,
      });

    expect(accruedVaultV2._totalAssets).toEqual(expectedTotalAssets);
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
            id: VaultV2MorphoVaultV1Adapter.adapterCapId(
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
            id: VaultV2MorphoVaultV1Adapter.adapterCapId(
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
