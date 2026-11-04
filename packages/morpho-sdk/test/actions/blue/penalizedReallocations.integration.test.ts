import { MathLib } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import type { AnvilTestClient } from "@morpho-org/test";
import { maxUint256, parseEther } from "viem";
import { assert, expect } from "vitest";
import { DEFAULT_SUPPLY_TARGET_UTILIZATION } from "../../../src/helpers/constant.js";
import {
  satisfyBlueBundlesV1Requirements,
  blueBundlesV1Test as test,
} from "../../helpers/blueBundlesV1.js";
import {
  createScenario,
  destinationMarket,
  type Scenario,
} from "../../helpers/penalizedReallocations.js";

const penalty = 10n ** 16n;
const freeIdle = parseEther("0.02");
const paidLiquidity = parseEther("2");

function sumAssets(
  reallocations: readonly { readonly assets: bigint }[],
): bigint {
  return reallocations.reduce((total, { assets }) => total + assets, 0n);
}

async function userLoanBalance(scenario: Scenario): Promise<bigint> {
  return scenario.client.balanceOf({
    erc20: destinationMarket.loanToken,
    owner: scenario.client.account.address,
  });
}

test("borrows with free liquidity above 90% utilization without using a paid vault", async ({
  client,
}) => {
  const amount = parseEther("0.14");
  const scenario = await createScenario(client as AnvilTestClient, [
    { assets: parseEther("0.05"), penalty: 0n },
    {
      assets: paidLiquidity,
      penalty,
      liquiditySource: "market",
    },
  ]);
  // Exact free/paid sizing assumes zero headroom; default headroom is covered by unit tests.
  const plan = scenario.destination.getVaultV2BlueReallocations({
    reallocationData: scenario.reallocationData,
    options: {
      maxPenalty: penalty,
      operation: { type: "borrow", amount },
      allocatorCapHeadroom: 0n,
    },
  });
  const freeLegs = plan.reallocations.filter(
    ({ penalty: legPenalty }) => legPenalty === 0n,
  );
  const paidLegs = plan.reallocations.filter(
    ({ penalty: legPenalty }) => legPenalty > 0n,
  );
  expect(paidLegs).toEqual([]);
  expect(sumAssets(freeLegs)).toBe(parseEther("0.05"));

  const balanceBefore = await userLoanBalance(scenario);
  const action = scenario.destination.borrow({
    userAddress: scenario.client.account.address,
    borrowAssets: amount,
    positionData: scenario.destinationPosition,
    reallocations: plan.reallocations,
    deadline: maxUint256,
  });
  const signatures = await satisfyBlueBundlesV1Requirements(scenario.client, {
    requirements: await action.getRequirements(),
  });
  await scenario.client.sendTransaction(action.buildTx(signatures));
  const balanceAfter = await userLoanBalance(scenario);
  const positionAfter = await scenario.destination.getPositionData(
    scenario.client.account.address,
  );

  expect(balanceAfter - balanceBefore).toBe(amount);
  expect(positionAfter.market.utilization).toBeGreaterThan(
    DEFAULT_SUPPLY_TARGET_UTILIZATION,
  );
  expect(positionAfter.market.utilization).toBeLessThan(MathLib.WAD);
});

test.for([
  { type: "borrow", amount: parseEther("0.14") },
  { type: "withdraw", amount: parseEther("0.15") },
] as const)(
  "$type uses paid liquidity only for the shortfall and donates its penalty",
  async (operation, { client }) => {
    const scenario = await createScenario(client as AnvilTestClient, [
      { assets: freeIdle, penalty: 0n },
      {
        assets: paidLiquidity,
        penalty,
        liquiditySource: "market",
      },
    ]);
    const timestamp = (await scenario.client.getBlock()).timestamp;
    const plan = scenario.destination.getVaultV2BlueReallocations({
      reallocationData: scenario.reallocationData,
      options: {
        maxPenalty: penalty,
        operation,
        allocatorCapHeadroom: 0n,
        timestamp,
      },
    });
    const freeLegs = plan.reallocations.filter(
      ({ penalty: legPenalty }) => legPenalty === 0n,
    );
    const paidLegs = plan.reallocations.filter(
      ({ penalty: legPenalty }) => legPenalty > 0n,
    );
    const freeAssets = sumAssets(freeLegs);
    const paidAssets = sumAssets(paidLegs);
    const targetMarket = scenario.reallocationData
      .getMarket(destinationMarket.id)
      .accrueInterest(timestamp);
    const supply =
      operation.type === "withdraw"
        ? targetMarket.totalSupplyAssets - operation.amount
        : targetMarket.totalSupplyAssets;
    const borrow =
      operation.type === "borrow"
        ? targetMarket.totalBorrowAssets + operation.amount
        : targetMarket.totalBorrowAssets;
    const shortfall = borrow > supply ? borrow - supply : 0n;
    const penaltyDonation = paidLegs.reduce(
      (total, { assets, penalty: legPenalty }) =>
        total + MathLib.mulDivUp(assets, legPenalty, MathLib.WAD),
      0n,
    );
    const paidVault = scenario.vaults.find(
      ({ penalty: vaultPenalty }) => vaultPenalty > 0n,
    );
    assert(paidVault != null);
    expect(freeAssets).toBe(freeIdle);
    expect(paidAssets).toBe(shortfall - freeAssets);
    expect(paidLegs.every(({ from }) => from.type === "market")).toBe(true);

    const balanceBefore = await userLoanBalance(scenario);
    const idleBefore = (
      await fetchAccrualVaultV2(paidVault.vault, scenario.client)
    ).assetBalance;
    const action =
      operation.type === "borrow"
        ? scenario.destination.borrow({
            userAddress: scenario.client.account.address,
            borrowAssets: operation.amount,
            positionData: scenario.destinationPosition,
            reallocations: plan.reallocations,
            deadline: maxUint256,
          })
        : scenario.destination.withdraw({
            userAddress: scenario.client.account.address,
            assets: operation.amount,
            positionData: scenario.destinationPosition,
            reallocations: plan.reallocations,
            deadline: maxUint256,
          });
    const signatures = await satisfyBlueBundlesV1Requirements(scenario.client, {
      requirements: await action.getRequirements(),
    });
    await scenario.client.sendTransaction(action.buildTx(signatures));
    const balanceAfter = await userLoanBalance(scenario);
    const idleAfter = (
      await fetchAccrualVaultV2(paidVault.vault, scenario.client)
    ).assetBalance;
    const balanceDelta = balanceAfter - balanceBefore;
    const expectedBalanceDelta = operation.amount - penaltyDonation;

    expect(balanceDelta).toBeGreaterThanOrEqual(
      expectedBalanceDelta - BigInt(paidLegs.length),
    );
    expect(balanceDelta).toBeLessThanOrEqual(
      expectedBalanceDelta + BigInt(paidLegs.length),
    );
    expect(idleAfter - idleBefore).toBe(penaltyDonation);

    const positionAfter = await scenario.destination.getPositionData(
      scenario.client.account.address,
    );
    expect(positionAfter.market.totalSupplyAssets).toBeGreaterThanOrEqual(
      positionAfter.market.totalBorrowAssets,
    );
    expect(
      positionAfter.market.totalSupplyAssets -
        positionAfter.market.totalBorrowAssets,
    ).toBeLessThanOrEqual(5n);
  },
);
