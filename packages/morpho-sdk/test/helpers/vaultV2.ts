import {
  getChainAddresses,
  type MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  morphoMarketV1AdapterV2FactoryAbi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  maxUint128,
  parseEther,
  parseEventLogs,
  toHex,
} from "viem";

export async function createVaultV2(params: {
  client: AnvilTestClient;
  asset: Address;
  chainId: number;
}) {
  const { client, asset, chainId } = params;
  const { vaultV2Factory } = getChainAddresses(chainId);

  if (!vaultV2Factory) {
    throw new Error(`VaultV2 factory not found for chain ${chainId}`);
  }

  const txHash = await client.writeContract({
    address: vaultV2Factory,
    abi: vaultV2FactoryAbi,
    functionName: "createVaultV2",
    args: [client.account?.address, asset, toHex(0n, { size: 32 })],
  });

  const txReceipt = await client.waitForTransactionReceipt({
    hash: txHash,
  });

  const [vaultCreatedEvent] = parseEventLogs({
    abi: vaultV2FactoryAbi,
    logs: txReceipt.logs,
    eventName: "CreateVaultV2",
  });

  if (!vaultCreatedEvent) {
    throw new Error("Could not find CreateVault event in transaction receipt");
  }

  const decoded = decodeEventLog({
    abi: vaultV2FactoryAbi,
    data: vaultCreatedEvent.data,
    topics: vaultCreatedEvent.topics,
  });

  const vaultAddress = decoded.args.newVaultV2;

  return { address: vaultAddress };
}

export const submitAndAcceptVaultV2Call = async (
  client: AnvilTestClient,
  params: { readonly vault: Address; readonly data: Hex },
) => {
  const { vault, data } = params;
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "submit",
    args: [data],
  });
  const hash = await client.sendTransaction({ to: vault, data });
  await client.waitForTransactionReceipt({ hash });
};

export const deployVaultV2 = async (
  client: AnvilTestClient,
  asset: Address,
) => {
  await client.deal({ amount: parseEther("1") });
  const { address: vault } = await createVaultV2({
    client,
    asset,
    chainId: client.chain.id,
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "setCurator",
    args: [client.account.address],
  });

  return vault;
};

/**
 * Deploys a Vault V2 with exactly one MorphoMarketV1AdapterV2, uncapped over the given markets.
 *
 * Produces the only vault shape `VaultExitBundlesV1` Vault V2 exits accept: `adaptersLength() == 1`
 * and a markets-based adapter. Returns the vault, its adapter, and a helper that allocates the
 * caller's deposit across markets.
 */
export const setUpSingleAdapterVaultV2 = async (
  client: AnvilTestClient,
  params: {
    readonly asset: Address;
    readonly markets: readonly MarketParams[];
    readonly forceDeallocatePenalty?: bigint;
    readonly liquidityMarket?: MarketParams;
  },
) => {
  const vault = await deployVaultV2(client, params.asset);
  await submitAndAcceptVaultV2Call(client, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [client.account.address, true],
    }),
  });

  const adapter = await deployMorphoMarketV1AdapterV2(client, vault);
  await submitAndAcceptVaultV2Call(client, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "addAdapter",
      args: [adapter],
    }),
  });

  const capIds = [
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      ["this", adapter],
    ),
    ...params.markets.flatMap((market) => [
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["collateralToken", market.collateralToken],
      ),
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, marketParamsAbi],
        ["this/marketParams", adapter, market],
      ),
    ]),
  ];
  for (const id of capIds) {
    await submitAndAcceptVaultV2Call(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [id, maxUint128],
      }),
    });
    await submitAndAcceptVaultV2Call(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseRelativeCap",
        args: [id, MathLib.WAD],
      }),
    });
  }

  if (params.forceDeallocatePenalty != null) {
    await submitAndAcceptVaultV2Call(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setForceDeallocatePenalty",
        args: [adapter, params.forceDeallocatePenalty],
      }),
    });
  }

  // Set last so the deposit below is not auto-allocated through the liquidity adapter.
  const setLiquidityMarket = async (market: MarketParams) => {
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "setLiquidityAdapterAndData",
      args: [adapter, encodeAbiParameters([marketParamsAbi], [market])],
    });
  };

  /** Deposits `assets` and allocates the given per-market amounts into the adapter. */
  const depositAndAllocate = async (allocations: {
    readonly assets: bigint;
    readonly perMarket: readonly { market: MarketParams; assets: bigint }[];
  }) => {
    await client.deal({ erc20: params.asset, amount: allocations.assets });
    await client.approve({
      address: params.asset,
      args: [vault, allocations.assets],
    });
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [allocations.assets, client.account.address],
    });
    for (const { market, assets } of allocations.perMarket) {
      if (assets <= 0n) continue;
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "allocate",
        args: [
          adapter,
          encodeAbiParameters([marketParamsAbi], [market]),
          assets,
        ],
      });
    }
    if (params.liquidityMarket != null) {
      await setLiquidityMarket(params.liquidityMarket);
    }
    // Leave the account holding only what the exit pays out.
    await client.deal({ erc20: params.asset, amount: 0n });
  };

  return { vault, adapter, depositAndAllocate };
};

export const deployMorphoMarketV1AdapterV2 = async (
  client: AnvilTestClient,
  vault: Address,
) => {
  const { morphoMarketV1AdapterV2Factory } = getChainAddresses(client.chain.id);
  const hash = await client.writeContract({
    address: morphoMarketV1AdapterV2Factory!,
    abi: morphoMarketV1AdapterV2FactoryAbi,
    functionName: "createMorphoMarketV1AdapterV2",
    args: [vault],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const event = receipt.logs
    .map((log) => {
      try {
        return decodeEventLog({
          abi: morphoMarketV1AdapterV2FactoryAbi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return undefined;
      }
    })
    .find(
      (candidate) =>
        candidate?.eventName === "CreateMorphoMarketV1AdapterV2" &&
        "morphoMarketV1AdapterV2" in candidate.args,
    );
  if (event?.eventName !== "CreateMorphoMarketV1AdapterV2") {
    throw new Error("No CreateMorphoMarketV1AdapterV2 event found.");
  }

  return event.args.morphoMarketV1AdapterV2;
};
