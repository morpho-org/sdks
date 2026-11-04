import {
  type AccrualPosition,
  getChainAddresses,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  readContractRestructured,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  encodeFunctionData,
  maxUint128,
  parseEther,
  parseUnits,
  toHex,
} from "viem";
import { mainnet } from "viem/chains";
import { assert, expect } from "vitest";
import type { BlueActions } from "../../src/entities/blue/blue.js";
import type { VaultV2BlueReallocationData } from "../../src/entities/vaultV2BlueReallocationData.js";
import { morphoViemExtension } from "../../src/index.js";
import { borrow, supplyCollateral, supplyLoan } from "./blue.js";
import {
  setUpSingleAdapterVaultV2,
  submitAndAcceptVaultV2Call,
} from "./vaultV2.js";

const sourceMarket = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
});

export const destinationMarket = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.86", 18),
});

export const referralRecipient =
  "0x0000000000000000000000000000000000000002" as Address;
export const day = 24n * 60n * 60n;

type VaultFixture = {
  readonly vault: Address;
  readonly adapter: Address;
  readonly penalty: bigint;
};

export type Scenario = {
  readonly client: AnvilTestClient;
  readonly source: BlueActions;
  readonly destination: BlueActions;
  readonly sourcePosition: AccrualPosition;
  readonly destinationPosition: AccrualPosition;
  readonly amount: bigint;
  readonly reallocationData: VaultV2BlueReallocationData;
  readonly vaults: readonly VaultFixture[];
};

async function createVault(params: {
  readonly client: AnvilTestClient;
  readonly assets: bigint;
  readonly penalty: bigint;
  readonly salt: `0x${string}`;
  readonly liquiditySource?: "idle" | "market";
}): Promise<VaultFixture> {
  const { client, assets, penalty, salt, liquiditySource = "idle" } = params;
  const { vault, adapter, depositAndAllocate } =
    await setUpSingleAdapterVaultV2(client, {
      asset: sourceMarket.loanToken,
      markets:
        liquiditySource === "market"
          ? [sourceMarket, destinationMarket]
          : [destinationMarket],
      salt,
    });
  const { vaultV2BluePublicAllocator: allocator } = getChainAddresses(
    mainnet.id,
  );
  assert(allocator != null);
  await submitAndAcceptVaultV2Call(client, {
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
    args: [vault, adapter, destinationMarket, maxUint128],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setCanPullFromIdle",
    args: [vault, true],
  });
  if (liquiditySource === "market") {
    await client.writeContract({
      address: allocator,
      abi: vaultV2BluePublicAllocatorAbi,
      functionName: "setCanPullFromMarket",
      args: [vault, adapter, sourceMarket, true],
    });
  }
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setPenalty",
    args: [vault, penalty],
  });
  await depositAndAllocate({
    assets,
    perMarket:
      liquiditySource === "market" ? [{ market: sourceMarket, assets }] : [],
  });
  return { vault, adapter, penalty };
}

export async function createScenario(
  client: AnvilTestClient,
  vaultConfigs: readonly {
    readonly assets: bigint;
    readonly penalty: bigint;
    readonly liquiditySource?: "idle" | "market";
  }[],
): Promise<Scenario> {
  const morpho = client.extend(morphoViemExtension()).morpho;
  const source = morpho.blue(sourceMarket, mainnet.id);
  const destination = morpho.blue(destinationMarket, mainnet.id);
  const { blue } = getChainAddresses(mainnet.id);
  assert(blue != null);
  const marketState = await readContractRestructured(client, {
    address: blue,
    abi: blueAbi,
    functionName: "market",
    args: [destinationMarket.id],
  });
  if (marketState.lastUpdate === 0n) {
    await client.writeContract({
      address: blue,
      abi: blueAbi,
      functionName: "createMarket",
      args: [destinationMarket],
    });
  }

  await supplyLoan({
    client,
    chainId: mainnet.id,
    market: sourceMarket,
    supplyAmount: parseEther("4"),
  });
  await supplyLoan({
    client,
    chainId: mainnet.id,
    market: destinationMarket,
    supplyAmount: parseEther("0.2"),
  });
  await supplyCollateral({
    client,
    chainId: mainnet.id,
    market: sourceMarket,
    collateralAmount: parseEther("5"),
  });
  await borrow({
    client,
    chainId: mainnet.id,
    market: sourceMarket,
    borrowAmount: parseEther("1"),
  });
  await supplyCollateral({
    client,
    chainId: mainnet.id,
    market: destinationMarket,
    collateralAmount: parseEther("5"),
  });
  await borrow({
    client,
    chainId: mainnet.id,
    market: destinationMarket,
    borrowAmount: parseEther("0.1"),
  });
  const [sourcePositionBeforeAccrual, destinationPositionBeforeAccrual] =
    await Promise.all([
      source.getPositionData(client.account.address),
      destination.getPositionData(client.account.address),
    ]);
  const initialQuoteTimestamp =
    MathLib.max(
      Time.timestamp(),
      sourcePositionBeforeAccrual.market.lastUpdate,
      destinationPositionBeforeAccrual.market.lastUpdate,
    ) + Time.s.from.h(2n);
  const sourceDebtBeforeAccrual = sourcePositionBeforeAccrual.accrueInterest(
    initialQuoteTimestamp,
  ).borrowAssets;
  const destinationDebtBeforeAccrual =
    destinationPositionBeforeAccrual.accrueInterest(
      initialQuoteTimestamp,
    ).borrowAssets;

  const vaults: VaultFixture[] = [];
  for (const { assets, penalty, liquiditySource } of vaultConfigs) {
    vaults.push(
      await createVault({
        client,
        assets,
        penalty,
        liquiditySource,
        salt: toHex(BigInt(vaults.length), { size: 32 }),
      }),
    );
  }

  const before = await client.getBlock();
  await client.setNextBlockTimestamp({
    timestamp: MathLib.max(before.timestamp, Time.timestamp()) + day,
  });
  await client.mine({ blocks: 1 });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "accrueInterest",
    args: [sourceMarket],
  });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "accrueInterest",
    args: [destinationMarket],
  });
  const block = await client.getBlock();
  const [sourcePosition, destinationPosition] = await Promise.all([
    source.getPositionData(client.account.address),
    destination.getPositionData(client.account.address),
  ]);
  const quoteTimestamp =
    MathLib.max(
      Time.timestamp(),
      sourcePosition.market.lastUpdate,
      destinationPosition.market.lastUpdate,
    ) + Time.s.from.h(2n);
  expect(
    sourcePosition.accrueInterest(quoteTimestamp).borrowAssets,
  ).toBeGreaterThan(sourceDebtBeforeAccrual);
  expect(
    destinationPosition.accrueInterest(quoteTimestamp).borrowAssets,
  ).toBeGreaterThan(destinationDebtBeforeAccrual);
  const amount = sourcePosition.accrueInterest(quoteTimestamp).borrowAssets;
  const reallocationData = await destination.getVaultV2BlueReallocationData({
    vaultAddresses: vaults.map(({ vault }) => vault),
    block,
  });
  return {
    client,
    source,
    destination,
    sourcePosition,
    destinationPosition,
    amount,
    reallocationData,
    vaults,
  };
}
