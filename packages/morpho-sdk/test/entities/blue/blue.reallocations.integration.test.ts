import {
  getChainAddresses,
  MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  fetchAccrualVaultV2,
  readContractRestructured,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  maxUint128,
  parseUnits,
} from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import {
  ChainIdMismatchError,
  morphoViemExtension,
} from "../../../src/index.js";
import { CbbtcUsdcBlue } from "../../fixtures/blue.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import {
  deployMorphoMarketV1AdapterV2,
  deployVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";
import { test } from "../../setup.js";

const baseTargetMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0x4200000000000000000000000000000000000006",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const baseTest = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 50_063_965n, // BluePublicAllocator deployment block.
  stepsTracing: false,
});

describe("MorphoBlue Vault V1 reallocation integration", () => {
  test("error: getVaultV1ReallocationData rejects a mismatched chain", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id + 1);

    await expect(
      market.getVaultV1ReallocationData({
        vaultAddresses: [SteakhouseUsdcVaultV1.address],
        block: { number: 0n, timestamp: 0n },
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("plans only when target liquidity is insufficient", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const block = await client.getBlock();
    const reallocationData = await market.getVaultV1ReallocationData({
      vaultAddresses: [SteakhouseUsdcVaultV1.address],
      block,
    });

    const reallocations = market.getVaultV1Reallocations({
      reallocationData,
      operation: "borrow",
      amount: parseUnits("50000000", 6),
      options: { timestamp: block.timestamp },
    });

    expect(reallocations.length).toBeGreaterThan(0);
    expect(
      reallocations.every(
        ({ withdrawals }) =>
          withdrawals.length > 0 &&
          withdrawals.every(({ amount }) => amount > 0n),
      ),
    ).toBe(true);

    expect(
      market.getVaultV1Reallocations({
        reallocationData,
        operation: "borrow",
        amount: parseUnits("1", 6),
        options: { timestamp: block.timestamp },
      }),
    ).toEqual([]);
  });
});

describe("MorphoBlue Vault V2 reallocation integration", () => {
  baseTest(
    "executes the simulated zero-elapsed relative-cap maximum",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { morpho, vaultV2BluePublicAllocator: allocator } =
        getChainAddresses(base.id);
      assert(allocator != null);
      const depositAssets = parseUnits("100", 6);
      const seedAssets = parseUnits("1", 6);
      const postLossIdleAssets = parseUnits("89", 6);
      const relativeCap = MathLib.WAD / 2n;

      const marketState = await readContractRestructured(client, {
        address: morpho,
        abi: blueAbi,
        functionName: "market",
        args: [baseTargetMarket.id],
      });
      if (marketState.lastUpdate === 0n) {
        await client.writeContract({
          address: morpho,
          abi: blueAbi,
          functionName: "createMarket",
          args: [baseTargetMarket],
        });
      }

      const vault = await deployVaultV2(
        anvilClient,
        baseTargetMarket.loanToken,
      );
      await submitAndAcceptVaultV2Call(anvilClient, {
        vault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "setIsAllocator",
          args: [client.account.address, true],
        }),
      });
      const targetAdapter = await deployMorphoMarketV1AdapterV2(
        anvilClient,
        vault,
      );
      await submitAndAcceptVaultV2Call(anvilClient, {
        vault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "addAdapter",
          args: [targetAdapter],
        }),
      });

      const targetIdData = [
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["this", targetAdapter],
        ),
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["collateralToken", baseTargetMarket.collateralToken],
        ),
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }, marketParamsAbi],
          ["this/marketParams", targetAdapter, baseTargetMarket],
        ),
      ] as const;
      for (const idData of targetIdData) {
        await submitAndAcceptVaultV2Call(anvilClient, {
          vault,
          data: encodeFunctionData({
            abi: vaultV2Abi,
            functionName: "increaseAbsoluteCap",
            args: [idData, maxUint128],
          }),
        });
        await submitAndAcceptVaultV2Call(anvilClient, {
          vault,
          data: encodeFunctionData({
            abi: vaultV2Abi,
            functionName: "increaseRelativeCap",
            args: [idData, relativeCap],
          }),
        });
      }

      await submitAndAcceptVaultV2Call(anvilClient, {
        vault,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "setIsAllocator",
          args: [allocator, true],
        }),
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setIsActiveAdapter",
        args: [vault, targetAdapter, true],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setAbsoluteCap",
        args: [vault, targetAdapter, baseTargetMarket, maxUint128],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromIdle",
        args: [vault, true],
      });

      await client.deal({
        account: client.account.address,
        erc20: baseTargetMarket.loanToken,
        amount: depositAssets,
      });
      await client.approve({
        address: baseTargetMarket.loanToken,
        args: [vault, depositAssets],
      });
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "deposit",
        args: [depositAssets, client.account.address],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "allocateFromIdle",
        args: [vault, targetAdapter, baseTargetMarket, seedAssets, 0n],
      });

      // Change the token balance without mining so the snapshot timestamp still
      // equals lastUpdate while real vault assets are below stored _totalAssets.
      await client.deal({
        account: vault,
        erc20: baseTargetMarket.loanToken,
        amount: postLossIdleAssets,
      });

      const block = await client.getBlock();
      const market = client
        .extend(morphoViemExtension())
        .morpho.blue(baseTargetMarket, base.id);
      const reallocationData = await market.getVaultV2BlueReallocationData({
        vaultAddresses: [vault],
        block,
      });
      const vaultData = reallocationData.getVault(vault);
      const targetMarketParamsId = keccak256(targetIdData[2]);
      const targetAllocation = reallocationData.getAllocation(
        vault,
        targetMarketParamsId,
      );
      const realTotalAssets = vaultData.accrualAdapters.reduce(
        (assets, adapter) => assets + adapter.realAssets(block.timestamp),
        vaultData.assetBalance,
      );
      const expectedMaximum =
        MathLib.wMulDown(realTotalAssets, relativeCap) -
        targetAllocation.allocation;
      expect(block.timestamp).toBe(vaultData.lastUpdate);
      expect(realTotalAssets).toBeLessThan(vaultData._totalAssets);

      const result = reallocationData.computeVaultV2BlueReallocations(
        baseTargetMarket.id,
        { timestamp: block.timestamp },
      );
      expect(result.reallocations).toHaveLength(1);
      expect(result.reallocations[0]?.assets).toBe(expectedMaximum);

      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "allocateFromIdle",
        args: [
          vault,
          targetAdapter,
          baseTargetMarket,
          result.reallocations[0]!.assets,
          0n,
        ],
      });

      const [allocationAfter, vaultAfter] = await Promise.all([
        client.readContract({
          address: vault,
          abi: vaultV2Abi,
          functionName: "allocation",
          args: [targetMarketParamsId],
        }),
        fetchAccrualVaultV2(vault, client),
      ]);
      expect(allocationAfter).toBeGreaterThan(targetAllocation.allocation);
      expect(allocationAfter).toBeLessThanOrEqual(
        MathLib.wMulDown(vaultAfter._totalAssets, relativeCap),
      );
    },
  );
});
