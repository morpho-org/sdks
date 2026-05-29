import {
  AccrualPosition,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { type Address, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { MorphoClient } from "../../client/index.js";
import {
  BorrowAmountAndSharesExclusiveError,
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  RefinanceExceedsBorrowAssetsError,
  RefinanceExceedsBorrowSharesError,
  RefinanceExceedsCollateralError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
  ZeroCollateralAmountError,
} from "../../types/index.js";

const USER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const IRM = "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC";

const sourceParams = new MarketParams({
  collateralToken: WETH,
  loanToken: USDC,
  oracle: "0x1111111111111111111111111111111111111111",
  irm: IRM,
  lltv: parseUnits("0.86", 18),
});

const targetParams = new MarketParams({
  collateralToken: WETH,
  loanToken: USDC,
  oracle: "0x2222222222222222222222222222222222222222",
  irm: IRM,
  lltv: parseUnits("0.915", 18),
});

// 1 WETH (18d) = 4_000 USDC (6d). Morpho oracle convention:
//   collateral_smallest_unit * price / ORACLE_PRICE_SCALE = loan_smallest_unit_value
// => price = 4_000 * 10**6 * ORACLE_PRICE_SCALE / 10**18 = 4e27.
const PRICE = (4_000n * 10n ** 6n * ORACLE_PRICE_SCALE) / 10n ** 18n;

const baseMarket = (params: MarketParams) =>
  new Market({
    params,
    totalSupplyAssets: parseUnits("10000000", 6),
    totalBorrowAssets: parseUnits("5000000", 6),
    totalSupplyShares: parseUnits("10000000", 12),
    totalBorrowShares: parseUnits("5000000", 12),
    lastUpdate: 1_700_000_000n,
    fee: 0n,
    price: PRICE,
  });

const makePosition = (params: {
  market: Market;
  user: Address;
  collateral?: bigint;
  borrowShares?: bigint;
  supplyShares?: bigint;
}) =>
  new AccrualPosition(
    {
      user: params.user,
      supplyShares: params.supplyShares ?? 0n,
      borrowShares: params.borrowShares ?? 0n,
      collateral: params.collateral ?? 0n,
    },
    params.market,
  );

const makeMarket = () => {
  const { client } = createMockClient(mainnet);
  return new MorphoClient(client).marketV1(sourceParams, mainnet.id);
};

describe("MorphoMarketV1.refinance", () => {
  test("error: ZeroCollateralAmountError when collateralAmount is zero", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
      borrowShares: parseUnits("100", 12),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: targetParams, positionData: targetPosition },
        collateralAmount: 0n,
      }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("error: ChainIdMismatchError when client.chain.id !== entity.chainId", () => {
    const { client } = createMockClient(mainnet);
    // Construct the entity bound to a different chain id than the client reports.
    const market = new MorphoClient(client).marketV1(sourceParams, 137);
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: targetParams, positionData: targetPosition },
        collateralAmount: parseUnits("0.5", 18),
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: RefinanceSameMarketError when source and target are the same market", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: sourceParams, positionData },
        collateralAmount: parseUnits("0.5", 18),
      }),
    ).toThrow(RefinanceSameMarketError);
  });

  test("error: RefinanceTokenMismatchError when loanToken differs", () => {
    const mismatched = new MarketParams({
      collateralToken: WETH,
      loanToken: USDT,
      oracle: targetParams.oracle,
      irm: IRM,
      lltv: targetParams.lltv,
    });
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
    });
    const targetPosition = makePosition({
      market: baseMarket(mismatched),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: mismatched, positionData: targetPosition },
        collateralAmount: parseUnits("0.5", 18),
      }),
    ).toThrow(RefinanceTokenMismatchError);
  });

  test("error: RefinanceTokenMismatchError when collateralToken differs", () => {
    const WBTC: Address = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
    const mismatched = new MarketParams({
      collateralToken: WBTC,
      loanToken: USDC,
      oracle: targetParams.oracle,
      irm: IRM,
      lltv: targetParams.lltv,
    });
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
    });
    const targetPosition = makePosition({
      market: baseMarket(mismatched),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: mismatched, positionData: targetPosition },
        collateralAmount: parseUnits("0.5", 18),
      }),
    ).toThrow(RefinanceTokenMismatchError);
  });

  test("error: RefinanceExceedsCollateralError when collateralAmount > position.collateral", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: targetParams, positionData: targetPosition },
        collateralAmount: parseUnits("2", 18),
      }),
    ).toThrow(RefinanceExceedsCollateralError);
  });

  test("error: RefinanceExceedsBorrowAssetsError when borrowAssets > position.borrowAssets", () => {
    const market = makeMarket();
    // borrowShares = 100 (12-decimal share units) → borrowAssets ≈ 50 USDC at our 2:1
    // shares:assets ratio. Asking for 1000 USDC of asset repay exceeds that.
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
      borrowShares: parseUnits("100", 12),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: targetParams, positionData: targetPosition },
        collateralAmount: parseUnits("0.1", 18),
        borrowAssets: parseUnits("1000", 6),
      }),
    ).toThrow(RefinanceExceedsBorrowAssetsError);
  });

  test("error: BorrowAmountAndSharesExclusiveError when both borrowAssets and borrowShares are positive", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
      borrowShares: parseUnits("100", 12),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: targetParams, positionData: targetPosition },
        collateralAmount: parseUnits("0.1", 18),
        borrowAssets: parseUnits("10", 6),
        borrowShares: parseUnits("100", 12),
      }),
    ).toThrow(BorrowAmountAndSharesExclusiveError);
  });

  test("error: RefinanceExceedsBorrowSharesError when borrowShares > position.borrowShares", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
      borrowShares: parseUnits("100", 12),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: targetParams, positionData: targetPosition },
        collateralAmount: parseUnits("0.1", 18),
        borrowShares: parseUnits("200", 12),
      }),
    ).toThrow(RefinanceExceedsBorrowSharesError);
  });

  test("error: BorrowExceedsSafeLtvError when partial migration leaves residual unhealthy", () => {
    // 1 WETH collateral ($4000 power), ~1000 USDC debt — currently safe on source.
    // Migrating ALL collateral while leaving the debt creates a zero-collateral residual,
    // which the LLTV check rejects.
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
      borrowShares: parseUnits("1000", 12),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    expect(() =>
      market.refinance({
        userAddress: USER,
        positionData,
        target: { marketParams: targetParams, positionData: targetPosition },
        collateralAmount: parseUnits("1", 18),
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
  });

  test("default: shares-mode full close builds a valid bundle", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
      borrowShares: parseUnits("100", 12),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    const refi = market.refinance({
      userAddress: USER,
      positionData,
      target: { marketParams: targetParams, positionData: targetPosition },
      collateralAmount: parseUnits("1", 18),
      borrowShares: parseUnits("100", 12),
    });

    const tx = refi.buildTx();
    expect(tx.action.type).toBe("marketV1Refinance");
    expect(tx.action.args.sourceMarket).toBe(sourceParams.id);
    expect(tx.action.args.targetMarket).toBe(targetParams.id);
    expect(tx.action.args.borrowShares).toBe(parseUnits("100", 12));
    // Overshoot inflates borrowAssets above zero (target-borrow leg encoded).
    expect(tx.action.args.borrowAssets).toBeGreaterThan(0n);
    expect(tx.action.args.user).toBe(USER);
  });

  test("default: assets-mode partial migration builds a valid bundle", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
      borrowShares: parseUnits("100", 12),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    const refi = market.refinance({
      userAddress: USER,
      positionData,
      target: { marketParams: targetParams, positionData: targetPosition },
      collateralAmount: parseUnits("0.5", 18),
      borrowAssets: parseUnits("50", 6),
    });

    const tx = refi.buildTx();
    expect(tx.action.args.borrowAssets).toBe(parseUnits("50", 6));
    expect(tx.action.args.borrowShares).toBe(0n);
  });

  test("default: collat-only migration builds a valid bundle", () => {
    const market = makeMarket();
    const positionData = makePosition({
      market: baseMarket(sourceParams),
      user: USER,
      collateral: parseUnits("1", 18),
    });
    const targetPosition = makePosition({
      market: baseMarket(targetParams),
      user: USER,
    });

    const refi = market.refinance({
      userAddress: USER,
      positionData,
      target: { marketParams: targetParams, positionData: targetPosition },
      collateralAmount: parseUnits("1", 18),
    });

    const tx = refi.buildTx();
    expect(tx.action.args.borrowAssets).toBe(0n);
    expect(tx.action.args.borrowShares).toBe(0n);
  });
});
