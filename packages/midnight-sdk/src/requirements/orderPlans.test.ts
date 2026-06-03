import { describe, expect, test } from "vitest";

import { addresses } from "../__test__/fixtures.js";
import {
  planBorrowMarketOrderRequirements,
  planLendMarketOrderRequirements,
  planMakeOfferRequirements,
  planSupplyCollateralRequirements,
} from "./orderPlans.js";

describe("planBorrowMarketOrderRequirements", () => {
  test("default", () => {
    const requirements = planBorrowMarketOrderRequirements({
      midnight: addresses.midnight,
      midnightBundles: addresses.midnightBundles,
      borrower: addresses.taker,
      collateralToken: addresses.collateralToken,
      collateralAmount: 100n,
      collateralAllowance: 0n,
      isBundlerAuthorized: false,
    });

    expect(requirements.map((requirement) => requirement.type)).toEqual([
      "approval",
      "authorization",
    ]);
  });
});

describe("planLendMarketOrderRequirements", () => {
  test("behavior: skips satisfied requirements", () => {
    const requirements = planLendMarketOrderRequirements({
      midnight: addresses.midnight,
      midnightBundles: addresses.midnightBundles,
      lender: addresses.taker,
      loanToken: addresses.loanToken,
      loanTokenAmount: 100n,
      loanTokenAllowance: 100n,
      isBundlerAuthorized: true,
    });

    expect(requirements).toEqual([]);
  });
});

describe("planSupplyCollateralRequirements", () => {
  test("default", () => {
    const requirements = planSupplyCollateralRequirements({
      midnight: addresses.midnight,
      supplier: addresses.taker,
      collateralToken: addresses.collateralToken,
      collateralAmount: 100n,
      collateralAllowance: 0n,
    });

    expect(requirements[0]?.type).toBe("approval");
  });
});

describe("planMakeOfferRequirements", () => {
  test("default", () => {
    const requirements = planMakeOfferRequirements({
      midnight: addresses.midnight,
      maker: addresses.maker,
      ratifierInfo: {
        type: "setter",
        ratifier: addresses.setterRatifier,
      },
      isRatifierAuthorized: true,
      root: "0x0000000000000000000000000000000000000000000000000000000000000000",
      payload: "0x1234",
    });

    expect(requirements.map((requirement) => requirement.type)).toEqual([
      "rootApproval",
      "payloadValidation",
    ]);
    expect(requirements[0]).toMatchObject({
      type: "rootApproval",
      call: { to: addresses.setterRatifier },
    });
  });

  test("behavior: plans ratifier authorization", () => {
    const requirements = planMakeOfferRequirements({
      midnight: addresses.midnight,
      maker: addresses.maker,
      ratifierInfo: {
        type: "ecrecover",
        ratifier: addresses.ecrecoverRatifier,
      },
      isRatifierAuthorized: false,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({
      type: "authorization",
      authorized: addresses.ecrecoverRatifier,
    });
  });

  test("behavior: skips already ratified setter root", () => {
    const requirements = planMakeOfferRequirements({
      midnight: addresses.midnight,
      maker: addresses.maker,
      ratifierInfo: {
        type: "setter",
        ratifier: addresses.setterRatifier,
      },
      isRatifierAuthorized: true,
      root: "0x0000000000000000000000000000000000000000000000000000000000000000",
      isRootRatified: true,
    });

    expect(requirements).toEqual([]);
  });
});
