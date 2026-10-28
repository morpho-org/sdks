import {
  getChainAddresses,
  MarketParams,
  MarketUtils,
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
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  maxUint128,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import { assert, describe, expect } from "vitest";
import { morphoViemExtension } from "../../../src/index.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import {
  deployMorphoMarketV1AdapterV2,
  deployVaultV2,
  setUpSingleAdapterVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";

const baseTargetMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0x4200000000000000000000000000000000000006",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const snapshotSourceMarket = new MarketParams({
  ...baseTargetMarket,
  lltv: 945_000_000_000_000_000n,
});

const snapshotTargetMarket = baseTargetMarket;

const baseTest = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 50_063_965n, // BluePublicAllocator deployment block.
  stepsTracing: false,
});

describe("MorphoBlue Vault V2 reallocation integration", () => {
  baseTest(
    "executes the simulated zero-elapsed relative-cap maximum",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { blue: morpho, vaultV2BluePublicAllocator: allocator } =
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

      const vault = await deployVaultV2({
        client: anvilClient,
        asset: baseTargetMarket.loanToken,
      });
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

      const exactMaximumResult =
        reallocationData.computeVaultV2BlueReallocations(baseTargetMarket.id, {
          timestamp: block.timestamp,
          capAccrualBuffer: 0n,
        });
      expect(exactMaximumResult.reallocations).toHaveLength(1);
      expect(exactMaximumResult.reallocations[0]?.assets).toBe(expectedMaximum);

      const bufferedResult = reallocationData.computeVaultV2BlueReallocations(
        baseTargetMarket.id,
        { timestamp: block.timestamp },
      );
      expect(bufferedResult.reallocations).toHaveLength(1);
      expect(bufferedResult.reallocations[0]!.assets).toBeGreaterThan(0n);
      expect(bufferedResult.reallocations[0]!.assets).toBeLessThanOrEqual(
        expectedMaximum,
      );

      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "allocateFromIdle",
        args: [
          vault,
          targetAdapter,
          baseTargetMarket,
          bufferedResult.reallocations[0]!.assets,
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

  baseTest(
    "plans a market-source reallocation at the fetched block timestamp",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { blue: morpho, vaultV2BluePublicAllocator: allocator } =
        getChainAddresses(base.id);
      assert(allocator != null);
      const sourceDepositAssets = parseUnits("1000000", 6);
      const sourceBorrowAssets = parseUnits("1700000", 6);
      const maxWithdrawalUtilization =
        (MathLib.WAD * 9n) / 10n - 1_000_000_000_000n;
      const onchainMaxWithdrawalUtilization = (MathLib.WAD * 9n) / 10n;

      for (const marketParams of [snapshotSourceMarket, snapshotTargetMarket]) {
        const marketState = await readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "market",
          args: [marketParams.id],
        });
        if (marketState.lastUpdate === 0n) {
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "createMarket",
            args: [marketParams],
          });
        }
      }

      await supplyLoan({
        client: anvilClient,
        chainId: base.id,
        market: snapshotSourceMarket,
        supplyAmount: sourceDepositAssets,
      });

      const { vault, adapter, depositAndAllocate } =
        await setUpSingleAdapterVaultV2(anvilClient, {
          asset: snapshotTargetMarket.loanToken,
          markets: [snapshotSourceMarket, snapshotTargetMarket],
        });
      await depositAndAllocate({
        assets: sourceDepositAssets,
        perMarket: [
          { market: snapshotSourceMarket, assets: sourceDepositAssets },
        ],
      });

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
        args: [vault, adapter, true],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setAbsoluteCap",
        args: [vault, adapter, snapshotTargetMarket, maxUint128],
      });
      await client.writeContract({
        address: allocator,
        abi: vaultV2BluePublicAllocatorAbi,
        functionName: "setCanPullFromMarket",
        args: [vault, adapter, snapshotSourceMarket, true],
      });

      await supplyCollateral({
        client: anvilClient,
        chainId: base.id,
        market: snapshotSourceMarket,
        collateralAmount: parseUnits("1000", 18),
      });
      await borrow({
        client: anvilClient,
        chainId: base.id,
        market: snapshotSourceMarket,
        borrowAmount: sourceBorrowAssets,
      });

      const blockBeforeTimeAdvance = await client.getBlock();
      await client.setNextBlockTimestamp({
        timestamp: blockBeforeTimeAdvance.timestamp + 30n * 24n * 60n * 60n,
      });
      await client.mine({ blocks: 1 });
      const block = await client.getBlock();
      const market = client
        .extend(morphoViemExtension())
        .morpho.blue(snapshotTargetMarket, base.id);
      const reallocationData = await market.getVaultV2BlueReallocationData({
        vaultAddresses: [vault],
        block,
      });
      const defaultPlan = market.getVaultV2BlueReallocations({
        reallocationData,
        options: { maxWithdrawalUtilization },
      });
      const explicitPlan = market.getVaultV2BlueReallocations({
        reallocationData,
        options: { timestamp: block.timestamp, maxWithdrawalUtilization },
      });
      const sourceMarket = reallocationData.getMarket(snapshotSourceMarket.id);
      const accruedSourceMarket = sourceMarket.accrueInterest(block.timestamp);
      const sourceWithdrawals = defaultPlan.reallocations
        .filter(
          ({ from }) =>
            from.type === "market" &&
            from.marketParams.id === snapshotSourceMarket.id,
        )
        .reduce((assets, { assets: withdrawal }) => assets + withdrawal, 0n);

      expect(block.timestamp - sourceMarket.lastUpdate).toBeGreaterThanOrEqual(
        24n * 60n * 60n,
      );
      expect(sourceMarket.rateAtTarget ?? 0n).toBeGreaterThan(0n);
      expect(accruedSourceMarket.totalBorrowAssets).toBeGreaterThan(
        sourceMarket.totalBorrowAssets,
      );
      expect(defaultPlan.reallocations).toStrictEqual(
        explicitPlan.reallocations,
      );
      expect(sourceWithdrawals).toBeGreaterThan(0n);
      expect(
        MarketUtils.getUtilization({
          totalSupplyAssets:
            accruedSourceMarket.totalSupplyAssets - sourceWithdrawals,
          totalBorrowAssets: accruedSourceMarket.totalBorrowAssets,
        }),
      ).toBeLessThanOrEqual(maxWithdrawalUtilization);

      for (const {
        from,
        to,
        assets,
        penalty,
        vault: reallocatableVault,
      } of defaultPlan.reallocations) {
        assert(from.type === "market");
        await client.writeContract({
          address: allocator,
          abi: vaultV2BluePublicAllocatorAbi,
          functionName: "reallocate",
          args: [
            reallocatableVault,
            from.adapter,
            from.marketParams,
            to.adapter,
            snapshotTargetMarket,
            assets,
            penalty,
          ],
        });
      }

      const sourceMarketAfter = await readContractRestructured(client, {
        address: morpho,
        abi: blueAbi,
        functionName: "market",
        args: [snapshotSourceMarket.id],
      });
      expect(MarketUtils.getUtilization(sourceMarketAfter)).toBeLessThanOrEqual(
        onchainMaxWithdrawalUtilization,
      );
    },
  );
});
