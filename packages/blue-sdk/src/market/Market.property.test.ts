// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  amount,
  edgeBiased,
  MAX_TOTAL,
  total,
} from "../__test__/arbitraries.js";
import { marketInput, marketParams } from "../__test__/fixtures.js";
import {
  isHealthy,
  lltvArbitrary,
  MAX_UINT_128,
  maxBorrow,
  positionStateCase,
  positiveLltv,
  priceArbitrary,
  uint128,
  VIRTUAL_SHARES,
} from "../__test__/morphoModel.js";
import { BlueErrors } from "../errors.js";
import { Market } from "./Market.js";
import { MarketUtils } from "./MarketUtils.js";

const positiveAmount = edgeBiased(1n, MAX_UINT_128);
const positiveTotal = edgeBiased(1n, MAX_TOTAL);
const min = (...values: bigint[]) =>
  values.reduce((smallest, value) => (value < smallest ? value : smallest));
const marketState = fc
  .record({
    totalSupplyAssets: total,
    totalSupplyShares: total,
    totalBorrowShares: total,
  })
  .chain((state) =>
    edgeBiased(0n, state.totalSupplyAssets).map((totalBorrowAssets) => ({
      ...state,
      totalBorrowAssets,
    })),
  );
const chooseInput = <TState>({
  state,
  maxAssets,
  maxShares,
}: {
  state: TState;
  maxAssets: bigint;
  maxShares: bigint;
}) => {
  const byAssets =
    maxAssets === 0n
      ? undefined
      : edgeBiased(1n, maxAssets).map((assets) => ({
          state,
          assets,
          shares: 0n,
        }));
  const byShares =
    maxShares === 0n
      ? undefined
      : edgeBiased(1n, maxShares).map((shares) => ({
          state,
          assets: 0n,
          shares,
        }));

  if (byAssets && byShares)
    return fc.boolean().chain((isShares) => (isShares ? byShares : byAssets));
  if (byAssets) return byAssets;
  if (byShares) return byShares;
  return fc.constant({ state, assets: 0n, shares: 0n });
};
const supplyInput = marketState.chain((state) => {
  const assetRoom = MAX_UINT_128 - state.totalSupplyAssets;
  const shareRoom = MAX_UINT_128 - state.totalSupplyShares;
  const maxAssetsByShares =
    ((shareRoom + 1n) * (state.totalSupplyAssets + 1n) - 1n) /
    (state.totalSupplyShares + VIRTUAL_SHARES);
  const maxAssets = min(assetRoom, maxAssetsByShares);
  const maxSharesByAssets =
    (assetRoom * (state.totalSupplyShares + VIRTUAL_SHARES)) /
    (state.totalSupplyAssets + 1n);
  const maxShares = min(shareRoom, maxSharesByAssets);

  return chooseInput({ state, maxAssets, maxShares });
});
const supplyOverflowInput = positiveAmount.map((shares) => ({
  state: {
    totalSupplyAssets: 0n,
    totalSupplyShares: MAX_UINT_128 - shares + 1n,
    totalBorrowAssets: 0n,
    totalBorrowShares: 0n,
  },
  shares,
}));
const borrowOverflowInput = positiveAmount.map((shares) => ({
  state: {
    totalSupplyAssets: MAX_TOTAL,
    totalSupplyShares: 0n,
    totalBorrowAssets: 0n,
    totalBorrowShares: MAX_UINT_128 - shares + 1n,
  },
  shares,
}));
const withdrawLiquidityInput = marketState.chain((state) => {
  if (state.totalSupplyShares === 0n)
    return fc.constant({ state, value: 0n, byShares: false });

  const maxAssets =
    (state.totalSupplyShares * (state.totalSupplyAssets + 1n)) /
    (state.totalSupplyShares + VIRTUAL_SHARES);
  const byShares = fc
    .bigInt({ min: 1n, max: state.totalSupplyShares })
    .map((value) => ({ state, value, byShares: true }));

  if (maxAssets === 0n) return byShares;

  const byAssets = fc
    .bigInt({ min: 1n, max: maxAssets })
    .map((value) => ({ state, value, byShares: false }));
  return fc.boolean().chain((isShares) => (isShares ? byShares : byAssets));
});
const withdrawInput = marketState.chain((state) => {
  const inputState = {
    ...state,
    totalSupplyAssets:
      state.totalSupplyAssets === state.totalBorrowAssets &&
      state.totalSupplyAssets < MAX_TOTAL
        ? state.totalSupplyAssets + 1n
        : state.totalSupplyAssets,
    totalBorrowAssets:
      state.totalSupplyAssets === MAX_TOTAL &&
      state.totalBorrowAssets === MAX_TOTAL
        ? state.totalBorrowAssets - 1n
        : state.totalBorrowAssets,
    totalSupplyShares:
      state.totalSupplyShares === 0n ? 1n : state.totalSupplyShares,
  };
  const liquidity = inputState.totalSupplyAssets - inputState.totalBorrowAssets;
  const maxAssetsByShares =
    (inputState.totalSupplyShares * (inputState.totalSupplyAssets + 1n)) /
    (inputState.totalSupplyShares + VIRTUAL_SHARES);
  const maxAssets = min(liquidity, maxAssetsByShares);
  const maxSharesByLiquidity =
    ((liquidity + 1n) * (inputState.totalSupplyShares + VIRTUAL_SHARES) - 1n) /
    (inputState.totalSupplyAssets + 1n);
  const maxShares = min(inputState.totalSupplyShares, maxSharesByLiquidity);

  return chooseInput({ state: inputState, maxAssets, maxShares });
});
const withdrawUnderflowInput = marketState.chain((state) => {
  const liquidity = state.totalSupplyAssets - state.totalBorrowAssets;
  const maxShares =
    ((liquidity + 1n) * (state.totalSupplyShares + VIRTUAL_SHARES) - 1n) /
    (state.totalSupplyAssets + 1n);
  const maxExtra = maxShares - state.totalSupplyShares;

  if (maxExtra < 1n) return fc.constant({ state, extra: 0n });

  return edgeBiased(1n, maxExtra).map((extra) => ({ state, extra }));
});
const borrowInput = marketState.chain((state) => {
  const inputState =
    state.totalSupplyAssets === state.totalBorrowAssets &&
    state.totalSupplyAssets < MAX_TOTAL
      ? { ...state, totalSupplyAssets: state.totalSupplyAssets + 1n }
      : state.totalSupplyAssets === MAX_TOTAL &&
          state.totalBorrowAssets === MAX_TOTAL
        ? { ...state, totalBorrowAssets: state.totalBorrowAssets - 1n }
        : state;
  const liquidity = inputState.totalSupplyAssets - inputState.totalBorrowAssets;
  const assetRoom = MAX_UINT_128 - inputState.totalBorrowAssets;
  const shareRoom = MAX_UINT_128 - inputState.totalBorrowShares;
  const maxAssetsByShares =
    (shareRoom * (inputState.totalBorrowAssets + 1n)) /
    (inputState.totalBorrowShares + VIRTUAL_SHARES);
  const maxAssets = min(liquidity, assetRoom, maxAssetsByShares);
  const maxSharesByLiquidity =
    (liquidity * (inputState.totalBorrowShares + VIRTUAL_SHARES)) /
    (inputState.totalBorrowAssets + 1n);
  const maxSharesByAssets =
    ((assetRoom + 1n) * (inputState.totalBorrowShares + VIRTUAL_SHARES) - 1n) /
    (inputState.totalBorrowAssets + 1n);
  const maxShares = min(shareRoom, maxSharesByLiquidity, maxSharesByAssets);

  return chooseInput({ state: inputState, maxAssets, maxShares });
});
const borrowLiquidityInput = marketState.chain((state) => {
  const assetRoom = MAX_UINT_128 - state.totalBorrowAssets;
  const shareRoom = MAX_UINT_128 - state.totalBorrowShares;
  const maxAssetsByShares =
    (shareRoom * (state.totalBorrowAssets + 1n)) /
    (state.totalBorrowShares + VIRTUAL_SHARES);
  const maxAssets = min(assetRoom, maxAssetsByShares);
  const maxSharesByAssets =
    ((assetRoom + 1n) * (state.totalBorrowShares + VIRTUAL_SHARES) - 1n) /
    (state.totalBorrowAssets + 1n);
  const maxShares = min(shareRoom, maxSharesByAssets);

  return chooseInput({ state, maxAssets, maxShares });
});
const borrowRepayInput = marketState.chain((state) => {
  const assetRoom = MAX_UINT_128 - state.totalSupplyAssets;
  const shareRoom = MAX_UINT_128 - state.totalBorrowShares;
  const maxAssetsByShares =
    (shareRoom * (state.totalBorrowAssets + 1n)) /
    (state.totalBorrowShares + VIRTUAL_SHARES);
  const maxAssets = min(assetRoom, maxAssetsByShares);

  if (maxAssets === 0n) return fc.constant({ state, assets: 0n });

  return edgeBiased(1n, maxAssets).map((assets) => ({ state, assets }));
});
const repayInput = marketState.chain((state) => {
  const inputState = {
    ...state,
    totalBorrowShares:
      state.totalBorrowShares === 0n ? 1n : state.totalBorrowShares,
  };
  const maxAssets =
    (inputState.totalBorrowShares * (inputState.totalBorrowAssets + 1n)) /
    (inputState.totalBorrowShares + VIRTUAL_SHARES);
  return chooseInput({
    state: inputState,
    maxAssets,
    maxShares: inputState.totalBorrowShares,
  });
});
// morpho-blue/src/Morpho.sol: supply.
describe.sequential("supply", () => {
  test.prop([supplyInput], { numRuns: 1_000 })(
    "default",
    ({ state, assets: inputAssets, shares: inputShares }) => {
      if (inputAssets === 0n && inputShares === 0n) return;

      const market = new Market(marketInput(state));
      const result = market.supply(inputAssets, inputShares, market.lastUpdate);
      const assets =
        inputShares === 0n
          ? inputAssets
          : (inputShares * (state.totalSupplyAssets + 1n) +
              state.totalSupplyShares +
              VIRTUAL_SHARES -
              1n) /
            (state.totalSupplyShares + VIRTUAL_SHARES);
      const shares =
        inputShares === 0n
          ? (inputAssets * (state.totalSupplyShares + VIRTUAL_SHARES)) /
            (state.totalSupplyAssets + 1n)
          : inputShares;

      expect(result.assets).toBe(assets);
      expect(result.shares).toBe(shares);
      expect(result.market.totalSupplyAssets).toBe(
        state.totalSupplyAssets + assets,
      );
      expect(result.market.totalSupplyShares).toBe(
        state.totalSupplyShares + shares,
      );
    },
  );

  test.prop([supplyInput], { numRuns: 1_000 })(
    "behavior: supplying then withdrawing the minted shares does not overpay",
    ({ state, assets, shares }) => {
      if (assets === 0n && shares === 0n) return;

      const market = new Market(marketInput(state));
      const supplied = market.supply(assets, shares, market.lastUpdate);
      if (supplied.shares === 0n) return;

      const withdrawn = supplied.market.withdraw(
        0n,
        supplied.shares,
        supplied.market.lastUpdate,
      );
      expect(withdrawn.assets).toBeLessThanOrEqual(supplied.assets);
    },
  );

  // Solidity reverts on uint128 overflow; the SDK does not. Flip to test.prop once the SDK matches.
  test.fails.prop([supplyOverflowInput], {
    examples: [
      [
        {
          state: {
            totalSupplyAssets: 0n,
            totalSupplyShares: MAX_UINT_128,
            totalBorrowAssets: 0n,
            totalBorrowShares: 0n,
          },
          shares: 1n,
        },
      ],
    ],
    numRuns: 1_000,
  })("error: totals past uint128 throw", ({ state, shares }) => {
    const market = new Market(marketInput(state));
    expect(() => market.supply(0n, shares, market.lastUpdate)).toThrow();
  });

  // Confirms this expected failure is the tracked divergence; flip it together
  // with the fails.prop.
  test("behavior: pinned supply overflow returns total shares past uint128", () => {
    const market = new Market(
      marketInput({
        totalSupplyAssets: 0n,
        totalSupplyShares: MAX_UINT_128,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
      }),
    );
    const result = market.supply(0n, 1n, market.lastUpdate);

    expect(result.market.totalSupplyShares).toBe(MAX_UINT_128 + 1n);
  });
});

