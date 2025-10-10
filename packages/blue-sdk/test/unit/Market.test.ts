import { Time } from "@morpho-org/morpho-ts";
import { randomAddress } from "@morpho-org/test/fixtures";
import { describe, expect, test } from "vitest";
import { Market } from "../../src/index.js";

describe("Market", () => {
  test("should have consistent APRs and APYs", () => {
    const timestamp = Time.timestamp();

    const market = new Market({
      params: {
        collateralToken: randomAddress(),
        loanToken: randomAddress(),
        oracle: randomAddress(),
        irm: randomAddress(),
        lltv: 86_0000000000000000n,
      },
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10000000n,
      totalBorrowShares: 9000000n,
      rateAtTarget: 10_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });

    expect(market.getAvgSupplyRate(timestamp) * Time.s.from.y(1n)).toBe(
      67_500000003024000n,
    );
    expect(market.getAvgSupplyApy(timestamp)).toBe(0.06983025960113722);
    expect(market.getAvgBorrowApy(timestamp)).toBe(0.10517091806252704);

    const market2 = new Market({
      params: {
        collateralToken: randomAddress(),
        loanToken: randomAddress(),
        oracle: randomAddress(),
        irm: randomAddress(),
        lltv: 86_0000000000000000n,
      },
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10000000n,
      totalBorrowShares: 9000000n,
      rateAtTarget: 100_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });

    expect(market2.getAvgSupplyRate(timestamp) * Time.s.from.y(1n)).toBe(
      67_4999999967168000n, // due to rounding of rateAtTarget definition
    );
    expect(market2.getAvgSupplyApy(timestamp)).toBe(0.964032975905364);
    expect(market2.getAvgBorrowApy(timestamp)).toBe(1.718281828393502);
  });
});
