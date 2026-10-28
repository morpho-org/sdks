import {
  type AccrualPosition,
  getChainAddresses,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  fetchAccrualVaultV2,
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
  maxUint256,
  parseEther,
  parseUnits,
  toHex,
} from "viem";
import { mainnet } from "viem/chains";
import { assert, expect } from "vitest";
import type { BlueActions } from "../../../src/entities/blue/blue.js";
import type { VaultV2BlueReallocationData } from "../../../src/entities/vaultV2BlueReallocationData.js";
import {
  InsufficientSharedLiquidityError,
  morphoViemExtension,
} from "../../../src/index.js";
import type { VaultV2BlueReallocation } from "../../../src/types/sharedLiquidity.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";
import {
  setUpSingleAdapterVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";

const sourceMarket = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.945", 18),
});

const destinationMarket = new MarketParams({
  loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  oracle: "0x2a01EB9496094dA03c4E364Def50f5aD1280AD72",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: parseUnits("0.86", 18),
});

const referralRecipient =
  "0x0000000000000000000000000000000000000002" as Address;
const day = 24n * 60n * 60n;

type VaultFixture = {
  readonly vault: Address;
  readonly adapter: Address;
  readonly penalty: bigint;
};

type Scenario = {
  readonly client: AnvilTestClient;
  readonly source: BlueActions;
  readonly destination: BlueActions;
  readonly sourcePosition: AccrualPosition;
  readonly destinationPosition: AccrualPosition;
  readonly amount: bigint;
  readonly reallocationData: VaultV2BlueReallocationData;
  readonly vaults: readonly VaultFixture[];
};

const penaltyAssets = (
  reallocations: readonly { assets: bigint; penalty: bigint }[],
) =>
  reallocations.reduce(
    (total, leg) =>
      total + MathLib.mulDivUp(leg.assets, leg.penalty, MathLib.WAD),
    0n,
  );

async function createIdleVault(params: {
  readonly client: AnvilTestClient;
  readonly assets: bigint;
  readonly penalty: bigint;
  readonly salt: `0x${string}`;
}): Promise<VaultFixture> {
  const { client, assets, penalty, salt } = params;
  const { vault, adapter, depositAndAllocate } =
    await setUpSingleAdapterVaultV2(client, {
      asset: sourceMarket.loanToken,
      markets: [destinationMarket],
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
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setPenalty",
    args: [vault, penalty],
  });
  await depositAndAllocate({ assets, perMarket: [] });
  return { vault, adapter, penalty };
}

