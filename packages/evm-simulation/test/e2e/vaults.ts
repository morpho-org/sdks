import {
  getChainAddresses,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import {
  metaMorphoAbi,
  metaMorphoFactoryAbi,
  morphoMarketV1AdapterV2FactoryAbi,
  vaultV2Abi,
} from "@morpho-org/morpho-sdk/abis";
import {
  DEAD_ADDRESS,
  MIN_DEAD_SHARES,
} from "@morpho-org/morpho-sdk/constants";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  type Hex,
  maxUint128,
  maxUint256,
  parseEventLogs,
  parseUnits,
  zeroHash,
} from "viem";
import { deployIdleVaultV2, seededMarketData } from "../setup.js";
import { type E2eAsset, fundE2eAsset } from "./assets.js";
import { createE2eMarket } from "./setup.js";

/** Creates a funded MetaMorpho vault with a single market and real dead deposits. */
export const createE2eVaultV1 = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly asset: E2eAsset;
    readonly seed: boolean;
  },
) => {
  const { chainId, asset } = params;
  const owner = client.account.address;
  const market = await createE2eMarket(client, {
    chainId,
    loanToken: asset.address,
  });
  const { decimals } = await fundE2eAsset(client, {
    token: asset.address,
    amount: "40",
  });
  // The returned snapshot is not needed until the vault has its allocation.
  await seededMarketData(client, market);
  const { result: vault, request } = await client.simulateContract({
    address: getChainAddresses(chainId).metaMorphoFactory!,
    abi: metaMorphoFactoryAbi,
    functionName: "createMetaMorpho",
    args: [owner, 0n, asset.address, "Simulation V1", "simV1", zeroHash],
  });
  await client.writeContract(request);
  const amount = parseUnits("10", decimals);
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [market, maxUint128],
  });
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "acceptCap",
    args: [market],
  });
  await client.writeContract({
    address: vault,
    abi: metaMorphoAbi,
    functionName: "setSupplyQueue",
    args: [[market.id]],
  });
  await client.approve({ address: asset.address, args: [vault, maxUint256] });
  const deadAssets = await client.readContract({
    address: vault,
    abi: erc4626Abi,
    functionName: "previewMint",
    args: [MIN_DEAD_SHARES],
  });
  await client.writeContract({
    address: vault,
    abi: erc4626Abi,
    functionName: "deposit",
    args: [deadAssets, DEAD_ADDRESS],
  });
  if (params.seed)
    await client.writeContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "deposit",
      args: [amount, owner],
    });
  const entity = client
    .extend(morphoViemExtension({ supportSignature: true }))
    .morpho.vaultV1(vault, chainId);
  return {
    vault,
    entity,
    market,
    amount,
    decimals,
    tracked: {
      wallets: [owner, vault, getChainAddresses(chainId).blue],
      tokens: [asset.address, vault],
    },
  };
};

const accept = async (
  client: AnvilTestClient<Chain>,
  params: { readonly vault: Address; readonly data: Hex },
) => {
  await client.writeContract({
    address: params.vault,
    abi: vaultV2Abi,
    functionName: "submit",
    args: [params.data],
  });
  await client.sendTransaction({ to: params.vault, data: params.data });
};

/** Creates a single-market adapter vault; optional owner fees remain pending for its exit. */
export const createE2eVaultV2 = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly chainId: number;
    readonly asset: E2eAsset;
    readonly fees: boolean;
    readonly liquidity: boolean;
  },
) => {
  const { chainId, asset } = params;
  const owner = client.account.address;
  const market = await createE2eMarket(client, {
    chainId,
    loanToken: asset.address,
  });
  const { decimals } = await fundE2eAsset(client, {
    token: asset.address,
    amount: "40",
  });
  // The adapter needs the market's dead supply before its first allocation.
  await seededMarketData(client, market);
  const vault = await deployIdleVaultV2(client, asset.address);
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "setCurator",
    args: [owner],
  });
  await accept(client, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [owner, true],
    }),
  });
  const hash = await client.writeContract({
    address: getChainAddresses(chainId).morphoMarketV1AdapterV2Factory!,
    abi: morphoMarketV1AdapterV2FactoryAbi,
    functionName: "createMorphoMarketV1AdapterV2",
    args: [vault],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const [created] = parseEventLogs({
    abi: morphoMarketV1AdapterV2FactoryAbi,
    eventName: "CreateMorphoMarketV1AdapterV2",
    logs: receipt.logs,
  });
  if (!created) throw new Error("Missing adapter creation event");
  const adapter = created.args.morphoMarketV1AdapterV2;
  await accept(client, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "addAdapter",
      args: [adapter],
    }),
  });
  for (const id of [
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["this", adapter],
    ),
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["collateralToken", market.collateralToken],
    ),
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, marketParamsAbi],
      ["this/marketParams", adapter, market],
    ),
  ]) {
    await accept(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [id, maxUint128],
      }),
    });
    await accept(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseRelativeCap",
        args: [id, MathLib.WAD],
      }),
    });
  }
  if (params.fees) {
    for (const call of [
      { functionName: "setPerformanceFeeRecipient", args: [owner] },
      { functionName: "setManagementFeeRecipient", args: [owner] },
      { functionName: "setPerformanceFee", args: [MathLib.WAD / 10n] },
    ] as const)
      await accept(client, {
        vault,
        data: encodeFunctionData({ abi: vaultV2Abi, ...call }),
      });
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "setMaxRate",
      args: [MathLib.WAD / 31_536_000n],
    });
  }
  const amount = parseUnits("10", decimals);
  await client.approve({ address: asset.address, args: [vault, maxUint256] });
  await client.writeContract({
    address: vault,
    abi: erc4626Abi,
    functionName: "deposit",
    args: [amount, owner],
  });
  const allocation = await client.balanceOf({
    erc20: asset.address,
    owner: vault,
  });
  const data = encodeAbiParameters([marketParamsAbi], [market]);
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "allocate",
    args: [adapter, data, allocation],
  });
  if (params.liquidity)
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "setLiquidityAdapterAndData",
      args: [adapter, data],
    });
  if (params.fees) {
    await client.writeContract({
      address: asset.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [vault, parseUnits("1", decimals)],
    });
    await client.setNextBlockTimestamp({
      timestamp: (await client.getBlock()).timestamp + 31_536_000n,
    });
    await client.mine({ blocks: 1 });
  }
  const entity = client
    .extend(morphoViemExtension({ supportSignature: true }))
    .morpho.vaultV2(vault, chainId);
  return {
    vault,
    entity,
    market,
    adapter,
    amount,
    decimals,
    allocation,
    tracked: {
      wallets: [owner, vault, adapter, getChainAddresses(chainId).blue],
      tokens: [asset.address, vault],
    },
  };
};
