import { type AccrualPosition, MathLib } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2, vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { maxUint256, parseEther } from "viem";
import { assert, expect } from "vitest";
import type { VaultV2BlueReallocationData } from "../../../src/entities/vaultV2BlueReallocationData.js";
import { InsufficientSharedLiquidityError } from "../../../src/index.js";
import type { VaultV2BlueReallocation } from "../../../src/types/sharedLiquidity.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";
import {
  createScenario,
  day,
  destinationMarket,
  referralRecipient,
  type Scenario,
} from "../../helpers/penalizedReallocations.js";

const penaltyAssets = (
  reallocations: readonly { assets: bigint; penalty: bigint }[],
) =>
  reallocations.reduce(
    (total, leg) =>
      total + MathLib.mulDivUp(leg.assets, leg.penalty, MathLib.WAD),
    0n,
  );

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