// morpho-blue/src/Morpho.sol: withdraw.
describe.sequential("withdraw", () => {
  test.prop([withdrawInput], { numRuns: 1_000 })(
    "default",
    ({ state, assets: inputAssets, shares: inputShares }) => {
      const market = new Market(marketInput(state));
      const result = market.withdraw(
        inputAssets,
        inputShares,
        market.lastUpdate,
      );
      const assets =
        inputShares === 0n
          ? inputAssets
          : (inputShares * (state.totalSupplyAssets + 1n)) /
            (state.totalSupplyShares + VIRTUAL_SHARES);
      const shares =
        inputShares === 0n
          ? (inputAssets * (state.totalSupplyShares + VIRTUAL_SHARES) +
              state.totalSupplyAssets) /
            (state.totalSupplyAssets + 1n)
          : inputShares;

      expect(result.assets).toBe(assets);
      expect(result.shares).toBe(shares);
      expect(result.market.totalSupplyAssets).toBe(
        state.totalSupplyAssets - assets,
      );
      expect(result.market.totalSupplyShares).toBe(
        state.totalSupplyShares - shares,
      );
    },
  );

  test.prop([withdrawLiquidityInput], { numRuns: 1_000 })(
    "behavior: throws InsufficientLiquidity exactly when assets exceed liquidity",
    ({ state, value, byShares }) => {
      if (value === 0n) return;

      const market = new Market(marketInput(state));
      const assets = byShares
        ? (value * (state.totalSupplyAssets + 1n)) /
          (state.totalSupplyShares + VIRTUAL_SHARES)
        : value;
      const shares = byShares ? value : 0n;
      const newTotalSupplyAssets = state.totalSupplyAssets - assets;
      const operation = () =>
        market.withdraw(byShares ? 0n : assets, shares, market.lastUpdate);

      if (newTotalSupplyAssets < state.totalBorrowAssets)
        expect(operation).toThrow(BlueErrors.InsufficientLiquidity);
      else expect(operation).not.toThrow();
    },
  );

  // SDK returns negative totals for Solidity share underflow. Flip to test.prop once the SDK matches.
  test.fails.prop([withdrawUnderflowInput], {
    examples: [
      [
        {
          state: {
            totalSupplyAssets: 0n,
            totalSupplyShares: 0n,
            totalBorrowAssets: 0n,
            totalBorrowShares: 0n,
          },
          extra: 999_999n,
        },
      ],
    ],
    numRuns: 1_000,
  })(
    "error: withdrawing more shares than the market's supply shares throws",
    ({ state, extra }) => {
      if (extra === 0n) return;

      const market = new Market(marketInput(state));
      expect(() =>
        market.withdraw(0n, state.totalSupplyShares + extra, market.lastUpdate),
      ).toThrow();
    },
  );

  // Confirms this expected failure is the tracked divergence; flip it together
  // with the fails.prop.
  test("behavior: pinned withdraw underflow returns negative supply shares", () => {
    const market = new Market(
      marketInput({
        totalSupplyAssets: 0n,
        totalSupplyShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
      }),
    );
    const result = market.withdraw(0n, 999_999n, market.lastUpdate);

    expect(result.shares).toBe(999_999n);
    expect(result.market.totalSupplyShares).toBe(-999_999n);
  });
});

