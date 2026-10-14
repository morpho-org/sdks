import { fc, test } from "@fast-check/vitest";
import { addressesRegistry, MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { decodeFunctionData, getAddress, maxUint256, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  addressArbitrary as address,
  amountArbitrary as amount,
  propertyDeadline as deadline,
  marketParamsArbitrary as marketParams,
  referralFeeArbitrary as referralFee,
  UINT128_MAX,
} from "../../../test/fixtures/properties.js";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  MaxRepayAssetsBelowRepayAssetsError,
  MutuallyExclusiveRepayAmountsError,
  MutuallyExclusiveWithdrawAmountsError,
  NonPositiveInputError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
} from "../../types/index.js";
import { blueBorrow } from "./borrow.js";
import { blueRefinance } from "./refinance.js";
import { blueRepay } from "./repay.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { blueSupply } from "./supply.js";
import { blueSupplyCollateral } from "./supplyCollateral.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";
import { blueWithdraw } from "./withdraw.js";
import { blueWithdrawCollateral } from "./withdrawCollateral.js";

// IBlueBundlesV1.sol SignedAuthorization: zeroed when no Morpho authorization is signed.
const emptyAuthorization = {
  signature: { v: 0, r: zeroHash, s: zeroHash },
  nonce: 0n,
  deadline: 0n,
};
const chainId = mainnet.id;
const blueBundlesV1 = addressesRegistry[chainId].bundles?.blueBundlesV1;
if (blueBundlesV1 == null) throw new Error("BlueBundlesV1 is not registered");
const emptyPermit = { kind: 0, data: "0x" };

const market = (
  params: typeof marketParams extends fc.Arbitrary<infer T> ? T : never,
) => ({
  chainId,
  marketParams: new MarketParams(params),
});

