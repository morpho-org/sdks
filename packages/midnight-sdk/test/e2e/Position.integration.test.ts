import { describe, expect } from "vitest";
import { fetchMarket } from "../../src/fetch/Market.js";
import {
  fetchAccrualPosition,
  fetchPosition,
} from "../../src/fetch/Position.js";
import { midnightMarket } from "./fixtures.js";
import { test } from "./setup.js";

const params = {
  marketId: midnightMarket.id,
  user: midnightMarket.borrower,
} as const;

describe("fetchPosition on fork", () => {
  test("deployless query matches the direct-read fallback", async ({
    client,
  }) => {
    const [deployless, direct] = await Promise.all([
      fetchPosition(client, { ...params, deployless: "force" }),
      fetchPosition(client, { ...params, deployless: false }),
    ]);

    expect(deployless).toEqual(direct);
    expect(deployless.user).toBe(midnightMarket.borrower);
    expect(deployless.marketId).toBe(midnightMarket.id);
    expect(deployless.debt).toBeGreaterThan(0n);
    expect(deployless.collateralBitmap).not.toBe(0n);
    expect(deployless.collateral.some((assets) => assets > 0n)).toBe(true);
  });
});

describe("fetchAccrualPosition on fork", () => {
  test("pairs the position with its own market", async ({ client }) => {
    const [accrual, position, market] = await Promise.all([
      fetchAccrualPosition(client, params),
      fetchPosition(client, params),
      fetchMarket(client, params),
    ]);

    expect(accrual.marketId).toBe(midnightMarket.id);
    expect(accrual.market).toEqual(market);
    expect(accrual.debt).toBe(position.debt);
    expect(accrual.credit).toBe(position.credit);
    expect(accrual.collateral).toEqual(position.collateral);
  });
});
