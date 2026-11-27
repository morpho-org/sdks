import { MarketUtils } from "@morpho-org/midnight-sdk";
import { maxUint256 } from "viem";
import { expect, test } from "vitest";
import { midnightMarket } from "../../test/fixtures/midnight.js";
import { computeMidnightPostWithdrawalCollateral } from "./computeMidnightPostWithdrawalCollateral.js";

test("uses the remaining collateral for maxUint256 after a same-index withdrawal", () => {
  const collateral = [200n];
  expect(
    computeMidnightPostWithdrawalCollateral({
      market: midnightMarket,
      marketId: MarketUtils.toId(midnightMarket),
      collateral,
      withdrawals: [
        { collateralIndex: 0n, assets: 121n },
        { collateralIndex: 0n, assets: maxUint256 },
      ],
    }),
  ).toEqual({ postCollateral: [0n], withdrawAmount: 200n });
  expect(collateral).toEqual([200n]);
});
