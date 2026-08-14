import {
  getChainAddresses,
  MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  fetchAccrualVaultV2,
  fetchMarket,
  fetchVaultV2PublicAllocatorData,
  readContractRestructured,
  vaultV2Abi,
} from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  maxUint128,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import { assert, describe, expect } from "vitest";
import {
  abi as allocatorAbi,
  code as allocatorCode,
} from "../../../test/fixtures/BluePublicAllocatorWriteFixture.js";
import { supplyCollateral } from "../../../test/helpers/blue.js";
import {
  deployMorphoMarketV1AdapterV2,
  deployVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../../test/helpers/vaultV2.js";
import { VaultV2ReallocationData } from "../../entities/vaultV2ReallocationData.js";
import {
  isRequirementApproval,
  isRequirementBlueAuthorization,
  morphoViemExtension,
} from "../../index.js";
import type { VaultV2BlueReallocation } from "../../types/index.js";

const test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 41_290_768n,
  stepsTracing: false,
});

const sourceMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  oracle: "0x663BECd10daE6C4A3Dcd89F1d76c1174199639B9",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const targetMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0x4200000000000000000000000000000000000006",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

describe("Blue actions with Vault V2 reallocations", () => {
  test("executes market and idle reallocations through live Base contracts", async ({
    client,
  }) => {
    const anvilClient = client as AnvilTestClient;
    const { morpho, bundler3 } = getChainAddresses(base.id);
    const sourceAssets = parseUnits("20", 6);
    const idleAssets = parseUnits("10", 6);
    const sourceDeposit = parseUnits("100", 6);
    const initialIdleAssets = parseUnits("20", 6);
    const penalty = parseUnits("0.01", 18);
    const borrowAmount = parseUnits("1", 6);
    const collateralAmount = parseUnits("1", 18);
    const totalPenaltyAssets =
      MathLib.wMulUp(sourceAssets, penalty) +
      MathLib.wMulUp(idleAssets, penalty);

    for (const marketParams of [sourceMarket, targetMarket]) {
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

    const vault = await deployVaultV2(anvilClient, targetMarket.loanToken);
    await submitAndAcceptVaultV2Call(anvilClient, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setIsAllocator",
        args: [client.account.address, true],
      }),
    });

    const sourceAdapter = await deployMorphoMarketV1AdapterV2(
      anvilClient,
      vault,
    );
    const targetAdapter = sourceAdapter;

    await submitAndAcceptVaultV2Call(anvilClient, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "addAdapter",
        args: [sourceAdapter],
      }),
    });

    const idsData = new Set(
      [sourceMarket, targetMarket].flatMap((marketParams) => [
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["this", sourceAdapter],
        ),
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["collateralToken", marketParams.collateralToken],
        ),
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }, marketParamsAbi],
          ["this/marketParams", sourceAdapter, marketParams],
        ),
      ]),
    );

    for (const idData of idsData) {
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
          args: [idData, MathLib.WAD],
        }),
      });
    }

    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "setLiquidityAdapterAndData",
      args: [
        sourceAdapter,
        encodeAbiParameters([marketParamsAbi], [sourceMarket]),
      ],
    });
    await client.deal({
      account: client.account.address,
      erc20: targetMarket.loanToken,
      amount: sourceDeposit,
    });
    await client.approve({
      address: targetMarket.loanToken,
      args: [vault, sourceDeposit],
    });
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [sourceDeposit, client.account.address],
    });
    await client.deal({
      account: vault,
      erc20: targetMarket.loanToken,
      amount: initialIdleAssets,
    });

    const deploymentHash = await client.deployContract({
      abi: allocatorAbi,
      bytecode: allocatorCode,
    });
    const deploymentReceipt = await client.waitForTransactionReceipt({
      hash: deploymentHash,
    });
    const allocator = deploymentReceipt.contractAddress;
    assert(allocator != null);

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
      abi: allocatorAbi,
      functionName: "setIsActiveAdapter",
      args: [vault, sourceAdapter, true],
    });
    await client.writeContract({
      address: allocator,
      abi: allocatorAbi,
      functionName: "setAbsoluteCap",
      args: [vault, targetAdapter, targetMarket, maxUint128],
    });
    await client.writeContract({
      address: allocator,
      abi: allocatorAbi,
      functionName: "setCanPullFromMarket",
      args: [vault, sourceAdapter, sourceMarket, true],
    });
    await client.writeContract({
      address: allocator,
      abi: allocatorAbi,
      functionName: "setCanPullFromIdle",
      args: [vault, true],
    });
    await client.writeContract({
      address: allocator,
      abi: allocatorAbi,
      functionName: "setPenalty",
      args: [vault, penalty],
    });

    await supplyCollateral({
      client: anvilClient,
      chainId: base.id,
      market: targetMarket,
      collateralAmount,
    });
    await client.deal({
      account: client.account.address,
      erc20: targetMarket.loanToken,
      amount: totalPenaltyAssets,
    });

    const reallocations: readonly VaultV2BlueReallocation[] = [
      {
        allocator,
        type: "bluePublicAllocator",
        vault,
        from: {
          type: "market",
          adapter: sourceAdapter,
          marketParams: sourceMarket,
        },
        to: { adapter: targetAdapter },
        assets: sourceAssets,
        penalty,
      },
      {
        allocator,
        type: "bluePublicAllocator",
        vault,
        from: { type: "idle" },
        to: { adapter: targetAdapter },
        assets: idleAssets,
        penalty,
      },
    ];

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(targetMarket, base.id);
    const positionData = await market.getPositionData(client.account.address);
    const borrow = market.borrow({
      userAddress: client.account.address,
      amount: borrowAmount,
      positionData,
      reallocations,
    });
    const requirements = await borrow.getRequirements();
    const approval = requirements.find(isRequirementApproval);
    const authorization = requirements.find(isRequirementBlueAuthorization);
    assert(approval != null);
    assert(authorization != null);
    await client.sendTransaction(approval);
    await client.sendTransaction(authorization);

    const [sourcePositionBefore, targetPositionBefore, vaultBalanceBefore] =
      await Promise.all([
        readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "position",
          args: [sourceMarket.id, sourceAdapter],
        }),
        readContractRestructured(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "position",
          args: [targetMarket.id, targetAdapter],
        }),
        client.readContract({
          address: targetMarket.loanToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [vault],
        }),
      ]);

    await client.sendTransaction(borrow.buildTx());

    const [
      sourcePositionAfter,
      targetPositionAfter,
      vaultBalanceAfter,
      bundlerBalanceAfter,
      allocatorAllowanceAfter,
    ] = await Promise.all([
      readContractRestructured(client, {
        address: morpho,
        abi: blueAbi,
        functionName: "position",
        args: [sourceMarket.id, sourceAdapter],
      }),
      readContractRestructured(client, {
        address: morpho,
        abi: blueAbi,
        functionName: "position",
        args: [targetMarket.id, targetAdapter],
      }),
      client.readContract({
        address: targetMarket.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [vault],
      }),
      client.readContract({
        address: targetMarket.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [bundler3.bundler3],
      }),
      client.readContract({
        address: targetMarket.loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [bundler3.bundler3, allocator],
      }),
    ]);

    expect(sourcePositionAfter.supplyShares).toBeLessThan(
      sourcePositionBefore.supplyShares,
    );
    expect(targetPositionBefore.supplyShares).toBe(0n);
    expect(targetPositionAfter.supplyShares).toBeGreaterThan(0n);
    expect(vaultBalanceBefore).toBe(initialIdleAssets);
    expect(vaultBalanceAfter).toBe(
      vaultBalanceBefore + totalPenaltyAssets - idleAssets,
    );
    expect(bundlerBalanceAfter).toBe(0n);
    expect(allocatorAllowanceAfter).toBe(0n);
  });

  test("executes the simulated zero-elapsed relative-cap maximum", async ({
    client,
  }) => {
    const anvilClient = client as AnvilTestClient;
    const { morpho } = getChainAddresses(base.id);
    const depositAssets = parseUnits("100", 6);
    const seedAssets = parseUnits("1", 6);
    const postLossIdleAssets = parseUnits("89", 6);
    const relativeCap = MathLib.WAD / 2n;

    const marketState = await readContractRestructured(client, {
      address: morpho,
      abi: blueAbi,
      functionName: "market",
      args: [targetMarket.id],
    });
    if (marketState.lastUpdate === 0n) {
      await client.writeContract({
        address: morpho,
        abi: blueAbi,
        functionName: "createMarket",
        args: [targetMarket],
      });
    }

    const vault = await deployVaultV2(anvilClient, targetMarket.loanToken);
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
        ["collateralToken", targetMarket.collateralToken],
      ),
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, marketParamsAbi],
        ["this/marketParams", targetAdapter, targetMarket],
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

    const deploymentHash = await client.deployContract({
      abi: allocatorAbi,
      bytecode: allocatorCode,
    });
    const deploymentReceipt = await client.waitForTransactionReceipt({
      hash: deploymentHash,
    });
    const allocator = deploymentReceipt.contractAddress;
    assert(allocator != null);

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
      abi: allocatorAbi,
      functionName: "setIsActiveAdapter",
      args: [vault, targetAdapter, true],
    });
    await client.writeContract({
      address: allocator,
      abi: allocatorAbi,
      functionName: "setAbsoluteCap",
      args: [vault, targetAdapter, targetMarket, maxUint128],
    });
    await client.writeContract({
      address: allocator,
      abi: allocatorAbi,
      functionName: "setCanPullFromIdle",
      args: [vault, true],
    });

    await client.deal({
      account: client.account.address,
      erc20: targetMarket.loanToken,
      amount: depositAssets,
    });
    await client.approve({
      address: targetMarket.loanToken,
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
      abi: allocatorAbi,
      functionName: "allocateFromIdle",
      args: [vault, targetAdapter, targetMarket, seedAssets, 0n],
    });

    // Change the token balance without mining so the snapshot timestamp still
    // equals lastUpdate while real vault assets are below stored _totalAssets.
    await client.deal({
      account: vault,
      erc20: targetMarket.loanToken,
      amount: postLossIdleAssets,
    });

    const [vaultData, targetMarketData, block] = await Promise.all([
      fetchAccrualVaultV2(vault, client),
      fetchMarket(targetMarket.id, client),
      client.getBlock(),
    ]);
    const allocatorData = await fetchVaultV2PublicAllocatorData(
      allocator,
      vaultData,
      client,
    );
    const targetMarketParamsId = keccak256(targetIdData[2]);
    const targetAllocation = allocatorData.allocations[targetMarketParamsId];
    assert(targetAllocation != null);
    const realTotalAssets = vaultData.accrualAdapters.reduce(
      (assets, adapter) => assets + adapter.realAssets(block.timestamp),
      vaultData.assetBalance,
    );
    const expectedMaximum =
      MathLib.wMulDown(realTotalAssets, relativeCap) -
      targetAllocation.allocation;
    const reallocationData = new VaultV2ReallocationData({
      chainId: base.id,
      allocator,
      markets: { [targetMarket.id]: targetMarketData },
      vaults: { [vault]: vaultData },
      allocations: { [vault]: allocatorData.allocations },
      publicAllocatorConfigs: {
        [vault]: allocatorData.publicAllocatorConfig,
      },
      marketPublicAllocatorConfigs: {
        [vault]: allocatorData.marketPublicAllocatorConfigs,
      },
    });

    expect(block.timestamp).toBe(vaultData.lastUpdate);
    expect(realTotalAssets).toBeLessThan(vaultData._totalAssets);
    const result = reallocationData.computeVaultV2Reallocations(
      targetMarket.id,
      { timestamp: block.timestamp },
    );
    expect(result.reallocations).toHaveLength(1);
    expect(result.reallocations[0]?.assets).toBe(expectedMaximum);

    await client.writeContract({
      address: allocator,
      abi: allocatorAbi,
      functionName: "allocateFromIdle",
      args: [
        vault,
        targetAdapter,
        targetMarket,
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
  });
});
