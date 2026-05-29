import { getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import { type Address, maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  NegativeBorrowSharesError,
  NegativeMaxRepaySharePriceError,
  NonPositiveAssetAmountError,
  NonPositiveMinBorrowSharePriceError,
  NonPositiveRepayMaxSharePriceError,
  RefinanceSameMarketError,
  RefinanceSharesMissingBorrowAssetsError,
  RefinanceTokenMismatchError,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import { marketV1Refinance } from "./refinance.js";

// Two markets that share loanToken + collateralToken but differ on oracle/lltv —
// the only valid topology for refinance.
const source = new MarketParams({
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  oracle: "0x1111111111111111111111111111111111111111",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860000000000000000n,
});

const target = new MarketParams({
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  oracle: "0x2222222222222222222222222222222222222222",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 915000000000000000n,
});

const USER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const baseArgs = {
  user: USER,
  collateralAmount: parseUnits("1", 18),
  minBorrowSharePrice: 0n,
  maxRepaySharePrice: 1_500_000_000_000_000_000_000_000_000n, // 1.5 ray
};

describe("marketV1Refinance", () => {
  test("default: shares mode bundle includes target dust sweep", () => {
    const tx = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: {
        ...baseArgs,
        borrowShares: parseUnits("1000", 24),
        borrowAssets: parseUnits("1001", 6), // entity-computed overshoot
      },
    });

    expect(tx.action.type).toBe("marketV1Refinance");
    expect(tx.action.args.sourceMarket).toBe(source.id);
    expect(tx.action.args.targetMarket).toBe(target.id);
    expect(tx.action.args.collateralAmount).toBe(baseArgs.collateralAmount);
    expect(tx.action.args.borrowAssets).toBe(parseUnits("1001", 6));
    expect(tx.action.args.borrowShares).toBe(parseUnits("1000", 24));
    expect(tx.action.args.user).toBe(USER);
    expect(tx.to).toBe(getChainAddresses(mainnet.id).bundler3.bundler3);
    expect(tx.value).toBe(0n);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("behavior: assets mode produces a bundle without a target dust sweep", () => {
    const tx = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: {
        ...baseArgs,
        borrowAssets: parseUnits("1000", 6),
      },
    });

    expect(tx.action.args.borrowAssets).toBe(parseUnits("1000", 6));
    expect(tx.action.args.borrowShares).toBe(0n);
  });

  test("behavior: collat-only refinance omits borrow/repay legs", () => {
    const tx = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: {
        ...baseArgs,
        borrowAssets: 0n,
        borrowShares: 0n,
      },
    });

    expect(tx.action.args.borrowAssets).toBe(0n);
    expect(tx.action.args.borrowShares).toBe(0n);
    expect(tx.to).toBe(getChainAddresses(mainnet.id).bundler3.bundler3);
    expect(tx.value).toBe(0n);
  });

  test("behavior: shares-mode sweep is encoded BEFORE source withdrawCollateral", () => {
    // In same-token markets (`loanToken === collateralToken`), a trailing `maxUint256` repay
    // after the source withdrawal would drain the just-withdrawn collateral and revert the
    // outer `safeTransferFrom`. The action must emit the sweep before the withdraw.
    const tx = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: {
        ...baseArgs,
        borrowShares: parseUnits("1000", 24),
        borrowAssets: parseUnits("1001", 6),
      },
    });

    const data = tx.data.toLowerCase();
    const sweepHex = maxUint256.toString(16); // 64 'f's — only the sweep uses `assets = maxUint256`
    // Source params are encoded inline at every call site that touches the source market.
    // Use the unique source oracle address (lowercase, unpadded) as the anchor — its last
    // occurrence in the calldata is the source `morphoWithdrawCollateral` leg.
    const sourceOracleHex = source.oracle.slice(2).toLowerCase();

    const sweepIdx = data.indexOf(sweepHex);
    const sourceWithdrawIdx = data.lastIndexOf(sourceOracleHex);

    expect(sweepIdx).toBeGreaterThan(-1);
    expect(sourceWithdrawIdx).toBeGreaterThan(-1);
    expect(sweepIdx).toBeLessThan(sourceWithdrawIdx);
  });

  test("behavior: maxUint256 sweep arg is encoded for shares-mode bundles", () => {
    // Sanity: the shares-mode bundle's last callback action is a target repay with
    // assets=maxUint256 and skipRevert=true. We verify by re-encoding without the dust
    // sweep and asserting the calldata diverges.
    const txShares = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: {
        ...baseArgs,
        borrowShares: parseUnits("1000", 24),
        borrowAssets: parseUnits("1001", 6),
      },
    });
    const txAssets = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: {
        ...baseArgs,
        borrowAssets: parseUnits("1001", 6),
      },
    });
    expect(txShares.data).not.toBe(txAssets.data);
    // The shares-mode calldata embeds maxUint256 (encoded as 64 hex `f`s).
    expect(txShares.data.toLowerCase()).toContain(maxUint256.toString(16));
  });

  test("error: ZeroCollateralAmountError when collateralAmount === 0n", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: { ...baseArgs, collateralAmount: 0n },
      }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("error: ZeroCollateralAmountError when collateralAmount is negative", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: { ...baseArgs, collateralAmount: -1n },
      }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("error: NonPositiveAssetAmountError when borrowAssets is negative", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: { ...baseArgs, borrowAssets: -1n },
      }),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("error: NegativeBorrowSharesError when borrowShares is negative", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: { ...baseArgs, borrowShares: -1n },
      }),
    ).toThrow(NegativeBorrowSharesError);
  });

  test("error: NonPositiveMinBorrowSharePriceError when minBorrowSharePrice is negative", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: { ...baseArgs, minBorrowSharePrice: -1n },
      }),
    ).toThrow(NonPositiveMinBorrowSharePriceError);
  });

  test("error: NegativeMaxRepaySharePriceError when maxRepaySharePrice is negative", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: { ...baseArgs, maxRepaySharePrice: -1n },
      }),
    ).toThrow(NegativeMaxRepaySharePriceError);
  });

  test("error: RefinanceSameMarketError when source.id === target.id", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: source },
        args: baseArgs,
      }),
    ).toThrow(RefinanceSameMarketError);
  });

  test("error: RefinanceTokenMismatchError when loanToken differs", () => {
    const mismatched = new MarketParams({
      collateralToken: source.collateralToken,
      loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      oracle: target.oracle,
      irm: target.irm,
      lltv: target.lltv,
    });
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: mismatched },
        args: baseArgs,
      }),
    ).toThrow(RefinanceTokenMismatchError);
  });

  test("error: RefinanceTokenMismatchError when collateralToken differs", () => {
    const mismatched = new MarketParams({
      collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
      loanToken: source.loanToken,
      oracle: target.oracle,
      irm: target.irm,
      lltv: target.lltv,
    });
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: mismatched },
        args: baseArgs,
      }),
    ).toThrow(RefinanceTokenMismatchError);
  });

  test("error: NonPositiveRepayMaxSharePriceError when debt is migrated with zero maxRepaySharePrice", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: {
          ...baseArgs,
          borrowAssets: parseUnits("1000", 6),
          maxRepaySharePrice: 0n,
        },
      }),
    ).toThrow(NonPositiveRepayMaxSharePriceError);
  });

  test("behavior: collat-only refinance accepts zero maxRepaySharePrice", () => {
    // Zero sentinel is legitimate in collat-only mode (no repay leg encoded).
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: {
          ...baseArgs,
          maxRepaySharePrice: 0n,
        },
      }),
    ).not.toThrow();
  });

  test("error: RefinanceSharesMissingBorrowAssetsError when shares mode passes no overshoot", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: {
          ...baseArgs,
          borrowShares: parseUnits("1000", 24),
          // borrowAssets omitted — direct callers must provide the entity-computed overshoot.
        },
      }),
    ).toThrow(RefinanceSharesMissingBorrowAssetsError);
  });

  test("error: RefinanceSharesMissingBorrowAssetsError when shares mode passes zero overshoot", () => {
    expect(() =>
      marketV1Refinance({
        source: { chainId: mainnet.id, marketParams: source },
        target: { marketParams: target },
        args: {
          ...baseArgs,
          borrowShares: parseUnits("1000", 24),
          borrowAssets: 0n,
        },
      }),
    ).toThrow(RefinanceSharesMissingBorrowAssetsError);
  });

  test("behavior: metadata is appended to tx.data when provided", () => {
    const txWithout = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: { ...baseArgs, borrowAssets: parseUnits("1000", 6) },
    });
    const txWith = marketV1Refinance({
      source: { chainId: mainnet.id, marketParams: source },
      target: { marketParams: target },
      args: { ...baseArgs, borrowAssets: parseUnits("1000", 6) },
      metadata: { origin: "a1b2c3d4" },
    });
    expect(txWith.data.length).toBeGreaterThan(txWithout.data.length);
    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
  });
});
