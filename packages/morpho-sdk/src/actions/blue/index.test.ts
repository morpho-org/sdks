import { describe, expect, test } from "vitest";
import * as sdk from "../../index.js";
import * as blue from "./index.js";

describe("Blue public exports", () => {
  test("exports only the established standalone builders", () => {
    expect(Object.keys(blue).sort()).toEqual([
      "blueBorrow",
      "blueRefinance",
      "blueRepay",
      "blueRepayWithdrawCollateral",
      "blueSupply",
      "blueSupplyCollateral",
      "blueSupplyCollateralBorrow",
      "blueWithdraw",
      "blueWithdrawBuyCallback",
      "blueWithdrawCollateral",
    ]);
  });

  test.each([
    "_blueSupplyCollateralBorrow",
    "parseBlueMarket",
    "parseUint256",
    "parseDeadline",
    "parseReferralFee",
    "parseNativeFunding",
    "parseBlueBundlesV1Common",
    "parseBlueAllocations",
    "encodeBlueSupply",
    "parseBlueRepayWithdrawCollateral",
    "parseBlueRepayMode",
    "parseBlueRepayCap",
    "parseBlueRepayCoverage",
    "parseBlueWithdrawMode",
    "parseBlueWithdrawPenalty",
    "parseBlueRefinanceMarkets",
    "parseBlueSupplyCollateralBorrowMode",
    "parseBlueSupplyCollateralBorrowAllocations",
    "parseBlueSupply",
    "buildBlueSupply",
    "parseBlueWithdraw",
    "buildBlueWithdraw",
    "parseBlueSupplyCollateralBorrow",
    "buildBlueSupplyCollateralBorrow",
    "parseBlueRepayWithdrawCollateralLegs",
    "parseBlueRepayFunding",
    "buildBlueRepayWithdrawCollateral",
    "parseBlueRefinance",
    "buildBlueRefinance",
    "parseBlueWithdrawBuyCallback",
    "buildBlueWithdrawBuyCallback",
    "parseBlueSupplyCollateral",
    "buildBlueSupplyCollateral",
    "parseBlueBorrow",
    "buildBlueBorrow",
    "parseBlueRepay",
    "buildBlueRepay",
    "parseBlueWithdrawCollateral",
    "buildBlueWithdrawCollateral",
    "signatureFunding",
  ])("does not expose %s from the package root", (name) => {
    expect(sdk).not.toHaveProperty(name);
  });
});
