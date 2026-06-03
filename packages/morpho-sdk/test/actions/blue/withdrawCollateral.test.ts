import type { AccrualPosition } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MissingAccrualPositionError,
  MorphoClient,
  NonPositiveWithdrawCollateralAmountError,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
} from "../../../src/index.js";
import { WethUsdsBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral } from "../../helpers/blue.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("WithdrawCollateralBlue", () => {
  test("should withdraw collateral (no debt)", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const withdrawAmount = parseUnits("5", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount,
    });

    const {
      markets: {
        WethUsdsBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        markets: { WethUsdsBlue },
      },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const withdraw = market.withdrawCollateral({
          userAddress: client.account.address,
          amount: withdrawAmount,
          positionData,
        });

        const tx = withdraw.buildTx();
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + withdrawAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral - withdrawAmount,
    );
    // Loan token should not change
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance,
    );
  });

  // full withdraw
  test("should full withdraw collateral (no debt)", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const withdrawAmount = collateralAmount;

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount,
    });

    const {
      markets: {
        WethUsdsBlue: { finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsBlue } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const withdraw = market.withdrawCollateral({
          userAddress: client.account.address,
          amount: withdrawAmount,
          positionData,
        });

        const tx = withdraw.buildTx();
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.position.collateral).toEqual(0n);
  });

  test("should throw when withdraw makes position unhealthy", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      borrowAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    // Try to withdraw most of the collateral — should make position unhealthy
    expect(() =>
      market.withdrawCollateral({
        userAddress: client.account.address,
        amount: parseUnits("9.99", 18),
        positionData,
      }),
    ).toThrow(WithdrawMakesPositionUnhealthyError);
  });

  test("should throw when withdraw exceeds collateral", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      collateralAmount,
    });

    // Create a borrow position so borrowAssets > 0 (triggers the check path)
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      borrowAmount: parseUnits("100", 18),
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.withdrawCollateral({
        userAddress: client.account.address,
        amount: collateralAmount + 1n,
        positionData,
      }),
    ).toThrow(WithdrawExceedsCollateralError);
  });

  test("should throw when withdraw amount is non-positive", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.withdrawCollateral({
        userAddress: client.account.address,
        amount: 0n,
        positionData,
      }),
    ).toThrow(NonPositiveWithdrawCollateralAmountError);
  });

  test("should revert when positionData is not provided", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);

    expect(() =>
      market.withdrawCollateral({
        userAddress: client.account.address,
        amount: parseUnits("1", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });
});
