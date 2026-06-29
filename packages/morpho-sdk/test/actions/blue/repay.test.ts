import {
  type AccrualPosition,
  AccrualPosition as AccrualPositionClass,
} from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import {
  isRequirementApproval,
  MissingAccrualPositionError,
  morphoViemExtension,
  NonPositiveRepayAmountError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  ShareDivideByZeroError,
} from "../../../src/index.js";
import { WethUsdsBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("RepayBlue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  test("should repay loan token (by assets)", async ({ client }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);
    const repayAmount = parseUnits("500", 18);

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
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
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
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
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
        // Shares-mode repayments use a forward-accrued transfer amount;
        // fund the exact requirement instead of a stale fixture estimate.
        await client.deal({
          erc20: WethUsdsBlue.loanToken,
          amount: approval.action.args.amount,
        });
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

  // Regression: repay-by-shares used to size transferAmount from the stale
  // (un-accrued) market snapshot. On a market whose lastUpdate lags the
  // current block, on-chain morphoRepay required more assets than the
  // bundler had pre-pulled, reverting the supposedly-immune full repay.
  test("should full repay by shares on a dormant market", async ({
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

    // Advance chain time so lastUpdate is meaningfully behind block.timestamp.
    // 30 days of accrual is far larger than DEFAULT_SLIPPAGE_TOLERANCE on any
    // realistic market, so the stale-sized transfer cannot cover the on-chain
    // repay amount without the accrual fix.
    const fastForwardedTimestamp =
      (await client.timestamp()) + Time.s.from.d(30n);
    await client.setNextBlockTimestamp({ timestamp: fastForwardedTimestamp });
    // Align wall-clock with chain time so the SDK's `Time.timestamp()` projection
    // matches the block the repay tx will execute on.
    vi.useFakeTimers({
      now: Number(fastForwardedTimestamp) * 1000,
      toFake: ["Date"],
    });

    // Pre-fund a generous loan-token balance; the bundle skim returns any
    // unused buffer to the user, so over-funding here is safe.
    await client.deal({
      erc20: WethUsdsBlue.loanToken,
      amount: parseUnits("100000", 18),
    });

    const {
      markets: {
        WethUsdsBlue: { finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
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

    expect(finalState.position.borrowShares).toBe(0n);
    expect(finalState.position.collateral).toEqual(collateralAmount);
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

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
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
        params: WethUsdsBlue,
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

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);

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
      market: WethUsdsBlue,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WethUsdsBlue,
      borrowAmount,
    });

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
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
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
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
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);

    expect(() =>
      market.repay({
        userAddress: client.account.address,
        assets: parseUnits("100", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });
});

describe("RepayBlue - native wrapping (entity)", () => {
  // WstethWethBlue's loan token is WETH (the mainnet wNative), so repays on it
  // can be funded by wrapping native ETH via `market.repay({ ..., nativeAmount })`.

  /** Seed market liquidity and open a WETH-debt position of `borrowAmount`. */
  const openDebt = async (
    client: AnvilTestClient,
    {
      collateralAmount,
      borrowAmount,
    }: { collateralAmount: bigint; borrowAmount: bigint },
  ) => {
    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: WstethWethBlue,
      supplyAmount: borrowAmount,
    });
    await supplyCollateral({
      client,
      chainId: mainnet.id,
      market: WstethWethBlue,
      collateralAmount,
    });
    await borrow({
      client,
      chainId: mainnet.id,
      market: WstethWethBlue,
      borrowAmount,
    });
    await client.setBalance({
      address: client.account.address,
      value: parseUnits("100", 18),
    });
  };

  test("repay by assets funded entirely by native (no ERC-20 approval)", async ({
    client,
  }) => {
    const repayAmount = parseUnits("1", 18);
    await openDebt(client, {
      collateralAmount: parseUnits("10", 18),
      borrowAmount: parseUnits("2", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WstethWethBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const repay = market.repay({
          userAddress: client.account.address,
          assets: repayAmount,
          nativeAmount: repayAmount,
          positionData,
        });

        // Fully native: no ERC-20 approval is required.
        expect(await repay.getRequirements()).toHaveLength(0);

        const tx = repay.buildTx();
        expect(tx.value).toEqual(repayAmount);
        await client.sendTransaction(tx);
      },
    });

    // WETH balance untouched — funded entirely by wrapped native.
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance,
    );
    expect(
      initialState.userNativeBalance - finalState.userNativeBalance,
    ).toBeGreaterThanOrEqual(repayAmount);
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + repayAmount,
    );
    expect(finalState.position.borrowShares).toBeLessThan(
      initialState.position.borrowShares,
    );
  });

  test("repay by assets funded by native + ERC-20 (approval covers the remainder only)", async ({
    client,
  }) => {
    const repayAmount = parseUnits("1", 18);
    const nativeAmount = parseUnits("0.4", 18);
    const erc20Remainder = repayAmount - nativeAmount;
    await openDebt(client, {
      collateralAmount: parseUnits("10", 18),
      borrowAmount: parseUnits("2", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WstethWethBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const repay = market.repay({
          userAddress: client.account.address,
          assets: repayAmount,
          nativeAmount,
          positionData,
        });

        // The approval requirement covers only the ERC-20 remainder.
        const requirements = await repay.getRequirements();
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        expect(approval.action.args.amount).toBe(erc20Remainder);
        await client.sendTransaction(approval);

        const tx = repay.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        await client.sendTransaction(tx);
      },
    });

    // Only the ERC-20 remainder left the user's WETH balance.
    expect(
      initialState.userLoanTokenBalance - finalState.userLoanTokenBalance,
    ).toEqual(erc20Remainder);
    expect(
      initialState.userNativeBalance - finalState.userNativeBalance,
    ).toBeGreaterThanOrEqual(nativeAmount);
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + repayAmount,
    );
  });

  test("full repay by shares funded by native (nativeAmount capped at the transfer)", async ({
    client,
  }) => {
    await openDebt(client, {
      collateralAmount: parseUnits("10", 18),
      borrowAmount: parseUnits("2", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WstethWethBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const repay = market.repay({
          userAddress: client.account.address,
          shares: positionData.borrowShares,
          // Over-provide: capped at the (forward-accrued) transfer, so it is
          // fully native. The residual wNative is skimmed back to the user.
          nativeAmount: parseUnits("10", 18),
          positionData,
        });

        // Fully native: no ERC-20 approval is required.
        expect(await repay.getRequirements()).toHaveLength(0);

        await client.sendTransaction(repay.buildTx());
      },
    });

    // Debt fully closed.
    expect(finalState.position.borrowShares).toBe(0n);
    // No WETH was pulled from the user (funded by native; residual skimmed back).
    expect(finalState.userLoanTokenBalance).toBeGreaterThanOrEqual(
      initialState.userLoanTokenBalance,
    );
    expect(
      initialState.userNativeBalance - finalState.userNativeBalance,
    ).toBeGreaterThan(0n);
    expect(finalState.morphoLoanTokenBalance).toBeGreaterThan(
      initialState.morphoLoanTokenBalance,
    );
  });
});
