import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  getChainAddresses,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  morphoMarketV1AdapterV2FactoryAbi,
  vaultV2Abi,
} from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  maxUint128,
  parseEventLogs,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  CbbtcUsdcBlue,
  WbtcUsdcSourceMarket,
} from "../../../test/fixtures/blue.js";
import { createVaultV2 } from "../../../test/helpers/vaultV2.js";
import {
  InsufficientBlueBalanceForInKindRedeemError,
  isRequirementApproval,
  isRequirementSignature,
  morphoViemExtension,
} from "../../index.js";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const setupMarkets = [CbbtcUsdcBlue, WbtcUsdcSourceMarket] as const;

// VaultExitBundlesV1 is deployed at this block. Keep the newer fork local so the shared fork
// remains pinned to the historical state expected by the existing Morpho SDK integration suite.
const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  chainId: mainnet.id,
  forkBlockNumber: 25_720_868n,
});

const submitAndAccept = async (params: {
  readonly client: AnvilTestClient;
  readonly vault: Address;
  readonly data: `0x${string}`;
}) => {
  await params.client.writeContract({
    address: params.vault,
    abi: vaultV2Abi,
    functionName: "submit",
    args: [params.data],
  });
  await params.client.sendTransaction({
    to: params.vault,
    data: params.data,
  });
};

