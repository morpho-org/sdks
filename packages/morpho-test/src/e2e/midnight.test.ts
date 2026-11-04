import {
  Offer,
  OfferUtils,
  PriceRatifierV1,
  RateRatifierV1,
  SetterRatifier,
  SetterRatifierUtils,
  Tree,
} from "@morpho-org/midnight-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Chain, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  E2eMidnightMarketRequiredError,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
} from "./midnight.js";

describe("fundE2eMidnightWallets validation", () => {
  const client = {} as AnvilTestClient<Chain>;

  test("accepts an empty wallet list without a market or RPC calls", async () => {
    await expect(
      fundE2eMidnightWallets(client, { wallets: {} }),
    ).resolves.toBeUndefined();
  });

  test.each([{ loanAssets: 1n }, { collateralAssets: 1n }, { loanAssets: 0n }])(
    "rejects asset funding without a market before RPC calls: %o",
    async (funding) => {
      await expect(
        fundE2eMidnightWallets(client, { wallets: { A: funding } }),
      ).rejects.toThrow(E2eMidnightMarketRequiredError);
    },
  );
});

const offer = Offer.create({
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  tick: 5_000n,
  expiry: 3_600n,
  ratifier: "0x000000000000000000000000000000000000a111",
  maxUnits: 100n,
});
const legacyTree = Tree.create([offer]);
const setterTree = Tree.create({ type: "setter", entries: [offer] });
const priceTree = Tree.create({
  type: "priceV1",
  entries: [{ offer, allowedTaker: zeroAddress }],
});
const rateTree = Tree.create({
  type: "rateV1",
  entries: [{ offer, rate: 100n }],
});
const setterSnapshot = setterTree.toDescriptor();
const priceSnapshot = priceTree.toDescriptor();
const rateSnapshot = rateTree.toDescriptor();
const units = 7n;

type RatifierItem = ReturnType<typeof SetterRatifierUtils.ratify>[number];

const expectTakeableOffers = (
  tree: Parameters<typeof getE2eTakeableOffers>[0]["tree"],
  items: readonly RatifierItem[],
) => {
  expect(getE2eTakeableOffers({ tree, units })).toEqual(
    items.map(({ offer: itemOffer, ratifierData }) => ({
      units,
      offer: OfferUtils.toStruct({ offer: itemOffer }),
      ratifierData,
    })),
  );
};

describe("getE2eTakeableOffers", () => {
  test("routes legacy trees to SetterRatifierUtils", () => {
    expectTakeableOffers(
      legacyTree,
      SetterRatifierUtils.ratify({ tree: legacyTree }),
    );
  });

  test("routes tagged Setter trees to SetterRatifier", () => {
    expectTakeableOffers(
      setterTree,
      SetterRatifier.ratify({ tree: setterTree }),
    );
  });

  test("routes Setter snapshots to SetterRatifier", () => {
    expectTakeableOffers(
      setterSnapshot,
      SetterRatifier.ratify({ tree: setterSnapshot }),
    );
  });

  test("routes Price V1 Tree instances to PriceRatifierV1 without throwing", () => {
    expect(() =>
      getE2eTakeableOffers({ tree: priceTree, units }),
    ).not.toThrow();
    expectTakeableOffers(
      priceTree,
      PriceRatifierV1.ratify({ tree: priceTree }),
    );
  });

  test("routes Price V1 snapshots to PriceRatifierV1", () => {
    expectTakeableOffers(
      priceSnapshot,
      PriceRatifierV1.ratify({ tree: priceSnapshot }),
    );
  });

  test("routes Rate V1 Tree instances to RateRatifierV1", () => {
    expectTakeableOffers(rateTree, RateRatifierV1.ratify({ tree: rateTree }));
  });

  test("routes Rate V1 snapshots to RateRatifierV1", () => {
    expectTakeableOffers(
      rateSnapshot,
      RateRatifierV1.ratify({ tree: rateSnapshot }),
    );
  });
});
