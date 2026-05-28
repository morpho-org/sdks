import {
  type AccrualPosition,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  SharesMath,
} from "@morpho-org/blue-sdk";

import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { WethUsdsMarketV1 } from "../../../test/fixtures/marketV1.js";
import { testInvariants } from "../../../test/helpers/invariants.js";
import { supplyCollateral } from "../../../test/helpers/marketV1.js";
import { test } from "../../../test/setup.js";
import {
  BorrowExceedsSafeLtvError,
  isRequirementAuthorization,
  MissingAccrualPositionError,
  MorphoClient,
} from "../../index.js";

describe("BorrowMarketV1", () => {
  test("should compute minSharePrice from real market borrow state", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    await client.deal({
      erc20: WethUsdsMarketV1.collateralToken,
      amount: collateralAmount,
    });
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const { totalBorrowAssets, totalBorrowShares } = positionData.market;

    const tx = market
      .borrow({
        userAddress: client.account.address,
        amount: parseUnits("100", 18),
        positionData,
      })
      .buildTx();

    const expectedMinSharePrice = MathLib.mulDivDown(
      totalBorrowAssets + SharesMath.VIRTUAL_ASSETS,
      MathLib.wToRay(MathLib.WAD - DEFAULT_SLIPPAGE_TOLERANCE),
      totalBorrowShares + SharesMath.VIRTUAL_SHARES,
    );

    expect(tx.action.args.minSharePrice).toBe(expectedMinSharePrice);
    expect(tx.action.args.minSharePrice).toBeGreaterThan(0n);
  });

  test("should borrow loan token", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });

    const {
      markets: {
        WethUsdsMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        markets: { WethUsdsMarketV1 },
      },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const borrow = market.borrow({
          userAddress: client.account.address,
          amount: borrowAmount,
          positionData,
        });

        const requirements = await borrow.getRequirements();
        const requirementAuthorization = requirements[0];
        if (!isRequirementAuthorization(requirementAuthorization)) {
          throw new Error("Authorization requirement not found");
        }

        await client.sendTransaction(requirementAuthorization);

        const tx = borrow.buildTx();

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance,
    );
    expect(finalState.morphoCollateralTokenBalance).toEqual(
      initialState.morphoCollateralTokenBalance,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral,
    );
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + borrowAmount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance - borrowAmount,
    );
    expect(finalState.position.borrowAssets).toEqual(
      initialState.position.borrowAssets + borrowAmount + 1n,
    );
  });

  // Test to create a new position exceeding the LLTV buffer
  test("should throw error when creating a new position exceeding the LLTV buffer", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("1", 18);
    const borrowAmount = parseUnits("10000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.borrow({
        userAddress: client.account.address,
        amount: borrowAmount,
        positionData,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
  });

  test("should revert when positionData is not provided", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

    expect(() =>
      market.borrow({
        userAddress: client.account.address,
        amount: parseUnits("100", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });
});