describe("MorphoVaultV2.inKindRedeem integration", () => {
  test("accepts the two-field-domain permit and exits with a penalty", async ({
    client,
  }) => {
    // Clear the test account's mainnet EIP-7702 delegation so permit validation uses ECDSA.
    await client.setCode({
      address: client.account.address,
      bytecode: "0x",
    });
    const { address: vaultAddress } = await createVaultV2({
      client,
      asset: USDC,
      chainId: mainnet.id,
    });
    await client.writeContract({
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "setCurator",
      args: [client.account.address],
    });
    await submitAndAccept({
      client,
      vault: vaultAddress,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setIsAllocator",
        args: [client.account.address, true],
      }),
    });

    const { morphoMarketV1AdapterV2Factory } = getChainAddresses(mainnet.id);
    if (morphoMarketV1AdapterV2Factory == null) {
      throw new Error("MorphoMarketV1AdapterV2 factory not found");
    }
    const adapterHash = await client.writeContract({
      address: morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "createMorphoMarketV1AdapterV2",
      args: [vaultAddress],
    });
    const adapterReceipt = await client.waitForTransactionReceipt({
      hash: adapterHash,
    });
    const [adapterEvent] = parseEventLogs({
      abi: morphoMarketV1AdapterV2FactoryAbi,
      logs: adapterReceipt.logs,
      eventName: "CreateMorphoMarketV1AdapterV2",
    });
    const adapterAddress = adapterEvent?.args.morphoMarketV1AdapterV2;
    if (adapterAddress == null) {
      throw new Error("MorphoMarketV1AdapterV2 deployment event not found");
    }

    await submitAndAccept({
      client,
      vault: vaultAddress,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "addAdapter",
        args: [adapterAddress],
      }),
    });
    await client.writeContract({
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "setLiquidityAdapterAndData",
      args: [
        adapterAddress,
        encodeAbiParameters([marketParamsAbi], [CbbtcUsdcBlue]),
      ],
    });

    const capIds = [
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", adapterAddress],
      ),
      ...setupMarkets.flatMap((market) => [
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }],
          ["collateralToken", market.collateralToken],
        ),
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }, marketParamsAbi],
          ["this/marketParams", adapterAddress, market],
        ),
      ]),
    ];
    for (const id of capIds) {
      await submitAndAccept({
        client,
        vault: vaultAddress,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "increaseAbsoluteCap",
          args: [id, maxUint128],
        }),
      });
      await submitAndAccept({
        client,
        vault: vaultAddress,
        data: encodeFunctionData({
          abi: vaultV2Abi,
          functionName: "increaseRelativeCap",
          args: [id, MathLib.WAD],
        }),
      });
    }

    const penalty = parseUnits("0.01", 18);
    await submitAndAccept({
      client,
      vault: vaultAddress,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setForceDeallocatePenalty",
        args: [adapterAddress, penalty],
      }),
    });

    const deposit = parseUnits("1000", 6);
    await client.deal({ erc20: USDC, amount: deposit });
    await client.approve({ address: USDC, args: [vaultAddress, deposit] });
    await client.writeContract({
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [deposit, client.account.address],
    });
    const reallocationAmount = deposit / 2n;
    await client.writeContract({
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "deallocate",
      args: [
        adapterAddress,
        encodeAbiParameters([marketParamsAbi], [CbbtcUsdcBlue]),
        reallocationAmount,
      ],
    });
    await client.writeContract({
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "allocate",
      args: [
        adapterAddress,
        encodeAbiParameters([marketParamsAbi], [WbtcUsdcSourceMarket]),
        reallocationAmount / 2n,
      ],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const [adapter] = vaultData.accrualAdapters;
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2)) {
      throw new Error("Expected a MorphoMarketV1AdapterV2 snapshot");
    }
    const marketParamsList = adapter.markets.map(({ params }) => params);
    const amount = parseUnits("900", 6);
    const initialVaultShares = await client.readContract({
      address: vaultAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const initialAssetBalance = await client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const initialSupplyShares = await Promise.all(
      setupMarkets.map(async ({ id }) => {
        return (await fetchAccrualPosition(client.account.address, id, client))
          .supplyShares;
      }),
    );

    expect(vaultData.forceDeallocatePenalties[adapterAddress]).toBe(penalty);
    expect(marketParamsList).toHaveLength(2);
    const exit = vault.inKindRedeem({
      amount,
      marketParamsList,
      vaultData,
      userAddress: client.account.address,
    });
    const [permitRequirement] = await exit.getRequirements();
    if (!isRequirementSignature(permitRequirement)) {
      throw new Error("Vault V2 shares permit requirement not found");
    }
    const permit = await permitRequirement.sign(client, client.account.address);
    await client.sendTransaction(exit.buildTx([permit]));

    const finalVaultShares = await client.readContract({
      address: vaultAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const finalAssetBalance = await client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const finalSupplyShares = await Promise.all(
      setupMarkets.map(async ({ id }) => {
        return (await fetchAccrualPosition(client.account.address, id, client))
          .supplyShares;
      }),
    );

    expect(finalVaultShares).toBeLessThan(initialVaultShares);
    expect(finalAssetBalance - initialAssetBalance).toBe(
      vaultData.assetBalance,
    );
    expect(
      finalSupplyShares.reduce((total, shares) => total + shares, 0n),
    ).toBeGreaterThan(
      initialSupplyShares.reduce((total, shares) => total + shares, 0n),
    );

    const { blue = getChainAddresses(mainnet.id).morpho } = getChainAddresses(
      mainnet.id,
    );
    await client.deal({ erc20: USDC, account: blue, amount: 0n });
    const balanceLimitedExit = vault.inKindRedeem({
      amount: 2n,
      marketParamsList: [WbtcUsdcSourceMarket],
      vaultData: await vault.getData(),
      userAddress: client.account.address,
    });
    await expect(balanceLimitedExit.getRequirements()).rejects.toBeInstanceOf(
      InsufficientBlueBalanceForInKindRedeemError,
    );
  });

  test("behavior: exits idle assets with an empty market list", async ({
    client,
  }) => {
    const { address: vaultAddress } = await createVaultV2({
      client,
      asset: USDC,
      chainId: mainnet.id,
    });
    await client.writeContract({
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "setCurator",
      args: [client.account.address],
    });

    const { morphoMarketV1AdapterV2Factory } = getChainAddresses(mainnet.id);
    if (morphoMarketV1AdapterV2Factory == null) {
      throw new Error("MorphoMarketV1AdapterV2 factory not found");
    }
    const adapterHash = await client.writeContract({
      address: morphoMarketV1AdapterV2Factory,
      abi: morphoMarketV1AdapterV2FactoryAbi,
      functionName: "createMorphoMarketV1AdapterV2",
      args: [vaultAddress],
    });
    const adapterReceipt = await client.waitForTransactionReceipt({
      hash: adapterHash,
    });
    const [adapterEvent] = parseEventLogs({
      abi: morphoMarketV1AdapterV2FactoryAbi,
      logs: adapterReceipt.logs,
      eventName: "CreateMorphoMarketV1AdapterV2",
    });
    const adapterAddress = adapterEvent?.args.morphoMarketV1AdapterV2;
    if (adapterAddress == null) {
      throw new Error("MorphoMarketV1AdapterV2 deployment event not found");
    }
    await submitAndAccept({
      client,
      vault: vaultAddress,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "addAdapter",
        args: [adapterAddress],
      }),
    });

    const deposit = parseUnits("100", 6);
    await client.deal({ erc20: USDC, amount: deposit });
    await client.approve({ address: USDC, args: [vaultAddress, deposit] });
    await client.writeContract({
      address: vaultAddress,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [deposit, client.account.address],
    });

    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(vaultAddress, mainnet.id);
    const vaultData = await vault.getData();
    const amount = deposit / 2n;
    const initialVaultShares = await client.readContract({
      address: vaultAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const initialAssetBalance = await client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });

    expect(vaultData.assetBalance).toBe(deposit);
    const exit = vault.inKindRedeem({
      amount,
      marketParamsList: [],
      vaultData,
      userAddress: client.account.address,
    });
    const [approval] = await exit.getRequirements();
    if (!isRequirementApproval(approval)) {
      throw new Error("VaultExitBundlesV1 approval requirement not found");
    }
    await client.sendTransaction(approval);
    await client.sendTransaction(exit.buildTx());

    const finalVaultShares = await client.readContract({
      address: vaultAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const finalAssetBalance = await client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });

    expect(finalVaultShares).toBeLessThan(initialVaultShares);
    expect(finalAssetBalance - initialAssetBalance).toBe(amount);
  });
});
