import { midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint256 } from "viem";
import { expect, expectTypeOf, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import {
  encodeMidnightSupplyCollateralTakeBorrow,
  encodeMidnightTakeBorrow,
  encodeMidnightTakeLend,
  encodeMidnightTakeRepayWithdrawCollateral,
  encodeMidnightTakeWithdraw,
} from "./encode.js";
import { parseMidnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";
import { parseMidnightTakeBorrow } from "./takeBorrow.js";
import { parseMidnightTakeLend } from "./takeLend.js";
import { parseMidnightTakeRepayWithdrawCollateral } from "./takeRepayWithdrawCollateral.js";
import { parseMidnightTakeWithdraw } from "./takeWithdraw.js";
import type { MidnightTakeableOffer } from "./types.js";

const common = {
  chainId: midnightChainId,
  market: midnightMarket,
  receiver: midnightAddresses.taker,
  collateralReceiver: midnightAddresses.taker,
  deadline: 1600n,
  maxContinuousFee: maxUint256,
  metadata: { origin: "a1b2c3d4" },
};
const buy = { type: "assets", assets: 1n, minUnits: 1n } as const;
const sell = { type: "assets", assets: 1n, maxUnits: 2n } as const;
const offers = (isBuy: boolean) =>
  [2n, 3n, 4n].map((units) => ({ ...midnightApiTake({ buy: isBuy }), units }));

// Every override must select the complete constructor's owned offers, never substitute raw offers.
test("all five taker encoders reject replacement arrays at the type boundary", () => {
  expectTypeOf<readonly MidnightTakeableOffer[]>().not.toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeLend>[1]>
  >();
  expectTypeOf<readonly MidnightTakeableOffer[]>().not.toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeBorrow>[1]>
  >();
  expectTypeOf<readonly MidnightTakeableOffer[]>().not.toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeWithdraw>[1]>
  >();
  expectTypeOf<readonly MidnightTakeableOffer[]>().not.toExtend<
    NonNullable<Parameters<typeof encodeMidnightSupplyCollateralTakeBorrow>[1]>
  >();
  expectTypeOf<readonly MidnightTakeableOffer[]>().not.toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeRepayWithdrawCollateral>[1]>
  >();
  expectTypeOf<readonly number[]>().toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeLend>[1]>
  >();
  expectTypeOf<readonly number[]>().toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeBorrow>[1]>
  >();
  expectTypeOf<readonly number[]>().toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeWithdraw>[1]>
  >();
  expectTypeOf<readonly number[]>().toExtend<
    NonNullable<Parameters<typeof encodeMidnightSupplyCollateralTakeBorrow>[1]>
  >();
  expectTypeOf<readonly number[]>().toExtend<
    NonNullable<Parameters<typeof encodeMidnightTakeRepayWithdrawCollateral>[1]>
  >();
});

const cases = [
  () => {
    const p = parseMidnightTakeLend({
      ...common,
      target: buy,
      takeableOffers: offers(false),
    });
    return {
      p,
      encode: (indexes?: readonly number[]) =>
        encodeMidnightTakeLend(p, indexes),
      fillIndex: 5,
    };
  },
  () => {
    const p = parseMidnightTakeBorrow({
      ...common,
      target: sell,
      takeableOffers: offers(true),
    });
    return {
      p,
      encode: (indexes?: readonly number[]) =>
        encodeMidnightTakeBorrow(p, indexes),
      fillIndex: 6,
    };
  },
  () => {
    const p = parseMidnightTakeWithdraw({
      ...common,
      target: sell,
      takeableOffers: offers(true),
    });
    return {
      p,
      encode: (indexes?: readonly number[]) =>
        encodeMidnightTakeWithdraw(p, indexes),
      fillIndex: 6,
    };
  },
  () => {
    const p = parseMidnightSupplyCollateralTakeBorrow({
      ...common,
      target: sell,
      takeableOffers: offers(true),
      collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
    });
    return {
      p,
      encode: (indexes?: readonly number[]) =>
        encodeMidnightSupplyCollateralTakeBorrow(p, indexes),
      fillIndex: 6,
    };
  },
  () => {
    const p = parseMidnightTakeRepayWithdrawCollateral({
      ...common,
      target: buy,
      takeableOffers: offers(false),
      repayEnabled: true,
      collateralWithdrawals: [],
    });
    return {
      p,
      encode: (indexes?: readonly number[]) =>
        encodeMidnightTakeRepayWithdrawCollateral(p, indexes),
      fillIndex: 5,
    };
  },
];

test.each(cases)(
  "checked selection preserves empty, full and filtered calldata and action args %#",
  (make) => {
    const { p, encode, fillIndex } = make();
    const full = encode();
    expect(encode([0, 1, 2])).toEqual(full);
    for (const indexes of [
      [],
      [2, 0],
      [1],
      [2, 2, 0, 99],
      [-1, 99, Number.NaN, 1.5],
    ]) {
      const tx = encode(indexes);
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });
      const original = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: full.data,
      });
      const selected = p.takeableOffers.filter((_, i) => indexes.includes(i));
      expect(decoded.args[fillIndex]).toEqual(selected);
      expect(decoded.args.filter((_, i) => i !== fillIndex)).toEqual(
        original.args.filter((_, i) => i !== fillIndex),
      );
      expect(tx.action.args).toEqual({
        ...full.action.args,
        takeableOffers: selected.length,
      });
      expect({ to: tx.to, value: tx.value }).toEqual({
        to: full.to,
        value: full.value,
      });
      expect(tx.data.endsWith(common.metadata.origin)).toBe(true);
      expect(Object.isFrozen(tx)).toBe(true);
      expect(Object.isFrozen(tx.action.args)).toBe(true);
    }
  },
);