// morpho-blue/src/Morpho.sol: borrow.
describe.sequential("borrow", () => {
  test.prop([borrowInput], { numRuns: 1_000 })(
    "default",
    ({ state, assets: inputAssets, shares: inputShares }) => {
      if (inputAssets === 0n && inputShares === 0n) return;

      const market = new Market(marketInput(state));
      const result = market.borrow(inputAssets, inputShares, market.lastUpdate);
      const assets =
        inputShares === 0n
          ? inputAssets
          : (inputShares * (state.totalBorrowAssets + 1n)) /
            (state.totalBorrowShares + VIRTUAL_SHARES);
      const shares =
        inputShares === 0n
          ? (inputAssets * (state.totalBorrowShares + VIRTUAL_SHARES) +
              state.totalBorrowAssets) /
            (state.totalBorrowAssets + 1n)
          : inputShares;

      expect(result.assets).toBe(assets);
      expect(result.shares).toBe(shares);
      expect(result.market.totalBorrowAssets).toBe(
        state.totalBorrowAssets + assets,
      );
      expect(result.market.totalBorrowShares).toBe(
        state.totalBorrowShares + shares,
      );
    },
  );

  // Solidity reverts on uint128 overflow; the SDK does not. Flip to test.prop once the SDK matches.
  test.fails.prop([borrowOverflowInput], {
    examples: [
      [
        {
          state: {
            totalSupplyAssets: MAX_TOTAL,
            totalSupplyShares: 0n,
            totalBorrowAssets: 0n,
            totalBorrowShares: MAX_UINT_128,
          },
          shares: 1n,
        },
      ],
    ],
    numRuns: 1_000,
  })("error: totals past uint128 throw", ({ state, shares }) => {
    const market = new Market(marketInput(state));
    expect(() => market.borrow(0n, shares, market.lastUpdate)).toThrow();
  });

  // Confirms this expected failure is the tracked divergence; flip it together
  // with the fails.prop.
  test("behavior: pinned borrow overflow returns total shares past uint128", () => {
    const market = new Market(
      marketInput({
        totalSupplyAssets: MAX_TOTAL,
        totalSupplyShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: MAX_UINT_128,
      }),
    );
    const result = market.borrow(0n, 1n, market.lastUpdate);

    expect(result.market.totalBorrowShares).toBe(MAX_UINT_128 + 1n);
  });

  test.prop([borrowLiquidityInput], { numRuns: 1_000 })(
    "behavior: throws InsufficientLiquidity exactly when borrow exceeds supply",
    ({ state, assets, shares }) => {
      if (assets === 0n && shares === 0n) return;

      const market = new Market(marketInput(state));
      const operation = () => market.borrow(assets, shares, market.lastUpdate);
      const borrowedAssets =
        shares === 0n
          ? assets
          : (shares * (state.totalBorrowAssets + 1n)) /
            (state.totalBorrowShares + VIRTUAL_SHARES);

      if (state.totalBorrowAssets + borrowedAssets > state.totalSupplyAssets)
        expect(operation).toThrow(BlueErrors.InsufficientLiquidity);
      else expect(operation).not.toThrow();
    },
  );

  test.prop([borrowRepayInput], { numRuns: 1_000 })(
    "behavior: borrowing then repaying the minted shares costs enough",
    ({ state, assets }) => {
      if (assets === 0n) return;

      const market = new Market(
        marketInput({
          ...state,
          totalSupplyAssets: state.totalSupplyAssets + assets,
        }),
      );
      const borrowed = market.borrow(assets, 0n, market.lastUpdate);
      if (borrowed.shares === 0n) return;

      const repaid = borrowed.market.repay(
        0n,
        borrowed.shares,
        borrowed.market.lastUpdate,
      );
      expect(repaid.assets).toBeGreaterThanOrEqual(assets);
    },
  );
});