async function createScenario(
  client: AnvilTestClient,
  penalties: readonly { assets: bigint; penalty: bigint }[],
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
  for (const { assets, penalty } of penalties) {
    vaults.push(
      await createIdleVault({
        client,
        assets,
        penalty,
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

async function executeScenario(params: {
  readonly scenario: Scenario;
  readonly referralFeePct: bigint;
  readonly maxPenalty: bigint;
  readonly operationAmount?: bigint;
}): Promise<{
  readonly plan: {
    readonly reallocations: readonly VaultV2BlueReallocation[];
    readonly data: VaultV2BlueReallocationData;
  };
  readonly amount: bigint;
  readonly sourceAfter: AccrualPosition;
  readonly destinationAfter: AccrualPosition;
  readonly penalties: bigint;
  readonly referralFee: bigint;
}> {
  const {
    scenario,
    referralFeePct,
    maxPenalty,
    operationAmount = params.scenario.amount,
  } = params;
  const {
    client,
    source,
    destination,
    sourcePosition,
    destinationPosition,
    reallocationData,
    vaults,
  } = scenario;
  const plan = destination.getVaultV2BlueReallocations({
    reallocationData,
    options: {
      maxPenalty,
      operation: {
        type: "refinance",
        amount: operationAmount,
        referralFeePct,
      },
    },
  });
  expect(plan.reallocations.length).toBeGreaterThan(0);
  const penalties = penaltyAssets(plan.reallocations);
  const referralFee = MathLib.mulDivDown(
    operationAmount,
    referralFeePct,
    MathLib.WAD - referralFeePct,
  );
  const feeBefore = await client.balanceOf({
    erc20: destinationMarket.loanToken,
    owner: referralRecipient,
  });
  const vaultTotalsBefore = new Map(
    await Promise.all(
      vaults.map(async ({ vault }) => {
        const data = await fetchAccrualVaultV2(vault, client);
        const assets = data.accrualAdapters.reduce(
          (total, adapter) => total + adapter.realAssets(data.lastUpdate),
          data.assetBalance,
        );
        return [vault, assets] as const;
      }),
    ),
  );
  const action = source.refinance({
    userAddress: client.account.address,
    positionData: sourcePosition,
    destination: {
      marketParams: destinationMarket,
      positionData: destinationPosition,
    },
    reallocations: plan.reallocations,
    deadline: maxUint256,
    referralFeePct,
    referralFeeRecipient: referralRecipient,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(client, {
    requirements: await action.getRequirements(),
  });
  const transactionHash = await client.sendTransaction(
    action.buildTx(signatures),
  );
  const receipt = await client.getTransactionReceipt({ hash: transactionHash });
  const inclusionBlock = await client.getBlock({
    blockNumber: receipt.blockNumber,
  });
  const inclusionQuoteTimestamp = MathLib.max(
    inclusionBlock.timestamp,
    sourcePosition.market.lastUpdate,
    destinationPosition.market.lastUpdate,
  );
  const inclusionDebt = sourcePosition.accrueInterest(
    inclusionQuoteTimestamp,
  ).borrowAssets;
  const includedReferralFee = MathLib.mulDivDown(
    inclusionDebt,
    referralFeePct,
    MathLib.WAD - referralFeePct,
  );
  const [sourceAfter, destinationAfter, feeAfter] = await Promise.all([
    source.getPositionData(client.account.address),
    destination.getPositionData(client.account.address),
    client.balanceOf({
      erc20: destinationMarket.loanToken,
      owner: referralRecipient,
    }),
  ]);
  expect(sourceAfter.borrowShares).toBe(0n);
  expect(sourceAfter.collateral).toBe(0n);
  const destinationDebtBeforeRefinance = destinationPosition.accrueInterest(
    inclusionQuoteTimestamp,
  ).borrowAssets;
  const destinationDebtIncrease =
    destinationAfter.borrowAssets - destinationDebtBeforeRefinance;
  const expectedDebtIncrease = inclusionDebt + includedReferralFee + penalties;
  expect(destinationDebtIncrease).toBeGreaterThanOrEqual(expectedDebtIncrease);
  expect(destinationDebtIncrease).toBeLessThanOrEqual(
    expectedDebtIncrease + BigInt(plan.reallocations.length + 2),
  );
  expect(feeAfter - feeBefore).toBe(includedReferralFee);
  for (const { vault } of vaults) {
    const data = await fetchAccrualVaultV2(vault, client);
    const plannedPenalty = plan.reallocations
      .filter((leg) => leg.vault === vault)
      .reduce(
        (total, leg) =>
          total + MathLib.mulDivUp(leg.assets, leg.penalty, MathLib.WAD),
        0n,
      );
    const assets = data.accrualAdapters.reduce(
      (total, adapter) => total + adapter.realAssets(data.lastUpdate),
      data.assetBalance,
    );
    if (plannedPenalty > 0n) {
      const paidLegs = plan.reallocations.filter(
        (leg) => leg.vault === vault && leg.penalty > 0n,
      );
      // Each destination supply can lose at most one wei to share conversion.
      expect(assets + BigInt(paidLegs.length)).toBeGreaterThanOrEqual(
        (vaultTotalsBefore.get(vault) ?? 0n) + plannedPenalty,
      );
    }
  }
  expect(destinationAfter.market.totalBorrowAssets).toBeLessThanOrEqual(
    destinationAfter.market.totalSupplyAssets,
  );
  return {
    plan,
    amount: operationAmount,
    sourceAfter,
    destinationAfter,
    penalties,
    referralFee,
  };
}

test("refinances through one paid Vault V2 with quote-horizon interest and referral fee", async ({
  client,
}) => {
  const scenario = await createScenario(client as AnvilTestClient, [
    { assets: parseEther("2"), penalty: MathLib.WAD / 100n },
  ]);
  const result = await executeScenario({
    scenario,
    referralFeePct: MathLib.WAD / 100n,
    maxPenalty: MathLib.WAD / 100n,
  });
  expect(result.plan.reallocations).toHaveLength(1);
  expect(result.penalties).toBeGreaterThan(0n);
});

test("uses free liquidity before the paid refinance leg", async ({
  client,
}) => {
  const scenario = await createScenario(client as AnvilTestClient, [
    { assets: parseEther("0.4"), penalty: 0n },
    { assets: parseEther("2"), penalty: MathLib.WAD / 100n },
  ]);
  const result = await executeScenario({
    scenario,
    referralFeePct: MathLib.WAD / 100n,
    maxPenalty: MathLib.WAD / 100n,
  });
  const free = result.plan.reallocations.findIndex(
    ({ penalty }) => penalty === 0n,
  );
  const paid = result.plan.reallocations.findIndex(
    ({ penalty }) => penalty > 0n,
  );
  expect(free).toBeGreaterThanOrEqual(0);
  expect(paid).toBeGreaterThan(free);
  const paidLeg = result.plan.reallocations[paid];
  assert(paidLeg != null);
  const freeAssets = result.plan.reallocations
    .filter(({ penalty }) => penalty === 0n)
    .reduce((total, leg) => total + leg.assets, 0n);
  const planTimestamp = [
    scenario.reallocationData.timestamp ?? 0n,
    ...Object.values(scenario.reallocationData.markets).map(
      (market) => market?.lastUpdate ?? 0n,
    ),
    ...Object.values(scenario.reallocationData.vaults).map(
      (vaultSnapshot) => vaultSnapshot?.lastUpdate ?? 0n,
    ),
  ].reduce((latest, timestamp) => MathLib.max(latest, timestamp), 0n);
  const destinationLiquidity = scenario.reallocationData
    .getMarket(destinationMarket.id)
    .accrueInterest(planTimestamp).liquidity;
  const required =
    result.amount + result.referralFee - destinationLiquidity - freeAssets;
  const paidNetAssets =
    paidLeg.assets -
    MathLib.mulDivUp(paidLeg.assets, paidLeg.penalty, MathLib.WAD);
  const previousPaidNetAssets =
    paidLeg.assets -
    1n -
    MathLib.mulDivUp(paidLeg.assets - 1n, paidLeg.penalty, MathLib.WAD);
  expect(paidNetAssets).toBeGreaterThanOrEqual(required);
  expect(previousPaidNetAssets).toBeLessThan(required);
});

test("uses the cheaper paid tier before the more expensive tier", async ({
  client,
}) => {
  const scenario = await createScenario(client as AnvilTestClient, [
    { assets: parseEther("0.4"), penalty: MathLib.WAD / 200n },
    { assets: parseEther("2"), penalty: MathLib.WAD / 50n },
  ]);
  const result = await executeScenario({
    scenario,
    referralFeePct: MathLib.WAD / 100n,
    maxPenalty: MathLib.WAD / 50n,
  });
  const first = result.plan.reallocations.findIndex(
    ({ penalty }) => penalty === MathLib.WAD / 200n,
  );
  const second = result.plan.reallocations.findIndex(
    ({ penalty }) => penalty === MathLib.WAD / 50n,
  );
  expect(first).toBeGreaterThanOrEqual(0);
  expect(second).toBeGreaterThan(first);
  const cheaperLeg = result.plan.reallocations[first];
  assert(cheaperLeg != null);
  expect(cheaperLeg.assets).toBe(parseEther("0.4"));
});

test("rejects a stale refinance amount and succeeds with quote-horizon debt", async ({
  client,
}) => {
  const anvilClient = client as AnvilTestClient;
  const scenario = await createScenario(anvilClient, [
    { assets: parseEther("2"), penalty: MathLib.WAD / 100n },
  ]);
  const staleAmount = scenario.sourcePosition.borrowAssets;
  const snapshot = await anvilClient.snapshot();
  const before = await anvilClient.getBlock();
  await anvilClient.setNextBlockTimestamp({
    timestamp: before.timestamp + day,
  });
  await anvilClient.mine({ blocks: 1 });
  const block = await anvilClient.getBlock();
  const [sourcePosition, destinationPosition] = await Promise.all([
    scenario.source.getPositionData(anvilClient.account.address),
    scenario.destination.getPositionData(anvilClient.account.address),
  ]);
  const reallocationData =
    await scenario.destination.getVaultV2BlueReallocationData({
      vaultAddresses: scenario.vaults.map(({ vault }) => vault),
      block,
    });
  const stalePlan = scenario.destination.getVaultV2BlueReallocations({
    reallocationData,
    options: {
      maxPenalty: MathLib.WAD / 100n,
      operation: {
        type: "refinance",
        amount: staleAmount,
        referralFeePct: MathLib.WAD / 100n,
      },
    },
  });
  const staleAction = scenario.source.refinance({
    userAddress: anvilClient.account.address,
    positionData: sourcePosition,
    destination: {
      marketParams: destinationMarket,
      positionData: destinationPosition,
    },
    reallocations: stalePlan.reallocations,
    deadline: maxUint256,
    referralFeePct: MathLib.WAD / 100n,
    referralFeeRecipient: referralRecipient,
  });
  const staleSignatures = await satisfyBlueBundlesV1Requirements(anvilClient, {
    requirements: await staleAction.getRequirements(),
  });
  await expect(
    anvilClient.sendTransaction(staleAction.buildTx(staleSignatures)),
  ).rejects.toThrow(/insufficient liquidity/i);
  await anvilClient.revert({ id: snapshot });
  await executeScenario({
    scenario,
    referralFeePct: MathLib.WAD / 100n,
    maxPenalty: MathLib.WAD / 100n,
  });
});

test("skips 100% penalty vaults and rejects when they are the only source", async ({
  client,
}) => {
  const scenario = await createScenario(client as AnvilTestClient, [
    { assets: parseEther("2"), penalty: MathLib.WAD },
    { assets: parseEther("2"), penalty: MathLib.WAD / 100n },
  ]);
  const result = await executeScenario({
    scenario,
    referralFeePct: MathLib.WAD / 100n,
    maxPenalty: MathLib.WAD,
  });
  expect(
    result.plan.reallocations.every(({ penalty }) => penalty < MathLib.WAD),
  ).toBe(true);

  const onlyWadVault = scenario.vaults.find(
    ({ penalty }) => penalty === MathLib.WAD,
  );
  assert(onlyWadVault != null);
  const onlyWadData = await scenario.destination.getVaultV2BlueReallocationData(
    {
      vaultAddresses: [onlyWadVault.vault],
      block: await client.getBlock(),
    },
  );
  expect(() =>
    scenario.destination.getVaultV2BlueReallocations({
      reallocationData: onlyWadData,
      options: {
        maxPenalty: MathLib.WAD,
        operation: {
          type: "refinance",
          amount: scenario.amount,
          referralFeePct: MathLib.WAD / 100n,
        },
      },
    }),
  ).toThrow(InsufficientSharedLiquidityError);
});

test("reports penalties when paid liquidity cannot cover refinance debt", async ({
  client,
}) => {
  const initialIdleAssets = parseEther("2");
  const penalty = MathLib.WAD / 100n;
  const scenario = await createScenario(client as AnvilTestClient, [
    { assets: initialIdleAssets, penalty },
  ]);
  const referralFee = MathLib.mulDivDown(
    scenario.amount,
    MathLib.WAD / 100n,
    MathLib.WAD - MathLib.WAD / 100n,
  );
  const initialPlanTimestamp = [
    scenario.reallocationData.timestamp ?? 0n,
    ...Object.values(scenario.reallocationData.markets).map(
      (market) => market?.lastUpdate ?? 0n,
    ),
    ...Object.values(scenario.reallocationData.vaults).map(
      (vaultSnapshot) => vaultSnapshot?.lastUpdate ?? 0n,
    ),
  ].reduce((latest, timestamp) => MathLib.max(latest, timestamp), 0n);
  const initialDestinationLiquidity = scenario.reallocationData
    .getMarket(destinationMarket.id)
    .accrueInterest(initialPlanTimestamp).liquidity;
  const initialBaseShortfall = MathLib.zeroFloorSub(
    scenario.amount + referralFee,
    initialDestinationLiquidity,
  );
  const penaltyMargin =
    MathLib.mulDivUp(initialBaseShortfall, penalty, MathLib.WAD) / 10n;
  const targetIdleAssets = initialBaseShortfall + penaltyMargin;
  const vault = scenario.vaults[0];
  assert(vault != null);
  await client.writeContract({
    address: vault.vault,
    abi: vaultV2Abi,
    functionName: "withdraw",
    args: [
      initialIdleAssets - targetIdleAssets,
      client.account.address,
      client.account.address,
    ],
  });
  const reallocationData =
    await scenario.destination.getVaultV2BlueReallocationData({
      vaultAddresses: [vault.vault],
      block: await client.getBlock(),
    });
  const planTimestamp = [
    reallocationData.timestamp ?? 0n,
    ...Object.values(reallocationData.markets).map(
      (market) => market?.lastUpdate ?? 0n,
    ),
    ...Object.values(reallocationData.vaults).map(
      (vaultSnapshot) => vaultSnapshot?.lastUpdate ?? 0n,
    ),
  ].reduce((latest, timestamp) => MathLib.max(latest, timestamp), 0n);
  const destinationLiquidity = reallocationData
    .getMarket(destinationMarket.id)
    .accrueInterest(planTimestamp).liquidity;
  const baseShortfall = MathLib.zeroFloorSub(
    scenario.amount + referralFee,
    destinationLiquidity,
  );
  let thrown: unknown;
  try {
    scenario.destination.getVaultV2BlueReallocations({
      reallocationData,
      options: {
        maxPenalty: MathLib.WAD / 100n,
        operation: {
          type: "refinance",
          amount: scenario.amount,
          referralFeePct: MathLib.WAD / 100n,
        },
      },
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(InsufficientSharedLiquidityError);
  assert(thrown instanceof InsufficientSharedLiquidityError);
  expect(thrown.params.shortfall).toBeGreaterThan(baseShortfall);
  expect(thrown.params.available).toBeGreaterThanOrEqual(baseShortfall);
  expect(thrown.params.shortfall).toBeGreaterThan(thrown.params.available);
});
