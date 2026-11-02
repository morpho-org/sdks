import {
  type AccrualVaultV2,
  DEAD_ADDRESS,
  getChainAddresses,
  type MarketId,
  type MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  fetchMarketParams,
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
  erc4626Abi,
  type Hex,
  isAddress,
  maxUint128,
  maxUint256,
  parseEther,
  parseEventLogs,
  toHex,
} from "viem";
import {
  InsufficientDeadSharesError,
  MIN_DEAD_SHARES,
  MIN_VAULT_V2_DEAD_ASSETS,
  validateVaultV2DeadShares,
} from "../../src/index.js";
import { seedDeadSupply } from "./blue.js";

export async function createVaultV2(params: {
  client: AnvilTestClient;
  asset: Address;
  chainId: number;
  salt?: Hex;
}) {
  const { client, asset, chainId, salt = toHex(0n, { size: 32 }) } = params;
  const { vaultV2Factory } = getChainAddresses(chainId);

  if (!vaultV2Factory) {
    throw new Error(`VaultV2 factory not found for chain ${chainId}`);
  }

  const txHash = await client.writeContract({
    address: vaultV2Factory,
    abi: vaultV2FactoryAbi,
    functionName: "createVaultV2",
    args: [client.account?.address, asset, salt],
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

export const deployVaultV2 = async (params: {
  readonly client: AnvilTestClient;
  readonly asset: Address;
  readonly salt?: Hex;
}) => {
  const { client, asset, salt } = params;
  await client.deal({ amount: parseEther("1") });
  const { address: vault } = await createVaultV2({
    client,
    asset,
    chainId: client.chain.id,
    salt,
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
 * caller's deposit across markets. Optionally configures the vault's annual management fee for the
 * test account and its `maxRate` (the per-second WAD cap on total-assets growth).
 */
export const setUpSingleAdapterVaultV2 = async (
  client: AnvilTestClient,
  params: {
    readonly asset: Address;
    readonly markets: readonly MarketParams[];
    readonly forceDeallocatePenalty?: bigint;
    readonly liquidityMarket?: MarketParams;
    readonly managementFee?: bigint;
    readonly maxRate?: bigint;
    readonly salt?: Hex;
  },
) => {
  const vault = await deployVaultV2({
    client,
    asset: params.asset,
    salt: params.salt,
  });
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
  if (params.maxRate != null) {
    await submitAndAcceptVaultV2Call(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setMaxRate",
        args: [params.maxRate],
      }),
    });
  }
  if (params.managementFee != null) {
    await submitAndAcceptVaultV2Call(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setManagementFeeRecipient",
        args: [client.account.address],
      }),
    });
    await submitAndAcceptVaultV2Call(client, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "setManagementFee",
        args: [params.managementFee],
      }),
    });
  }

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
    // Set after the deposit and the allocations above so neither is auto-routed through the
    // liquidity adapter.
    if (params.liquidityMarket != null) {
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [
          adapter,
          encodeAbiParameters([marketParamsAbi], [params.liquidityMarket]),
        ],
      });
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

/**
 * Seeds the dead deposits a forked Vault V2, and every market or Vault V1 it can allocate to, lacks
 * to pass `validateVaultV2DeadShares`, then returns the passing snapshot. Restores the caller's token
 * balances afterwards.
 */
export async function seedVaultV2DeadDeposits(
  client: AnvilTestClient,
  vault: { readonly getData: () => Promise<AccrualVaultV2> },
) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const data = await vault.getData();
    try {
      // Throws to identify the next missing dead deposit.
      validateVaultV2DeadShares(data);
      return data;
    } catch (error) {
      if (!(error instanceof InsufficientDeadSharesError)) throw error;
      const failing = error.entity.at(-1)!;
      if (isAddress(failing)) {
        const asset = await client.readContract({
          address: failing,
          abi: erc4626Abi,
          functionName: "asset",
        });
        const balance = await client.balanceOf({ erc20: asset });
        await client.deal({ erc20: asset, amount: maxUint128 });
        await client.approve({ address: asset, args: [failing, maxUint256] });
        await client.writeContract({
          address: failing,
          abi: erc4626Abi,
          ...(error.reason === "deadShares"
            ? { functionName: "mint", args: [MIN_DEAD_SHARES, DEAD_ADDRESS] }
            : {
                functionName: "deposit",
                args: [MIN_VAULT_V2_DEAD_ASSETS, DEAD_ADDRESS],
              }),
        });
        await client.approve({ address: asset, args: [failing, 0n] });
        await client.deal({ erc20: asset, amount: balance });
      } else
        await seedDeadSupply({
          client,
          chainId: client.chain.id,
          market: await fetchMarketParams(failing as MarketId, client),
        });
    }
  }
  throw new Error("could not seed the vault's dead deposits");
}
