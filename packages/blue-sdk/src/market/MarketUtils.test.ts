import { MarketUtils } from "./MarketUtils";

const market = {
  loanToken: "0x0000000000000000000000000000000000000001",
  collateralToken: "0x0000000000000000000000000000000000000002",
  oracle: "0x0000000000000000000000000000000000000003",
  irm: "0x0000000000000000000000000000000000000004",
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
});
