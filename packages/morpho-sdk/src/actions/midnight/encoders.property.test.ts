import {
  MAX_OFFER_CAP,
  MarketParams,
  midnightAbi,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, getAddress, type Hex, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { MidnightMarketAddressMismatchError } from "../../types/index.js";
import { midnightSetIsAuthorized } from "./authorization.js";
import { midnightCancelAndMake } from "./cancelAndMake.js";
import { midnightCancelOffer } from "./cancelOffer.js";
import { midnightRedeem } from "./redeem.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { midnightSupplyCollateral } from "./supplyCollateral.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";
import { midnightTakeBorrow } from "./takeBorrow.js";
import { midnightTakeLend } from "./takeLend.js";

registerCustomAddresses({
  addresses: {
    [midnightChainId]: {
      midnightBundlesV2: getAddress(
        "0x00000000000000000000000000000000000b2002",
      ),
    },
  },
});

const group =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const positiveUint128 = fc.bigInt({ min: 1n, max: MAX_OFFER_CAP });
const uint128 = fc.bigInt({ min: 0n, max: MAX_OFFER_CAP });
const inputs = fc.record({
  assets: positiveUint128,
  units: positiveUint128,
  optionalAmount: uint128,
  flag: fc.boolean(),
});

describe("Midnight calldata encoders", () => {
  test.each([
    [
      "redeem",
      (market: MarketParams) =>
        midnightRedeem({
          chainId: midnightChainId,
          market,
          units: 1n,
          onBehalf: midnightAddresses.taker,
        }),
    ],
    [
      "repayWithdrawCollateral",
      (market: MarketParams) =>
        midnightRepayWithdrawCollateral({
          chainId: midnightChainId,
          market,
          repayUnits: 1n,
          maxRepayAssets: 1n,
          collateralWithdrawals: [],
          collateralReceiver: midnightAddresses.taker,
          deadline: 1n,
        }),
    ],
    [
      "supplyCollateral",
      (market: MarketParams) =>
        midnightSupplyCollateral({
          chainId: midnightChainId,
          market,
          assets: 1n,
          onBehalf: midnightAddresses.taker,
        }),
    ],
    [
      "supplyCollateralTakeBorrow",
      (market: MarketParams) =>
        midnightSupplyCollateralTakeBorrow({
          chainId: midnightChainId,
          market,
          target: { type: "assets", assets: 1n, maxUnits: 1n },
          receiver: midnightAddresses.taker,
          collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: 1n,
        }),
    ],
    [
      "takeBorrow",
      (market: MarketParams) =>
        midnightTakeBorrow({
          chainId: midnightChainId,
          market,
          target: { type: "assets", assets: 1n, maxUnits: 1n },
          receiver: midnightAddresses.taker,
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: 1n,
        }),
    ],
    [
      "takeLend",
      (market: MarketParams) =>
        midnightTakeLend({
          chainId: midnightChainId,
          market,
          target: { type: "assets", assets: 1n, minUnits: 1n },
          takeableOffers: [midnightApiTake({ buy: false })],
          maxContinuousFee: 0n,
          deadline: 1n,
        }),
    ],
  ] as const)(
    "error: MidnightMarketAddressMismatchError for %s",
    (_, build) => {
      const foreignMarket = new MarketParams({
        ...midnightMarket,
        midnight: midnightAddresses.taker,
      });

      expect(() => build(foreignMarket)).toThrow(
        MidnightMarketAddressMismatchError,
      );
    },
  );

  test("property: preserves bounded primitive inputs through ABI encoding", () => {
    fc.assert(
      fc.property(inputs, ({ assets, units, optionalAmount, flag }) => {
        const authorization = decodeFunctionData({
          abi: midnightAbi,
          data: midnightSetIsAuthorized({
            chainId: midnightChainId,
            authorized: midnightAddresses.midnightBundles,
            onBehalf: midnightAddresses.taker,
            isAuthorized: flag,
          }).data,
        });
        expect(authorization.args[1]).toBe(flag);

        const cancellation = decodeFunctionData({
          abi: midnightAbi,
          data: midnightCancelOffer({
            chainId: midnightChainId,
            group,
            onBehalf: midnightAddresses.maker,
            amount: optionalAmount,
          }).data,
        });
        expect(cancellation.args[1]).toBe(optionalAmount);

        const redemption = decodeFunctionData({
          abi: midnightAbi,
          data: midnightRedeem({
            chainId: midnightChainId,
            market: midnightMarket,
            units,
            onBehalf: midnightAddresses.taker,
          }).data,
        });
        expect(redemption.args[1]).toBe(units);

        const repayment = decodeFunctionData({
          abi: midnightBundlesV2Abi,
          data: midnightRepayWithdrawCollateral({
            chainId: midnightChainId,
            market: midnightMarket,
            repayUnits: units,
            maxRepayAssets: assets,
            collateralWithdrawals: [{ collateralIndex: 0n, assets: units }],
            collateralReceiver: midnightAddresses.taker,
            deadline: assets,
          }).data,
        });
        if (
          repayment.functionName !==
          "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
        ) {
          throw new TypeError("unexpected repay function");
        }
        expect(repayment.args.slice(1, 3)).toEqual([units, assets]);
        expect(repayment.args[6][0]?.assets).toBe(units);
        expect(repayment.args[11]).toBe(assets);

        const collateralSupply = decodeFunctionData({
          abi: midnightAbi,
          data: midnightSupplyCollateral({
            chainId: midnightChainId,
            market: midnightMarket,
            assets,
            onBehalf: midnightAddresses.taker,
          }).data,
        });
        expect(collateralSupply.args[2]).toBe(assets);
      }),
      { seed: 42 },
    );
  });

  test("property: preserves taker targets through ABI encoding", () => {
    const target = fc.record({
      byUnits: fc.boolean(),
      amount: positiveUint128,
      bound: positiveUint128,
      deadline: fc.bigInt({ min: 1n, max: maxUint256 }),
    });
    fc.assert(
      fc.property(target, ({ byUnits, amount, bound, deadline }) => {
        const lend = decodeFunctionData({
          abi: midnightBundlesV2Abi,
          data: midnightTakeLend({
            chainId: midnightChainId,
            market: midnightMarket,
            target: byUnits
              ? { type: "units", units: amount, maxBuyerAssets: bound }
              : { type: "assets", assets: amount, minUnits: bound },
            takeableOffers: [midnightApiTake({ buy: false })],
            maxContinuousFee: bound,
            deadline,
          }).data,
        });
        expect(lend.functionName).toBe(
          byUnits
            ? "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
            : "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
        );
        expect(lend.args.slice(1, 5)).toEqual([amount, bound, false, false]);
        expect(lend.args.slice(10, 12)).toEqual([bound, deadline]);

        const borrow = decodeFunctionData({
          abi: midnightBundlesV2Abi,
          data: midnightSupplyCollateralTakeBorrow({
            chainId: midnightChainId,
            market: midnightMarket,
            target: byUnits
              ? { type: "units", units: amount, minSellerAssets: bound }
              : { type: "assets", assets: amount, maxUnits: bound },
            receiver: midnightAddresses.taker,
            collateralSupplies: [{ collateralIndex: 0n, assets: amount }],
            takeableOffers: [midnightApiTake({ buy: true })],
            deadline,
          }).data,
        });
        expect(borrow.functionName).toBe(
          byUnits
            ? "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
            : "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
        );
        expect(borrow.args.slice(1, 4)).toEqual([amount, bound, false]);
        expect(borrow.args[5]).toEqual([
          { collateralIndex: 0n, assets: amount },
        ]);
        expect(borrow.args[9]).toBe(deadline);
      }),
      { seed: 42 },
    );
  });

  test("property: preserves cancelAndMake inputs through ABI encoding", () => {
    const bytes32 = fc
      .uint8Array({ minLength: 32, maxLength: 32 })
      .map((b) => `0x${Buffer.from(b).toString("hex")}` as Hex)
      .filter((h) => BigInt(h) !== 0n);
    fc.assert(
      fc.property(
        fc.record({
          root: bytes32,
          cancelled: bytes32,
          maxConsumed: uint128,
          assets: positiveUint128,
          deadline: fc.bigInt({ min: 1n, max: maxUint256 }),
          withCollateral: fc.boolean(),
        }),
        ({
          root,
          cancelled,
          maxConsumed,
          assets,
          deadline,
          withCollateral,
        }) => {
          fc.pre(cancelled.toLowerCase() !== group);
          const decoded = decodeFunctionData({
            abi: midnightBundlesV2Abi,
            data: midnightCancelAndMake({
              chainId: midnightChainId,
              cancellations: [{ group: cancelled, maxConsumed }],
              deadline,
              publication: {
                ratifier: getChainAddress(midnightChainId, "rateRatifierV1"),
                root,
                groups: [group],
                payload: "0x1234",
                ...(withCollateral && {
                  collateral: {
                    market: midnightMarket,
                    supplies: [{ collateralIndex: 0n, assets }],
                  },
                }),
              },
            }).data,
          });
          expect(decoded.args[4]).toEqual(
            withCollateral ? [{ collateralIndex: 0n, assets }] : [],
          );
          expect(decoded.args[6]).toBe(root);
          expect(decoded.args[13]).toEqual([{ group: cancelled, maxConsumed }]);
          expect(decoded.args[15]).toBe(deadline);
        },
      ),
      { seed: 42 },
    );
  });
});