// morpho-blue/src/Morpho.sol: repay.
describe.sequential("repay", () => {
  test.prop([repayInput], { numRuns: 1_000 })(
    "default",
    ({ state, assets: inputAssets, shares: inputShares }) => {
      const market = new Market(marketInput(state));
      const result = market.repay(inputAssets, inputShares, market.lastUpdate);
      const assets =
        inputShares === 0n
          ? inputAssets
          : (inputShares * (state.totalBorrowAssets + 1n) +
              state.totalBorrowShares +
              VIRTUAL_SHARES -
              1n) /
            (state.totalBorrowShares + VIRTUAL_SHARES);
      const shares =
        inputShares === 0n
          ? (inputAssets * (state.totalBorrowShares + VIRTUAL_SHARES)) /
            (state.totalBorrowAssets + 1n)
          : inputShares;

      expect(result.assets).toBe(assets);
      expect(result.shares).toBe(shares);
      expect(result.market.totalBorrowAssets).toBe(
        assets > state.totalBorrowAssets
          ? 0n
          : state.totalBorrowAssets - assets,
      );
      expect(result.market.totalBorrowShares).toBe(
        state.totalBorrowShares - shares,
      );
    },
  );

  // SDK returns negative totals for Solidity share underflow. Flip to test.prop once the SDK matches.
  test.fails.prop([marketState, positiveTotal], {
    examples: [
      [
        {
          totalSupplyAssets: 4_000_000n,
          totalSupplyShares: 3_000_001n,
          totalBorrowAssets: 2_000_000n,
          totalBorrowShares: 1_000_001n,
        },
        1n,
      ],
    ],
    numRuns: 1_000,
  })(
    "error: repaying more shares than the market's borrow shares throws",
    (state, extra) => {
      const market = new Market(marketInput(state));
      expect(() =>
        market.repay(0n, state.totalBorrowShares + extra, market.lastUpdate),
      ).toThrow();
    },
  );

  // Confirms this expected failure is the tracked divergence; flip it together
  // with the fails.prop.
  test("behavior: pinned repay underflow returns negative borrow shares", () => {
    const market = new Market(
      marketInput({
        totalSupplyAssets: 4_000_000n,
        totalSupplyShares: 3_000_001n,
        totalBorrowAssets: 2_000_000n,
        totalBorrowShares: 1_000_001n,
      }),
    );
    const result = market.repay(0n, 1_000_002n, market.lastUpdate);

    expect(result.assets).toBe(1_000_002n);
    expect(result.shares).toBe(1_000_002n);
    expect(result.market.totalBorrowAssets).toBe(999_998n);
    expect(result.market.totalBorrowShares).toBe(-1n);
  });
});

