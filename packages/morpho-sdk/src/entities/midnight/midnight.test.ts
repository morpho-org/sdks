import {
  AccrualPosition,
  Group,
  Market,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import type { Address, Hex } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightBaseOffer,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import type {
  MidnightOfferRootSignature,
  MidnightSubmitOffersAction,
  Transaction,
} from "../../types/action.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  MarketIdMismatchError,
  MidnightOfferRootOfferCountMismatchError,
  MidnightOfferRootOwnerMismatchError,
  MidnightOfferRootRatifierMismatchError,
  MissingAccrualPositionError,
} from "../../types/error.js";
import type { MidnightActionSignatures } from "./midnight.js";
import { MorphoMidnight } from "./midnight.js";

interface PreparedOffersFixture {
  readonly group: Group;
  readonly tree: Tree;
  readonly ratifierType: "ecrecover" | "setter";
  readonly ratifier: Address;
  readonly setterPayload?: Hex;
}

type BuildSubmitOffersTx = (params: {
  readonly accountAddress: Address;
  readonly prepared: PreparedOffersFixture;
  readonly signatures?: MidnightActionSignatures;
}) => Readonly<Transaction<MidnightSubmitOffersAction>>;

const buildSubmitOffersTx: BuildSubmitOffersTx = (params) =>
  (
    Object.assign(Object.create(MorphoMidnight.prototype), {
      chainId: midnightChainId,
    }) as {
      buildSubmitOffersTx: BuildSubmitOffersTx;
    }
  ).buildSubmitOffersTx(params);

const preparedOffers = (): PreparedOffersFixture => {
  const offer = Offer.create(
    midnightBaseOffer({ ratifier: midnightAddresses.ecrecoverRatifier }),
  );
  const group = Group.create([offer]);

  return {
    group,
    tree: Tree.create([group]),
    ratifierType: "ecrecover",
    ratifier: midnightAddresses.ecrecoverRatifier,
  };
};

const offerRootSignature = (
  prepared: PreparedOffersFixture,
  overrides: {
    readonly owner?: Address;
    readonly ratifier?: Address;
    readonly offers?: number;
  } = {},
): MidnightOfferRootSignature => ({
  action: {
    type: "midnightOfferRootSignature",
    args: {
      root: prepared.tree.root,
      ratifier: overrides.ratifier ?? prepared.ratifier,
      offers: overrides.offers ?? prepared.tree.offers.length,
    },
  },
  args: {
    owner: overrides.owner ?? midnightAddresses.maker,
    root: prepared.tree.root,
    signature: "0x1234",
    payload: "0x1234",
  },
});

const client = {
  viemClient: { chain: { id: midnightChainId } },
  options: {},
} as unknown as MorphoClientType;

const marketData = (overrides: { readonly withdrawable?: bigint } = {}) =>
  new Market({
    chainId: midnightChainId,
    params: midnightMarket,
    totalUnits: 1_000n,
    lossFactor: 0n,
    withdrawable: overrides.withdrawable ?? 1_000n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });

const positionData = (
  market: Market,
  overrides: { readonly credit?: bigint; readonly pendingFee?: bigint } = {},
) =>
  new AccrualPosition(
    {
      credit: overrides.credit ?? 100n,
      pendingFee: overrides.pendingFee ?? 0n,
      lastLossFactor: 0n,
      lastAccrual: 0n,
      debt: 0n,
      collateralBitmap: 0n,
      collateral: [],
    },
    market,
  );

const midnight = () => new MorphoMidnight(client, midnightChainId);

describe("MorphoMidnight", () => {
  describe("takeLend", () => {
    test("default", () => {
      const output = midnight().takeLend({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        assets: 1_000n,
        minUnits: 900n,
        takeableOffers: [midnightApiTake()],
      });
      const tx = output.buildTx();

      expect(tx.action.args).toEqual({
        market: midnightMarketId,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers: 1,
      });
    });
  });

  describe("redeem", () => {
    test("default", () => {
      const market = marketData();
      const output = midnight().redeem({
        marketData: market,
        positionData: positionData(market, { credit: 250n, pendingFee: 50n }),
        accountAddress: midnightAddresses.taker,
      });
      const tx = output.buildTx();

      expect(tx.action.args).toEqual({
        market: midnightMarketId,
        units: 200n,
        onBehalf: midnightAddresses.taker,
        receiver: midnightAddresses.taker,
      });
    });

    test("behavior: explicit units override face value", () => {
      const market = marketData();
      const output = midnight().redeem({
        marketData: market,
        positionData: positionData(market, { credit: 250n, pendingFee: 50n }),
        accountAddress: midnightAddresses.taker,
        units: 125n,
      });
      const tx = output.buildTx();

      expect(tx.action.args).toEqual({
        market: midnightMarketId,
        units: 125n,
        onBehalf: midnightAddresses.taker,
        receiver: midnightAddresses.taker,
      });
    });

    test("error: MarketIdMismatchError", () => {
      const market = marketData();
      const otherMarket = new Market({
        ...market,
        params: midnightOtherMarket,
      });

      expect(() =>
        midnight().redeem({
          marketData: market,
          positionData: positionData(otherMarket),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(MarketIdMismatchError);
    });

    test("error: MissingAccrualPositionError", () => {
      const market = marketData();

      expect(() =>
        midnight().redeem({
          marketData: market,
          positionData: undefined as unknown as AccrualPosition,
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(MissingAccrualPositionError);
    });
  });

  describe("buildSubmitOffersTx", () => {
    test("default", () => {
      const prepared = preparedOffers();
      const tx = buildSubmitOffersTx({
        accountAddress: midnightAddresses.maker,
        prepared,
        signatures: offerRootSignature(prepared),
      });

      expect(tx.action.args).toEqual({
        group: prepared.group.id,
        root: prepared.tree.root,
        maker: midnightAddresses.maker,
        ratifier: midnightAddresses.ecrecoverRatifier,
        ratifierType: "ecrecover",
        offers: prepared.tree.offers.length,
      });
    });

    test("error: MidnightOfferRootOwnerMismatchError", () => {
      const prepared = preparedOffers();

      expect(() =>
        buildSubmitOffersTx({
          accountAddress: midnightAddresses.maker,
          prepared,
          signatures: offerRootSignature(prepared, {
            owner: midnightAddresses.taker,
          }),
        }),
      ).toThrow(MidnightOfferRootOwnerMismatchError);
    });

    test("error: MidnightOfferRootRatifierMismatchError", () => {
      const prepared = preparedOffers();

      expect(() =>
        buildSubmitOffersTx({
          accountAddress: midnightAddresses.maker,
          prepared,
          signatures: offerRootSignature(prepared, {
            ratifier: midnightAddresses.setterRatifier,
          }),
        }),
      ).toThrow(MidnightOfferRootRatifierMismatchError);
    });

    test("error: MidnightOfferRootOfferCountMismatchError", () => {
      const prepared = preparedOffers();

      expect(() =>
        buildSubmitOffersTx({
          accountAddress: midnightAddresses.maker,
          prepared,
          signatures: offerRootSignature(prepared, {
            offers: prepared.tree.offers.length + 1,
          }),
        }),
      ).toThrow(MidnightOfferRootOfferCountMismatchError);
    });
  });
});
