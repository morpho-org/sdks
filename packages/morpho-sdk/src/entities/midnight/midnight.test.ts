import {
  AccrualPosition,
  type IOffer,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  Payload,
  RateRatifierV1,
  Tree,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
import {
  createMockClient,
  type MockClientHandle,
  mockRead,
} from "@morpho-org/test/mock";
import {
  type Address,
  type Chain,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  type Hex,
  maxUint256,
  numberToHex,
  zeroAddress,
  zeroHash,
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
import type { MorphoClientType } from "../../types/client.js";
import {
  AccrualPositionUserMismatchError,
  ChainIdMismatchError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightGroupCancellationsError,
  EmptyMidnightTakeableOffersError,
  InsufficientMidnightWithdrawableLiquidityError,
  MarketIdMismatchError,
  MidnightMarketAddressMismatchError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferRatifierMismatchError,
  MidnightOfferSideMismatchError,
  MidnightRedeemExceedsCreditError,
  MidnightReplacementGroupCancelledError,
  MidnightTakeableOfferMarketMismatchError,
  MissingAccrualPositionError,
  NegativeInputError,
  NoMidnightCreditToRedeemError,
  NonPositiveInputError,
} from "../../types/error.js";
import { MorphoMidnight } from "./midnight.js";
import type {
  CancelAndMakeBorrowParams,
  CancelAndMakeLendParams,
  MidnightMakerTreeInput,
} from "./types.js";

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

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});
const priceRatifierV1 = getChainAddress(midnightChainId, "priceRatifierV1");
const rateRatifierV1 = getChainAddress(midnightChainId, "rateRatifierV1");
const previousGroup = `0x${"11".repeat(32)}` as Hex;
const makerGroup = `0x${"22".repeat(32)}` as Hex;

const makerOffer = (overrides: Partial<IOffer> & { readonly buy: boolean }) =>
  Offer.create(
    midnightBaseOffer({
      market: { ...midnightMarket, maturity: apiValidMaturity },
      expiry: apiValidMaturity - 60n,
      maxAssets: 1_000n,
      maxUnits: 0n,
      ratifier: rateRatifierV1,
      group: makerGroup,
      ...overrides,
    }),
  );

