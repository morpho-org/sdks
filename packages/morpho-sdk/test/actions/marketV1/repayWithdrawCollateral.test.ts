import {
  type AccrualPosition,
  AccrualPosition as AccrualPositionClass,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
} from "@morpho-org/blue-sdk";
import { http, createPublicClient, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  AddressMismatchError,
  MissingAccrualPositionError,
  MissingClientPropertyError,
  MorphoClient,
  NonPositiveRepayAmountError,
  NonPositiveWithdrawCollateralAmountError,
  RepayExceedsDebtError,
  ShareDivideByZeroError,
  WithdrawMakesPositionUnhealthyError,
  computeMaxRepaySharePrice,
  isRequirementApproval,
  isRequirementAuthorization,
  marketV1RepayWithdrawCollateral,
} from "../../../src/index.js";
import { WethUsdsMarketV1 } from "../../fixtures/marketV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { borrow, supplyCollateral } from "../../helpers/marketV1.js";

import { test } from "../../setup.js";

describe("RepayWithdrawCollateralMarketV1", () => {
  test("should create repayWithdrawCollateral bundle (by assets)", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);
    const repayAmount = parseUnits("500", 18);
    const withdrawAmount = parseUnits("1", 18);

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

    const action = market.repayWithdrawCollateral({
      userAddress: client.account.address,
      assets: repayAmount,
      withdrawAmount,
      positionData,
    });

    const tx = action.buildTx();

    const maxSharePrice = computeMaxRepaySharePrice({
      repayAssets: repayAmount,
      repayShares: 0n,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    const directTx = marketV1RepayWithdrawCollateral({
      market: { chainId: mainnet.id, marketParams: WethUsdsMarketV1 },
      args: {
        assets: repayAmount,
        shares: 0n,
        transferAmount: repayAmount,
        withdrawAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        maxSharePrice,
      },
    });

    expect(directTx).toStrictEqual(tx);
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
        const morphoClient = new MorphoClient(client, {
          supportSignature: false,
        });
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
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
      market: WethUsdsMarketV1,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsMarketV1,
      borrowAmount,
    });

    // Deal enough loan tokens for the full repay (with slippage buffer for interest accrual)
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
        const morphoClient = new MorphoClient(client, {
          supportSignature: false,
        });
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
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
          if (isRequirementApproval(req) || isRequirementAuthorization(req)) {
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

  test("should throw when withdraw makes position unhealthy (even after repay)", async ({
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
        params: WethUsdsMarketV1,
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
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

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
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
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
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: parseUnits("100", 18),
        withdrawAmount: parseUnits("1", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });

  test("should throw MissingClientPropertyError when client has no account", () => {
    // Public client (no account) — building any market action that takes a
    // userAddress must fail loudly rather than silently produce a tx that
    // could be signed by an unrelated account.
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });
    const morphoClient = new MorphoClient(publicClient);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        assets: parseUnits("100", 18),
        withdrawAmount: parseUnits("1", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingClientPropertyError);
  });

  test("should throw AddressMismatchError when userAddress differs from client account", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

    // Anvil's second default account — guaranteed distinct from client.account.
    const otherAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: otherAddress,
        assets: parseUnits("100", 18),
        withdrawAmount: parseUnits("1", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(AddressMismatchError);
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
      .repayWithdrawCollateral({
        userAddress: client.account.address,
        assets: parseUnits("500", 18),
        withdrawAmount: parseUnits("1", 18),
        positionData,
      })
      .buildTx();

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});
