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
  MissingAccrualPositionError,
  morphoViemExtension,
  NonPositiveRepayAmountError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  ShareDivideByZeroError,
} from "../../../src/index.js";
import { WethUsdsBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral } from "../../helpers/blue.js";
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
          amount: repayAmount,
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

  test("should repay end-to-end with native ETH (wNative loan)", async ({
    client,
  }) => {
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1", 18);
    const nativeAmount = parseUnits("0.5", 18);

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

    // Fund the account with native ETH to wrap for the repay.
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

        // Fully native repay: no ERC-20 pulled, funded entirely by wrapped ETH.
        const repay = market.repay({
          userAddress: client.account.address,
          amount: 0n,
          nativeAmount,
          positionData,
        });

        // A fully-native repay pulls no ERC-20, so it needs no approval.
        const requirements = await repay.getRequirements();
        expect(requirements.length).toBe(0);

        const tx = repay.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        await client.sendTransaction(tx);
      },
    });

    // The wrapped ETH repaid WETH into Morpho.
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + nativeAmount,
    );
    // Debt was reduced.
    expect(finalState.position.borrowShares).toBeLessThan(
      initialState.position.borrowShares,
    );
    // Paid in native ETH: the user's ERC-20 loan-token balance is untouched.
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance,
    );
    // Collateral unchanged (repay only).
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral,
    );
  });

  test("should repay (assets) funded partly by ERC-20 and partly by native ETH", async ({
    client,
  }) => {
    // WstethWethBlue's loan token is wNative (WETH), so a repay can mix funding:
    // `amount` is pulled as ERC-20 WETH and `nativeAmount` is wrapped from ETH.
    // Assets mode is additive (like supply): the repaid total is amount + nativeAmount.
    const collateralAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1", 18);
    const erc20Part = parseUnits("0.3", 18); // pulled as ERC-20 WETH
    const nativePart = parseUnits("0.2", 18); // wrapped from native ETH
    const totalRepaid = erc20Part + nativePart;

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

    // Fund the account with native ETH to wrap for the repay (plus gas).
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
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const repay = market.repay({
          userAddress: client.account.address,
          amount: erc20Part,
          nativeAmount: nativePart,
          positionData,
        });

        // The approval must cover ONLY the ERC-20 portion, not the wrapped native.
        const requirements = await repay.getRequirements();
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        expect(approval.action.args.amount).toEqual(erc20Part);
        await client.sendTransaction(approval);

        const tx = repay.buildTx();
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
    // The wrapped ETH (plus gas) left the user's native balance.
    expect(finalState.userNativeBalance).toBeLessThan(
      initialState.userNativeBalance - nativePart,
    );
    // Partial repay: debt reduced but not closed; collateral untouched.
    expect(finalState.position.borrowShares).toBeLessThan(
      initialState.position.borrowShares,
    );
    expect(finalState.position.borrowShares).toBeGreaterThan(0n);
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral,
    );
  });

  test("should full repay by shares funded partly by native ETH (net of native)", async ({
    client,
  }) => {
    // Shares mode carves native out of the transfer: the ERC-20 pulled is
    // `toBorrowAssets(shares) - nativeAmount`, and the wrapped ETH funds the rest.
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
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const repay = market.repay({
          userAddress: client.account.address,
          shares: positionData.borrowShares,
          nativeAmount: nativePart,
          positionData,
        });

        const requirements = await repay.getRequirements();
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

        const tx = repay.buildTx();
        expect(tx.value).toEqual(nativePart);
        await client.sendTransaction(tx);
      },
    });

    // Full close, funded by ERC-20 + wrapped ETH.
    expect(finalState.position.borrowShares).toBe(0n);
    expect(finalState.morphoLoanTokenBalance).toBeGreaterThan(
      initialState.morphoLoanTokenBalance,
    );
    // The wrapped ETH (plus gas) left the user's native balance.
    expect(finalState.userNativeBalance).toBeLessThan(
      initialState.userNativeBalance - nativePart,
    );
    // Collateral untouched (repay only).
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
        amount: borrowAmount * 2n,
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
        amount: 1n,
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
        amount: 0n,
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
        amount: parseUnits("100", 18),
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(MissingAccrualPositionError);
  });
});
