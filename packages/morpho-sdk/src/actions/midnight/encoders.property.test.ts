import {
  MAX_OFFER_CAP,
  MarketParams,
  midnightAbi,
  midnightBundlesAbi,
  setterRatifierAbi,
} from "@morpho-org/midnight-sdk";
import fc from "fast-check";
import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { MidnightMarketAddressMismatchError } from "../../types/index.js";
import { midnightSetIsAuthorized } from "./authorization.js";
import { midnightCancelOffer } from "./cancelOffer.js";
import { midnightRedeem } from "./redeem.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { setterRatifierRatifyRoot } from "./setterRatifierRatifyRoot.js";
import { midnightSupplyCollateral } from "./supplyCollateral.js";
import { midnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";
import { midnightTakeBorrow } from "./takeBorrow.js";
import { midnightTakeLend } from "./takeLend.js";

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
          repayAssets: 1n,
          withdrawCollateralAssets: 0n,
          onBehalf: midnightAddresses.taker,
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
          collateralAssets: 1n,
          loanAssets: 1n,
          maxUnits: 1n,
          taker: midnightAddresses.taker,
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
          loanAssets: 1n,
          maxUnits: 1n,
          taker: midnightAddresses.taker,
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
          assets: 1n,
          minUnits: 1n,
          taker: midnightAddresses.taker,
          takeableOffers: [midnightApiTake({ buy: false })],
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
          abi: midnightBundlesAbi,
          data: midnightRepayWithdrawCollateral({
            chainId: midnightChainId,
            market: midnightMarket,
            repayAssets: assets,
            withdrawCollateralAssets: units,
            onBehalf: midnightAddresses.taker,
            deadline: optionalAmount,
          }).data,
        });
        if (
          repayment.functionName !==
          "midnightBundlesV1RepayAndWithdrawCollateral"
        ) {
          throw new TypeError("unexpected repay function");
        }
        expect(repayment.args[1]).toBe(assets);
        expect(repayment.args[4][0]?.assets).toBe(units);
        expect(repayment.args[8]).toBe(optionalAmount);

        const rootRatification = decodeFunctionData({
          abi: setterRatifierAbi,
          data: setterRatifierRatifyRoot({
            chainId: midnightChainId,
            maker: midnightAddresses.maker,
            root: group,
            isRootRatified: flag,
          }).data,
        });
        expect(rootRatification.args[2]).toBe(flag);

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

        const takeableBorrowOffers = [midnightApiTake({ buy: true })];
        const collateralBorrow = decodeFunctionData({
          abi: midnightBundlesAbi,
          data: midnightSupplyCollateralTakeBorrow({
            chainId: midnightChainId,
            market: midnightMarket,
            collateralAssets: assets,
            loanAssets: assets,
            maxUnits: units,
            taker: midnightAddresses.taker,
            takeableOffers: takeableBorrowOffers,
            deadline: optionalAmount,
          }).data,
        });
        if (
          collateralBorrow.functionName !==
          "midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget"
        ) {
          throw new TypeError("unexpected collateral-borrow function");
        }
        expect(collateralBorrow.args[0]).toBe(assets);
        expect(collateralBorrow.args[1]).toBe(units);
        expect(collateralBorrow.args[5][0]?.assets).toBe(assets);

        const borrow = decodeFunctionData({
          abi: midnightBundlesAbi,
          data: midnightTakeBorrow({
            chainId: midnightChainId,
            market: midnightMarket,
            loanAssets: assets,
            maxUnits: units,
            taker: midnightAddresses.taker,
            takeableOffers: takeableBorrowOffers,
            deadline: optionalAmount,
          }).data,
        });
        expect(borrow.args[0]).toBe(assets);
        expect(borrow.args[1]).toBe(units);

        const lend = decodeFunctionData({
          abi: midnightBundlesAbi,
          data: midnightTakeLend({
            chainId: midnightChainId,
            market: midnightMarket,
            assets,
            minUnits: optionalAmount,
            taker: midnightAddresses.taker,
            takeableOffers: [midnightApiTake({ buy: false })],
            deadline: optionalAmount,
          }).data,
        });
        expect(lend.args[0]).toBe(assets);
        expect(lend.args[1]).toBe(optionalAmount);
      }),
      { seed: 42 },
    );
  });
});
