import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { SimulationState } from "../../result.js";
import { diffState } from "./diff.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const MARKET_ID =
  "0xb8c25cd0a6f03f8b34c8b9b12e24a2a1b3f0f0f0f0f0f0f0f0f0f0f0f0f0f0f" as MarketId;

const state = (overrides: Partial<SimulationState> = {}): SimulationState => ({
  balances: [],
  allowances: [],
  morphoAuthorizations: [],
  nonces: [],
  positions: [],
  markets: [],
  vaults: [],
  ...overrides,
});

describe("diffState", () => {
  test("default: unchanged subjects are omitted", () => {
    const s = state({
      balances: [{ account: OWNER, token: TOKEN, assets: 100n }],
    });
    expect(diffState(s, s)).toEqual({
      balances: [],
      allowances: [],
      positions: [],
      markets: [],
      vaults: [],
    });
  });

  test("balances carry signed after − before diffs", () => {
    const before = state({
      balances: [{ account: OWNER, token: TOKEN, assets: 100n }],
    });
    const after = state({
      balances: [{ account: OWNER, token: TOKEN, assets: 30n }],
    });
    const diff = diffState(before, after);
    expect(diff.balances).toEqual([
      { account: OWNER, token: TOKEN, assets: -70n },
    ]);
  });

  test("positions and markets diff each numeric field", () => {
    const position = {
      marketId: MARKET_ID,
      user: OWNER,
      supplyAssets: 0n,
      supplyShares: 0n,
      borrowAssets: 0n,
      borrowShares: 0n,
      collateral: 0n,
    };
    const market = {
      marketId: MARKET_ID,
      totalSupplyAssets: 1000n,
      totalSupplyShares: 1000n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      liquidityAssets: 1000n,
      lastUpdate: 1n,
      feeWad: 0n,
    };
    const diff = diffState(
      state({ positions: [position], markets: [market] }),
      state({
        positions: [{ ...position, supplyShares: 5n }],
        markets: [
          { ...market, totalSupplyAssets: 1100n, liquidityAssets: 1100n },
        ],
      }),
    );
    expect(diff.positions).toEqual([
      {
        marketId: MARKET_ID,
        user: OWNER,
        supplyAssets: 0n,
        supplyShares: 5n,
        borrowAssets: 0n,
        borrowShares: 0n,
        collateral: 0n,
      },
    ]);
    expect(diff.markets).toEqual([
      {
        marketId: MARKET_ID,
        totalSupplyAssets: 100n,
        totalSupplyShares: 0n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        liquidityAssets: 100n,
      },
    ]);
  });
});