const rateTree = (...offers: readonly Offer[]): MidnightMakerTreeInput =>
  Tree.create({
    type: "rateV1",
    entries: offers.map((offer) => ({ offer, rate: 1_000_000_000n })),
  });

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
  overrides: {
    readonly credit?: bigint;
    readonly pendingFee?: bigint;
    readonly user?: Address;
  } = {},
) =>
  new AccrualPosition(
    {
      user: overrides.user ?? midnightAddresses.taker,
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
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().takeLend({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          assets: 1_000n,
          minUnits: -1n,
          takeableOffers: [midnightApiTake()],
          deadline: maxUint256,
        }),
      ).toThrow(NegativeInputError);
      expect(() =>
        midnight().takeLend({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          assets: 1_000n,
          minUnits: 900n,
          takeableOffers: [midnightApiTake()],
          deadline: -1n,
        }),
      ).toThrow(NegativeInputError);
    });

    test("error: MidnightMarketAddressMismatchError", () => {
      const market = marketData();
      const foreignMarket = new Market({
        ...market,
        params: {
          ...market.params,
          midnight: midnightAddresses.taker,
        },
      });

      expect(() =>
        midnight().takeLend({
          marketData: foreignMarket,
          accountAddress: midnightAddresses.taker,
          assets: 1_000n,
          minUnits: 900n,
          takeableOffers: [midnightApiTake()],
          deadline: maxUint256,
        }),
      ).toThrow(MidnightMarketAddressMismatchError);
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
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().takeBorrow({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          loanAssets: 1_000n,
          maxUnits: 0n,
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: maxUint256,
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().takeBorrow({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          loanAssets: 1_000n,
          maxUnits: -1n,
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: maxUint256,
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().takeBorrow({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          loanAssets: 1_000n,
          maxUnits: 900n,
          takeableOffers: [midnightApiTake({ buy: true })],
          deadline: -1n,
        }),
      ).toThrow(NegativeInputError);
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
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, loanAssets: 0n }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, maxUnits: 0n }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, maxUnits: -1n }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, deadline: -1n }),
      ).toThrow(NegativeInputError);
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

      const approval = requirements[0];
      expect(approval?.action.type).toBe("erc20Approval");
      if (approval?.action.type !== "erc20Approval") return;
      expect(approval.action.args.amount).toBe(2_000n);
    });

    test("error: amount validation", () => {
      expect(() =>
        midnight().supplyCollateral({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          collateralAssets: 0n,
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().supplyCollateral({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          collateralAssets: 2_000n,
          reservedCollateralAssets: -1n,
        }),
      ).toThrow(NegativeInputError);
    });
  });

  describe("redeem", () => {
    test("default", () => {
      const market = marketData();
      const output = midnight().redeem({
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

    test("behavior: explicit units may exceed face value up to credit", () => {
      const market = marketData();
      const output = midnight().redeem({
        positionData: positionData(market, { credit: 250n, pendingFee: 50n }),
        accountAddress: midnightAddresses.taker,
        units: 225n,
      });
      const tx = output.buildTx();

      expect(tx.action.args).toEqual({
        market: midnightMarketId,
        units: 225n,
        onBehalf: midnightAddresses.taker,
        receiver: midnightAddresses.taker,
      });
    });

    test("error: MidnightRedeemExceedsCreditError", () => {
      const market = marketData();

      expect(() =>
        midnight().redeem({
          positionData: positionData(market, {
            credit: 250n,
            pendingFee: 50n,
          }),
          accountAddress: midnightAddresses.taker,
          units: 251n,
        }),
      ).toThrow(MidnightRedeemExceedsCreditError);
    });

    test("error: AccrualPositionUserMismatchError", () => {
      const market = marketData();

      expect(() =>
        midnight().redeem({
          positionData: positionData(market, {
            user: midnightAddresses.maker,
          }),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(AccrualPositionUserMismatchError);
    });

    test("error: ownerless position snapshots are rejected", () => {
      const market = marketData();
      const ownerlessPosition = new AccrualPosition(
        {
          ...positionData(market),
          user: undefined as unknown as Address,
        },
        market,
      );

      expect(() =>
        midnight().redeem({
          positionData: ownerlessPosition,
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(AccrualPositionUserMismatchError);
    });

    test("behavior: explicit receiver and empty requirements", async () => {
      const market = marketData();
      const output = midnight().redeem({
        positionData: positionData(market, { credit: 250n, pendingFee: 50n }),
        accountAddress: midnightAddresses.taker,
        receiver: midnightAddresses.maker,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(requirements).toEqual([]);
      expect(tx.action.args.receiver).toBe(midnightAddresses.maker);
    });

    test("error: MissingAccrualPositionError", () => {
      expect(() =>
        midnight().redeem({
          positionData: undefined as unknown as AccrualPosition,
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(MissingAccrualPositionError);
    });

    test("error: ChainIdMismatchError", () => {
      const market = marketData();
      const wrongChainMarket = new Market({
        ...market,
        params: {
          ...market.params,
          chainId: midnightChainId + 1,
        },
      });

      expect(() =>
        midnight().redeem({
          positionData: positionData(wrongChainMarket),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(ChainIdMismatchError);
    });

    test("error: NoMidnightCreditToRedeemError", () => {
      const market = marketData();

      expect(() =>
        midnight().redeem({
          positionData: positionData(market, { credit: 50n, pendingFee: 50n }),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(NoMidnightCreditToRedeemError);
    });

    test("error: NonPositiveInputError for explicit non-positive units", () => {
      const market = marketData();
      const data = positionData(market, { credit: 250n, pendingFee: 50n });

      expect(() =>
        midnight().redeem({
          positionData: data,
          accountAddress: midnightAddresses.taker,
          units: 0n,
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().redeem({
          positionData: data,
          accountAddress: midnightAddresses.taker,
          units: -1n,
        }),
      ).toThrow(NonPositiveInputError);
    });

    test("error: InsufficientMidnightWithdrawableLiquidityError", () => {
      const market = marketData({ withdrawable: 50n });

      expect(() =>
        midnight().redeem({
          positionData: positionData(market, {
            credit: 250n,
            pendingFee: 50n,
          }),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(InsufficientMidnightWithdrawableLiquidityError);
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
    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockPositionReads(handle);

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

      expect(position.lastAccrual).toBe(1_000n);
      expect(
        handle.request.mock.calls.some(
          ([call]) => call.method === "eth_getBlockByNumber",
        ),
      ).toBe(false);
    });

    test("behavior: forwards an explicit blockNumber to every read", async () => {
      const handle = createMockClient(midnightTestChain);
      const requestedBlockNumber = 100n;
      mockPositionReads(handle);

      await midnightWithHandle(handle, {
        supportSignature: false,
        supportDeployless: false,
      }).getPositionData({
        marketId: midnightMarketId,
        accountAddress: midnightAddresses.taker,
        parameters: { blockNumber: requestedBlockNumber },
      });

      const calls = handle.request.mock.calls
        .map(([call]) => call)
        .filter((call) => call.method === "eth_call");
      expect(calls.length).toBeGreaterThan(0);
      expect(
        calls.every(
          (call) => call.params?.[1] === numberToHex(requestedBlockNumber),
        ),
      ).toBe(true);
    });

    test("behavior: forwards an explicit blockTag to every read", async () => {
      const handle = createMockClient(midnightTestChain);
      mockPositionReads(handle);

      await midnightWithHandle(handle, {
        supportSignature: false,
        supportDeployless: false,
      }).getPositionData({
        marketId: midnightMarketId,
        accountAddress: midnightAddresses.taker,
        parameters: { blockTag: "pending" },
      });

      const calls = handle.request.mock.calls
        .map(([call]) => call)
        .filter((call) => call.method === "eth_call");
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((call) => call.params?.[1] === "pending")).toBe(true);
    });
  });

  describe("getOffersData", () => {
    test("behavior: derives groups and payload from a RateRatifierV1 tree", async () => {
      const lend = makerOffer({ buy: true });
      const other = makerOffer({ buy: true, maxAssets: 2_000n });
      const data = await midnight().getOffersData({
        accountAddress: midnightAddresses.maker,
        offers: rateTree(lend, other),
        validation: offerValidation,
      });

      expect(data.groups).toEqual([lend.group]);
      expect(data.ratifierType).toBe("rateV1");
      expect(data.ratifier).toBe(rateRatifierV1);
      expect(data.payload).toBe(
        await Payload.encode(
          RateRatifierV1.ratify({ tree: data.tree as Tree<"rateV1"> }),
        ),
      );
    });

    test("behavior: accepts a PriceRatifierV1 tree", async () => {
      const offer = makerOffer({ buy: true, ratifier: priceRatifierV1 });
      const data = await midnight().getOffersData({
        accountAddress: midnightAddresses.maker,
        offers: Tree.create({ type: "priceV1", entries: [{ offer }] }),
        validation: offerValidation,
      });

      expect(data.ratifierType).toBe("priceV1");
      expect(data.ratifier).toBe(priceRatifierV1);
    });

    test("error: MidnightOfferMakerMismatchError", async () => {
      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.taker,
          offers: rateTree(makerOffer({ buy: true })),
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferMakerMismatchError);
    });

    test("error: MidnightOfferMarketChainMismatchError", async () => {
      const offer = makerOffer({
        buy: true,
        market: { ...midnightMarket, maturity: apiValidMaturity, chainId: 1n },
      });

      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(offer),
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferMarketChainMismatchError);
    });

    test("error: MidnightOfferMarketAddressMismatchError", async () => {
      const offer = makerOffer({
        buy: true,
        market: {
          ...midnightMarket,
          maturity: apiValidMaturity,
          midnight: zeroAddress,
        },
      });

      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(offer),
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferMarketAddressMismatchError);
    });

    test("error: MidnightOfferRatifierMismatchError", async () => {
      const offer = makerOffer({ buy: true, ratifier: priceRatifierV1 });

      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(offer),
          validation: offerValidation,
        }),
      ).rejects.toThrow(MidnightOfferRatifierMismatchError);
    });
  });

  describe("cancelAndMakeLend", () => {
    const prepare = (
      handle: MidnightMockHandle,
      overrides: Partial<CancelAndMakeLendParams> = {},
    ) =>
      midnightWithHandle(handle).cancelAndMakeLend({
        accountAddress: midnightAddresses.maker,
        offers: rateTree(makerOffer({ buy: true })),
        deadline: maxUint256,
        validation: offerValidation,
        loanToken: midnightAddresses.loanToken,
        loanAssets: 1_000n,
        ...overrides,
      });

    test("error: ChainIdMismatchError", async () => {
      await expect(
        new MorphoMidnight(client, midnightChainId + 1).cancelAndMakeLend({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(makerOffer({ buy: true })),
          deadline: maxUint256,
          validation: offerValidation,
          loanToken: midnightAddresses.loanToken,
          loanAssets: 1_000n,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({ handle, token: midnightAddresses.loanToken, result: 0n });
      mockMidnightAuthorization(handle, false);
      const offer = makerOffer({ buy: true });
      const output = await prepare(handle, {
        offers: rateTree(offer),
        cancellations: [{ group: previousGroup, maxConsumed: 5n }],
        reservedLoanAssets: 500n,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(output.groups).toEqual([offer.group]);
      expect(output.ratifierType).toBe("rateV1");
      expect(requirements.map(({ action }) => action)).toEqual([
        {
          type: "erc20Approval",
          args: {
            spender: midnightAddresses.midnight,
            amount: 1_500n,
          },
        },
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.maker,
          },
        },
      ]);
      expect(tx.to).toBe(midnightBundlesV2);
      expect(decoded.args[5]).toBe(rateRatifierV1);
      expect(decoded.args[6]).toBe(output.root);
      expect(decoded.args.slice(7, 13)).toEqual([
        0n,
        0n,
        0n,
        0,
        zeroHash,
        zeroHash,
      ]);
      expect(decoded.args[13]).toEqual([
        { group: previousGroup, maxConsumed: 5n },
      ]);
      expect(decoded.args[14]).toBe(
        await Payload.encode(
          RateRatifierV1.ratify({ tree: rateTree(offer) as Tree<"rateV1"> }),
        ),
      );
    });

    test("behavior: returns no requirements when approval and authorization are satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: maxUint256,
      });
      mockMidnightAuthorization(handle, true);
      const output = await prepare(handle);

      await expect(output.getRequirements()).resolves.toEqual([]);
      expect(output.buildTx().action.args.cancellations).toEqual([]);
    });

    test("behavior: a fresh handle builds the same transaction", async () => {
      const outputA = await prepare(createMockClient(midnightTestChain));
      const outputB = await prepare(createMockClient(midnightTestChain));

      expect(outputB.buildTx()).toEqual(outputA.buildTx());
    });

    test("error: amount validation", async () => {
      const handle = createMockClient(midnightTestChain);
      await expect(prepare(handle, { loanAssets: 0n })).rejects.toThrow(
        NonPositiveInputError,
      );
      await expect(
        prepare(handle, { reservedLoanAssets: -1n }),
      ).rejects.toThrow(NegativeInputError);
    });

    test("error: MidnightOfferSideMismatchError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(makerOffer({ buy: false })),
        }),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
    });

    test("error: MidnightOfferMarketLoanTokenMismatchError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          loanToken: midnightAddresses.dai,
        }),
      ).rejects.toThrow(MidnightOfferMarketLoanTokenMismatchError);
    });

    test("error: MidnightReplacementGroupCancelledError", async () => {
      const offer = makerOffer({ buy: true });

      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(offer),
          cancellations: [{ group: offer.group, maxConsumed: 0n }],
        }),
      ).rejects.toThrow(MidnightReplacementGroupCancelledError);
    });
  });

  describe("cancelAndMakeBorrow", () => {
    const market = new MarketParams({
      ...midnightMarket,
      maturity: apiValidMaturity,
    });
    const prepare = (
      handle: MidnightMockHandle,
      overrides: Partial<CancelAndMakeBorrowParams> = {},
    ) =>
      midnightWithHandle(handle).cancelAndMakeBorrow({
        accountAddress: midnightAddresses.maker,
        offers: rateTree(makerOffer({ buy: false })),
        deadline: maxUint256,
        validation: offerValidation,
        ...overrides,
      });

    test("error: ChainIdMismatchError", async () => {
      await expect(
        new MorphoMidnight(client, midnightChainId + 1).cancelAndMakeBorrow({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(makerOffer({ buy: false })),
          deadline: maxUint256,
          validation: offerValidation,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);
      const output = await prepare(handle, {
        cancellations: [{ group: previousGroup, maxConsumed: 0n }],
      });
      const tx = output.buildTx();

      await expect(output.getRequirements()).resolves.toEqual([]);
      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.args).toMatchObject({
        ratifier: rateRatifierV1,
        root: output.root,
        groups: output.groups,
        collateralSupplies: [],
        cancellations: [{ group: previousGroup, maxConsumed: 0n }],
      });
    });

    test("behavior: collateral supplies require approval to MidnightBundlesV2", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);
      const output = await prepare(handle, {
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 2_000n }],
        },
      });
      const requirements = await output.getRequirements();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: output.buildTx().data,
      });

      expect(requirements.map(({ action }) => action)).toEqual([
        {
          type: "erc20Approval",
          args: {
            spender: midnightBundlesV2,
            amount: 2_000n,
          },
        },
      ]);
      expect(decoded.args[3]).toEqual(MarketUtils.toStruct(market));
      expect(decoded.args[4]).toEqual([
        { collateralIndex: 0n, assets: 2_000n },
      ]);
    });

    test("behavior: sums repeated supplies into one approval", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);
      const output = await prepare(handle, {
        collateral: {
          market,
          supplies: [
            { collateralIndex: 0n, assets: 2_000n },
            { collateralIndex: 0n, assets: 500n },
          ],
        },
      });

      expect(
        (await output.getRequirements()).map(({ action }) => action),
      ).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: 2_500n },
        },
      ]);
    });

    test("behavior: requests one MidnightBundlesV2 approval per collateral token", async () => {
      const secondCollateralToken = getAddress(
        "0x0000000000000000000000000000000000007100",
      );
      const collateralMarket = new MarketParams({
        ...market,
        collateralParams: [
          ...market.collateralParams,
          {
            ...market.collateralParams[0]!,
            token: secondCollateralToken,
          },
        ],
      });
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockAllowance({
        handle,
        token: secondCollateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);
      const output = await prepare(handle, {
        offers: rateTree(makerOffer({ buy: false, market: collateralMarket })),
        collateral: {
          market: collateralMarket,
          supplies: [
            { collateralIndex: 0n, assets: 2_000n },
            { collateralIndex: 1n, assets: 3_000n },
          ],
        },
      });

      expect(
        (await output.getRequirements()).map(({ action }) => action),
      ).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: 2_000n },
        },
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: 3_000n },
        },
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.maker,
          },
        },
      ]);
    });

    test("error: MarketIdMismatchError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          collateral: {
            market: midnightOtherMarket,
            supplies: [{ collateralIndex: 0n, assets: 2_000n }],
          },
        }),
      ).rejects.toThrow(MarketIdMismatchError);
    });

    test("error: UnknownCollateralIndexError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          collateral: {
            market,
            supplies: [{ collateralIndex: 1n, assets: 2_000n }],
          },
        }),
      ).rejects.toThrow(UnknownCollateralIndexError);
    });

    test("error: EmptyMidnightCollateralSuppliesError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          collateral: { market, supplies: [] },
        }),
      ).rejects.toThrow(EmptyMidnightCollateralSuppliesError);
    });

    test("error: MidnightOfferSideMismatchError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(makerOffer({ buy: true })),
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
      ).toThrow(NegativeInputError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          withdrawCollateralAssets: -1n,
        }),
      ).toThrow(NegativeInputError);
      expect(() =>
        midnight().repayWithdrawCollateral({ ...params, deadline: -1n }),
      ).toThrow(NegativeInputError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          withdrawCollateralAssets: 1n,
          collateralIndex: -1n,
        }),
      ).toThrow(NegativeInputError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          withdrawCollateralAssets: 1n,
          collateralIndex: 1n,
        }),
      ).toThrow(UnknownCollateralIndexError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          repayAssets: 0n,
          withdrawCollateralAssets: 0n,
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          ...params,
          repayAssets: 0n,
          withdrawCollateralAssets: 1n,
          collateralIndex: 1n,
        }),
      ).toThrow(UnknownCollateralIndexError);
    });
  });

  describe("cancelOffer", () => {
    test("default", async () => {
      const output = midnight().cancelOffer({
        group: previousGroup,
        accountAddress: midnightAddresses.maker,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(requirements).toEqual([]);
      expect(tx.action.args.group).toBe(previousGroup);
    });
  });

  describe("cancelOffers", () => {
    test("behavior: authorizes and targets MidnightBundlesV2", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, false);
      const cancellations = [{ group: previousGroup, maxConsumed: 0n }];
      const output = new MorphoMidnight(
        {
          viemClient: handle.client,
          options: {},
        } as unknown as MorphoClientType,
        midnightChainId,
      ).cancelOffers({
        accountAddress: midnightAddresses.maker,
        cancellations,
        deadline: maxUint256,
      });

      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action).toEqual({
        type: "midnightAuthorization",
        args: {
          authorized: midnightBundlesV2,
          isAuthorized: true,
          onBehalf: midnightAddresses.maker,
        },
      });
      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.args).toEqual({
        ratifier: zeroAddress,
        root: zeroHash,
        groups: [],
        cancellations,
        collateralSupplies: [],
        deadline: maxUint256,
      });
    });

    test("behavior: appends metadata", () => {
      const handle = createMockClient(midnightTestChain);
      const tx = new MorphoMidnight(
        {
          viemClient: handle.client,
          options: { metadata: { origin: "a1b2c3d4" } },
        } as unknown as MorphoClientType,
        midnightChainId,
      )
        .cancelOffers({
          accountAddress: midnightAddresses.maker,
          cancellations: [{ group: offersData().groups[0]!, maxConsumed: 0n }],
          deadline: maxUint256,
        })
        .buildTx();

      expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    });

    test("behavior: already authorized returns no requirements", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);
      const output = new MorphoMidnight(
        {
          viemClient: handle.client,
          options: {},
        } as unknown as MorphoClientType,
        midnightChainId,
      ).cancelOffers({
        accountAddress: midnightAddresses.maker,
        cancellations: [{ group: previousGroup, maxConsumed: 0n }],
        deadline: maxUint256,
      });

      await expect(output.getRequirements()).resolves.toEqual([]);
    });

    test("error: invalid cancellations throw before requirements", () => {
      expect(() =>
        new MorphoMidnight(client, midnightChainId).cancelOffers({
          accountAddress: midnightAddresses.maker,
          cancellations: [],
          deadline: maxUint256,
        }),
      ).toThrow(EmptyMidnightGroupCancellationsError);
    });

    test("error: ChainIdMismatchError", () => {
      expect(() =>
        new MorphoMidnight(client, midnightChainId + 1).cancelOffers({
          accountAddress: midnightAddresses.maker,
          cancellations: [{ group: previousGroup, maxConsumed: 0n }],
          deadline: maxUint256,
        }),
      ).toThrow(ChainIdMismatchError);
    });
  });
});
