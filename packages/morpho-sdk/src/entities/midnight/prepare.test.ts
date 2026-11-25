import { MarketParams as BlueMarketParams } from "@morpho-org/blue-sdk";
import { Offer, Tree } from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
  vi,
} from "vitest";
import {
  midnightAddresses,
  midnightBaseOffer,
  midnightChainId,
} from "../../../test/fixtures/midnight.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  InvalidMidnightHexInputError,
  MidnightOfferNotReduceOnlyError,
  MidnightOfferSideMismatchError,
  NonPositiveInputError,
} from "../../types/error.js";
import {
  type parseGetOffersDataParams,
  parseMakeBorrowParams,
  parseMakeLendParams,
  parseMakeRepayParams,
  parseMakeWithdrawParams,
  parseSupplyBlueMakeLendParams,
  type parseSupplyCollateralMakeBorrowParams,
} from "./prepare.js";

const context = {
  chainId: midnightChainId,
  client: {
    viemClient: { chain: { id: midnightChainId } },
    options: {},
  } as unknown as MorphoClientType,
};
const offers = (buy: boolean, reduceOnly = false) =>
  Tree.create({
    type: "rateV1",
    entries: [
      {
        offer: Offer.create(
          midnightBaseOffer({
            buy,
            reduceOnly,
            ratifier: getChainAddress(midnightChainId, "rateRatifierV1"),
          }),
        ),
        rate: 1_000_000_000n,
      },
    ],
  });
type WithoutWitness<T> = {
  [K in keyof T as K extends symbol ? never : K]: T[K];
};

describe.sequential("complete maker operation constructors", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  test("raw maker params cannot replace complete prepared operations", () => {
    expectTypeOf<Parameters<typeof parseGetOffersDataParams>[0]>().not.toExtend<
      ReturnType<typeof parseGetOffersDataParams>
    >();
    expectTypeOf<Parameters<typeof parseMakeLendParams>[0]>().not.toExtend<
      Awaited<ReturnType<typeof parseMakeLendParams>>
    >();
    expectTypeOf<Parameters<typeof parseMakeRepayParams>[0]>().not.toExtend<
      Awaited<ReturnType<typeof parseMakeRepayParams>>
    >();
    expectTypeOf<Parameters<typeof parseMakeBorrowParams>[0]>().not.toExtend<
      Awaited<ReturnType<typeof parseMakeBorrowParams>>
    >();
    expectTypeOf<Parameters<typeof parseMakeWithdrawParams>[0]>().not.toExtend<
      Awaited<ReturnType<typeof parseMakeWithdrawParams>>
    >();
    expectTypeOf<
      Parameters<typeof parseSupplyBlueMakeLendParams>[0]
    >().not.toExtend<
      Awaited<ReturnType<typeof parseSupplyBlueMakeLendParams>>
    >();
    expectTypeOf<
      Parameters<typeof parseSupplyCollateralMakeBorrowParams>[0]
    >().not.toExtend<
      Awaited<ReturnType<typeof parseSupplyCollateralMakeBorrowParams>>
    >();
    expectTypeOf<
      WithoutWitness<Awaited<ReturnType<typeof parseMakeLendParams>>>
    >().not.toExtend<Awaited<ReturnType<typeof parseMakeLendParams>>>();
    expectTypeOf<
      WithoutWitness<Awaited<ReturnType<typeof parseMakeBorrowParams>>>
    >().not.toExtend<Awaited<ReturnType<typeof parseMakeBorrowParams>>>();
    expectTypeOf<
      Awaited<ReturnType<typeof parseMakeLendParams>>
    >().not.toExtend<Awaited<ReturnType<typeof parseMakeRepayParams>>>();
    expectTypeOf<
      Awaited<ReturnType<typeof parseMakeBorrowParams>>
    >().not.toExtend<Awaited<ReturnType<typeof parseMakeWithdrawParams>>>();
  });

  test("whole lend construction preserves funding-before-opening-side and reduction-before-funding precedence", async () => {
    const raw = {
      accountAddress: midnightAddresses.maker,
      offers: offers(false),
      deadline: 1_500n,
      loanToken: midnightAddresses.loanToken,
      loanAssets: 0n,
    };
    await expect(parseMakeLendParams(raw, context)).rejects.toThrow(
      NonPositiveInputError,
    );
    await expect(
      parseMakeLendParams({ ...raw, loanAssets: 1n }, context),
    ).rejects.toThrow(MidnightOfferSideMismatchError);
    await expect(
      parseMakeRepayParams({ ...raw, offers: offers(true) }, context),
    ).rejects.toThrow(MidnightOfferNotReduceOnlyError);
  });

  test("borrow constructors select their operation rather than treating extra raw loanToken fields as lend funding", async () => {
    const raw = {
      accountAddress: midnightAddresses.maker,
      offers: offers(true),
      deadline: 1_500n,
      loanToken: "invalid-extra-field",
      loanAssets: 0n,
    };
    await expect(parseMakeBorrowParams(raw, context)).rejects.toThrow(
      MidnightOfferSideMismatchError,
    );
    await expect(
      parseMakeWithdrawParams({ ...raw, offers: offers(true, true) }, context),
    ).rejects.toThrow(MidnightOfferSideMismatchError);
  });

  test("Blue maker construction preserves callback-salt error precedence before parking amount validation and RPC", async () => {
    await expect(
      parseSupplyBlueMakeLendParams(
        {
          accountAddress: midnightAddresses.maker,
          offers: offers(true),
          deadline: 1_500n,
          blueMarket: new BlueMarketParams({
            loanToken: midnightAddresses.loanToken,
            collateralToken: midnightAddresses.collateralToken,
            oracle: midnightAddresses.oracle,
            irm: zeroAddress,
            lltv: 770000000000000000n,
          }),
          callbackSalt: "0x12",
          assetsToPark: 0n,
        },
        context,
      ),
    ).rejects.toThrow(InvalidMidnightHexInputError);
  });
});
