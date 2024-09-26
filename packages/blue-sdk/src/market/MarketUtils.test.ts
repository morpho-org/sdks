import { MathLib } from "../maths";
import { Address } from "../types";
import { MarketUtils } from "./MarketUtils";

const market = {
  loanToken: "0x0000000000000000000000000000000000000001" as Address,
  collateralToken: "0x0000000000000000000000000000000000000002" as Address,
  oracle: "0x0000000000000000000000000000000000000003" as Address,
  irm: "0x0000000000000000000000000000000000000004" as Address,
  lltv: 86_0000000000000000n,
};

describe("MarketUtils", () => {
  it("should calculate the correct market id", () => {
    expect(MarketUtils.getMarketId(market)).toEqual(
      "0x625e29dff74826b71c1f4c74b208a896109cc8ac9910192ce2927a982b0809e6",
    );
  });

  it("should calculate the correct liquidation incentive factor", () => {
    expect(MarketUtils.getLiquidationIncentiveFactor(market)).toEqual(
      1043841336116910229n,
    );
  });

  it("should calculate the supply volume to reach utilization", () => {
    expect(
      MarketUtils.getSupplyToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toEqual(11_1111111111111112n);

    expect(
      MarketUtils.getSupplyToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: 0n },
        90_0000000000000000n,
      ),
    ).toEqual(0n);

    expect(
      MarketUtils.getSupplyToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: 0n },
        0n,
      ),
    ).toEqual(0n);

    expect(
      MarketUtils.getSupplyToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: 1n },
        0n,
      ),
    ).toEqual(MathLib.MAX_UINT_256);
  });

  it("should calculate the withdraw volume to reach utilization", () => {
    expect(
      MarketUtils.getWithdrawToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toEqual(0n);

    expect(
      MarketUtils.getWithdrawToUtilization(
        { totalSupplyAssets: 2n * MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toEqual(88_8888888888888888n);

    expect(
      MarketUtils.getWithdrawToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: 0n },
        90_0000000000000000n,
      ),
    ).toEqual(MathLib.WAD);
  });

  it("should calculate the borrow volume to reach utilization", () => {
    expect(
      MarketUtils.getBorrowToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toEqual(0n);

    expect(
      MarketUtils.getBorrowToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: 0n },
        90_0000000000000000n,
      ),
    ).toEqual(90_0000000000000000n);
  });

  it("should calculate the repay volume to reach utilization", () => {
    expect(
      MarketUtils.getRepayToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: MathLib.WAD },
        90_0000000000000000n,
      ),
    ).toEqual(10_0000000000000000n);

    expect(
      MarketUtils.getRepayToUtilization(
        { totalSupplyAssets: MathLib.WAD, totalBorrowAssets: 0n },
        90_0000000000000000n,
      ),
    ).toEqual(0n);
  });
});