// bundles IBlueBundlesV1.sol blueBundlesV1Supply(marketParams, assets, permit, fee, recipient, deadline):
// BlueBundlesV1 pulls exactly `assets` and supplies `assets - assets.mulDivDown(pct, WAD)` to Morpho;
// Blue supply carries no share-price bound.
describe("blueSupply", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        assets: amount,
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args match generated market params, assets and referral fields",
    ({ params, assets, referralFeePct, user, feeRecipient }) => {
      const transaction = blueSupply({
        market: market(params),
        args: {
          userAddress: user,
          assets,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      expect(
        decodeFunctionData({ abi: blueBundlesV1Abi, data: transaction.data }),
      ).toEqual({
        functionName: "blueBundlesV1Supply",
        args: [
          params,
          assets,
          emptyPermit,
          referralFeePct,
          feeRecipient,
          deadline,
        ],
      });
    },
  );
});

// bundles IBlueBundlesV1.sol blueBundlesV1SupplyCollateralAndBorrow: the post-operation LTV must
// stay <= maxLtv, so the bound is passed through unchanged.
describe("blueSupplyCollateralBorrow", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        collateralAssets: amount,
        borrowAssets: fc.oneof(fc.constant(0n), amount),
        maxLtvBelowLltv: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args match inputs and carry the requested max LTV",
    ({
      params,
      collateralAssets,
      borrowAssets,
      maxLtvBelowLltv,
      referralFeePct,
      user,
      feeRecipient,
    }) => {
      const maxLtv = maxLtvBelowLltv % (params.lltv + 1n);
      const transaction = blueSupplyCollateralBorrow({
        market: market(params),
        args: {
          userAddress: user,
          collateralAssets,
          borrowAssets,
          maxLtv,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow") {
        throw new TypeError("Expected blueBundlesV1SupplyCollateralAndBorrow");
      }
      const [
        decodedParams,
        collateral,
        borrow,
        ltv,
        permit,
        authorization,
        allocations,
        fee,
        recipient,
        end,
      ] = decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect(decodedParams).toEqual(params);
      expect([collateral, borrow, ltv]).toEqual([
        collateralAssets,
        borrowAssets,
        maxLtv,
      ]);
      expect(permit).toEqual(emptyPermit);
      expect(allocations).toEqual([]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
    },
  );
});

// bundles BlueBundlesV1.sol blueBundlesV1RepayAndWithdrawCollateral: pulls maxRepayAssets, charges
// fee = repaid.mulDivDown(pct, WAD - pct) and refunds maxRepayAssets - repaid - fee (reverts below it).
describe("blueRepayWithdrawCollateral", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        repayAssets: amount,
        slack: fc.oneof(
          fc.constant(0n),
          fc.bigInt({ min: 0n, max: UINT128_MAX }),
        ),
        collateralAssets: fc.oneof(fc.constant(0n), amount),
        maxLtv: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    {
      numRuns: 200,
      // One-asset repay without fee: one below the bound is a zero, non-positive maxRepayAssets.
      examples: [
        [
          {
            params: {
              loanToken: getAddress(
                "0x0000000000000000000000000000000000000001",
              ),
              collateralToken: getAddress(
                "0x0000000000000000000000000000000000000001",
              ),
              oracle: getAddress("0x0000000000000000000000000000000000000001"),
              irm: getAddress("0x0000000000000000000000000000000000000001"),
              lltv: 0n,
            },
            repayAssets: 1n,
            slack: 0n,
            collateralAssets: 0n,
            maxLtv: 0n,
            referralFeePct: 0n,
            user: getAddress("0x0000000000000000000000000000000000000001"),
            feeRecipient: getAddress(
              "0x0000000000000000000000000000000000000002",
            ),
          },
        ],
      ],
    },
  )(
    "behavior: decoded args match inputs and the repay bound covers exactly the repay plus referral fee",
    ({
      params,
      repayAssets,
      slack,
      collateralAssets,
      maxLtv,
      referralFeePct,
      user,
      feeRecipient,
    }) => {
      const feeAssets =
        referralFeePct === 0n
          ? 0n
          : (repayAssets * referralFeePct) / (MathLib.WAD - referralFeePct);
      const maxRepayAssets = repayAssets + feeAssets + slack;
      const transaction = blueRepayWithdrawCollateral({
        market: market(params),
        args: {
          userAddress: user,
          repayAssets,
          repayShares: 0n,
          maxRepayAssets,
          collateralAssets,
          maxLtv,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
        throw new TypeError("Expected blueBundlesV1RepayAndWithdrawCollateral");
      }
      const [
        decodedParams,
        assets,
        shares,
        maxRepay,
        collateral,
        ltv,
        permit,
        authorization,
        fee,
        recipient,
        end,
      ] = decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect(decodedParams).toEqual(params);
      expect([assets, shares, maxRepay]).toEqual([
        repayAssets,
        0n,
        maxRepayAssets,
      ]);
      if (slack === 0n && maxRepayAssets > 1n) {
        expect(() =>
          blueRepayWithdrawCollateral({
            market: market(params),
            args: {
              userAddress: user,
              repayAssets,
              repayShares: 0n,
              maxRepayAssets: maxRepayAssets - 1n,
              collateralAssets,
              maxLtv,
              referralFeePct,
              referralFeeRecipient: feeRecipient,
              deadline,
            },
          }),
        ).toThrow(MaxRepayAssetsBelowRepayAssetsError);
      } else if (slack === 0n && maxRepayAssets === 1n) {
        expect(() =>
          blueRepayWithdrawCollateral({
            market: market(params),
            args: {
              userAddress: user,
              repayAssets,
              repayShares: 0n,
              maxRepayAssets: 0n,
              collateralAssets,
              maxLtv,
              referralFeePct,
              referralFeeRecipient: feeRecipient,
              deadline,
            },
          }),
        ).toThrow(NonPositiveInputError);
      }
      expect([collateral, ltv, permit]).toEqual([
        collateralAssets,
        maxLtv,
        emptyPermit,
      ]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
    },
  );
});

// bundles BlueBundlesV1.sol blueBundlesV1SupplyCollateralAndBorrow with collateralAssets = 0:
// borrows exactly borrowAssets, then requireMaxLtv caps the resulting LTV at maxLtv.
describe("blueBorrow", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        borrowAssets: amount,
        maxLtvBelowLltv: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry zero collateral, the borrow amount and the requested max LTV",
    ({
      params,
      borrowAssets,
      maxLtvBelowLltv,
      referralFeePct,
      user,
      feeRecipient,
    }) => {
      const maxLtv = maxLtvBelowLltv % (params.lltv + 1n);
      const transaction = blueBorrow({
        market: market(params),
        args: {
          userAddress: user,
          borrowAssets,
          maxLtv,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow") {
        throw new TypeError("Expected blueBundlesV1SupplyCollateralAndBorrow");
      }
      const [
        decodedParams,
        collateral,
        borrow,
        ltv,
        permit,
        authorization,
        allocations,
        fee,
        recipient,
        end,
      ] = decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect(decodedParams).toEqual(params);
      expect([collateral, borrow, ltv]).toEqual([0n, borrowAssets, maxLtv]);
      expect([permit, allocations]).toEqual([emptyPermit, []]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
    },
  );
});

// bundles BlueBundlesV1.sol blueBundlesV1Withdraw: Morpho.withdraw(marketParams, assets, shares, ...)
// requires exactly one of assets/shares (UtilsLib.exactlyOneZero); the fee is
// received.mulDivDown(pct, WAD). A lender withdrawal carries no share-price bound.
describe("blueWithdraw", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        value: amount,
        byShares: fc.boolean(),
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args set exactly one withdrawal leg and reject both legs at once",
    ({ params, value, byShares, referralFeePct, user, feeRecipient }) => {
      const withdrawAssets = byShares ? 0n : value;
      const withdrawShares = byShares ? value : 0n;
      const build = (assetsLeg: bigint, sharesLeg: bigint) =>
        blueWithdraw({
          market: market(params),
          args: {
            userAddress: user,
            withdrawAssets: assetsLeg,
            withdrawShares: sharesLeg,
            referralFeePct,
            referralFeeRecipient: feeRecipient,
            deadline,
          },
        });
      const transaction = build(withdrawAssets, withdrawShares);
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1Withdraw") {
        throw new TypeError("Expected blueBundlesV1Withdraw");
      }
      const [
        decodedParams,
        assets,
        shares,
        authorization,
        allocations,
        fee,
        recipient,
        end,
      ] = decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect(decodedParams).toEqual(params);
      expect([assets, shares]).toEqual([withdrawAssets, withdrawShares]);
      expect(allocations).toEqual([]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
      expect(() => build(value, value)).toThrow(
        MutuallyExclusiveWithdrawAmountsError,
      );
    },
  );
});

// bundles BlueBundlesV1.sol blueBundlesV1RepayAndWithdrawCollateral with a zero repay: withdraws
// collateralAssets, then requireMaxLtv caps the resulting LTV at maxLtv.
describe("blueWithdrawCollateral", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        collateralAssets: amount,
        maxLtvBelowLltv: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry no repay leg, the collateral amount and the requested max LTV",
    ({
      params,
      collateralAssets,
      maxLtvBelowLltv,
      referralFeePct,
      user,
      feeRecipient,
    }) => {
      const maxLtv = maxLtvBelowLltv % (params.lltv + 1n);
      const transaction = blueWithdrawCollateral({
        market: market(params),
        args: {
          userAddress: user,
          collateralAssets,
          maxLtv,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
        throw new TypeError("Expected blueBundlesV1RepayAndWithdrawCollateral");
      }
      const [
        decodedParams,
        assets,
        shares,
        maxRepay,
        collateral,
        ltv,
        permit,
        authorization,
        fee,
        recipient,
        end,
      ] = decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect(decodedParams).toEqual(params);
      expect([assets, shares, maxRepay]).toEqual([0n, 0n, 0n]);
      expect([collateral, ltv, permit]).toEqual([
        collateralAssets,
        maxLtv,
        emptyPermit,
      ]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
    },
  );
});

// bundles BlueBundlesV1.sol blueBundlesV1RepayAndWithdrawCollateral without collateral: a repay only
// lowers the LTV, so requireMaxLtv is disabled with type(uint256).max; the pull is bounded by
// maxRepayAssets >= repaid + repaid.mulDivDown(pct, WAD - pct).
describe("blueRepay", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        repayAssets: amount,
        slack: fc.oneof(
          fc.constant(0n),
          fc.bigInt({ min: 0n, max: UINT128_MAX }),
        ),
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry the repay amount and a pull bound covering repay plus fee",
    ({ params, repayAssets, slack, referralFeePct, user, feeRecipient }) => {
      const feeAssets = MathLib.mulDivDown(
        repayAssets,
        referralFeePct,
        MathLib.WAD - referralFeePct,
      );
      const maxRepayAssets = repayAssets + feeAssets + slack;
      const transaction = blueRepay({
        market: market(params),
        args: {
          userAddress: user,
          repayAssets,
          repayShares: 0n,
          maxRepayAssets,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
        throw new TypeError("Expected blueBundlesV1RepayAndWithdrawCollateral");
      }
      const [
        decodedParams,
        assets,
        shares,
        maxRepay,
        collateral,
        ltv,
        permit,
        authorization,
        fee,
        recipient,
        end,
      ] = decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect(decodedParams).toEqual(params);
      expect([assets, shares, maxRepay]).toEqual([
        repayAssets,
        0n,
        maxRepayAssets,
      ]);
      expect([collateral, ltv, permit]).toEqual([0n, maxUint256, emptyPermit]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
    },
  );
});

// bundles BlueBundlesV1.sol blueBundlesV1MigrateBorrowPosition: requires the same loan and collateral
// tokens, moves the whole position, then requireMaxLtv caps the destination LTV at maxLtv.
describe("blueRefinance", () => {
  test.prop(
    [
      fc.record({
        source: marketParams,
        destinationOracle: address,
        destinationLltv: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
        otherToken: address,
        maxLtvBelowLltv: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry both markets and the max LTV, and mismatched markets are rejected",
    ({
      source,
      destinationOracle,
      destinationLltv,
      otherToken,
      maxLtvBelowLltv,
      referralFeePct,
      user,
      feeRecipient,
    }) => {
      const destination = {
        ...source,
        oracle: destinationOracle,
        lltv: destinationLltv,
      };
      const sourceMarketParams = new MarketParams(source);
      const destinationMarketParams = new MarketParams(destination);
      fc.pre(sourceMarketParams.id !== destinationMarketParams.id);
      fc.pre(otherToken !== source.loanToken);
      const maxLtv = maxLtvBelowLltv % (destination.lltv + 1n);
      const build = (
        sourceParams: MarketParams,
        destinationParams: MarketParams,
      ) =>
        blueRefinance({
          market: {
            chainId,
            sourceMarketParams: sourceParams,
            destinationMarketParams: destinationParams,
          },
          args: {
            userAddress: user,
            maxLtv,
            referralFeePct,
            referralFeeRecipient: feeRecipient,
            deadline,
          },
        });
      const transaction = build(sourceMarketParams, destinationMarketParams);
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1MigrateBorrowPosition") {
        throw new TypeError("Expected blueBundlesV1MigrateBorrowPosition");
      }
      const [from, to, ltv, authorization, allocations, fee, recipient, end] =
        decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect([from, to]).toEqual([source, destination]);
      expect(ltv).toBe(maxLtv);
      expect(allocations).toEqual([]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
      expect(() => build(sourceMarketParams, sourceMarketParams)).toThrow(
        RefinanceSameMarketError,
      );
      expect(() =>
        build(
          sourceMarketParams,
          new MarketParams({ ...destination, loanToken: otherToken }),
        ),
      ).toThrow(RefinanceTokenMismatchError);
    },
  );
});

// bundles BlueBundlesV1.sol blueBundlesV1SupplyCollateralAndBorrow with borrowAssets = 0: supplying
// collateral only lowers the LTV, so requireMaxLtv is disabled with type(uint256).max.
describe("blueSupplyCollateral", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        collateralAssets: amount,
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry the collateral, a zero borrow and a disabled LTV cap",
    ({ params, collateralAssets, referralFeePct, user, feeRecipient }) => {
      const transaction = blueSupplyCollateral({
        market: market(params),
        args: {
          userAddress: user,
          collateralAssets,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(blueBundlesV1);
      expect(transaction.value).toBe(0n);
      expect(transaction.action.type).toBe("blueSupplyCollateral");
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow") {
        throw new TypeError("Expected blueBundlesV1SupplyCollateralAndBorrow");
      }
      const [
        decodedParams,
        collateral,
        borrow,
        ltv,
        permit,
        authorization,
        allocations,
        fee,
        recipient,
        end,
      ] = decoded.args;
      expect(authorization).toEqual(emptyAuthorization);
      expect(decodedParams).toEqual(params);
      expect([collateral, borrow, ltv]).toEqual([
        collateralAssets,
        0n,
        maxUint256,
      ]);
      expect(permit).toEqual(emptyPermit);
      expect(allocations).toEqual([]);
      expect([fee, recipient, end]).toEqual([
        referralFeePct,
        feeRecipient,
        deadline,
      ]);
    },
  );
});

// Same blueBundlesV1RepayAndWithdrawCollateral in share mode: Morpho.repay requires exactly one of
// assets/shares (UtilsLib.exactlyOneZero); type(uint256).max shares is the full-repay sentinel.
describe("blueRepay shares mode", () => {
  test.prop(
    [
      fc.record({
        params: marketParams,
        repayShares: fc.oneof(fc.constant(maxUint256), amount),
        maxRepayAssets: amount,
        referralFeePct: referralFee,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry only the share leg, and both legs are rejected",
    ({
      params,
      repayShares,
      maxRepayAssets,
      referralFeePct,
      user,
      feeRecipient,
    }) => {
      const build = (repayAssets: bigint) =>
        blueRepay({
          market: market(params),
          args: {
            userAddress: user,
            repayAssets,
            repayShares,
            maxRepayAssets,
            referralFeePct,
            referralFeeRecipient: feeRecipient,
            deadline,
          },
        });
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: build(0n).data,
      });
      if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
        throw new TypeError("Expected blueBundlesV1RepayAndWithdrawCollateral");
      }
      const [decodedParams, assets, shares, maxRepay, collateral, ltv] =
        decoded.args;
      expect(decodedParams).toEqual(params);
      expect([assets, shares, maxRepay, collateral, ltv]).toEqual([
        0n,
        repayShares,
        maxRepayAssets,
        0n,
        maxUint256,
      ]);
      expect(() => build(1n)).toThrow(MutuallyExclusiveRepayAmountsError);
    },
  );
});
