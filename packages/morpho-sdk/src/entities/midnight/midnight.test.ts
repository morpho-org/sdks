import {
  AccrualPosition,
  Group,
  Market,
  MarketUtils,
  midnightAbi,
  Offer,
  setterRatifierAbi,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  createMockClient,
  type MockClientHandle,
  mockRead,
} from "@morpho-org/test/mock";
import {
  type Address,
  type Chain,
  createWalletClient,
  custom,
  erc20Abi,
  type Hex,
  maxUint256,
  numberToHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
  MempoolSubmitOffersAction,
  MidnightOfferRootSignature,
  Transaction,
} from "../../types/action.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AmbiguousRequirementSignaturesError,
  ChainIdMismatchError,
  EmptyMidnightTakeableOffersError,
  InsufficientMidnightWithdrawableLiquidityError,
  MarketIdMismatchError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferRootMismatchError,
  MidnightOfferRootOfferCountMismatchError,
  MidnightOfferRootOwnerMismatchError,
  MidnightOfferRootRatifierMismatchError,
  MidnightOfferSideMismatchError,
  MidnightRedeemExceedsFaceValueError,
  MidnightTakeableOfferMarketMismatchError,
  MissingAccrualPositionError,
  MissingMidnightOfferRootSignatureError,
  NegativeMidnightAmountError,
  NoMidnightCreditToRedeemError,
  NonPositiveMidnightAmountError,
  UnexpectedRequirementSignatureError,
  UnknownMidnightRatifierError,
} from "../../types/error.js";
import { MorphoMidnight } from "./midnight.js";
import type { MidnightActionSignatures, OffersData } from "./types.js";

type BuildSubmitOffersTx = (params: {
  readonly offersData: OffersData;
  readonly signatures?: MidnightActionSignatures;
  readonly metadata?: { readonly origin: string };
}) => Readonly<Transaction<MempoolSubmitOffersAction>>;

const buildSubmitOffersTx: BuildSubmitOffersTx = (params) =>
  (
    Object.assign(Object.create(MorphoMidnight.prototype), {
      chainId: midnightChainId,
      client: {
        options: {
          metadata: params.metadata,
        },
      },
    }) as {
      buildSubmitOffersTx: BuildSubmitOffersTx;
    }
  ).buildSubmitOffersTx(params);

