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
  isRequirementBlueAuthorization,
  MissingAccrualPositionError,
  morphoViemExtension,
  NonPositiveRepayAmountError,
  NonPositiveWithdrawCollateralAmountError,
  RepayExceedsDebtError,
  ShareDivideByZeroError,
  WithdrawMakesPositionUnhealthyError,
} from "../../../src/index.js";
import { WethUsdsBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral } from "../../helpers/blue.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";
import { buildPlanTx, getPlanRequests } from "../../transactionPlanUtils.js";

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
        const morphoClient = client.extend(
          morphoViemExtension({
            supportSignature: false,
          }),
        ).morpho;
        const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const action = market.repayWithdrawCollateral({
          userAddress: client.account.address,
          amount: repayAmount,
          withdrawAmount,
          positionData,
        });

        const requirements = await getPlanRequests(action);

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const tx = await buildPlanTx(action);
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
        const morphoClient = client.extend(
          morphoViemExtension({
            supportSignature: false,
          }),
        ).morpho;
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

        const requirements = await getPlanRequests(action);
        for (const req of requirements) {
          if (isRequirementApproval(req)) {
            // Shares-mode repayments use a forward-accrued transfer amount;
            // fund the exact requirement instead of a stale fixture estimate.
            await client.deal({
              erc20: WethUsdsBlue.loanToken,
              amount: req.action.args.amount,
            });
            await client.sendTransaction(req);
          } else if (isRequirementBlueAuthorization(req)) {
            await client.sendTransaction(req);
          }
        }

        const tx = await buildPlanTx(action);
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
        const morphoClient = client.extend(
          morphoViemExtension({
            supportSignature: false,
          }),
        ).morpho;
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

        const requirements = await getPlanRequests(action);
        for (const req of requirements) {
          if (isRequirementApproval(req)) {
            // Shares-mode repayments use a forward-accrued transfer amount;
            // fund the exact requirement instead of a stale fixture estimate.
            await client.deal({
              erc20: WethUsdsBlue.loanToken,
              amount: req.action.args.amount,
            });
            await client.sendTransaction(req);
          } else if (isRequirementBlueAuthorization(req)) {
            await client.sendTransaction(req);
          }
        }

        const tx = await buildPlanTx(action);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.position.borrowShares).toBe(0n);
    expect(finalState.position.collateral).toBe(0n);
    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + collateralAmount,
    );
  });

  test("should repay with native ETH and withdraw collateral (wNative loan)", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const withdrawAmount = parseUnits("1", 18);

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

    // Fund the account with native ETH to wrap for the repay leg.
    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("10", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        markets: { WstethWethBlue },
      },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        // Fully native repay leg (no ERC-20 pulled), then withdraw collateral.
        const action = market.repayWithdrawCollateral({
          userAddress: client.account.address,
          amount: 0n,
          nativeAmount,
          withdrawAmount,
          positionData,
        });

        const requirements = await getPlanRequests(action);
        // A fully-native repay pulls no ERC-20, so there is no approval to make;
        // GeneralAdapter1 was already authorized when the position was opened.
        expect(requirements.some(isRequirementApproval)).toBe(false);
        for (const req of requirements) {
          if (isRequirementBlueAuthorization(req)) {
            await client.sendTransaction(req);
          }
        }

        const tx = await buildPlanTx(action);
        expect(tx.value).toEqual(nativeAmount);
        await client.sendTransaction(tx);
      },
    });

    // The wrapped ETH repaid WETH into Morpho and reduced the debt.
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + nativeAmount,
    );
    expect(finalState.position.borrowShares).toBeLessThan(
      initialState.position.borrowShares,
    );
    // Collateral was withdrawn to the receiver.
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral - withdrawAmount,
    );
    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + withdrawAmount,
    );
  });

  test("should repay (assets) funded partly by ERC-20 and partly by native ETH, then withdraw collateral", async ({
    client,
  }) => {
    // WstethWethBlue's loan token is wNative (WETH): repay is funded by a mix of
    // `amount` ERC-20 WETH + `nativeAmount` wrapped ETH (additive assets mode),
    // then collateral is withdrawn in the same bundle.
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1", 18);
    const erc20Part = parseUnits("0.3", 18); // pulled as ERC-20 WETH
    const nativePart = parseUnits("0.2", 18); // wrapped from native ETH
    const totalRepaid = erc20Part + nativePart;
    const withdrawAmount = parseUnits("1", 18);

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

    // Fund the account with native ETH to wrap for the repay leg (plus gas).
    await client.setBalance({
      address: client.account.address,
      value: nativePart + parseUnits("10", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        markets: { WstethWethBlue },
      },
      actionFn: async () => {
        const morphoClient = client.extend(
          morphoViemExtension({
            supportSignature: false,
          }),
        ).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const action = market.repayWithdrawCollateral({
          userAddress: client.account.address,
          amount: erc20Part,
          nativeAmount: nativePart,
          withdrawAmount,
          positionData,
        });

        // GA1 was authorized when the position opened, so the only requirement is
        // the ERC-20 approval — and it must cover ONLY the ERC-20 portion.
        const requirements = await getPlanRequests(action);
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        expect(approval.action.args.amount).toEqual(erc20Part);
        await client.sendTransaction(approval);

        const tx = await buildPlanTx(action);
        // Only the native portion rides as tx.value.
        expect(tx.value).toEqual(nativePart);
        await client.sendTransaction(tx);
      },
    });

    // Morpho received the full repaid total (ERC-20 pulled + wrapped ETH).
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + totalRepaid,
    );
    // Only the ERC-20 portion left the user's WETH balance; the rest came from ETH.
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance - erc20Part,
    );
    // Collateral was withdrawn to the user.
    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + withdrawAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral - withdrawAmount,
    );
    // Partial repay: debt reduced but not closed.
    expect(finalState.position.borrowShares).toBeLessThan(
      initialState.position.borrowShares,
    );
    expect(finalState.position.borrowShares).toBeGreaterThan(0n);
  });

  test("should full repay by shares funded partly by native ETH, then withdraw all collateral", async ({
    client,
  }) => {
    // Shares mode carves native out of the transfer (ERC-20 pulled =
    // `toBorrowAssets(shares) - nativeAmount`); the wrapped ETH funds the rest,
    // and the whole position is closed and de-collateralised in one bundle.
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1", 18);
    const nativePart = parseUnits("0.4", 18); // wrapped from native ETH

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
      value: nativePart + parseUnits("10", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: {
        markets: { WstethWethBlue },
      },
      actionFn: async () => {
        const morphoClient = client.extend(
          morphoViemExtension({
            supportSignature: false,
          }),
        ).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const action = market.repayWithdrawCollateral({
          userAddress: client.account.address,
          shares: positionData.borrowShares,
          nativeAmount: nativePart,
          withdrawAmount: positionData.collateral,
          positionData,
        });

        const requirements = await getPlanRequests(action);
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        // Partial native: a positive ERC-20 remainder is still pulled (not fully native).
        expect(approval.action.args.amount).toBeGreaterThan(0n);
        // Fund the exact ERC-20 remainder the shares-mode transfer needs.
        await client.deal({
          erc20: WstethWethBlue.loanToken,
          amount: approval.action.args.amount,
        });
        await client.sendTransaction(approval);

        const tx = await buildPlanTx(action);
        expect(tx.value).toEqual(nativePart);
        await client.sendTransaction(tx);
      },
    });

    // Position fully closed and all collateral returned.
    expect(finalState.position.borrowShares).toBe(0n);
    expect(finalState.position.collateral).toBe(0n);
    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance + collateralAmount,
    );
    expect(finalState.morphoLoanTokenBalance).toBeGreaterThan(
      initialState.morphoLoanTokenBalance,
    );
    // The wrapped ETH (plus gas) left the user's native balance.
    expect(finalState.userNativeBalance).toBeLessThan(
      initialState.userNativeBalance - nativePart,
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

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    // Small repay + huge withdraw → still unhealthy
    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        amount: parseUnits("10", 18),
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

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        amount: borrowAmount * 2n,
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

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        amount: 1n,
        withdrawAmount: parseUnits("1", 18),
        positionData,
      }),
    ).toThrow(ShareDivideByZeroError);
  });

  test("should throw when repay amount is non-positive", async ({ client }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        amount: 0n,
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

    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        amount: parseUnits("500", 18),
        withdrawAmount: 0n,
        positionData,
      }),
    ).toThrow(NonPositiveWithdrawCollateralAmountError);
  });

  test("should revert when positionData is not provided", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(WethUsdsBlue, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        userAddress: client.account.address,
        amount: parseUnits("100", 18),
        withdrawAmount: parseUnits("1", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });
});