// morpho-blue/src/libraries/SharesMathLib.sol conversions delegated by Market.ts.
describe.sequential("Market conversion methods", () => {
  test.prop([marketState, amount, fc.constantFrom("Down", "Up")], {
    numRuns: 1_000,
  })("default", (state, value, rounding) => {
    const market = new Market(marketInput(state));

    expect(market.toSupplyAssets(value, rounding)).toBe(
      MarketUtils.toSupplyAssets(value, state, rounding),
    );
    expect(market.toSupplyShares(value, rounding)).toBe(
      MarketUtils.toSupplyShares(value, state, rounding),
    );
    expect(market.toBorrowAssets(value, rounding)).toBe(
      MarketUtils.toBorrowAssets(value, state, rounding),
    );
    expect(market.toBorrowShares(value, rounding)).toBe(
      MarketUtils.toBorrowShares(value, state, rounding),
    );
  });
});
const marketCase = positionStateCase();

const withdrawCase = fc
  .record({
    totalBorrowAssets: uint128,
    totalBorrowShares: uint128,
    price: priceArbitrary,
    collateral: uint128,
    lltv: positiveLltv,
    firstMaxLtv: positiveLltv,
    secondMaxLtv: positiveLltv,
  })
  .chain(
    ({
      totalBorrowAssets,
      totalBorrowShares,
      price,
      collateral,
      lltv,
      firstMaxLtv,
      secondMaxLtv,
    }) =>
      fc.record({
        totalBorrowAssets: fc.constant(totalBorrowAssets),
        totalBorrowShares: fc.constant(totalBorrowShares),
        price: fc.constant(price),
        collateral: fc.constant(collateral),
        lltv: fc.constant(lltv),
        firstMaxLtv: fc.constant(firstMaxLtv),
        secondMaxLtv: fc.constant(secondMaxLtv),
        borrowShares: fc.bigInt({
          min: 0n,
          max: totalBorrowShares,
        }),
      }),
  );

