import {
  type AccrualPosition,
  AccrualPosition as AccrualPositionClass,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
} from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MissingAccrualPositionError,
  MorphoClient,
  NonPositiveRepayAmountError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  ShareDivideByZeroError,
  computeMaxRepaySharePrice,
  isRequirementApproval,
  marketV1Repay,
} from "../../../src/index.js";
import { WethUsdsMarketV1 } from "../../fixtures/marketV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { borrow, supplyCollateral } from "../../helpers/marketV1.js";

import { test } from "../../setup.js";

describe("RepayMarketV1", () => {
  test("should create repay bundle (by assets)", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);
    const repayAmount = parseUnits("500", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const repay = market.repay({
      userAddress: client.account.address,
      assets: repayAmount,
      positionData,
    });

    const tx = repay.buildTx();

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets: repayAmount,
      repayShares: 0n,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    const directTx = marketV1Repay({
      market: { chainId: mainnet.id, marketParams: WethUsdsMarketV1 },
      args: {
        assets: repayAmount,
        shares: 0n,
        transferAmount: repayAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice,
      },
    });

    expect(directTx).toStrictEqual(tx);
  });

  test("should create repay bundle (by shares — full repay)", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const repay = market.repay({
      userAddress: client.account.address,
      shares: positionData.borrowShares,
      positionData,
    });

    const tx = repay.buildTx();

    expect(tx.action.args.shares).toBe(positionData.borrowShares);
    expect(tx.action.args.assets).toBe(0n);
  });

  test("should repay loan token (by assets)", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);
    const repayAmount = parseUnits("500", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
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

        const repay = market.repay({
          userAddress: client.account.address,
          assets: repayAmount,
          positionData,
        });

        const requirements = await repay.getRequirements();

        // Repay should NOT have morpho authorization requirement
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const tx = repay.buildTx();
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance - repayAmount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + repayAmount,
    );
    // Collateral should not change
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral,
    );
  });

  test("should full repay by shares", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
    });

    // Deal enough loan tokens to cover the buffered transfer amount (slippage buffer)
    const morphoClientSetup = new MorphoClient(client);
    const marketSetup = morphoClientSetup.marketV1(
      WethUsdsMarketV1,
      mainnet.id,
    );
    const setupPosition = await marketSetup.getPositionData(
      client.account.address,
    );
    const baseAmount = setupPosition.market.toBorrowAssets(
      setupPosition.borrowShares,
      "Up",
    );
    const dealAmount = MathLib.wMulUp(
      baseAmount,
      MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
    );
    await client.deal({
      erc20: WethUsdsMarketV1.loanToken,
      amount: dealAmount,
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

        const repay = market.repay({
          userAddress: client.account.address,
          shares: positionData.borrowShares,
          positionData,
        });

        const requirements = await repay.getRequirements();
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const tx = repay.buildTx();
        await client.sendTransaction(tx);
      },
    });

    // After full repay, borrow shares should be 0
    expect(finalState.position.borrowShares).toBe(0n);

    // Morpho should have received loan tokens
    expect(finalState.morphoLoanTokenBalance).toBeGreaterThan(
      initialState.morphoLoanTokenBalance,
    );

    // Collateral should not change
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral,
    );
  });

  test("should throw when repay amount exceeds debt", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.repay({
        userAddress: client.account.address,
        assets: borrowAmount * 2n,
        positionData,
      }),
    ).toThrow(RepayExceedsDebtError);
  });

  test("should throw when repay amount is too small to convert to shares", async ({
    client,
  }) => {
    // Construct a market where interest has diverged totalBorrowAssets from
    // totalBorrowShares enough that 1 wei converts to 0 borrow shares.
    // Formula: shares = mulDivDown(assets, totalBorrowShares + 1e6, totalBorrowAssets + 1)
    // For shares == 0: totalBorrowAssets must exceed totalBorrowShares + 999_999.
    const totalBorrowShares = parseUnits("100000000", 18); // 100M shares
    const totalBorrowAssets = totalBorrowShares + parseUnits("1", 18); // +1e18 gap (>> 1e6 virtual offset)

    const positionData = new AccrualPositionClass(
      {
        user: client.account.address,
        supplyShares: 0n,
        borrowShares: parseUnits("1000", 18),
        collateral: parseUnits("10", 18),
      },
      {
        params: WethUsdsMarketV1,
        totalSupplyAssets: totalBorrowAssets * 2n,
        totalSupplyShares: totalBorrowShares * 2n,
        totalBorrowAssets,
        totalBorrowShares,
        lastUpdate: 0n,
        fee: 0n,
      },
    );

    // Verify our setup: 1 wei should round to 0 shares on this market
    expect(positionData.market.toBorrowShares(1n, "Down")).toBe(0n);

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

    expect(() =>
      market.repay({
        userAddress: client.account.address,
        assets: 1n,
        positionData,
      }),
    ).toThrow(ShareDivideByZeroError);
  });

  test("should throw when repay shares exceed borrow shares", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.repay({
        userAddress: client.account.address,
        shares: positionData.borrowShares * 2n,
        positionData,
      }),
    ).toThrow(RepaySharesExceedDebtError);
  });

  test("should throw when repay amount is non-positive", async ({ client }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.repay({
        userAddress: client.account.address,
        assets: 0n,
        positionData,
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("should revert when positionData is not provided", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

    expect(() =>
      market.repay({
        userAddress: client.account.address,
        assets: parseUnits("100", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });

  test("should return deep-frozen transaction", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const tx = market
      .repay({
        userAddress: client.account.address,
        assets: parseUnits("500", 18),
        positionData,
      })
      .buildTx();

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});
