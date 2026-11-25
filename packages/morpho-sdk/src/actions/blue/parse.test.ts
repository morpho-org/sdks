import { MarketParams } from "@morpho-org/blue-sdk";
import { maxUint256, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, expectTypeOf, test } from "vitest";
import { parseBlueMarket } from "../../helpers/parse.js";
import {
  type AuthorizationRequirementSignature,
  type BundlesTokenRequirementSignature,
  DepositOwnerMismatchError,
  InputExceedsMaxError,
  MaxRepayAssetsBelowRepayAssetsError,
  MutuallyExclusiveRepayAmountsError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationsRequireBorrowError,
  UnexpectedRequirementSignatureError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { buildBlueBorrow, parseBlueBorrow } from "./borrow.internal.js";
import { blueBorrow } from "./borrow.js";
import { parseBlueAllocations } from "./common.js";
import {
  buildBlueRefinance,
  parseBlueRefinance,
} from "./refinance.internal.js";
import { blueRefinance } from "./refinance.js";
import { buildBlueRepay, parseBlueRepay } from "./repay.internal.js";
import { blueRepay } from "./repay.js";
import {
  buildBlueRepayWithdrawCollateral,
  parseBlueRepayWithdrawCollateral,
} from "./repayWithdrawCollateral.internal.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { buildBlueSupply, parseBlueSupply } from "./supply.internal.js";
import { type BlueSupplyParams, blueSupply } from "./supply.js";
import {
  buildBlueSupplyCollateral,
  parseBlueSupplyCollateral,
} from "./supplyCollateral.internal.js";
import { blueSupplyCollateral } from "./supplyCollateral.js";
import {
  buildBlueSupplyCollateralBorrow,
  parseBlueSupplyCollateralBorrow,
} from "./supplyCollateralBorrow.internal.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";
import {
  buildBlueWithdraw,
  parseBlueWithdraw,
  parseBlueWithdrawMode,
  parseBlueWithdrawPenalty,
} from "./withdraw.internal.js";
import { blueWithdraw } from "./withdraw.js";
import {
  buildBlueWithdrawBuyCallback,
  parseBlueWithdrawBuyCallback,
} from "./withdrawBuyCallback.internal.js";
import {
  buildBlueWithdrawCollateral,
  parseBlueWithdrawCollateral,
} from "./withdrawCollateral.internal.js";
import { blueWithdrawCollateral } from "./withdrawCollateral.js";

const marketParams = new MarketParams({
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 860000000000000000n,
});
const destinationMarketParams = new MarketParams({
  ...marketParams,
  lltv: 800000000000000000n,
});
const market = { chainId: mainnet.id, marketParams };
const args = {
  userAddress: zeroAddress,
  deadline: 1_900_000_000n,
  maxLtv: maxUint256,
};
const invalidToken = {
  action: { type: "permit" },
  args: { owner: "0x0000000000000000000000000000000000000001" },
} as unknown as BundlesTokenRequirementSignature;
const invalidAuthorization = {
  args: { owner: "0x0000000000000000000000000000000000000001" },
} as unknown as AuthorizationRequirementSignature;
const invalidPlan = [{}] as unknown as readonly VaultV2BlueReallocation[];

describe("Blue parsed input contracts", () => {
  test("fixed-intent builders reject combined and sibling operation contracts", () => {
    type CombinedSupply = ReturnType<typeof parseBlueSupplyCollateralBorrow>;
    type CombinedRepay = ReturnType<typeof parseBlueRepayWithdrawCollateral>;
    type SupplyCollateral = Parameters<typeof buildBlueSupplyCollateral>[0];
    type Borrow = Parameters<typeof buildBlueBorrow>[0];
    type Repay = Parameters<typeof buildBlueRepay>[0];
    type WithdrawCollateral = Parameters<typeof buildBlueWithdrawCollateral>[0];

    expectTypeOf<CombinedSupply>().not.toExtend<SupplyCollateral>();
    expectTypeOf<Borrow>().not.toExtend<SupplyCollateral>();
    expectTypeOf<CombinedSupply>().not.toExtend<Borrow>();
    expectTypeOf<SupplyCollateral>().not.toExtend<Borrow>();
    expectTypeOf<CombinedRepay>().not.toExtend<Repay>();
    expectTypeOf<WithdrawCollateral>().not.toExtend<Repay>();
    expectTypeOf<CombinedRepay>().not.toExtend<WithdrawCollateral>();
    expectTypeOf<Repay>().not.toExtend<WithdrawCollateral>();
    expectTypeOf<SupplyCollateral["borrowAssets"]>().toEqualTypeOf<0n>();
    expectTypeOf<Borrow["collateralAssets"]>().toEqualTypeOf<0n>();
    expectTypeOf<Repay["collateralAssets"]>().toEqualTypeOf<0n>();
    expectTypeOf<WithdrawCollateral["repayAssets"]>().toEqualTypeOf<0n>();
    expectTypeOf<WithdrawCollateral["repayShares"]>().toEqualTypeOf<0n>();
    expectTypeOf<WithdrawCollateral["maxRepayAssets"]>().toEqualTypeOf<0n>();
    expectTypeOf<WithdrawCollateral["hasRepay"]>().toEqualTypeOf<false>();
  });

  test("fixed-intent raw constructors retain zero legs and complete encoder inputs", () => {
    const supply = parseBlueSupplyCollateral({
      market,
      args: { ...args, collateralAssets: 2n },
    });
    const borrow = parseBlueBorrow({
      market,
      args: { ...args, borrowAssets: 2n },
    });
    const repay = parseBlueRepay({
      market,
      args: { ...args, repayAssets: 2n, repayShares: 0n, maxRepayAssets: 2n },
    });
    const withdraw = parseBlueWithdrawCollateral({
      market,
      args: { ...args, collateralAssets: 2n },
    });
    expect(supply).toMatchObject({ collateralAssets: 2n, borrowAssets: 0n });
    expect(borrow).toMatchObject({ collateralAssets: 0n, borrowAssets: 2n });
    expect(repay).toMatchObject({ repayAssets: 2n, collateralAssets: 0n });
    expect(withdraw).toMatchObject({
      repayAssets: 0n,
      repayShares: 0n,
      maxRepayAssets: 0n,
      hasRepay: false,
      collateralAssets: 2n,
    });
    const cases = [
      [buildBlueSupplyCollateral(supply), "blueSupplyCollateral", supply],
      [buildBlueBorrow(borrow), "blueBorrow", borrow],
      [buildBlueRepay(repay), "blueRepay", repay],
      [
        buildBlueWithdrawCollateral(withdraw),
        "blueWithdrawCollateral",
        withdraw,
      ],
    ] as const;
    for (const [tx, type, parsed] of cases) {
      expect(tx.action.type).toBe(type);
      expect(tx.action.args).toMatchObject({
        collateralAssets: parsed.collateralAssets,
        deadline: parsed.deadline,
      });
      expect(Object.isFrozen(tx)).toBe(true);
      expect(Object.isFrozen(tx.action.args)).toBe(true);
      expect(Object.isFrozen(parsed.marketParams)).toBe(true);
    }
  });

  test("whole raw constructors return every normalized encoder field", () => {
    const supply = parseBlueSupply({ market, args: { ...args, assets: 2n } });
    expect(supply).toMatchObject({
      assets: 2n,
      value: 0n,
      deadline: args.deadline,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
    });
    expectTypeOf<typeof supply>().toExtend<
      Parameters<typeof buildBlueSupply>[0]
    >();
    expect(Object.isFrozen(supply.marketParams)).toBe(true);
    expect(supply.marketParams).not.toBe(marketParams);
    const withdraw = parseBlueWithdraw({
      market,
      args: { ...args, withdrawAssets: 2n, withdrawShares: 0n },
    });
    expect(withdraw).toMatchObject({
      withdrawAssets: 2n,
      withdrawShares: 0n,
      publicAllocations: [],
      reallocationPenaltyAssets: 0n,
      signedAuthorization: { nonce: 0n, deadline: 0n },
    });
    expectTypeOf<typeof withdraw>().toExtend<
      Parameters<typeof buildBlueWithdraw>[0]
    >();
    const refinance = parseBlueRefinance({
      market: {
        chainId: mainnet.id,
        sourceMarketParams: marketParams,
        destinationMarketParams,
      },
      args,
    });
    expect(refinance).toMatchObject({
      maxLtv: maxUint256,
      publicAllocations: [],
      reallocationPenaltyAssets: 0n,
      signedAuthorization: { nonce: 0n, deadline: 0n },
    });
    expectTypeOf<typeof refinance>().toExtend<
      Parameters<typeof buildBlueRefinance>[0]
    >();
    expect(Object.isFrozen(refinance.destinationMarketParams)).toBe(true);
  });

  test("combined and callback constructors return complete owned operation inputs", () => {
    const combined = parseBlueSupplyCollateralBorrow({
      market,
      args: { ...args, collateralAssets: 2n, borrowAssets: 1n },
    });
    expect(combined).toMatchObject({
      chainId: mainnet.id,
      userAddress: args.userAddress,
      collateralAssets: 2n,
      borrowAssets: 1n,
      maxLtv: maxUint256,
      deadline: args.deadline,
      value: 0n,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
      publicAllocations: [],
      reallocationPenaltyAssets: 0n,
      bound: { signedAuthorization: { nonce: 0n, deadline: 0n } },
    });
    expectTypeOf<typeof combined>().toExtend<
      Parameters<typeof buildBlueSupplyCollateralBorrow>[0]
    >();
    expect(Object.isFrozen(combined.marketParams)).toBe(true);
    expect(combined.marketParams).not.toBe(marketParams);

    const callback = parseBlueWithdrawBuyCallback({
      market,
      args: {
        userAddress: args.userAddress,
        callbackAddress: "0x0000000000000000000000000000000000000001",
        shares: 3n,
      },
    });
    expect(callback).toMatchObject({
      userAddress: args.userAddress,
      callbackAddress: "0x0000000000000000000000000000000000000001",
      shares: 3n,
    });
    expectTypeOf<typeof callback>().toExtend<
      Parameters<typeof buildBlueWithdrawBuyCallback>[0]
    >();
    expect(Object.isFrozen(callback.marketParams)).toBe(true);
    expect(callback.marketParams).not.toBe(marketParams);
    expect(buildBlueWithdrawBuyCallback(callback).to).toBe(callback.to);
  });

  test("fresh signatures are checked on every build without revisiting raw static params", () => {
    const raw = {
      market,
      args: { ...args, assets: 2n },
    };
    const supply = parseBlueSupply(raw);
    const withdraw = parseBlueWithdraw({
      market,
      args: { ...args, withdrawAssets: 2n, withdrawShares: 0n },
    });
    const combined = parseBlueSupplyCollateralBorrow({
      market,
      args: { ...args, collateralAssets: 2n, borrowAssets: 1n },
    });
    const repay = parseBlueRepayWithdrawCollateral({
      market,
      args: {
        ...args,
        repayAssets: 2n,
        repayShares: 0n,
        maxRepayAssets: 2n,
        collateralAssets: 1n,
      },
    });
    const refinance = parseBlueRefinance({
      market: {
        chainId: mainnet.id,
        sourceMarketParams: marketParams,
        destinationMarketParams,
      },
      args,
    });
    // A retained raw object must never be read by the build-time boundary.
    Object.defineProperty(raw.args, "assets", {
      get: () => {
        throw new Error("static supply input was read again");
      },
    });
    const builds = [
      [
        () => buildBlueSupply(supply),
        () => buildBlueSupply(supply, { requirementSignature: invalidToken }),
      ],
      [
        () => buildBlueWithdraw(withdraw),
        () =>
          buildBlueWithdraw(withdraw, {
            authorizationSignature: invalidAuthorization,
          }),
      ],
      [
        () => buildBlueSupplyCollateralBorrow(combined),
        () =>
          buildBlueSupplyCollateralBorrow(combined, {
            requirementSignature: invalidToken,
          }),
      ],
      [
        () => buildBlueRepayWithdrawCollateral(repay),
        () =>
          buildBlueRepayWithdrawCollateral(repay, {
            requirementSignature: invalidToken,
          }),
      ],
      [
        () => buildBlueRefinance(refinance),
        () =>
          buildBlueRefinance(refinance, {
            authorizationSignature: invalidAuthorization,
          }),
      ],
    ] as const;
    for (const [build, buildInvalid] of builds) {
      const expected = build();
      expect(buildInvalid).toThrow(DepositOwnerMismatchError);
      expect(build()).toEqual(expected);
      expect(buildInvalid).toThrow(DepositOwnerMismatchError);
      expect(Object.isFrozen(expected)).toBe(true);
    }
  });

  test("standalone supply positivity precedes invalid common inputs as on main", () => {
    expect(() =>
      blueSupply({
        market,
        args: { ...args, assets: -1n, deadline: 0n },
      }),
    ).toThrow(
      expect.objectContaining({
        constructor: NonPositiveInputError,
        field: "assets",
      }),
    );
  });

  test("the raw repay constructor owns mode, cap, fee coverage and funding together", () => {
    const raw = {
      market,
      args: {
        ...args,
        repayAssets: 1n,
        repayShares: 0n,
        collateralAssets: 0n,
        maxRepayAssets: 1n,
      },
    };
    const parsed = parseBlueRepayWithdrawCollateral(raw);
    expect(parsed).toMatchObject({
      hasRepay: true,
      minimumRepayAssets: 1n,
      maxRepayAssets: 1n,
      value: 0n,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
    });
    expectTypeOf<typeof parsed>().toExtend<
      Parameters<typeof buildBlueRepayWithdrawCollateral>[0]
    >();
    expect(() =>
      parseBlueRepayWithdrawCollateral({
        ...raw,
        args: { ...raw.args, maxRepayAssets: 0n },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      parseBlueRepayWithdrawCollateral({
        ...raw,
        args: { ...raw.args, repayShares: 1n },
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
    expect(() =>
      parseBlueRepayWithdrawCollateral({
        ...raw,
        args: {
          ...raw.args,
          repayAssets: 2n,
          maxRepayAssets: 2n,
          referralFeePct: 500_000_000_000_000_000n,
          referralFeeRecipient: "0x0000000000000000000000000000000000000001",
        },
      }),
    ).toThrow(MaxRepayAssetsBelowRepayAssetsError);
    expect(() =>
      parseBlueRepayWithdrawCollateral({
        ...raw,
        args: { ...raw.args, maxRepayAssets: -1n, referralFeePct: 1n },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      parseBlueRepayWithdrawCollateral({
        ...raw,
        args: { ...raw.args, repayAssets: 0n, collateralAssets: 1n },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("withdraw penalty constraints retain their typed errors", () => {
    const parsedMarket = parseBlueMarket(marketParams);
    const allocations = parseBlueAllocations([], parsedMarket);
    const mode = parseBlueWithdrawMode(parsedMarket, {
      withdrawAssets: 1n,
      withdrawShares: 0n,
      field: "assets",
    });
    const checked = parseBlueWithdrawPenalty(allocations, mode);
    expect(checked.penaltyAssets).toBe(0n);
    expect(() =>
      parseBlueWithdrawPenalty({ ...allocations, penaltyAssets: 2n }, mode),
    ).toThrow(InputExceedsMaxError);
  });

  test("withdrawal-only unexpected funding signature precedes an invalid deadline", () => {
    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          ...args,
          repayAssets: 0n,
          repayShares: 0n,
          collateralAssets: 1n,
          maxRepayAssets: 0n,
          requirementSignature: invalidToken,
          deadline: 0n,
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("internal encoders reject unparsed inputs at the type boundary", () => {
    expectTypeOf<BlueSupplyParams>().not.toExtend<
      Parameters<typeof buildBlueSupply>[0]
    >();
    expectTypeOf<
      Parameters<typeof blueSupplyCollateralBorrow>[0]
    >().not.toExtend<Parameters<typeof buildBlueSupplyCollateralBorrow>[0]>();
    expectTypeOf<
      Parameters<typeof blueRepayWithdrawCollateral>[0]
    >().not.toExtend<Parameters<typeof buildBlueRepayWithdrawCollateral>[0]>();
    expectTypeOf<Parameters<typeof blueWithdraw>[0]>().not.toExtend<
      Parameters<typeof buildBlueWithdraw>[0]
    >();
    expectTypeOf<Parameters<typeof blueRefinance>[0]>().not.toExtend<
      Parameters<typeof buildBlueRefinance>[0]
    >();
    expectTypeOf<
      Parameters<
        typeof import("./withdrawBuyCallback.js").blueWithdrawBuyCallback
      >[0]
    >().not.toExtend<Parameters<typeof buildBlueWithdrawBuyCallback>[0]>();
    expectTypeOf<Parameters<typeof blueBorrow>[0]>().not.toExtend<
      Parameters<typeof buildBlueSupplyCollateralBorrow>[0]
    >();
    expectTypeOf<Parameters<typeof blueSupplyCollateral>[0]>().not.toExtend<
      Parameters<typeof buildBlueSupplyCollateralBorrow>[0]
    >();
    expectTypeOf<Parameters<typeof blueRepay>[0]>().not.toExtend<
      Parameters<typeof buildBlueRepayWithdrawCollateral>[0]
    >();
    expectTypeOf<Parameters<typeof blueWithdrawCollateral>[0]>().not.toExtend<
      Parameters<typeof buildBlueRepayWithdrawCollateral>[0]
    >();
    // Even fully shaped fields cannot manufacture an operation's private witness.
    expectTypeOf<
      Omit<Parameters<typeof buildBlueSupply>[0], symbol>
    >().not.toExtend<Parameters<typeof buildBlueSupply>[0]>();
    expectTypeOf<
      Omit<Parameters<typeof buildBlueWithdraw>[0], symbol>
    >().not.toExtend<Parameters<typeof buildBlueWithdraw>[0]>();
    expectTypeOf<
      Omit<Parameters<typeof buildBlueSupplyCollateralBorrow>[0], symbol>
    >().not.toExtend<Parameters<typeof buildBlueSupplyCollateralBorrow>[0]>();
    expectTypeOf<
      Omit<Parameters<typeof buildBlueRepayWithdrawCollateral>[0], symbol>
    >().not.toExtend<Parameters<typeof buildBlueRepayWithdrawCollateral>[0]>();
    expectTypeOf<
      Omit<Parameters<typeof buildBlueRefinance>[0], symbol>
    >().not.toExtend<Parameters<typeof buildBlueRefinance>[0]>();
    expectTypeOf<
      Omit<Parameters<typeof buildBlueWithdrawBuyCallback>[0], symbol>
    >().not.toExtend<Parameters<typeof buildBlueWithdrawBuyCallback>[0]>();
  });

  test.each([
    [
      "supplyCollateralBorrow",
      () =>
        blueSupplyCollateralBorrow({
          market,
          args: {
            ...args,
            collateralAssets: 1n,
            borrowAssets: 1n,
            reallocations: invalidPlan,
            requirementSignature: invalidToken,
          },
        }),
    ],
    [
      "borrow",
      () =>
        blueBorrow({
          market,
          args: {
            ...args,
            borrowAssets: 1n,
            reallocations: invalidPlan,
            authorizationSignature: invalidAuthorization,
          },
        }),
    ],
    [
      "withdraw",
      () =>
        blueWithdraw({
          market,
          args: {
            ...args,
            withdrawAssets: 1n,
            withdrawShares: 0n,
            reallocations: invalidPlan,
            authorizationSignature: invalidAuthorization,
          },
        }),
    ],
    [
      "refinance",
      () =>
        blueRefinance({
          market: {
            chainId: mainnet.id,
            sourceMarketParams: marketParams,
            destinationMarketParams,
          },
          args: {
            ...args,
            reallocations: invalidPlan,
            authorizationSignature: invalidAuthorization,
          },
        }),
    ],
  ] as const)(
    "%s binds signatures before parsing reallocations",
    (_name, build) => {
      expect(build).toThrow(DepositOwnerMismatchError);
    },
  );

  test.each([
    [
      "supplyCollateralBorrow",
      () =>
        blueSupplyCollateralBorrow({
          market,
          args: {
            ...args,
            collateralAssets: 1n,
            borrowAssets: 0n,
            referralFeePct: 1n,
            authorizationSignature: invalidAuthorization,
          },
        }),
    ],
    [
      "supplyCollateral",
      () =>
        blueSupplyCollateral({
          market,
          args: {
            ...args,
            collateralAssets: 1n,
            referralFeePct: 1n,
            authorizationSignature: invalidAuthorization,
          },
        } as Parameters<typeof blueSupplyCollateral>[0]),
    ],
    [
      "borrow",
      () =>
        blueBorrow({
          market,
          args: {
            ...args,
            borrowAssets: 1n,
            referralFeePct: 1n,
            requirementSignature: invalidToken,
          },
        } as Parameters<typeof blueBorrow>[0]),
    ],
    [
      "repayWithdrawCollateral",
      () =>
        blueRepayWithdrawCollateral({
          market,
          args: {
            ...args,
            repayAssets: 1n,
            repayShares: 0n,
            maxRepayAssets: 1n,
            collateralAssets: 0n,
            referralFeePct: 1n,
            authorizationSignature: invalidAuthorization,
          },
        }),
    ],
    [
      "repay",
      () =>
        blueRepay({
          market,
          args: {
            ...args,
            repayAssets: 1n,
            repayShares: 0n,
            maxRepayAssets: 1n,
            referralFeePct: 1n,
            authorizationSignature: invalidAuthorization,
          },
        } as Parameters<typeof blueRepay>[0]),
    ],
    [
      "withdrawCollateral",
      () =>
        blueWithdrawCollateral({
          market,
          args: {
            ...args,
            collateralAssets: 1n,
            referralFeePct: 1n,
            requirementSignature: invalidToken,
          },
        } as Parameters<typeof blueWithdrawCollateral>[0]),
    ],
  ] as const)(
    "%s rejects inactive signatures before parsing common inputs",
    (_name, build) => {
      expect(build).toThrow(UnexpectedRequirementSignatureError);
    },
  );

  test("keeps raw-input precedence for negative amounts, empty legs, and reallocations", () => {
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          ...args,
          collateralAssets: -1n,
          borrowAssets: 0n,
          reallocations: invalidPlan,
          deadline: 0n,
        },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          ...args,
          collateralAssets: 0n,
          borrowAssets: 0n,
          reallocations: invalidPlan,
          deadline: 0n,
        },
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          ...args,
          collateralAssets: 1n,
          borrowAssets: 0n,
          reallocations: invalidPlan,
          deadline: 0n,
        },
      }),
    ).toThrow(ReallocationsRequireBorrowError);
    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          ...args,
          repayAssets: 1n,
          repayShares: 1n,
          maxRepayAssets: 1n,
          collateralAssets: 0n,
          deadline: 0n,
        },
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
    expect(() =>
      blueSupply({ market, args: { ...args, assets: 0n, deadline: 0n } }),
    ).toThrow(NonPositiveInputError);
  });
});