function createMarket(input: {
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  price: bigint;
  lltv: bigint;
}) {
  return new Market(
    marketInput({
      params: marketParams({ lltv: input.lltv }),
      totalBorrowAssets: input.totalBorrowAssets,
      totalBorrowShares: input.totalBorrowShares,
      price: input.price,
    }),
  );
}

// morpho-blue src/Morpho.sol _isHealthy
describe("Market.getMaxBorrowAssets", () => {
  test.prop([marketCase, lltvArbitrary], { numRuns: 1000 })(
    "default",
    (input, maxLtv) => {
      const market = createMarket(input);
      const effectiveLtv = min(maxLtv, input.lltv);
      const maxBorrowAssets = market.getMaxBorrowAssets(input.collateral, {
        maxLtv,
      });

      expect(maxBorrowAssets).toBe(
        maxBorrow(input.collateral, input.price, effectiveLtv),
      );
      expect(maxBorrowAssets!).toBeLessThanOrEqual(
        market.getMaxBorrowAssets(input.collateral)!,
      );
    },
  );
});

// morpho-blue src/Morpho.sol _isHealthy
describe("Market.isHealthy", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    expect(
      createMarket(input).isHealthy({
        collateral: input.collateral,
        borrowShares: input.borrowShares,
      }),
    ).toBe(
      isHealthy(
        input.collateral,
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
        input.price,
        input.lltv,
      ),
    );
  });
});

// morpho-blue src/Morpho.sol withdrawCollateral and _isHealthy
describe("Market.getWithdrawableCollateral", () => {
  test.prop([withdrawCase], { numRuns: 1000 })(
    "behavior: decreases with maxLtv and never exceeds the default",
    (input) => {
      const market = createMarket(input);
      const position = {
        collateral: input.collateral,
        borrowShares: input.borrowShares,
      };
      const lowerMaxLtv = min(input.firstMaxLtv, input.secondMaxLtv);
      const higherMaxLtv =
        input.firstMaxLtv < input.secondMaxLtv
          ? input.secondMaxLtv
          : input.firstMaxLtv;
      const lower = market.getWithdrawableCollateral(position, {
        maxLtv: lowerMaxLtv,
      })!;
      const higher = market.getWithdrawableCollateral(position, {
        maxLtv: higherMaxLtv,
      })!;
      const defaultValue = market.getWithdrawableCollateral(position)!;

      expect(lower).toBeLessThanOrEqual(higher);
      expect(higher).toBeLessThanOrEqual(defaultValue);
    },
  );
});
