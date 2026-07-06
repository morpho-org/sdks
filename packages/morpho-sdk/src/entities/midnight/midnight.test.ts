import {
  AccrualPosition,
  Group,
  Market,
  midnightAbi,
  Offer,
  Tree,
} from "@morpho-org/midnight-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  type Chain,
  erc20Abi,
  maxUint256,
  zeroAddress,
} from "viem";
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
  TokenRequirementSignature,
  Transaction,
} from "../../types/action.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AmbiguousRequirementSignaturesError,
  MarketIdMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferRootOfferCountMismatchError,
  MidnightOfferRootOwnerMismatchError,
  MidnightOfferRootRatifierMismatchError,
  MidnightOfferSideMismatchError,
  MissingAccrualPositionError,
  UnexpectedRequirementSignatureError,
} from "../../types/error.js";
import type { MidnightActionSignatures, OffersData } from "./midnight.js";
import { MorphoMidnight } from "./midnight.js";

type BuildSubmitOffersTx = (params: {
  readonly offersData: OffersData;
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

const offersData = (buy = true): OffersData => {
  const offer = Offer.create(
    midnightBaseOffer({
      market: { ...midnightMarket, maturity: apiValidMaturity },
      buy,
      expiry: apiValidMaturity - 60n,
      maxAssets: 1_000n,
      maxUnits: 0n,
      ratifier: midnightAddresses.ecrecoverRatifier,
    }),
  );
  const group = Group.create([offer]);

  return {
    accountAddress: midnightAddresses.maker,
    groups: [group.id],
    tree: Tree.create([group]),
    ratifierType: "ecrecover",
    ratifier: midnightAddresses.ecrecoverRatifier,
  };
};

const multiGroupOffersData = (): OffersData => {
  const lendOffer = Offer.create(
    midnightBaseOffer({
      market: { ...midnightMarket, maturity: apiValidMaturity },
      buy: true,
      expiry: apiValidMaturity - 60n,
      maxAssets: 1_000n,
      maxUnits: 0n,
      ratifier: midnightAddresses.ecrecoverRatifier,
    }),
  );
  const borrowOffer = Offer.create(
    midnightBaseOffer({
      market: { ...midnightMarket, maturity: apiValidMaturity },
      buy: false,
      tick: 5_004n,
      expiry: apiValidMaturity - 60n,
      maxAssets: 1_000n,
      maxUnits: 0n,
      ratifier: midnightAddresses.ecrecoverRatifier,
    }),
  );
  const lendGroup = Group.create([lendOffer]);
  const borrowGroup = Group.create([borrowOffer]);

  return {
    accountAddress: midnightAddresses.maker,
    groups: [lendGroup.id, borrowGroup.id],
    tree: Tree.create([lendGroup, borrowGroup]),
    ratifierType: "ecrecover",
    ratifier: midnightAddresses.ecrecoverRatifier,
  };
};

const setterOffersData = (): OffersData => {
  const offer = Offer.create(
    midnightBaseOffer({
      market: { ...midnightMarket, maturity: apiValidMaturity },
      buy: true,
      expiry: apiValidMaturity - 60n,
      maxAssets: 1_000n,
      maxUnits: 0n,
      ratifier: midnightAddresses.setterRatifier,
    }),
  );
  const group = Group.create([offer]);

  return {
    accountAddress: midnightAddresses.maker,
    groups: [group.id],
    tree: Tree.create([group]),
    ratifierType: "setter",
    ratifier: midnightAddresses.setterRatifier,
    setterPayload: "0x1234",
  };
};

const offerRootSignature = (
  data: OffersData,
  overrides: {
    readonly owner?: Address;
    readonly ratifier?: Address;
    readonly offers?: number;
  } = {},
): MidnightOfferRootSignature => ({
  action: {
    type: "midnightOfferRootSignature",
    args: {
      root: data.tree.root,
      ratifier: overrides.ratifier ?? data.ratifier,
      offers: overrides.offers ?? data.tree.offers.length,
    },
  },
  args: {
    owner: overrides.owner ?? data.accountAddress,
    root: data.tree.root,
    signature: "0x1234",
    payload: "0x1234",
  },
});

const tokenSignature = {
  action: {
    type: "permit2Transfer",
    args: {
      spender: midnightAddresses.midnightBundles,
      amount: 1_000n,
      deadline: 123n,
    },
  },
  args: {
    owner: midnightAddresses.taker,
    nonce: 42n,
    asset: midnightAddresses.loanToken,
    signature: "0x1234",
    amount: 1_000n,
    deadline: 123n,
  },
} satisfies TokenRequirementSignature;

const client = {
  viemClient: { chain: { id: midnightChainId } },
  options: {},
} as unknown as MorphoClientType;

const midnightTestChain = {
  id: midnightChainId,
  name: "Midnight Test",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
} as const satisfies Chain;

const apiValidMaturity = 1_767_279_600n;
const offerValidation = {
  apiUrl: "https://api.example/base/",
  fetch: async () =>
    new Response(JSON.stringify({ data: { issues: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
};

const marketData = (overrides: { readonly withdrawable?: bigint } = {}) =>
  new Market({
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
        reduceOnly: false,
        takeableOffers: 1,
        collateralWithdrawals: 0,
        collateralReceiver: zeroAddress,
        referralFeePct: 0n,
        referralFeeRecipient: zeroAddress,
        maxContinuousFee: maxUint256,
        deadline: maxUint256,
      });
    });

    test("error: MidnightOfferSideMismatchError", () => {
      const output = midnight().takeLend({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        assets: 1_000n,
        minUnits: 900n,
        takeableOffers: [midnightApiTake({ buy: true })],
      });

      expect(() => output.buildTx()).toThrow(MidnightOfferSideMismatchError);
    });
  });

  describe("takeBorrow", () => {
    test("error: MidnightOfferSideMismatchError", () => {
      const output = midnight().takeBorrow({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers: [midnightApiTake({ buy: false })],
      });

      expect(() => output.buildTx()).toThrow(MidnightOfferSideMismatchError);
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

  describe("getOffersData", () => {
    test("behavior: accepts multiple Tree.create entries", async () => {
      const lendOffer = Offer.create(
        midnightBaseOffer({
          market: { ...midnightMarket, maturity: apiValidMaturity },
          buy: true,
          expiry: apiValidMaturity - 60n,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );
      const borrowOffer = Offer.create(
        midnightBaseOffer({
          market: { ...midnightMarket, maturity: apiValidMaturity },
          buy: false,
          tick: 5_004n,
          expiry: apiValidMaturity - 60n,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );
      const lendGroup = Group.create([lendOffer]);
      const borrowGroup = Group.create([borrowOffer]);
      const data = await midnight().getOffersData({
        accountAddress: midnightAddresses.maker,
        offers: [lendGroup, borrowGroup],
        validation: offerValidation,
      });

      expect(data.groups).toEqual([lendGroup.id, borrowGroup.id]);
      expect(data.tree.offers).toHaveLength(2);
      expect(data.ratifierType).toBe("ecrecover");
      expect(data.ratifier).toBe(midnightAddresses.ecrecoverRatifier);
    });

    test("behavior: accepts a single offer", async () => {
      const offer = Offer.create(
        midnightBaseOffer({
          market: { ...midnightMarket, maturity: apiValidMaturity },
          buy: true,
          expiry: apiValidMaturity - 60n,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );
      const data = await midnight().getOffersData({
        accountAddress: midnightAddresses.maker,
        offers: offer,
        validation: offerValidation,
      });

      expect(data.groups).toEqual([offer.group]);
      expect(data.tree.offers).toHaveLength(1);
    });

    test("error: MidnightOfferMarketChainMismatchError", async () => {
      const offer = Offer.create(
        midnightBaseOffer({
          market: { ...midnightMarket, chainId: 1n },
          buy: true,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );

      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers: offer,
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferMarketChainMismatchError);
    });

    test("error: MidnightOfferMarketAddressMismatchError", async () => {
      const offer = Offer.create(
        midnightBaseOffer({
          market: { ...midnightMarket, midnight: zeroAddress },
          buy: true,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );

      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers: offer,
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferMarketAddressMismatchError);
    });
  });

  describe("makeLend", () => {
    test("default", async () => {
      const data = offersData(true);
      const output = await midnight().makeLend({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
        loanToken: midnightAddresses.loanToken,
        loanAssets: 1_000n,
      });
      const tx = output.buildTx(offerRootSignature(data));

      expect(output.groups).toEqual(data.groups);
      expect(output.root).toBe(data.tree.root);
      expect(output.ratifierType).toBe("ecrecover");
      expect(tx.action.args).toMatchObject({
        groups: data.groups,
        root: data.tree.root,
        maker: midnightAddresses.maker,
        ratifier: midnightAddresses.ecrecoverRatifier,
        ratifierType: "ecrecover",
        offers: data.tree.offers.length,
      });
    });

    test("behavior: approval covers new group and existing loan reserves", async () => {
      const handle = createMockClient(midnightTestChain);
      mockRead(handle, {
        address: midnightAddresses.loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: midnightAddresses.midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        result: true,
      });

      const data = offersData(true);
      const output = await new MorphoMidnight(
        {
          viemClient: handle.client,
          options: {},
        } as unknown as MorphoClientType,
        midnightChainId,
      ).makeLend({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
        loanToken: midnightAddresses.loanToken,
        loanAssets: 1_000n,
        reservedLoanAssets: 250n,
      });
      const requirements = await output.getRequirements();

      expect(
        requirements.find(
          (requirement) => requirement.action.type === "erc20Approval",
        )?.action,
      ).toMatchObject({
        args: {
          spender: midnightAddresses.midnight,
          amount: 1_250n,
        },
      });
    });

    test("error: MidnightOfferSideMismatchError", async () => {
      await expect(
        midnight().makeLend({
          accountAddress: midnightAddresses.maker,
          offers: offersData(false).tree,
          validation: offerValidation,
          loanToken: midnightAddresses.loanToken,
          loanAssets: 1_000n,
        }),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
    });

    test("error: MidnightOfferMarketLoanTokenMismatchError", async () => {
      const offer = Offer.create(
        midnightBaseOffer({
          market: {
            ...midnightMarket,
            loanToken: midnightAddresses.dai,
            maturity: apiValidMaturity,
          },
          buy: true,
          expiry: apiValidMaturity - 60n,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );

      await expect(
        midnight().makeLend({
          accountAddress: midnightAddresses.maker,
          offers: offer,
          validation: offerValidation,
          loanToken: midnightAddresses.loanToken,
          loanAssets: 1_000n,
        }),
      ).rejects.toThrow(MidnightOfferMarketLoanTokenMismatchError);
    });
  });

  describe("supplyCollateralMakeBorrow", () => {
    test("behavior: approval covers new group and existing collateral reserves", async () => {
      const handle = createMockClient(midnightTestChain);
      mockRead(handle, {
        address: midnightAddresses.collateralToken,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      mockRead(handle, {
        address: midnightAddresses.midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        result: true,
      });

      const data = offersData(false);
      const output = await new MorphoMidnight(
        {
          viemClient: handle.client,
          options: {},
        } as unknown as MorphoClientType,
        midnightChainId,
      ).supplyCollateralMakeBorrow({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
        market: midnightMarket,
        collateralAssets: 1_000n,
        reservedCollateralAssets: 250n,
      });
      const requirements = await output.getRequirements();

      expect(
        requirements.find(
          (requirement) => requirement.action.type === "erc20Approval",
        )?.action,
      ).toMatchObject({
        args: {
          spender: midnightAddresses.midnight,
          amount: 1_250n,
        },
      });
      expect(
        requirements.find(
          (requirement) =>
            requirement.action.type === "midnightSupplyCollateral",
        )?.action,
      ).toMatchObject({
        args: {
          assets: 1_000n,
        },
      });
    });
  });

  describe("makeBorrow", () => {
    test("default", async () => {
      const data = offersData(false);
      const output = await midnight().makeBorrow({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
      });
      const tx = output.buildTx(offerRootSignature(data));

      expect(output.groups).toEqual(data.groups);
      expect(tx.action.args.maker).toBe(midnightAddresses.maker);
      expect(tx.action.args.offers).toBe(data.tree.offers.length);
    });

    test("error: MidnightOfferSideMismatchError", async () => {
      await expect(
        midnight().makeBorrow({
          accountAddress: midnightAddresses.maker,
          offers: offersData(true).tree,
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
    });

    test("error: MidnightOfferSideMismatchError mixed-side groups", async () => {
      const data = multiGroupOffersData();

      await expect(
        midnight().makeBorrow({
          accountAddress: data.accountAddress,
          offers: data.tree,
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
    });
  });

  describe("buildSubmitOffersTx", () => {
    test("default", () => {
      const data = offersData();
      const tx = buildSubmitOffersTx({
        offersData: data,
        signatures: offerRootSignature(data),
      });

      expect(tx.action.args).toEqual({
        groups: data.groups,
        root: data.tree.root,
        maker: midnightAddresses.maker,
        ratifier: midnightAddresses.ecrecoverRatifier,
        ratifierType: "ecrecover",
        offers: data.tree.offers.length,
      });
    });

    test("error: MidnightOfferRootOwnerMismatchError", () => {
      const data = offersData();

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: offerRootSignature(data, {
            owner: midnightAddresses.taker,
          }),
        }),
      ).toThrow(MidnightOfferRootOwnerMismatchError);
    });

    test("error: MidnightOfferRootRatifierMismatchError", () => {
      const data = offersData();

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: offerRootSignature(data, {
            ratifier: midnightAddresses.setterRatifier,
          }),
        }),
      ).toThrow(MidnightOfferRootRatifierMismatchError);
    });

    test("error: MidnightOfferRootOfferCountMismatchError", () => {
      const data = offersData();

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: offerRootSignature(data, {
            offers: data.tree.offers.length + 1,
          }),
        }),
      ).toThrow(MidnightOfferRootOfferCountMismatchError);
    });

    test("error: AmbiguousRequirementSignaturesError", () => {
      const data = offersData();
      const signature = offerRootSignature(data);

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: [signature, signature],
        }),
      ).toThrow(AmbiguousRequirementSignaturesError);
    });

    test("error: UnexpectedRequirementSignatureError", () => {
      const data = offersData();

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: [tokenSignature],
        }),
      ).toThrow(UnexpectedRequirementSignatureError);
    });

    test("error: UnexpectedRequirementSignatureError for setter ratifier", () => {
      const data = setterOffersData();

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: [offerRootSignature(data)],
        }),
      ).toThrow(UnexpectedRequirementSignatureError);
    });
  });
});
