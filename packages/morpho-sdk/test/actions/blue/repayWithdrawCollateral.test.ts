import {
  type AccrualPosition,
  AccrualPosition as AccrualPositionClass,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import {
  isRequirementApproval,
  isRequirementAuthorization,
  MissingAccrualPositionError,
  MorphoClient,
  NonPositiveRepayAmountError,
  NonPositiveWithdrawCollateralAmountError,
  RepayExceedsDebtError,
  ShareDivideByZeroError,
  WithdrawMakesPositionUnhealthyError,
} from "../../../src/index.js";
import { WethUsdsBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral } from "../../helpers/blue.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("RepayWithdrawCollateralBlue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  test("should repay and withdraw collateral (by assets)", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);
    const repayAmount = parseUnits("500", 18);
    const withdrawAmount = parseUnits("1", 18);

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
        const morphoClient = new MorphoClient(client, {
          supportSignature: false,
        });
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const action = market.repayWithdrawCollateral({
          userAddress: client.account.address,
          assets: repayAmount,
          withdrawAmount,
          positionData,
        });

        const requirements = await action.getRequirements();

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const tx = action.buildTx();
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance - repayAmount,
    );
    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + withdrawAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral - withdrawAmount,
    );
  });

  test("should full repay by shares and withdraw all collateral", async ({
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
        const morphoClient = new MorphoClient(client, {
          supportSignature: false,
        });
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const action = market.repayWithdrawCollateral({
          userAddress: client.account.address,
          shares: positionData.borrowShares,
          withdrawAmount: positionData.collateral,
          positionData,
        });

        const requirements = await action.getRequirements();
        for (const req of requirements) {
          if (isRequirementApproval(req)) {
            // Shares-mode repayments use a forward-accrued transfer amount;
            // fund the exact requirement instead of a stale fixture estimate.
            await client.deal({
              erc20: WethUsdsBlue.loanToken,
              amount: req.action.args.amount,
            });
            await client.sendTransaction(req);
          } else if (isRequirementAuthorization(req)) {
            await client.sendTransaction(req);
          }
        }

        const tx = action.buildTx();
        await client.sendTransaction(tx);
      },
    });

    // Position should be fully closed
    expect(finalState.position.borrowShares).toBe(0n);
    expect(finalState.position.collateral).toBe(0n);

    // Morpho should have received loan tokens
    expect(finalState.morphoLoanTokenBalance).toBeGreaterThan(
      initialState.morphoLoanTokenBalance,
    );

    // User should have received collateral back
    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + collateralAmount,
    );
  });

  // Regression: same accrual bug as repay({ shares }) — transferAmount used
  // to be sized from the stale market snapshot, so a one-shot deleverage on
  // a dormant market reverted before collateral could be released.
  test("should full repay by shares and withdraw all collateral on a dormant market", async ({
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

    const fastForwardedTimestamp =
      (await client.timestamp()) + Time.s.from.d(30n);
    await client.setNextBlockTimestamp({ timestamp: fastForwardedTimestamp });
    // Align wall-clock with chain time so the SDK's `Time.timestamp()` projection
    // matches the block the repay tx will execute on.
    vi.useFakeTimers({
      now: Number(fastForwardedTimestamp) * 1000,
      toFake: ["Date"],
    });

    await client.deal({
      erc20: WethUsdsBlue.loanToken,
      amount: parseUnits("100000", 18),
    });

    const {
      markets: {
        WethUsdsBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsBlue } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client, {
          supportSignature: false,
        });
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const action = market.repayWithdrawCollateral({
          userAddress: client.account.address,
          shares: positionData.borrowShares,
          withdrawAmount: positionData.collateral,
          positionData,
        });

        const requirements = await action.getRequirements();
        for (const req of requirements) {
          if (isRequirementApproval(req)) {
            // Shares-mode repayments use a forward-accrued transfer amount;
            // fund the exact requirement instead of a stale fixture estimate.
            await client.deal({
              erc20: WethUsdsBlue.loanToken,
              amount: req.action.args.amount,
            });
            await client.sendTransaction(req);
          } else if (isRequirementAuthorization(req)) {
            await client.sendTransaction(req);
          }
        }

        const tx = action.buildTx();
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.position.borrowShares).toBe(0n);
    expect(finalState.position.collateral).toBe(0n);
    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + collateralAmount,
    );
  });

  test("should throw when withdraw makes position unhealthy (even after repay)", async ({
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

    // Small repay + huge withdraw → still unhealthy
    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: parseUnits("10", 18),
        withdrawAmount: parseUnits("9.99", 18),
        positionData,
      }),
    ).toThrow(WithdrawMakesPositionUnhealthyError);
  });

  test("should throw when repay amount exceeds debt", async ({ client }) => {
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

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: borrowAmount * 2n,
        withdrawAmount: parseUnits("1", 18),
        positionData,
      }),
    ).toThrow(RepayExceedsDebtError);
  });

  test("should throw when repay amount is too small to convert to shares", async ({
    client,
  }) => {
    // Construct a market where interest has diverged totalBorrowAssets from
    // totalBorrowShares enough that 1 wei converts to 0 borrow shares.
    const totalBorrowShares = parseUnits("100000000", 18);
    const totalBorrowAssets = totalBorrowShares + parseUnits("1", 18);

    const positionData = new AccrualPositionClass(
      {
        user: client.account.address,
        supplyShares: 0n,
        borrowShares: parseUnits("1000", 18),
        collateral: parseUnits("10", 18),
      },
      {
        params: WethUsdsBlue,
        totalSupplyAssets: totalBorrowAssets * 2n,
        totalSupplyShares: totalBorrowShares * 2n,
        totalBorrowAssets,
        totalBorrowShares,
        lastUpdate: 0n,
        fee: 0n,
        price: parseUnits("2000", 36),
      },
    );

    expect(positionData.market.toBorrowShares(1n, "Down")).toBe(0n);

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: 1n,
        withdrawAmount: parseUnits("1", 18),
        positionData,
      }),
    ).toThrow(ShareDivideByZeroError);
  });

  test("should throw when repay amount is non-positive", async ({ client }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: 0n,
        withdrawAmount: parseUnits("1", 18),
        positionData,
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("should throw when withdraw amount is non-positive", async ({
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

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: parseUnits("500", 18),
        withdrawAmount: 0n,
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
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: parseUnits("100", 18),
        withdrawAmount: parseUnits("1", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });
});