const offersData = (
  buy = true,
  maker: Address = midnightAddresses.maker,
): OffersData => {
  const offer = Offer.create(
    midnightBaseOffer({
      market: { ...midnightMarket, maturity: apiValidMaturity },
      buy,
      maker,
      expiry: apiValidMaturity - 60n,
      maxAssets: 1_000n,
      maxUnits: 0n,
      ratifier: midnightAddresses.ecrecoverRatifier,
      receiverIfMakerIsSeller: buy ? zeroAddress : maker,
    }),
  );
  const group = Group.create([offer]);

  return {
    accountAddress: maker,
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

const setterOffersData = (buy = true): OffersData => {
  const offer = Offer.create(
    midnightBaseOffer({
      market: { ...midnightMarket, maturity: apiValidMaturity },
      buy,
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

const unexpectedSignature = {
  action: {
    type: "authorization",
    args: {
      authorized: midnightAddresses.midnightBundles,
      isAuthorized: true,
      deadline: 123n,
    },
  },
  args: {
    owner: midnightAddresses.taker,
    authorized: midnightAddresses.midnightBundles,
    isAuthorized: true,
    nonce: 42n,
    signature: "0x1234",
    deadline: 123n,
  },
} as unknown as MidnightActionSignatures;

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
type MidnightMockHandle = MockClientHandle<typeof midnightTestChain>;

const midnightWithHandle = (
  handle: MidnightMockHandle,
  options: MorphoClientType["options"] = { supportSignature: false },
) =>
  new MorphoMidnight(
    {
      viemClient: handle.client,
      options,
    } as unknown as MorphoClientType,
    midnightChainId,
  );

type TakeableOffers = readonly ReturnType<typeof midnightApiTake>[];

const takeFlowCases: readonly {
  readonly name: string;
  readonly expectedBuy: boolean;
  readonly createOutput: (takeableOffers: TakeableOffers) => unknown;
}[] = [
  {
    name: "takeLend",
    expectedBuy: false,
    createOutput: (takeableOffers) =>
      midnight().takeLend({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        assets: 1_000n,
        minUnits: 900n,
        takeableOffers,
        deadline: maxUint256,
      }),
  },
  {
    name: "takeBorrow",
    expectedBuy: true,
    createOutput: (takeableOffers) =>
      midnight().takeBorrow({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers,
        deadline: maxUint256,
      }),
  },
  {
    name: "supplyCollateralTakeBorrow",
    expectedBuy: true,
    createOutput: (takeableOffers) =>
      midnight().supplyCollateralTakeBorrow({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers,
        deadline: maxUint256,
      }),
  },
];

const mockAllowance = (params: {
  readonly handle: MidnightMockHandle;
  readonly token: Address;
  readonly result: bigint;
}) => {
  mockRead(params.handle, {
    address: params.token,
    abi: erc20Abi,
    functionName: "allowance",
    result: params.result,
  });
};

const mockMidnightAuthorization = (
  handle: MidnightMockHandle,
  result: boolean,
) => {
  mockRead(handle, {
    address: midnightAddresses.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result,
  });
};

const mockSetterRootRatification = (
  handle: MidnightMockHandle,
  result: boolean,
) => {
  mockRead(handle, {
    address: midnightAddresses.setterRatifier,
    abi: setterRatifierAbi,
    functionName: "isRootRatified",
    result,
  });
};

const mockMarketReads = (handle: MidnightMockHandle) => {
  mockRead(handle, {
    address: midnightAddresses.midnight,
    abi: midnightAbi,
    functionName: "toMarket",
    result: MarketUtils.toStruct(midnightMarket),
  });
  mockRead(handle, {
    address: midnightAddresses.midnight,
    abi: midnightAbi,
    functionName: "marketState",
    result: [1_000n, 0n, 1_000n, 0n, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  });
};

const mockPositionReads = (handle: MidnightMockHandle) => {
  mockRead(handle, {
    address: midnightAddresses.midnight,
    abi: midnightAbi,
    functionName: "position",
    result: [1_000n, 0n, 0n, 1_000n, 0n, 0n],
  });
  mockRead(handle, {
    address: midnightAddresses.midnight,
    abi: midnightAbi,
    functionName: "collateral",
    result: 0n,
  });
  mockMarketReads(handle);
};

const mockBlockAndReads = (
  handle: MidnightMockHandle,
  block: { readonly number: bigint | null; readonly timestamp: bigint },
) => {
  handle.request.mockImplementation(async ({ method, params }) => {
    if (method === "eth_chainId") return numberToHex(midnightChainId);
    if (method === "eth_getBlockByNumber") {
      return {
        number: block.number == null ? null : numberToHex(block.number),
        timestamp: numberToHex(block.timestamp),
        transactions: [],
      };
    }
    if (method === "eth_call") {
      const [tx] = (params ?? []) as [
        { readonly to?: Address; readonly data?: `0x${string}` },
      ];
      if (typeof tx?.to === "string" && typeof tx.data === "string") {
        const encoded = handle.dispatch.get(
          `${tx.to.toLowerCase()}|${tx.data.slice(0, 10).toLowerCase()}`,
        );
        if (encoded != null) return encoded;
      }
    }

    throw new Error(`unhandled RPC ${method} ${JSON.stringify(params)}`);
  });
  mockPositionReads(handle);
};

describe("MorphoMidnight", () => {
  describe.each(takeFlowCases)("$name takeable offers", (takeFlow) => {
    test("error: EmptyMidnightTakeableOffersError", () => {
      expect(() => takeFlow.createOutput([])).toThrow(
        EmptyMidnightTakeableOffersError,
      );
    });

    test("error: MidnightOfferSideMismatchError", () => {
      expect(() =>
        takeFlow.createOutput([
          midnightApiTake({ buy: !takeFlow.expectedBuy }),
        ]),
      ).toThrow(MidnightOfferSideMismatchError);
    });

    test("error: MidnightTakeableOfferMarketMismatchError", () => {
      expect(() =>
        takeFlow.createOutput([
          midnightApiTake({
            buy: takeFlow.expectedBuy,
            market: midnightOtherMarket,
          }),
        ]),
      ).toThrow(MidnightTakeableOfferMarketMismatchError);
    });
  });

  describe("takeLend", () => {
    test("default", () => {
      const output = midnight().takeLend({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        assets: 1_000n,
        minUnits: 900n,
        takeableOffers: [midnightApiTake()],
        deadline: maxUint256,
      });
      const tx = output.buildTx();

      expect(tx.action.args).toEqual({
        market: midnightMarketId,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takeableOffers: 1,
        deadline: maxUint256,
      });
    });

    test("behavior: requirements include loan approval and bundle authorization", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).takeLend({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        assets: 1_000n,
        minUnits: 900n,
        takeableOffers: [midnightApiTake()],
        deadline: maxUint256,
      });
      const requirements = await output.getRequirements();

      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["erc20Approval", "midnightAuthorization"]);
    });

    test("behavior: returns no requirements when approval and authorization are satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: maxUint256,
      });
      mockMidnightAuthorization(handle, true);

      const output = midnightWithHandle(handle).takeLend({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        assets: 1_000n,
        minUnits: 900n,
        takeableOffers: [midnightApiTake()],
        deadline: maxUint256,
      });

      await expect(output.getRequirements()).resolves.toEqual([]);
    });

    test("error: amount validation", () => {
      expect(() =>
        midnight().takeLend({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          assets: 0n,
          minUnits: 900n,
          takeableOffers: [midnightApiTake()],
          deadline: maxUint256,
        }),
      ).toThrow(NonPositiveMidnightAmountError);
      expect(() =>
        midnight().takeLend({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          assets: 1_000n,
          minUnits: -1n,
          takeableOffers: [midnightApiTake()],
          deadline: maxUint256,
        }),
      ).toThrow(NegativeMidnightAmountError);
      expect(() =>
        midnight().takeLend({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          assets: 1_000n,
          minUnits: 900n,
          takeableOffers: [midnightApiTake()],
          deadline: -1n,
        }),
      ).toThrow(NegativeMidnightAmountError);
    });
  });

  describe("takeBorrow", () => {
    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).takeBorrow({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.action.args.loanAssets).toBe(1_000n);
      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["midnightAuthorization"]);
    });

    test("behavior: returns no requirements when authorization is satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);

      const output = midnightWithHandle(handle).takeBorrow({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      });

      await expect(output.getRequirements()).resolves.toEqual([]);
    });

    test("error: amount validation", () => {
      expect(() =>
        midnight().takeBorrow({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          loanAssets: 0n,
          maxUnits: 900n,
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: maxUint256,
        }),
      ).toThrow(NonPositiveMidnightAmountError);
      expect(() =>
        midnight().takeBorrow({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          loanAssets: 1_000n,
          maxUnits: -1n,
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: maxUint256,
        }),
      ).toThrow(NegativeMidnightAmountError);
      expect(() =>
        midnight().takeBorrow({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          loanAssets: 1_000n,
          maxUnits: 900n,
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: -1n,
        }),
      ).toThrow(NegativeMidnightAmountError);
    });
  });

  describe("supplyCollateralTakeBorrow", () => {
    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).supplyCollateralTakeBorrow({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.action.args).toMatchObject({
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
      });
      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["erc20Approval", "midnightAuthorization"]);
    });

    test("behavior: returns no requirements when approval and authorization are satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: maxUint256,
      });
      mockMidnightAuthorization(handle, true);

      const output = midnightWithHandle(handle).supplyCollateralTakeBorrow({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      });

      await expect(output.getRequirements()).resolves.toEqual([]);
    });

    test("error: amount validation", () => {
      const params = {
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        collateralAssets: 2_000n,
        loanAssets: 1_000n,
        maxUnits: 900n,
        takeableOffers: [midnightApiTake({ buy: true })],
        deadline: maxUint256,
      } as const;

      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          collateralAssets: 0n,
        }),
      ).toThrow(NonPositiveMidnightAmountError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, loanAssets: 0n }),
      ).toThrow(NonPositiveMidnightAmountError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, maxUnits: -1n }),
      ).toThrow(NegativeMidnightAmountError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, deadline: -1n }),
      ).toThrow(NegativeMidnightAmountError);
    });
  });

  describe("supplyCollateral", () => {
    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });

      const output = midnightWithHandle(handle).supplyCollateral({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        collateralAssets: 2_000n,
        reservedCollateralAssets: 500n,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.action.args.assets).toBe(2_000n);
      expect(requirements[0]?.action).toMatchObject({
        type: "erc20Approval",
        args: {
          spender: midnightAddresses.midnight,
          amount: 2_500n,
        },
      });
    });

    test("behavior: defaults reserved collateral to zero", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });

      const output = midnightWithHandle(handle).supplyCollateral({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        collateralAssets: 2_000n,
      });
      const requirements = await output.getRequirements();

      expect(requirements[0]?.action.args.amount).toBe(2_000n);
    });

    test("error: amount validation", () => {
      expect(() =>
        midnight().supplyCollateral({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          collateralAssets: 0n,
        }),
      ).toThrow(NonPositiveMidnightAmountError);
      expect(() =>
        midnight().supplyCollateral({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          collateralAssets: 2_000n,
          reservedCollateralAssets: -1n,
        }),
      ).toThrow(NegativeMidnightAmountError);
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

    test("error: MidnightRedeemExceedsFaceValueError", () => {
      const market = marketData();

      expect(() =>
        midnight().redeem({
          marketData: market,
          positionData: positionData(market, {
            credit: 250n,
            pendingFee: 50n,
          }),
          accountAddress: midnightAddresses.taker,
          units: 225n,
        }),
      ).toThrow(MidnightRedeemExceedsFaceValueError);
    });

    test("behavior: explicit receiver and empty requirements", async () => {
      const market = marketData();
      const output = midnight().redeem({
        marketData: market,
        positionData: positionData(market, { credit: 250n, pendingFee: 50n }),
        accountAddress: midnightAddresses.taker,
        receiver: midnightAddresses.maker,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(requirements).toEqual([]);
      expect(tx.action.args.receiver).toBe(midnightAddresses.maker);
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

    test("error: NoMidnightCreditToRedeemError", () => {
      const market = marketData();

      expect(() =>
        midnight().redeem({
          marketData: market,
          positionData: positionData(market, { credit: 50n, pendingFee: 50n }),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(NoMidnightCreditToRedeemError);
    });

    test("error: InsufficientMidnightWithdrawableLiquidityError", () => {
      const market = marketData({ withdrawable: 50n });
      const stalePositionMarket = marketData({ withdrawable: 1_000n });

      expect(() =>
        midnight().redeem({
          marketData: market,
          positionData: positionData(stalePositionMarket, {
            credit: 250n,
            pendingFee: 50n,
          }),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(InsufficientMidnightWithdrawableLiquidityError);
    });

    test("behavior: uses the supplied market liquidity", () => {
      const market = marketData({ withdrawable: 1_000n });
      const stalePositionMarket = marketData({ withdrawable: 50n });

      const output = midnight().redeem({
        marketData: market,
        positionData: positionData(stalePositionMarket, {
          credit: 250n,
          pendingFee: 50n,
        }),
        accountAddress: midnightAddresses.taker,
      });

      expect(output.buildTx().action.args.units).toBe(200n);
    });
  });

  describe("getMarketData", () => {
    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMarketReads(handle);

      const market =
        await midnightWithHandle(handle).getMarketData(midnightMarketId);

      expect(market.id).toBe(midnightMarketId);
      expect(market.withdrawable).toBe(1_000n);
    });

    test("error: ChainIdMismatchError", async () => {
      await expect(
        new MorphoMidnight(
          {
            viemClient: { chain: { id: midnightChainId + 1 } },
            options: {},
          } as unknown as MorphoClientType,
          midnightChainId,
        ).getMarketData(midnightMarketId),
      ).rejects.toThrow(ChainIdMismatchError);
    });
  });

  describe("getPositionData", () => {
    test("behavior: pins position reads to the fetched block", async () => {
      const handle = createMockClient(midnightTestChain);
      const blockNumber = 123n;
      const blockTimestamp = 1_500n;
      mockBlockAndReads(handle, {
        number: blockNumber,
        timestamp: blockTimestamp,
      });

      const position = await new MorphoMidnight(
        {
          viemClient: handle.client,
          options: { supportDeployless: false },
        } as unknown as MorphoClientType,
        midnightChainId,
      ).getPositionData({
        marketId: midnightMarketId,
        accountAddress: midnightAddresses.taker,
      });

      expect(position.lastAccrual).toBe(blockTimestamp);
      expect(
        handle.request.mock.calls
          .map(([call]) => call)
          .filter((call) => call.method === "eth_call")
          .every((call) => call.params?.[1] === numberToHex(blockNumber)),
      ).toBe(true);
    });

    test("behavior: accepts explicit blockNumber for the block snapshot", async () => {
      const handle = createMockClient(midnightTestChain);
      const requestedBlockNumber = 100n;
      const fetchedBlockNumber = 123n;
      mockBlockAndReads(handle, {
        number: fetchedBlockNumber,
        timestamp: 1_500n,
      });

      await midnightWithHandle(handle).getPositionData({
        marketId: midnightMarketId,
        accountAddress: midnightAddresses.taker,
        parameters: { blockNumber: requestedBlockNumber },
      });

      expect(
        handle.request.mock.calls.find(
          ([call]) => call.method === "eth_getBlockByNumber",
        )?.[0].params?.[0],
      ).toBe(numberToHex(requestedBlockNumber));
      expect(
        handle.request.mock.calls
          .map(([call]) => call)
          .filter((call) => call.method === "eth_call")
          .every(
            (call) => call.params?.[1] === numberToHex(fetchedBlockNumber),
          ),
      ).toBe(true);
    });

    test("behavior: reuses blockTag when the fetched block has no number", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlockAndReads(handle, {
        number: null,
        timestamp: 1_500n,
      });

      await midnightWithHandle(handle).getPositionData({
        marketId: midnightMarketId,
        accountAddress: midnightAddresses.taker,
        parameters: { blockTag: "pending" },
      });

      expect(
        handle.request.mock.calls.find(
          ([call]) => call.method === "eth_getBlockByNumber",
        )?.[0].params?.[0],
      ).toBe("pending");
      expect(
        handle.request.mock.calls
          .map(([call]) => call)
          .filter((call) => call.method === "eth_call")
          .every((call) => call.params?.[1] === "pending"),
      ).toBe(true);
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

    test("behavior: de-duplicates groups from grouped offers", async () => {
      const offers = [
        Offer.create(
          midnightBaseOffer({
            market: { ...midnightMarket, maturity: apiValidMaturity },
            buy: true,
            expiry: apiValidMaturity - 60n,
            maxAssets: 1_000n,
            maxUnits: 0n,
            ratifier: midnightAddresses.ecrecoverRatifier,
          }),
        ),
        Offer.create(
          midnightBaseOffer({
            market: { ...midnightMarket, maturity: apiValidMaturity },
            buy: true,
            tick: 5_004n,
            expiry: apiValidMaturity - 60n,
            maxAssets: 1_000n,
            maxUnits: 0n,
            ratifier: midnightAddresses.ecrecoverRatifier,
          }),
        ),
      ];
      const group = Group.create(offers);
      const data = await midnight().getOffersData({
        accountAddress: midnightAddresses.maker,
        offers: group,
        validation: offerValidation,
      });

      expect(data.groups).toEqual([group.id]);
      expect(data.tree.offers).toHaveLength(2);
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

    test("behavior: returns setter payload for setter-ratified offers", async () => {
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
      const data = await midnight().getOffersData({
        accountAddress: midnightAddresses.maker,
        offers: offer,
        validation: offerValidation,
      });

      expect(data.ratifierType).toBe("setter");
      expect(data.setterPayload).toMatch(/^0x/u);
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

    test("error: MidnightOfferMakerMismatchError", async () => {
      const offers = [
        Offer.create(
          midnightBaseOffer({
            market: { ...midnightMarket, maturity: apiValidMaturity },
            buy: true,
            expiry: apiValidMaturity - 60n,
            maxAssets: 1_000n,
            maxUnits: 0n,
            ratifier: midnightAddresses.ecrecoverRatifier,
          }),
        ),
        Offer.create(
          midnightBaseOffer({
            market: { ...midnightMarket, maturity: apiValidMaturity },
            buy: true,
            maker: midnightAddresses.taker,
            tick: 5_004n,
            expiry: apiValidMaturity - 60n,
            maxAssets: 1_000n,
            maxUnits: 0n,
            ratifier: midnightAddresses.ecrecoverRatifier,
          }),
        ),
      ];

      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers,
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferMakerMismatchError);
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

    test("error: UnknownMidnightRatifierError", async () => {
      const offer = Offer.create(
        midnightBaseOffer({
          market: { ...midnightMarket, maturity: apiValidMaturity },
          buy: true,
          expiry: apiValidMaturity - 60n,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: zeroAddress,
        }),
      );

      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers: offer,
          validation: offerValidation,
        }),
      ).rejects.toThrow(UnknownMidnightRatifierError);
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

    test("behavior: signs reviewable offer tree typed data", async () => {
      const account = privateKeyToAccount(
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      );
      let capturedOfferTreeTypedData:
        | {
            readonly primaryType?: string;
            readonly types?: {
              readonly OfferTree?: readonly {
                readonly name: string;
                readonly type: string;
              }[];
            };
            readonly message?: {
              readonly root?: Hex;
              readonly offerTree?: {
                readonly maker?: Address;
                readonly ratifier?: Address;
                readonly market?: { readonly loanToken?: Address };
              };
            };
          }
        | undefined;
      const walletClient = createWalletClient({
        account: account.address,
        chain: midnightTestChain,
        transport: custom({
          request: async ({ method, params }) => {
            if (
              method !== "eth_signTypedData_v4" ||
              !Array.isArray(params) ||
              typeof params[1] !== "string"
            ) {
              throw new Error("Unexpected RPC request");
            }
            const typedData = JSON.parse(params[1]) as NonNullable<
              typeof capturedOfferTreeTypedData
            > &
              Parameters<typeof account.signTypedData>[0];
            capturedOfferTreeTypedData = typedData;

            return account.signTypedData(typedData);
          },
        }),
      });
      const handle = createMockClient(midnightTestChain);
      mockRead(handle, {
        address: midnightAddresses.loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        result: maxUint256,
      });
      mockRead(handle, {
        address: midnightAddresses.midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        result: true,
      });

      const data = offersData(true, account.address);
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
      });
      const requirements = await output.getRequirements();
      const requirement = requirements.find(
        ({ action }) => action.type === "midnightOfferRootSignature",
      );
      if (requirement == null || !("sign" in requirement)) {
        throw new Error("Expected midnightOfferRootSignature requirement");
      }

      const signature = await requirement.sign(walletClient, account.address);
      if (signature.action.type !== "midnightOfferRootSignature") {
        throw new Error("Expected midnightOfferRootSignature result");
      }
      const message = capturedOfferTreeTypedData?.message;

      expect(signature.action.args.root).toBe(data.tree.root);
      expect(capturedOfferTreeTypedData?.primaryType).toBe("OfferTree");
      expect(capturedOfferTreeTypedData?.types?.OfferTree?.[0]).toEqual({
        name: "offerTree",
        type: "Offer",
      });
      expect(message?.root).toBeUndefined();
      expect(message?.offerTree).toMatchObject({
        maker: account.address,
        ratifier: data.ratifier,
        market: {
          loanToken: midnightAddresses.loanToken,
        },
      });
    });

    test("behavior: approval covers new group and existing loan reserves", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);

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

    test("behavior: accepts offers carrying hydrated market data", async () => {
      const offer = Offer.create(
        midnightBaseOffer({
          market: new Market({
            params: { ...midnightMarket, maturity: apiValidMaturity },
            totalUnits: 1_000n,
            lossFactor: 0n,
            withdrawable: 1_000n,
            continuousFeeCredit: 0n,
            settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
            continuousFee: 0,
            tickSpacing: 1,
          }),
          buy: true,
          expiry: apiValidMaturity - 60n,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );
      const output = await midnight().makeLend({
        accountAddress: midnightAddresses.maker,
        offers: offer,
        validation: offerValidation,
        loanToken: midnightAddresses.loanToken,
        loanAssets: 1_000n,
      });

      expect(output.root).toMatch(/^0x/u);
    });

    test("error: amount validation", async () => {
      const data = offersData(true);

      await expect(
        midnight().makeLend({
          accountAddress: data.accountAddress,
          offers: data.tree,
          validation: offerValidation,
          loanToken: midnightAddresses.loanToken,
          loanAssets: 0n,
        }),
      ).rejects.toThrow(NonPositiveMidnightAmountError);
      await expect(
        midnight().makeLend({
          accountAddress: data.accountAddress,
          offers: data.tree,
          validation: offerValidation,
          loanToken: midnightAddresses.loanToken,
          loanAssets: 1_000n,
          reservedLoanAssets: -1n,
        }),
      ).rejects.toThrow(NegativeMidnightAmountError);
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
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);

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
        market: { ...midnightMarket, maturity: apiValidMaturity },
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
      const tx = output.buildTx(offerRootSignature(data));

      expect(tx.action.args.maker).toBe(data.accountAddress);
    });

    test("behavior: accepts plain market input and defaults reserved collateral to zero", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);
      const data = offersData(false);
      const output = await midnightWithHandle(
        handle,
      ).supplyCollateralMakeBorrow({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
        market: MarketUtils.toStruct({
          ...midnightMarket,
          maturity: apiValidMaturity,
        }),
        collateralAssets: 1_000n,
      });
      const requirements = await output.getRequirements();
      const approval = requirements.find(
        (requirement) => requirement.action.type === "erc20Approval",
      );
      if (approval?.action.type !== "erc20Approval") {
        throw new Error("expected an ERC20 approval requirement");
      }

      expect(approval.action.args.amount).toBe(1_000n);
    });

    test("error: amount validation", async () => {
      const data = offersData(false);

      await expect(
        midnight().supplyCollateralMakeBorrow({
          accountAddress: data.accountAddress,
          offers: data.tree,
          validation: offerValidation,
          market: midnightMarket,
          collateralAssets: 0n,
        }),
      ).rejects.toThrow(NonPositiveMidnightAmountError);
      await expect(
        midnight().supplyCollateralMakeBorrow({
          accountAddress: data.accountAddress,
          offers: data.tree,
          validation: offerValidation,
          market: midnightMarket,
          collateralAssets: 1_000n,
          reservedCollateralAssets: -1n,
        }),
      ).rejects.toThrow(NegativeMidnightAmountError);
    });

    test("error: MarketIdMismatchError", async () => {
      const offer = Offer.create(
        midnightBaseOffer({
          market: { ...midnightOtherMarket, maturity: apiValidMaturity },
          buy: false,
          expiry: apiValidMaturity - 60n,
          maxAssets: 1_000n,
          maxUnits: 0n,
          ratifier: midnightAddresses.ecrecoverRatifier,
        }),
      );

      await expect(
        midnight().supplyCollateralMakeBorrow({
          accountAddress: midnightAddresses.maker,
          offers: offer,
          validation: offerValidation,
          market: midnightMarket,
          collateralAssets: 1_000n,
        }),
      ).rejects.toThrow(MarketIdMismatchError);
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

    test("behavior: ecrecover requirements include ratifier authorization", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, false);
      const data = offersData(false);
      const output = await midnightWithHandle(handle).makeBorrow({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
      });
      const requirements = await output.getRequirements();

      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["midnightAuthorization", "midnightOfferRootSignature"]);
    });

    test("behavior: setter ratifier requirements include root ratification", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);
      mockSetterRootRatification(handle, false);
      const data = setterOffersData(false);
      const output = await midnightWithHandle(handle).makeBorrow({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["setterRatifierRatifyRoot"]);
      expect(tx.action.args.ratifierType).toBe("setter");
    });

    test("behavior: setter ratifier returns no requirements when root is ratified", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);
      mockSetterRootRatification(handle, true);
      const data = setterOffersData(false);
      const output = await midnightWithHandle(handle).makeBorrow({
        accountAddress: data.accountAddress,
        offers: data.tree,
        validation: offerValidation,
      });

      await expect(output.getRequirements()).resolves.toEqual([]);
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

  describe("repayWithdrawCollateral", () => {
    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).repayWithdrawCollateral({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        repayAssets: 1_000n,
        withdrawCollateralAssets: 2_000n,
        deadline: maxUint256,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.action.args).toMatchObject({
        repayAssets: 1_000n,
        collateralWithdrawals: 1,
      });
      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["erc20Approval", "midnightAuthorization"]);
    });

    test("behavior: withdraw-only flow skips loan approval", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);

      const output = midnightWithHandle(handle).repayWithdrawCollateral({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        repayAssets: 0n,
        withdrawCollateralAssets: 2_000n,
        deadline: maxUint256,
      });
      const requirements = await output.getRequirements();

      expect(requirements).toEqual([]);
    });

    test("error: amount validation", () => {
      const params = {
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        repayAssets: 1_000n,
        withdrawCollateralAssets: 0n,
        deadline: maxUint256,
      } as const;

      expect(() =>
        midnight().repayWithdrawCollateral({ ...params, repayAssets: -1n }),
      ).toThrow(NegativeMidnightAmountError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          withdrawCollateralAssets: -1n,
        }),
      ).toThrow(NegativeMidnightAmountError);
      expect(() =>
        midnight().repayWithdrawCollateral({ ...params, deadline: -1n }),
      ).toThrow(NegativeMidnightAmountError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          withdrawCollateralAssets: 1n,
          collateralIndex: -1n,
        }),
      ).toThrow(NegativeMidnightAmountError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          repayAssets: 0n,
          withdrawCollateralAssets: 0n,
        }),
      ).toThrow(NonPositiveMidnightAmountError);
    });
  });

  describe("cancelOffer", () => {
    test("default", async () => {
      const data = offersData();
      const output = midnight().cancelOffer({
        group: data.groups[0]!,
        accountAddress: midnightAddresses.maker,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(requirements).toEqual([]);
      expect(tx.action.args.group).toBe(data.groups[0]);
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

    test("behavior: appends metadata", () => {
      const data = offersData();
      const tx = buildSubmitOffersTx({
        offersData: data,
        signatures: offerRootSignature(data),
        metadata: { origin: "a1b2c3d4" },
      });

      expect(tx.action.type).toBe("mempoolSubmitOffers");
      expect(tx.data.includes("a1b2c3d4")).toBe(true);
    });

    test("behavior: setter ratifier uses prepared payload without signatures", () => {
      const data = setterOffersData();
      const tx = buildSubmitOffersTx({
        offersData: data,
      });

      expect(tx.data).toBe(data.setterPayload);
      expect(tx.action.args.ratifierType).toBe("setter");
    });

    test("error: MissingMidnightOfferRootSignatureError for malformed setter data", () => {
      const data = setterOffersData();

      expect(() =>
        buildSubmitOffersTx({
          offersData: {
            ...data,
            setterPayload: undefined,
          },
        }),
      ).toThrow(MissingMidnightOfferRootSignatureError);
    });

    test("error: MissingMidnightOfferRootSignatureError", () => {
      const data = offersData();

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
        }),
      ).toThrow(MissingMidnightOfferRootSignatureError);
    });

    test("error: MidnightOfferRootMismatchError", () => {
      const data = offersData();
      const signature = offerRootSignature(data);
      const otherRoot =
        "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0" as Hex;

      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: {
            ...signature,
            args: {
              ...signature.args,
              root: otherRoot,
            },
          },
        }),
      ).toThrow(MidnightOfferRootMismatchError);
      expect(() =>
        buildSubmitOffersTx({
          offersData: data,
          signatures: {
            ...signature,
            action: {
              ...signature.action,
              args: {
                ...signature.action.args,
                root: otherRoot,
              },
            },
          },
        }),
      ).toThrow(MidnightOfferRootMismatchError);
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
          signatures: unexpectedSignature,
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
