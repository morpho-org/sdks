import {
  type InputMarketParams as BlueInputMarketParams,
  Market as BlueMarket,
  MarketParams as BlueMarketParams,
  MarketUtils as BlueMarketUtils,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import {
  adaptiveCurveIrmAbi,
  blueAbi,
  blueOracleAbi,
} from "@morpho-org/blue-sdk-viem";
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
  PriceRatifierV1,
  RateRatifierV1,
  Tree,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
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
  maxUint128,
  maxUint256,
  numberToHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  midnightApiTake as fixtureApiTake,
  midnightAddresses,
  midnightBaseOffer,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  InvalidMidnightPositionAccrualStateError,
  InvalidMidnightPositionLossFactorError,
} from "../../errors.js";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
} from "../../helpers/callback.js";
import type { MorphoClientType } from "../../types/client.js";
import {
  AccrualPositionUserMismatchError,
  ApprovalAmountLessThanSpendAmountError,
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  EmptyBlueParkingMarketError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightGroupCancellationsError,
  EmptyMidnightTakeableOffersError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InsufficientMidnightWithdrawableLiquidityError,
  InvalidMidnightHexInputError,
  MarketIdMismatchError,
  MidnightContinuousFeeAboveMaxError,
  MidnightContractReceiverError,
  MidnightInvalidAccountAddressError,
  MidnightMarketAddressMismatchError,
  MidnightOfferCallbackDataMismatchError,
  MidnightOfferCallbackMismatchError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferNotReduceOnlyError,
  MidnightOfferRatifierMismatchError,
  MidnightOfferReduceOnlyError,
  MidnightOfferSideMismatchError,
  MidnightRedeemExceedsCreditError,
  MidnightReferralFeePctExceededError,
  MidnightRepayExceedsDebtError,
  MidnightReplacementGroupCancelledError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOffersNotFillableError,
  MidnightTakeTargetUnreachableError,
  MidnightZeroOnBehalfError,
  MidnightZeroReceiverError,
  MissingAccrualPositionError,
  MissingMarketPriceError,
  NegativeInputError,
  NoMidnightCreditToRedeemError,
  NonPositiveInputError,
  UnboundedMidnightTakeInputError,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
  ZeroBlueParkingSharesError,
} from "../../types/error.js";
import { MidnightMarketMaturityTooFarError } from "../../types/midnightPublicationError.js";
import { MorphoMidnight } from "./midnight.js";
import { fetchMidnightMakerOfferStates } from "./publication.js";
import type {
  MakeLendParams,
  MakeOffersParams,
  MidnightMakerTreeInput,
  MidnightRequirementsParams,
  RepayWithdrawCollateralParams,
  SupplyBlueMakeLendParams,
  SupplyCollateralMakeBorrowParams,
  TakeRepayWithdrawCollateralParams,
} from "./types.js";

// Fixture takes quote 100 units near par; entity take flows reject targets the offers cannot hold
// or the buyer cap cannot pay for.
const midnightApiTake = (
  overrides: Parameters<typeof fixtureApiTake>[0] = {},
) => ({
  ...fixtureApiTake({ tick: 4_000n, ...overrides }),
  units: 1_000_000n,
});

// Fixture offers expire at 2_100 and the market matures at 2_000: run take flows before both.
const fixtureNow = 1_000n;
const useFixtureClock = () =>
  vi.useFakeTimers({ toFake: ["Date"], now: Number(fixtureNow) * 1_000 });
useFixtureClock();
beforeEach(useFixtureClock);

const maturityPolicyTestData = vi.hoisted(() => {
  const now = 1_767_279_000n;
  const maxTimeToMaturity = 100n * 365n * 86_400n;
  return { now, maturity: now + maxTimeToMaturity + 600n };
});

vi.mock("./publication.js", async (importOriginal) => {
  const publication = await importOriginal<typeof import("./publication.js")>();
  const isMaturityPolicyTree = (
    tree: Parameters<
      typeof publication.validateMidnightMakerOfferStates
    >[0]["tree"],
  ) =>
    tree.offers.some((offer) => {
      const market =
        "params" in offer.market ? offer.market.params : offer.market;
      return BigInt(market.maturity) === maturityPolicyTestData.maturity;
    });

  return {
    ...publication,
    validateMidnightMakerOfferStates: vi.fn(
      (
        params: Parameters<
          typeof publication.validateMidnightMakerOfferStates
        >[0],
      ) => {
        if (isMaturityPolicyTree(params.tree)) {
          publication.validateMidnightMakerOfferStates(params);
        }
      },
    ),
    fetchMidnightMakerOfferStates: vi.fn(
      async (
        params: Parameters<typeof publication.fetchMidnightMakerOfferStates>[0],
      ) => {
        const isMaturityPolicy = isMaturityPolicyTree(params.tree);
        return {
          states: params.tree.offers.map((offer) => {
            const marketParams = MarketParams.from(
              "params" in offer.market ? offer.market.params : offer.market,
            );
            const tickSpacing = isMaturityPolicy ? 0 : 1;
            return {
              consumed: 0n,
              tickSpacing,
              continuousFee: 0n,
              credit: 1n,
              debt: 1n,
              market: new Market({
                params: marketParams,
                totalUnits: 1_000_000n,
                lossFactor: 0n,
                withdrawable: 1_000_000n,
                continuousFeeCredit: 0n,
                settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
                continuousFee: 0,
                tickSpacing,
              }),
              lltvEnabled: isMaturityPolicy
                ? marketParams.collateralParams.map(() => true)
                : [],
              liquidationCursorEnabled: isMaturityPolicy
                ? marketParams.collateralParams.map(() => true)
                : [],
              oracleHasCode: isMaturityPolicy
                ? marketParams.collateralParams.map(() => true)
                : [],
            };
          }),
          now: maturityPolicyTestData.now,
        };
      },
    ),
  };
});

const client = {
  viemClient: {
    chain: { id: midnightChainId },
    request: async ({ method }: { readonly method: string }) => {
      if (method !== "eth_chainId") throw new Error(`unexpected RPC ${method}`);
      return `0x${midnightChainId.toString(16)}`;
    },
  },
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

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const wNative = getChainAddress(midnightChainId, "wNative");
const wNativeLoanMarket = new MarketParams({
  ...midnightMarket,
  loanToken: wNative,
});
const wNativeCollateralMarket = new MarketParams({
  ...midnightMarket,
  collateralParams: midnightMarket.collateralParams.map((collateral) => ({
    ...collateral,
    token: wNative,
  })),
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

const marketData = (
  overrides: {
    readonly withdrawable?: bigint;
    readonly continuousFee?: number;
  } = {},
) =>
  new Market({
    params: midnightMarket,
    totalUnits: 1_000n,
    lossFactor: 0n,
    withdrawable: overrides.withdrawable ?? 1_000n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: overrides.continuousFee ?? 0,
    tickSpacing: 1,
  });

const positionData = (
  market: Market,
  overrides: {
    readonly credit?: bigint;
    readonly pendingFee?: bigint;
    readonly user?: Address;
    readonly debt?: bigint;
    readonly collateral?: readonly bigint[];
  } = {},
) => {
  const collateral = overrides.collateral ?? [];
  let collateralBitmap = 0n;
  for (const [index, amount] of collateral.entries()) {
    if ((amount ?? 0n) > 0n) collateralBitmap |= 1n << BigInt(index);
  }

  return new AccrualPosition(
    {
      user: overrides.user ?? midnightAddresses.taker,
      credit: overrides.credit ?? 100n,
      pendingFee: overrides.pendingFee ?? 0n,
      lastLossFactor: 0n,
      lastAccrual: 0n,
      debt: overrides.debt ?? 0n,
      collateralBitmap,
      collateral,
    },
    market,
  );
};

const positionHealthParams = (
  market: Market,
  overrides: {
    readonly debt?: bigint;
    readonly collateral?: readonly bigint[];
    readonly user?: Address;
    readonly collateralPrices?: readonly bigint[];
  } = {},
) => ({
  positionData: positionData(market, {
    ...overrides,
    collateral: overrides.collateral ?? [10_000n],
  }),
  collateralPrices: overrides.collateralPrices ?? [ORACLE_PRICE_SCALE],
});

const marketWithTwoCollaterals = () => {
  const firstCollateral = midnightMarket.collateralParams[0]!;
  return new Market({
    ...marketData(),
    params: new MarketParams({
      ...midnightMarket,
      collateralParams: [
        firstCollateral,
        {
          ...firstCollateral,
          token: getAddress("0x0000000000000000000000000000000000007100"),
        },
      ],
    }),
  });
};

const sparsePositionData = (market: Market) => {
  const collateral = new Array<bigint>(2);
  collateral[1] = 10_000n;
  return positionData(market, { debt: 7_000n, collateral });
};

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

const midnightWithMetadata = (handle: MidnightMockHandle) =>
  midnightWithHandle(handle, {
    supportSignature: false,
    metadata: { origin: "a1b2c3d4" },
  });

type TakeableOffers = readonly ReturnType<typeof midnightApiTake>[];

const takeFlowCases: readonly {
  readonly name: string;
  readonly expectedBuy: boolean;
  readonly createOutput: (
    takeableOffers: TakeableOffers,
    deadline?: bigint,
  ) => unknown;
}[] = [
  {
    name: "takeLend",
    expectedBuy: false,
    createOutput: (takeableOffers, deadline = Time.timestamp() + 600n) =>
      midnight().takeLend({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        target: { type: "assets", assets: 1_000n, minUnits: 900n },
        takeableOffers,
        maxContinuousFee: maxUint256,
        deadline,
      }),
  },
  {
    name: "takeBorrow",
    expectedBuy: true,
    createOutput: (takeableOffers, deadline = Time.timestamp() + 600n) =>
      midnight().takeBorrow({
        marketData: marketData(),
        ...positionHealthParams(marketData()),
        accountAddress: midnightAddresses.taker,
        target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
        takeableOffers,
        deadline,
      }),
  },
  {
    name: "supplyCollateralTakeBorrow",
    expectedBuy: true,
    createOutput: (takeableOffers, deadline = Time.timestamp() + 600n) =>
      midnight().supplyCollateralTakeBorrow({
        marketData: marketData(),
        ...positionHealthParams(marketData()),
        accountAddress: midnightAddresses.taker,
        collateralSupplies: [{ collateralIndex: 0n, assets: 2_000n }],
        target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
        takeableOffers,
        deadline,
      }),
  },
  {
    name: "takeWithdraw",
    expectedBuy: true,
    createOutput: (takeableOffers, deadline = Time.timestamp() + 600n) =>
      midnight().takeWithdraw({
        marketData: marketData(),
        accountAddress: midnightAddresses.taker,
        target: { type: "units", units: 1_000n, minSellerAssets: 900n },
        takeableOffers,
        deadline,
      }),
  },
  {
    name: "takeRepayWithdrawCollateral",
    expectedBuy: false,
    createOutput: (takeableOffers, deadline = Time.timestamp() + 600n) =>
      midnight().takeRepayWithdrawCollateral({
        marketData: marketData(),
        ...positionHealthParams(marketData(), { debt: 1_000n }),
        accountAddress: midnightAddresses.taker,
        target: { type: "units", units: 1_000n, maxBuyerAssets: 990n },
        takeableOffers,
        repayEnabled: true,
        maxContinuousFee: maxUint256,
        deadline,
      }),
  },
];

describe.each(takeFlowCases)("deadline window: $name", (takeFlow) => {
  const now = fixtureNow;
  const offers = [midnightApiTake({ buy: takeFlow.expectedBuy })];

  afterEach(() => {
    vi.useRealTimers();
    useFixtureClock();
  });

  test("rejects an expired deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Number(now) * 1_000));

    expect(() => takeFlow.createOutput(offers, now)).toThrow(
      ExpiredDeadlineError,
    );
  });

  test("rejects a deadline more than one hour away", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Number(now) * 1_000));

    expect(() => takeFlow.createOutput(offers, now + 3_601n)).toThrow(
      expect.objectContaining({
        name: "MidnightTakeDeadlineTooFarError",
        deadline: now + 3_601n,
        maxDeadline: now + 3_600n,
      }),
    );
  });

  test("accepts a deadline one second away", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Number(now) * 1_000));

    expect(() => takeFlow.createOutput(offers, now + 1n)).not.toThrow();
  });

  test("accepts a deadline ten minutes away", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Number(now) * 1_000));

    expect(() => takeFlow.createOutput(offers, now + 600n)).not.toThrow();
  });

  test("accepts a deadline one hour away", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Number(now) * 1_000));

    expect(() => takeFlow.createOutput(offers, now + 3_600n)).not.toThrow();
  });
});

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

const blueMarket: BlueInputMarketParams = {
  loanToken: midnightAddresses.loanToken,
  collateralToken: midnightAddresses.collateralToken,
  oracle: midnightAddresses.oracle,
  irm: zeroAddress,
  lltv: 860000000000000000n,
};
const wNativeBlueMarket: BlueInputMarketParams = {
  ...blueMarket,
  loanToken: wNative,
};
const callback = getMidnightBlueBuyCallbackAddress({
  chainId: midnightChainId,
  owner: midnightAddresses.maker,
  salt: zeroHash,
});
const blue = getChainAddress(midnightChainId, "blue");
const callbackData = getMidnightBlueBuyCallbackData(blueMarket);
const blueOffer = (overrides: Partial<IOffer> = {}) =>
  makerOffer({ buy: true, callback, callbackData, ...overrides });

const mockBlueReads = (
  handle: MidnightMockHandle,
  {
    marketParams = blueMarket,
    totalSupplyAssets = 1_000n,
    totalSupplyShares = 1_000_000n,
    totalBorrowAssets = 0n,
    totalBorrowShares = 0n,
    lastUpdate = 1n,
    fee = 0n,
    rateAtTarget = 3_170_979_198n,
  }: {
    readonly marketParams?: typeof blueMarket;
    readonly totalSupplyAssets?: bigint;
    readonly totalSupplyShares?: bigint;
    readonly totalBorrowAssets?: bigint;
    readonly totalBorrowShares?: bigint;
    readonly lastUpdate?: bigint;
    readonly fee?: bigint;
    readonly rateAtTarget?: bigint;
  } = {},
) => {
  mockRead(handle, {
    address: blue,
    abi: blueAbi,
    functionName: "idToMarketParams",
    result: [
      marketParams.loanToken,
      marketParams.collateralToken,
      marketParams.oracle,
      marketParams.irm,
      marketParams.lltv,
    ],
  });
  mockRead(handle, {
    address: blue,
    abi: blueAbi,
    functionName: "market",
    result: [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ],
  });
  mockRead(handle, {
    address: marketParams.oracle,
    abi: blueOracleAbi,
    functionName: "price",
    result: 1n,
  });
  mockRead(handle, {
    address: getChainAddress(midnightChainId, "adaptiveCurveIrm"),
    abi: adaptiveCurveIrmAbi,
    functionName: "rateAtTarget",
    result: rateAtTarget,
  });
};

describe("maker publication maturity policies", () => {
  test("uses expiry for makeBorrow and now for supplyCollateralMakeBorrow", async () => {
    const now = maturityPolicyTestData.now;
    const maxTimeToMaturity = 100n * 365n * 86_400n;
    const expiry = now + 900n;
    const marketParams = new MarketParams({
      ...midnightMarket,
      maturity: maturityPolicyTestData.maturity,
    });
    const offer = makerOffer({
      buy: false,
      market: marketParams,
      expiry,
      ratifier: priceRatifierV1,
      tick: 4n,
    });
    const offers: MidnightMakerTreeInput = Tree.create({
      type: "priceV1",
      entries: [{ offer }],
    });

    expect(marketParams.maturity).toBeGreaterThan(now + maxTimeToMaturity);
    expect(marketParams.maturity).toBeLessThan(expiry + maxTimeToMaturity);
    await expect(
      midnightWithHandle(createMockClient(midnightTestChain)).makeBorrow({
        accountAddress: midnightAddresses.maker,
        offers,
        deadline: maxUint256,
        validation: offerValidation,
      }),
    ).resolves.toBeDefined();
    await expect(
      midnightWithHandle(
        createMockClient(midnightTestChain),
      ).supplyCollateralMakeBorrow({
        accountAddress: midnightAddresses.maker,
        offers,
        collateral: {
          market: marketParams,
          supplies: [{ collateralIndex: 0n, assets: 2_000n }],
        },
        deadline: maxUint256,
        validation: offerValidation,
      }),
    ).rejects.toBeInstanceOf(MidnightMarketMaturityTooFarError);
  });
});

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
    const params = {
      marketData: marketData(),
      accountAddress: midnightAddresses.taker,
      target: { type: "assets", assets: 1_000n, minUnits: 900n },
      takeableOffers: [midnightApiTake()],
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    } as const;

    test("default", () => {
      const tx = midnight().takeLend(params).buildTx();

      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.args).toEqual({
        market: midnightMarketId,
        target: { type: "assets", assets: 1_000n, minUnits: 900n },
        takeableOffers: 1,
        maxContinuousFee: maxUint256,
        deadline: params.deadline,
        referralFeePct: 0n,
        referralFeeRecipient: zeroAddress,
      });
    });

    test("behavior: appends metadata from client options", () => {
      const handle = createMockClient(midnightTestChain);
      const tx = midnightWithMetadata(handle).takeLend(params).buildTx();

      expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    });

    test("behavior: forwards native funding for a wNative loan token", () => {
      const nativeAmount = 500n;
      const market = wNativeLoanMarket;
      const tx = midnight()
        .takeLend({
          ...params,
          marketData: new Market({ ...marketData(), params: market }),
          takeableOffers: [midnightApiTake({ market })],
          nativeAmount,
        })
        .buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.value).toBe(nativeAmount);
      expect(decoded.args.at(-1)).toBe(wNative);
    });

    test("behavior: forwards the referral fee", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).takeLend({
        ...params,
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      });
      const requirements = await output.getRequirements();

      expect(output.buildTx().action.args).toMatchObject({
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      });
      expect(requirements.map(({ action }) => action)).toContainEqual({
        type: "erc20Approval",
        args: { spender: midnightBundlesV2, amount: maxUint256 },
      });
    });

    test("error: Midnight referral fee is capped at 10%", () => {
      expect(() =>
        midnight().takeLend({
          ...params,
          referralFeePct: 10n ** 17n + 1n,
          referralFeeRecipient: midnightAddresses.maker,
        }),
      ).toThrow(MidnightReferralFeePctExceededError);
    });

    test("behavior: requirements approve the pulled assets to MidnightBundlesV2 and authorize it", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const requirements = await midnightWithHandle(handle)
        .takeLend({
          ...params,
          target: { type: "units", units: 1_100n, maxBuyerAssets: 1_100n },
        })
        .getRequirements();

      expect(requirements.map((requirement) => requirement.action)).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.taker,
          },
        },
      ]);
    });

    test("behavior: requirements approve assets target amount to MidnightBundlesV2", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const requirements = await midnightWithHandle(handle)
        .takeLend({
          ...params,
          target: { type: "assets", assets: 1_000n, minUnits: 900n },
        })
        .getRequirements();

      expect(requirements.map((requirement) => requirement.action)).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.taker,
          },
        },
      ]);
    });

    test("behavior: returns no requirements when approval and authorization are satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: maxUint256,
      });
      mockMidnightAuthorization(handle, true);

      await expect(
        midnightWithHandle(handle).takeLend(params).getRequirements(),
      ).resolves.toEqual([]);
    });

    test("error: amount validation", () => {
      expect(() =>
        midnight().takeLend({
          ...params,
          target: { type: "assets", assets: 0n, minUnits: 900n },
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().takeLend({
          ...params,
          target: { type: "assets", assets: 1_000n, minUnits: -1n },
        }),
      ).toThrow(NonPositiveInputError);
      expect(() => midnight().takeLend({ ...params, deadline: 0n })).toThrow(
        ExpiredDeadlineError,
      );
    });

    test("error: MidnightMarketAddressMismatchError", () => {
      const market = marketData();
      const foreignMarket = new Market({
        ...market,
        params: { ...market.params, midnight: midnightAddresses.taker },
      });

      expect(() =>
        midnight().takeLend({ ...params, marketData: foreignMarket }),
      ).toThrow(MidnightMarketAddressMismatchError);
    });
  });

  describe("takeBorrow", () => {
    const params = {
      marketData: marketData(),
      ...positionHealthParams(marketData()),
      accountAddress: midnightAddresses.taker,
      target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
      takeableOffers: [midnightApiTake({ buy: true })],
      deadline: Time.timestamp() + 600n,
    } as const;

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).takeBorrow(params);
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.args).toMatchObject({
        target: params.target,
        receiver: midnightAddresses.taker,
      });
      expect(requirements.map((requirement) => requirement.action)).toEqual([
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.taker,
          },
        },
      ]);
    });

    test("behavior: appends metadata from client options", () => {
      const handle = createMockClient(midnightTestChain);
      const tx = midnightWithMetadata(handle).takeBorrow(params).buildTx();

      expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    });

    test("behavior: forwards an explicit receiver", () => {
      const tx = midnight()
        .takeBorrow({ ...params, receiver: midnightAddresses.maker })
        .buildTx();

      expect(tx.action.args.receiver).toBe(midnightAddresses.maker);
    });

    test("error: MidnightContractReceiverError for a protocol receiver", () => {
      const call = () =>
        midnight().takeBorrow({ ...params, receiver: midnightBundlesV2 });

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({
          field: "receiver",
          receiver: midnightBundlesV2,
          contract: "midnightBundlesV2",
        }),
      );
    });

    test("behavior: forwards the referral fee", () => {
      const tx = midnight()
        .takeBorrow({
          ...params,
          referralFeePct: 10n ** 16n,
          referralFeeRecipient: midnightAddresses.maker,
        })
        .buildTx();

      expect(tx.action.args).toMatchObject({
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      });
    });

    test("behavior: returns no requirements when authorization is satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);

      await expect(
        midnightWithHandle(handle).takeBorrow(params).getRequirements(),
      ).resolves.toEqual([]);
    });

    test("error: amount validation", () => {
      expect(() =>
        midnight().takeBorrow({
          ...params,
          target: { type: "assets", assets: 0n, maxUnits: 1_100n },
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().takeBorrow({
          ...params,
          target: { type: "units", units: 1_100n, minSellerAssets: -1n },
        }),
      ).toThrow(NonPositiveInputError);
    });

    test("error: invalid amount is rejected before the health check", () => {
      const market = marketData();

      expect(() =>
        midnight().takeBorrow({
          ...params,
          marketData: market,
          ...positionHealthParams(market, { collateral: [1_000n] }),
          target: { type: "assets", assets: -1n, maxUnits: 766n },
        }),
      ).toThrow(NonPositiveInputError);
    });

    test("error: UnboundedMidnightTakeInputError", () => {
      expect(() =>
        midnight().takeBorrow({
          ...params,
          target: { type: "units", units: maxUint256, minSellerAssets: 1n },
        }),
      ).toThrow(UnboundedMidnightTakeInputError);
      expect(() =>
        midnight().takeBorrow({
          ...params,
          target: { type: "assets", assets: 1_000n, maxUnits: maxUint256 },
        }),
      ).toThrow(UnboundedMidnightTakeInputError);
    });

    test("[INV-03] behavior: requires the buffered maximum debt", () => {
      const market = marketData();
      const healthParams = positionHealthParams(market, {
        collateral: [1_000n],
      });
      const borrow = (units: bigint) =>
        midnight().takeBorrow({
          ...params,
          marketData: market,
          ...healthParams,
          target: { type: "units", units, minSellerAssets: 1n },
        });

      expect(() => borrow(770n)).toThrow(BorrowExceedsSafeLtvError);
      expect(() => borrow(766n)).toThrow(BorrowExceedsSafeLtvError);
      expect(() => borrow(765n).buildTx()).not.toThrow();
    });

    test("behavior: error reports requested borrow and remaining safe room", () => {
      const market = marketData();
      let error: unknown;

      try {
        midnight().takeBorrow({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            debt: 500n,
            collateral: [1_000n],
          }),
          target: { type: "units", units: 300n, minSellerAssets: 1n },
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(BorrowExceedsSafeLtvError);
      expect(error).toHaveProperty(
        "message",
        new BorrowExceedsSafeLtvError(300n, 265n).message,
      );
    });

    test("behavior: floors remaining safe room at zero", () => {
      const market = marketData();
      let error: unknown;

      try {
        midnight().takeBorrow({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            debt: 800n,
            collateral: [1_000n],
          }),
          target: { type: "units", units: 300n, minSellerAssets: 1n },
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(BorrowExceedsSafeLtvError);
      expect(error).toHaveProperty(
        "message",
        new BorrowExceedsSafeLtvError(300n, 0n).message,
      );
    });

    test("behavior: assets target respects maxUnits at buffered LLTV", () => {
      const market = marketData();
      const healthParams = positionHealthParams(market, {
        collateral: [1_000n],
      });
      const borrow = (maxUnits: bigint) =>
        midnight().takeBorrow({
          ...params,
          marketData: market,
          ...healthParams,
          target: { type: "assets", assets: 700n, maxUnits },
        });

      expect(() => borrow(766n)).toThrow(BorrowExceedsSafeLtvError);
      expect(() => borrow(765n).buildTx()).not.toThrow();
    });

    test("error: MissingMarketPriceError", () => {
      const market = marketData();

      expect(() =>
        midnight().takeBorrow({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            collateral: [1_000n],
            collateralPrices: [],
          }),
          target: { type: "units", units: 1n, minSellerAssets: 1n },
        }),
      ).toThrow(MissingMarketPriceError);
    });

    test("error: position owner and market must match", () => {
      expect(() =>
        midnight().takeBorrow({
          ...params,
          positionData: positionData(params.marketData, {
            user: midnightAddresses.maker,
          }),
        }),
      ).toThrow(AccrualPositionUserMismatchError);
      expect(() =>
        midnight().takeBorrow({
          ...params,
          marketData: new Market({
            ...params.marketData,
            params: midnightOtherMarket,
          }),
          takeableOffers: [
            midnightApiTake({ buy: true, market: midnightOtherMarket }),
          ],
        }),
      ).toThrow(MarketIdMismatchError);
    });
  });

  describe("takeWithdraw", () => {
    const params = {
      marketData: marketData(),
      accountAddress: midnightAddresses.taker,
      target: { type: "units", units: 1_000n, minSellerAssets: 990n },
      takeableOffers: [midnightApiTake({ buy: true })],
      deadline: Time.timestamp() + 600n,
    } as const;

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).takeWithdraw(params);
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.type).toBe("midnightTakeWithdraw");
      expect(tx.action.args).toMatchObject({
        target: params.target,
        receiver: midnightAddresses.taker,
      });
      expect(requirements.map((requirement) => requirement.action)).toEqual([
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.taker,
          },
        },
      ]);
    });

    test("error: MidnightZeroReceiverError", () => {
      expect(() =>
        midnight().takeWithdraw({ ...params, receiver: zeroAddress }),
      ).toThrow(MidnightZeroReceiverError);
    });

    test("behavior: appends metadata from client options", () => {
      const handle = createMockClient(midnightTestChain);
      const tx = midnightWithMetadata(handle).takeWithdraw(params).buildTx();

      expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    });

    test("behavior: returns no requirements when authorization is satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);

      await expect(
        midnightWithHandle(handle).takeWithdraw(params).getRequirements(),
      ).resolves.toEqual([]);
    });

    test("behavior: forwards an explicit receiver", () => {
      const tx = midnight()
        .takeWithdraw({ ...params, receiver: midnightAddresses.maker })
        .buildTx();

      expect(tx.action.args.receiver).toBe(midnightAddresses.maker);
    });

    test("behavior: forwards the referral fee", () => {
      const tx = midnight()
        .takeWithdraw({
          ...params,
          referralFeePct: 10n ** 16n,
          referralFeeRecipient: midnightAddresses.maker,
        })
        .buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.action.args.referralFeePct).toBe(10n ** 16n);
      expect(tx.action.args.referralFeeRecipient).toBe(midnightAddresses.maker);
      expect(decoded.args.slice(7, 9)).toEqual([
        10n ** 16n,
        midnightAddresses.maker,
      ]);
    });
  });

  describe("supplyCollateralTakeBorrow", () => {
    const params = {
      marketData: marketData(),
      ...positionHealthParams(marketData()),
      accountAddress: midnightAddresses.taker,
      collateralSupplies: [{ collateralIndex: 0n, assets: 2_000n }],
      target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
      takeableOffers: [midnightApiTake({ buy: true })],
      deadline: Time.timestamp() + 600n,
    } as const;

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).supplyCollateralTakeBorrow({
        ...params,
        collateralSupplies: [
          { collateralIndex: 0n, assets: 2_000n },
          { collateralIndex: 0n, assets: 500n },
        ],
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.args.receiver).toBe(midnightAddresses.taker);
      expect(requirements.map((requirement) => requirement.action)).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.taker,
          },
        },
      ]);
    });

    test("behavior: appends metadata from client options", () => {
      const handle = createMockClient(midnightTestChain);
      const tx = midnightWithMetadata(handle)
        .supplyCollateralTakeBorrow(params)
        .buildTx();

      expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    });

    test("behavior: forwards native funding for a wNative collateral supply", () => {
      const nativeAmount = 500n;
      const tx = midnight()
        .supplyCollateralTakeBorrow({
          ...params,
          marketData: new Market({
            ...marketData(),
            params: wNativeCollateralMarket,
          }),
          ...positionHealthParams(
            new Market({ ...marketData(), params: wNativeCollateralMarket }),
          ),
          collateralSupplies: [{ collateralIndex: 0n, assets: 2_000n }],
          takeableOffers: [
            midnightApiTake({ buy: true, market: wNativeCollateralMarket }),
          ],
          nativeAmount,
        })
        .buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.value).toBe(nativeAmount);
      expect(decoded.args.at(-1)).toBe(wNative);
    });

    test("behavior: forwards an explicit receiver", () => {
      const tx = midnight()
        .supplyCollateralTakeBorrow({
          ...params,
          receiver: midnightAddresses.maker,
        })
        .buildTx();

      expect(tx.action.args.receiver).toBe(midnightAddresses.maker);
    });

    test("behavior: forwards the referral fee", () => {
      const tx = midnight()
        .supplyCollateralTakeBorrow({
          ...params,
          referralFeePct: 10n ** 16n,
          referralFeeRecipient: midnightAddresses.maker,
        })
        .buildTx();

      expect(tx.action.args).toMatchObject({
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      });
    });

    test("behavior: requests one MidnightBundlesV2 approval per collateral token", async () => {
      const secondCollateralToken = getAddress(
        "0x0000000000000000000000000000000000007100",
      );
      const collateralMarket = new MarketParams({
        ...midnightMarket,
        collateralParams: [
          ...midnightMarket.collateralParams,
          {
            ...midnightMarket.collateralParams[0]!,
            token: secondCollateralToken,
          },
        ],
      });
      const collateralMarketData = new Market({
        ...marketData(),
        params: collateralMarket,
      });
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockAllowance({ handle, token: secondCollateralToken, result: 0n });
      mockMidnightAuthorization(handle, true);

      const output = midnightWithHandle(handle).supplyCollateralTakeBorrow({
        ...params,
        marketData: collateralMarketData,
        ...positionHealthParams(collateralMarketData, {
          collateralPrices: [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE],
        }),
        collateralSupplies: [
          { collateralIndex: 0n, assets: 2_000n },
          { collateralIndex: 1n, assets: 3_000n },
        ],
        takeableOffers: [
          midnightApiTake({ buy: true, market: collateralMarket }),
        ],
      });

      expect(
        (await output.getRequirements()).map(({ action }) => action),
      ).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
      ]);
    });

    test("behavior: sums supplies of the same collateral token into one approval", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);
      const output = midnightWithHandle(handle).supplyCollateralTakeBorrow({
        ...params,
        collateralSupplies: [
          { collateralIndex: 0n, assets: 2_000n },
          { collateralIndex: 0n, assets: 3_000n },
        ],
      });

      expect(
        (await output.getRequirements()).map(({ action }) => action),
      ).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
      ]);
    });

    test("behavior: returns no requirements when approval and authorization are satisfied", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: maxUint256,
      });
      mockMidnightAuthorization(handle, true);

      await expect(
        midnightWithHandle(handle)
          .supplyCollateralTakeBorrow(params)
          .getRequirements(),
      ).resolves.toEqual([]);
    });

    test("error: EmptyMidnightCollateralSuppliesError", () => {
      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          collateralSupplies: [],
        }),
      ).toThrow(EmptyMidnightCollateralSuppliesError);
    });

    test("error: amount validation", () => {
      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          collateralSupplies: [{ collateralIndex: 0n, assets: 0n }],
        }),
      ).toThrow(NonPositiveInputError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({ ...params, deadline: 0n }),
      ).toThrow(ExpiredDeadlineError);
    });

    test("error: invalid collateral is rejected before the health check", () => {
      const market = marketData();

      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          marketData: market,
          ...positionHealthParams(market, { collateral: [1_000n] }),
          collateralSupplies: [{ collateralIndex: 0n, assets: 0n }],
          target: { type: "assets", assets: 700n, maxUnits: 766n },
        }),
      ).toThrow(NonPositiveInputError);
    });

    test("error: UnboundedMidnightTakeInputError", () => {
      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          target: { type: "units", units: maxUint256, minSellerAssets: 1n },
        }),
      ).toThrow(UnboundedMidnightTakeInputError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          target: { type: "assets", assets: 1_000n, maxUnits: maxUint256 },
        }),
      ).toThrow(UnboundedMidnightTakeInputError);
    });

    test("behavior: accounts for supplied collateral at buffered LLTV", () => {
      const market = marketData();
      const healthParams = positionHealthParams(market, {
        collateral: [500n],
      });
      const borrow = (units: bigint) =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          marketData: market,
          ...healthParams,
          collateralSupplies: [{ collateralIndex: 0n, assets: 500n }],
          target: { type: "units", units, minSellerAssets: 1n },
        });

      expect(() => borrow(770n)).toThrow(BorrowExceedsSafeLtvError);
      expect(() => borrow(765n).buildTx()).not.toThrow();
    });

    test("behavior: error reports requested borrow and remaining safe room", () => {
      const market = marketData();
      let error: unknown;

      try {
        midnight().supplyCollateralTakeBorrow({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            debt: 500n,
            collateral: [999n],
          }),
          collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
          target: { type: "units", units: 300n, minSellerAssets: 1n },
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(BorrowExceedsSafeLtvError);
      expect(error).toHaveProperty(
        "message",
        new BorrowExceedsSafeLtvError(300n, 265n).message,
      );
    });

    test("behavior: assets target respects maxUnits at buffered LLTV", () => {
      const market = marketData();
      const healthParams = positionHealthParams(market, {
        collateral: [1_000n],
      });
      const borrow = (maxUnits: bigint) =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          marketData: market,
          ...healthParams,
          collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
          target: { type: "assets", assets: 700n, maxUnits },
        });

      expect(() => borrow(766n)).toThrow(BorrowExceedsSafeLtvError);
      expect(() => borrow(765n).buildTx()).not.toThrow();
    });

    test("behavior: sparse collateral snapshots are densified before health checks", () => {
      const market = marketWithTwoCollaterals();
      const output = midnight().supplyCollateralTakeBorrow({
        ...params,
        marketData: market,
        positionData: sparsePositionData(market),
        collateralPrices: [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE],
        collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
        target: { type: "units", units: 1n, minSellerAssets: 1n },
        takeableOffers: [midnightApiTake({ buy: true, market: market.params })],
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("error: position owner and market must match", () => {
      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          positionData: positionData(params.marketData, {
            user: midnightAddresses.maker,
          }),
        }),
      ).toThrow(AccrualPositionUserMismatchError);
      expect(() =>
        midnight().supplyCollateralTakeBorrow({
          ...params,
          marketData: new Market({
            ...params.marketData,
            params: midnightOtherMarket,
          }),
          takeableOffers: [
            midnightApiTake({ buy: true, market: midnightOtherMarket }),
          ],
        }),
      ).toThrow(MarketIdMismatchError);
    });
  });

  describe("takeRepayWithdrawCollateral", () => {
    const params = {
      marketData: marketData(),
      ...positionHealthParams(marketData(), { debt: 1_000n }),
      accountAddress: midnightAddresses.taker,
      target: { type: "units", units: 1_000n, maxBuyerAssets: 990n },
      takeableOffers: [midnightApiTake()],
      repayEnabled: true,
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    } as const;

    test("error: MidnightZeroReceiverError", () => {
      const build = () =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 5n }],
          collateralReceiver: zeroAddress,
        });

      expect(build).toThrow(MidnightZeroReceiverError);
      expect(build).toThrow(
        expect.objectContaining({ field: "collateralReceiver" }),
      );
    });

    test("default", () => {
      const tx = midnight().takeRepayWithdrawCollateral(params).buildTx();

      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.args).toEqual({
        market: midnightMarketId,
        target: { type: "units", units: 1_000n, maxBuyerAssets: 990n },
        repayEnabled: true,
        collateralWithdrawals: [],
        collateralReceiver: midnightAddresses.taker,
        takeableOffers: 1,
        maxContinuousFee: maxUint256,
        deadline: params.deadline,
        referralFeePct: 0n,
        referralFeeRecipient: zeroAddress,
      });
    });

    test("behavior: appends metadata from client options", () => {
      const handle = createMockClient(midnightTestChain);
      const tx = midnightWithMetadata(handle)
        .takeRepayWithdrawCollateral(params)
        .buildTx();

      expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    });

    test("behavior: forwards native funding for a wNative loan token", () => {
      const nativeAmount = 500n;
      const tx = midnight()
        .takeRepayWithdrawCollateral({
          ...params,
          marketData: new Market({
            ...marketData(),
            params: wNativeLoanMarket,
          }),
          ...positionHealthParams(
            new Market({ ...marketData(), params: wNativeLoanMarket }),
            { debt: 1_000n },
          ),
          takeableOffers: [midnightApiTake({ market: wNativeLoanMarket })],
          nativeAmount,
        })
        .buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.value).toBe(nativeAmount);
      expect(decoded.args.at(-1)).toBe(wNative);
    });

    test("behavior: forwards the referral fee", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).takeRepayWithdrawCollateral({
        ...params,
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      });
      await output.getRequirements();

      expect(output.buildTx().action.args).toMatchObject({
        referralFeePct: 10n ** 16n,
        referralFeeRecipient: midnightAddresses.maker,
      });
      expect(
        decodeFunctionData({
          abi: midnightBundlesV2Abi,
          data: output.buildTx().data,
        }).args,
      ).toContainEqual(10n ** 16n);
      expect(
        decodeFunctionData({
          abi: midnightBundlesV2Abi,
          data: output.buildTx().data,
        }).args,
      ).toContainEqual(midnightAddresses.maker);
    });

    test("behavior: forwards withdrawals and an explicit collateral receiver", () => {
      const tx = midnight()
        .takeRepayWithdrawCollateral({
          ...params,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 5n }],
          collateralReceiver: midnightAddresses.maker,
        })
        .buildTx();

      expect(tx.action.args.collateralWithdrawals).toEqual([
        { collateralIndex: 0n, assets: 5n },
      ]);
      expect(tx.action.args.collateralReceiver).toBe(midnightAddresses.maker);
    });

    test("behavior: requirements approve the asset cap to MidnightBundlesV2 and authorize it", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const requirements = await midnightWithHandle(handle)
        .takeRepayWithdrawCollateral(params)
        .getRequirements();

      expect(requirements.map((requirement) => requirement.action)).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
        {
          type: "midnightAuthorization",
          args: {
            authorized: midnightBundlesV2,
            isAuthorized: true,
            onBehalf: midnightAddresses.taker,
          },
        },
      ]);
    });
    test("behavior: assets target approves the target assets", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);

      const requirements = await midnightWithHandle(handle)
        .takeRepayWithdrawCollateral({
          ...params,
          target: { type: "assets", assets: 500n, minUnits: 450n },
        })
        .getRequirements();

      expect(requirements.map((requirement) => requirement.action)).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
      ]);
    });

    test("error: ChainIdMismatchError", () => {
      expect(() =>
        new MorphoMidnight(
          client,
          midnightChainId + 1,
        ).takeRepayWithdrawCollateral(params),
      ).toThrow(ChainIdMismatchError);
    });

    test("[INV-03] behavior: checks withdrawals against buffered LLTV", () => {
      const market = marketData();
      const takeRepay = (debt: bigint) =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            debt,
            collateral: [1_000n],
          }),
          target: { type: "units", units: 1n, maxBuyerAssets: 1n },
          repayEnabled: false,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
        });

      expect(() => takeRepay(769n)).toThrow(
        WithdrawMakesPositionUnhealthyError,
      );
      const bufferedDebt = takeRepay(764n);
      expect(() => bufferedDebt.buildTx()).not.toThrow();
    });

    test("behavior: units targets repay their units when direct repayment is disabled", () => {
      const market = marketData();
      const output = midnight().takeRepayWithdrawCollateral({
        ...params,
        marketData: market,
        ...positionHealthParams(market, {
          debt: 1_000n,
          collateral: [1_000n],
          collateralPrices: [],
        }),
        target: {
          type: "units",
          units: maxUint256,
          maxBuyerAssets: 1_000n,
        },
        repayEnabled: false,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("behavior: partial repayment without withdrawals needs no prices", () => {
      const market = marketData();
      const output = midnight().takeRepayWithdrawCollateral({
        ...params,
        marketData: market,
        ...positionHealthParams(market, {
          debt: 1_000n,
          collateral: [1_000n],
          collateralPrices: [],
        }),
        target: { type: "units", units: 500n, maxBuyerAssets: 990n },
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("behavior: assets target uses minUnits for the post-operation debt", () => {
      const market = marketData();
      const output = midnight().takeRepayWithdrawCollateral({
        ...params,
        marketData: market,
        ...positionHealthParams(market, {
          debt: 770n,
          collateral: [1_000n],
        }),
        target: { type: "assets", assets: 20n, minUnits: 13n },
        repayEnabled: false,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("error: assets target minUnits that leaves too much debt", () => {
      const market = marketData();

      expect(() =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            debt: 770n,
            collateral: [1_000n],
          }),
          target: { type: "assets", assets: 20n, minUnits: 12n },
          repayEnabled: false,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
        }),
      ).toThrow(WithdrawMakesPositionUnhealthyError);
    });

    test("error: invalid target is rejected before the health check", () => {
      const market = marketData();

      expect(() =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            debt: 770n,
            collateral: [1_000n],
          }),
          target: { type: "assets", assets: -1n, minUnits: 12n },
          repayEnabled: false,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
        }),
      ).toThrow(NonPositiveInputError);
    });

    test("behavior: units target reduces debt when direct repayment is enabled", () => {
      const market = marketData();
      const output = midnight().takeRepayWithdrawCollateral({
        ...params,
        marketData: market,
        ...positionHealthParams(market, {
          debt: 770n,
          collateral: [1_000n],
        }),
        target: { type: "units", units: 20n, maxBuyerAssets: 20n },
        repayEnabled: true,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("error: max withdrawal leaves debt above buffered collateral capacity", () => {
      const market = marketData();

      expect(() =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            debt: 770n,
            collateral: [1_000n],
          }),
          target: { type: "units", units: 1n, maxBuyerAssets: 1n },
          repayEnabled: false,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
        }),
      ).toThrow(WithdrawMakesPositionUnhealthyError);
    });

    test("error: withdrawal cannot exceed held collateral", () => {
      const market = marketData();

      expect(() =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          marketData: market,
          ...positionHealthParams(market, {
            collateral: [1_000n],
          }),
          target: { type: "units", units: 1n, maxBuyerAssets: 1n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1_001n }],
        }),
      ).toThrow(WithdrawExceedsCollateralError);
    });

    test("behavior: sparse collateral snapshots are densified before health checks", () => {
      const market = marketWithTwoCollaterals();
      const prices = [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE];
      const output = midnight().takeRepayWithdrawCollateral({
        ...params,
        marketData: market,
        positionData: sparsePositionData(market),
        collateralPrices: prices,
        target: { type: "units", units: 1n, maxBuyerAssets: 1n },
        repayEnabled: true,
        collateralWithdrawals: [{ collateralIndex: 1n, assets: 1n }],
        takeableOffers: [midnightApiTake({ market: market.params })],
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("error: position owner and market must match", () => {
      expect(() =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          positionData: positionData(params.marketData, {
            user: midnightAddresses.maker,
          }),
        }),
      ).toThrow(AccrualPositionUserMismatchError);
      expect(() =>
        midnight().takeRepayWithdrawCollateral({
          ...params,
          marketData: new Market({
            ...params.marketData,
            params: midnightOtherMarket,
          }),
          takeableOffers: [midnightApiTake({ market: midnightOtherMarket })],
        }),
      ).toThrow(MarketIdMismatchError);
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
          amount: maxUint256,
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
      expect(approval.action.args.amount).toBe(maxUint256);
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
    test("error: MidnightZeroOnBehalfError", () => {
      const buildTx = () =>
        midnight()
          .supplyCollateral({
            marketData: marketData(),
            accountAddress: zeroAddress,
            collateralAssets: 2_000n,
          })
          .buildTx();

      expect(buildTx).toThrow(MidnightZeroOnBehalfError);
      expect(buildTx).toThrow(expect.objectContaining({ field: "onBehalf" }));
    });

    test("error: collateralAssets above uint128", () => {
      const collateralAssets = maxUint128 + 1n;
      expect(() =>
        midnightWithHandle(
          createMockClient(midnightTestChain),
        ).supplyCollateral({
          marketData: marketData(),
          accountAddress: midnightAddresses.taker,
          collateralAssets,
        }),
      ).toThrow(
        new InputExceedsMaxError({
          field: "collateralAssets",
          value: collateralAssets,
          max: maxUint128,
        }),
      );
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

    test("behavior: a snapshot whose lastAccrual is ahead of the clock accrues from lastAccrual", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1_000 * 1_000));
      const data = new AccrualPosition(
        {
          user: midnightAddresses.taker,
          credit: 250n,
          pendingFee: 50n,
          lastLossFactor: 0n,
          lastAccrual: 1_500n,
          debt: 0n,
          collateralBitmap: 0n,
          collateral: [],
        },
        marketData(),
      );

      try {
        expect(
          midnight()
            .redeem({
              positionData: data,
              accountAddress: midnightAddresses.taker,
            })
            .buildTx().action.args.units,
        ).toBe(data.faceValue);
        expect(() =>
          midnight().redeem({
            positionData: data,
            accountAddress: midnightAddresses.taker,
            units: data.credit + 1n,
          }),
        ).toThrow(MidnightRedeemExceedsCreditError);
      } finally {
        vi.useRealTimers();
      }
    });

    test("behavior: explicit units may exceed face value up to accrued credit", () => {
      vi.useFakeTimers();
      // Halfway from lastAccrual (0) to maturity (2_000): half of the pending fee has accrued.
      vi.setSystemTime(new Date(1_000 * 1_000));
      const data = positionData(marketData(), {
        credit: 250n,
        pendingFee: 50n,
      });

      try {
        const output = midnight().redeem({
          positionData: data,
          accountAddress: midnightAddresses.taker,
          units: 225n,
        });
        expect(output.buildTx().action.args.units).toBe(225n);
        expect(() =>
          midnight().redeem({
            positionData: data,
            accountAddress: midnightAddresses.taker,
            units: 226n,
          }),
        ).toThrow(MidnightRedeemExceedsCreditError);
      } finally {
        vi.useRealTimers();
      }
    });

    test("[INV-07] error: MidnightRedeemExceedsCreditError above credit net of accrued fees", () => {
      // Past maturity the whole pending fee has accrued: credit 250 - 50.
      vi.setSystemTime(new Date(3_000 * 1_000));
      expect(() =>
        midnight().redeem({
          positionData: positionData(marketData(), {
            credit: 250n,
            pendingFee: 50n,
          }),
          accountAddress: midnightAddresses.taker,
          units: 201n,
        }),
      ).toThrow(MidnightRedeemExceedsCreditError);
    });

    test("[INV-07] error: MidnightRedeemExceedsCreditError above credit net of realized losses", () => {
      const market = new Market({ ...marketData(), lossFactor: 1n << 127n });
      const data = positionData(market, { credit: 200n });

      expect(
        midnight()
          .redeem({
            positionData: data,
            accountAddress: midnightAddresses.taker,
          })
          .buildTx().action.args.units,
      ).toBe(99n);
      expect(() =>
        midnight().redeem({
          positionData: data,
          accountAddress: midnightAddresses.taker,
          units: 100n,
        }),
      ).toThrow(MidnightRedeemExceedsCreditError);
    });

    test("error: InvalidMidnightPositionLossFactorError when the market loss factor is below the snapshot's", () => {
      const data = new AccrualPosition(
        {
          user: midnightAddresses.taker,
          credit: 100n,
          pendingFee: 0n,
          lastLossFactor: 10n,
          lastAccrual: 0n,
          debt: 0n,
          collateralBitmap: 0n,
          collateral: [],
        },
        marketData(),
      );

      expect(() =>
        midnight().redeem({
          positionData: data,
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(InvalidMidnightPositionLossFactorError);
    });

    test("error: InvalidMidnightPositionAccrualStateError when the pending fee exceeds credit", () => {
      expect(() =>
        midnight().redeem({
          positionData: positionData(marketData(), {
            credit: 100n,
            pendingFee: 200n,
          }),
          accountAddress: midnightAddresses.taker,
        }),
      ).toThrow(InvalidMidnightPositionAccrualStateError);
    });

    test("[INV-07] error: MidnightRedeemExceedsCreditError", () => {
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
      const decoded = decodeFunctionData({
        abi: midnightAbi,
        data: tx.data,
      });
      expect(decoded.args[2]).toBe(midnightAddresses.taker);
      expect(decoded.args[3]).toBe(midnightAddresses.maker);
    });

    test("error: zero onBehalf is rejected before the default receiver", () => {
      const market = marketData();
      const redeem = () =>
        midnight().redeem({
          positionData: positionData(market, {
            credit: 250n,
            pendingFee: 50n,
            user: zeroAddress,
          }),
          accountAddress: zeroAddress,
        });

      expect(redeem).toThrow(MidnightZeroOnBehalfError);
      expect(redeem).toThrow(expect.objectContaining({ field: "onBehalf" }));
    });

    test("error: MidnightZeroReceiverError", () => {
      const market = marketData();
      const redeem = () =>
        midnight().redeem({
          positionData: positionData(market, {
            credit: 250n,
            pendingFee: 50n,
          }),
          accountAddress: midnightAddresses.taker,
          receiver: zeroAddress,
        });

      expect(redeem).toThrow(MidnightZeroReceiverError);
      expect(redeem).toThrow(expect.objectContaining({ field: "receiver" }));
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

    test("error: explicit units above uint128", () => {
      const market = marketData();
      const data = positionData(market, { credit: 250n, pendingFee: 50n });
      const units = maxUint128 + 1n;

      expect(() =>
        midnight().redeem({
          positionData: data,
          accountAddress: midnightAddresses.taker,
          units,
        }),
      ).toThrow(
        new InputExceedsMaxError({
          field: "units",
          value: units,
          max: maxUint128,
        }),
      );
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

    test("error: MidnightContractReceiverError for a protocol receiver", () => {
      const market = marketData();
      const call = () =>
        midnight().redeem({
          positionData: positionData(market, {
            credit: 250n,
            pendingFee: 50n,
          }),
          accountAddress: midnightAddresses.taker,
          receiver: midnightBundlesV2,
        });

      expect(call).toThrow(MidnightContractReceiverError);
      expect(call).toThrow(
        expect.objectContaining({
          field: "receiver",
          contract: "midnightBundlesV2",
        }),
      );
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
    test("behavior: validation: false skips the mempool API and returns the same OffersData", async () => {
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(JSON.stringify({ data: { issues: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      );
      const validation = { apiUrl: "https://sdk1520.test/base/" };
      try {
        const offers = rateTree(makerOffer({ buy: true }));
        const validated = await midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers,
          validation,
        });
        const mempoolCallsBeforeSkip = fetch.mock.calls.filter(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes(
            "/mempool/validate",
          ),
        ).length;
        expect(mempoolCallsBeforeSkip).toBeGreaterThan(0);

        const skipped = await midnight().getOffersData({
          accountAddress: midnightAddresses.maker,
          offers,
          validation: false,
        });

        expect(skipped).toEqual(validated);
        expect(
          fetch.mock.calls.filter(([input]) =>
            (input instanceof Request ? input.url : String(input)).includes(
              "/mempool/validate",
            ),
          ),
        ).toHaveLength(mempoolCallsBeforeSkip);
      } finally {
        fetch.mockRestore();
      }
    });

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

    test("error: validation: false still throws MidnightOfferMakerMismatchError", async () => {
      await expect(
        midnight().getOffersData({
          accountAddress: midnightAddresses.taker,
          offers: rateTree(makerOffer({ buy: true })),
          validation: false,
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

  describe("makeLend", () => {
    const prepare = (
      handle: MidnightMockHandle,
      overrides: Partial<MakeLendParams> = {},
    ) =>
      midnightWithHandle(handle).makeLend({
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
        new MorphoMidnight(client, midnightChainId + 1).makeLend({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(makerOffer({ buy: true })),
          deadline: maxUint256,
          validation: offerValidation,
          loanToken: midnightAddresses.loanToken,
          loanAssets: 1_000n,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("error: rejects invalid cancellation groups", async () => {
      const handle = createMockClient(midnightTestChain);

      await expect(
        prepare(handle, {
          cancellations: [{ group: "0x01", maxConsumed: 0n }],
        }),
      ).rejects.toBeInstanceOf(InvalidMidnightHexInputError);
    });

    test("error: rejects a nonzero continuous fee cap before mempool validation", async () => {
      const fetch = vi.fn(offerValidation.fetch);

      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(makerOffer({ buy: true, continuousFeeCap: 1n })),
          validation: { ...offerValidation, fetch },
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: "MidnightOfferContinuousFeeCapError",
          index: 0,
          continuousFeeCap: 1n,
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
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
            amount: maxUint256,
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

    test("behavior: validation: false builds the same transaction without calling the mempool API", async () => {
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(JSON.stringify({ data: { issues: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      );
      const validation = { apiUrl: "https://sdk1520.test/base/" };
      try {
        const defaultHandle = createMockClient(midnightTestChain);
        mockAllowance({
          handle: defaultHandle,
          token: midnightAddresses.loanToken,
          result: 0n,
        });
        mockMidnightAuthorization(defaultHandle, false);
        const skippedHandle = createMockClient(midnightTestChain);
        mockAllowance({
          handle: skippedHandle,
          token: midnightAddresses.loanToken,
          result: 0n,
        });
        mockMidnightAuthorization(skippedHandle, false);

        const defaultOutput = await prepare(defaultHandle, { validation });
        const mempoolCallsBeforeSkip = fetch.mock.calls.filter(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes(
            "/mempool/validate",
          ),
        ).length;
        expect(mempoolCallsBeforeSkip).toBeGreaterThan(0);
        const skippedOutput = await prepare(skippedHandle, {
          validation: false,
        });
        expect(
          fetch.mock.calls.filter(([input]) =>
            (input instanceof Request ? input.url : String(input)).includes(
              "/mempool/validate",
            ),
          ),
        ).toHaveLength(mempoolCallsBeforeSkip);

        await defaultOutput.getRequirements();
        await skippedOutput.getRequirements();
        expect(skippedOutput.buildTx()).toEqual(defaultOutput.buildTx());
      } finally {
        fetch.mockRestore();
      }
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
      const handle = createMockClient(midnightTestChain);
      await expect(
        prepare(handle, {
          offers: rateTree(makerOffer({ buy: false })),
        }),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
      expect(handle.request).not.toHaveBeenCalled();
    });

    test("error: MidnightOfferReduceOnlyError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(makerOffer({ buy: true, reduceOnly: true })),
        }),
      ).rejects.toThrow(MidnightOfferReduceOnlyError);
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

  describe("supplyBlueMakeLend", () => {
    const prepare = (
      handle: MidnightMockHandle,
      overrides: Partial<SupplyBlueMakeLendParams> = {},
    ) =>
      midnightWithHandle(handle).supplyBlueMakeLend({
        accountAddress: midnightAddresses.maker,
        offers: rateTree(blueOffer()),
        deadline: maxUint256,
        validation: offerValidation,
        blueMarket,
        assetsToPark: 1_000n,
        callbackSalt: zeroHash,
        ...overrides,
      });

    test("error: rejects callback salts that are not 32-byte hex", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle);
      const callbackSalt = "0x01" as Hex;
      const offerCallback = getMidnightBlueBuyCallbackAddress({
        chainId: midnightChainId,
        owner: midnightAddresses.maker,
        salt: callbackSalt,
      });

      await expect(
        prepare(handle, {
          callbackSalt,
          offers: rateTree(blueOffer({ callback: offerCallback })),
        }),
      ).rejects.toBeInstanceOf(InvalidMidnightHexInputError);
    });

    test("behavior: forwards native funding for a wNative Blue supply", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle, { marketParams: wNativeBlueMarket });
      const wNativeBlueOfferMarket = new MarketParams({
        ...midnightMarket,
        loanToken: wNative,
        maturity: apiValidMaturity,
      });
      const nativeAmount = 1_000n;
      const output = await prepare(handle, {
        blueMarket: wNativeBlueMarket,
        offers: rateTree(
          blueOffer({
            market: wNativeBlueOfferMarket,
            callbackData: getMidnightBlueBuyCallbackData(wNativeBlueMarket),
          }),
        ),
        nativeAmount,
      });
      const tx = output.buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.value).toBe(nativeAmount);
      expect(decoded.args.at(-1)).toBe(wNative);
    });

    test("error: assetsToPark above uint128 is rejected before reads", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          assetsToPark: maxUint128 + 1n,
        }),
      ).rejects.toThrow(InputExceedsMaxError);
    });

    test("behavior: a fresh handle builds the same transaction", async () => {
      const handleA = createMockClient(midnightTestChain);
      mockBlueReads(handleA);
      const handleB = createMockClient(midnightTestChain);
      mockBlueReads(handleB);
      const outputA = await prepare(handleA);
      const outputB = await prepare(handleB);

      expect(outputB.buildTx()).toEqual(outputA.buildTx());
    });

    test("error: ChainIdMismatchError", async () => {
      await expect(
        new MorphoMidnight(client, midnightChainId + 1).supplyBlueMakeLend({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(blueOffer()),
          deadline: maxUint256,
          validation: offerValidation,
          blueMarket,
          assetsToPark: 1_000n,
          callbackSalt: zeroHash,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("[INV-05] rejects an RPC on another chain before Blue reads", async () => {
      const handle = createMockClient(midnightTestChain);
      handle.request.mockImplementation(async ({ method }) => {
        if (method === "eth_chainId")
          return `0x${(midnightChainId + 1).toString(16)}`;
        throw new Error(`unexpected ${method}`);
      });

      await expect(prepare(handle)).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
        "eth_chainId",
      ]);
    });

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle);
      mockAllowance({ handle, token: midnightAddresses.loanToken, result: 0n });
      mockMidnightAuthorization(handle, false);
      const callbackSalt = `0x${"ee".repeat(32)}` as Hex;
      const offer = blueOffer({
        callback: getMidnightBlueBuyCallbackAddress({
          chainId: midnightChainId,
          owner: midnightAddresses.maker,
          salt: callbackSalt,
        }),
      });
      const output = await prepare(handle, {
        offers: rateTree(offer),
        cancellations: [{ group: previousGroup, maxConsumed: 5n }],
        callbackSalt,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(output.groups).toEqual([offer.group]);
      expect(requirements.map(({ action }) => action)).toEqual([
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
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
      expect(decoded.args.slice(0, 3)).toEqual([
        blueMarket,
        1_000n,
        callbackSalt,
      ]);
      expect(decoded.args[5]).toBe(rateRatifierV1);
      expect(decoded.args[6]).toBe(output.root);
      expect(decoded.args[13]).toEqual([
        { group: previousGroup, maxConsumed: 5n },
      ]);
      expect(tx.action.args.blueSupply).toEqual({
        market: blueMarket,
        assets: 1_000n,
        callbackSalt,
      });
    });

    test("does not use deployless reads when supportDeployless is false", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle);

      const output = await midnightWithHandle(handle, {
        supportSignature: false,
        supportDeployless: false,
      }).supplyBlueMakeLend({
        accountAddress: midnightAddresses.maker,
        offers: rateTree(blueOffer()),
        deadline: maxUint256,
        validation: offerValidation,
        blueMarket,
        assetsToPark: 1_000n,
        callbackSalt: zeroHash,
      });
      const ethCalls = handle.request.mock.calls
        .map(([call]) => call)
        .filter((call) => call.method === "eth_call");

      expect(output).toBeDefined();
      expect(ethCalls.length).toBeGreaterThan(0);
      expect(
        ethCalls.every((call) => {
          const transaction = call.params?.[0];
          return (
            typeof transaction === "object" &&
            transaction !== null &&
            "to" in transaction &&
            transaction.to != null
          );
        }),
      ).toBe(true);
    });

    test("error: NonPositiveInputError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), { assetsToPark: 0n }),
      ).rejects.toThrow(NonPositiveInputError);
    });

    test("error: EmptyBlueParkingMarketError", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle, { totalSupplyShares: 0n });
      const promise = prepare(handle);

      await expect(promise).rejects.toBeInstanceOf(EmptyBlueParkingMarketError);
      await expect(promise).rejects.toThrow(
        new EmptyBlueParkingMarketError({
          marketId: BlueMarketUtils.getMarketId(blueMarket),
        }),
      );
    });

    test("error: ZeroBlueParkingSharesError", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle, {
        totalSupplyAssets: 2_000_000_000_000n,
        totalSupplyShares: 1_000_000n,
      });

      const promise = prepare(handle, { assetsToPark: 1n });
      await expect(promise).rejects.toBeInstanceOf(ZeroBlueParkingSharesError);
      await expect(promise).rejects.toThrow(
        new ZeroBlueParkingSharesError({
          marketId: BlueMarketUtils.getMarketId(blueMarket),
          assets: 1n,
        }),
      );
    });

    test("error: ZeroBlueParkingSharesError after interest accrual", async () => {
      const handle = createMockClient(midnightTestChain);
      const adaptiveCurveIrm = getChainAddress(
        midnightChainId,
        "adaptiveCurveIrm",
      );
      const accruedBlueMarket = { ...blueMarket, irm: adaptiveCurveIrm };
      // One asset buys exactly one share before accrual; the fixtureNow seconds of interest
      // accrued since a zero lastUpdate round it down to zero shares.
      const totalSupplyAssets = 1_000_000_999_999n;
      const totalSupplyShares = 1_000_000_000_000n;
      const totalBorrowAssets = totalSupplyAssets;
      const totalBorrowShares = 1_000_000_000_000n;
      const lastUpdate = 0n;
      const rateAtTarget = 3_170_979_198n;
      mockBlueReads(handle, {
        marketParams: accruedBlueMarket,
        totalSupplyAssets,
        totalSupplyShares,
        totalBorrowAssets,
        totalBorrowShares,
        lastUpdate,
        rateAtTarget,
      });

      expect(
        BlueMarketUtils.toSupplyShares(
          1n,
          { totalSupplyAssets, totalSupplyShares },
          "Down",
        ),
      ).toBe(1n);
      expect(
        new BlueMarket({
          params: new BlueMarketParams(accruedBlueMarket),
          totalSupplyAssets,
          totalSupplyShares,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          fee: 0n,
          rateAtTarget,
        })
          .accrueInterest(Time.timestamp())
          .toSupplyShares(1n, "Down"),
      ).toBe(0n);

      const promise = prepare(handle, {
        assetsToPark: 1n,
        blueMarket: accruedBlueMarket,
      });
      await expect(promise).rejects.toBeInstanceOf(ZeroBlueParkingSharesError);
      await expect(promise).rejects.toThrow(
        new ZeroBlueParkingSharesError({
          marketId: BlueMarketUtils.getMarketId(accruedBlueMarket),
          assets: 1n,
        }),
      );
    });

    test("supports Blue markets with unsupported nonzero IRMs", async () => {
      const handle = createMockClient(midnightTestChain);
      const unsupportedIrmMarket = {
        ...blueMarket,
        irm: midnightAddresses.oracle,
      };
      mockBlueReads(handle, {
        marketParams: unsupportedIrmMarket,
        totalBorrowAssets: 1_000n,
        totalBorrowShares: 1_000n,
      });

      const output = await prepare(handle, {
        blueMarket: unsupportedIrmMarket,
        offers: rateTree(
          blueOffer({
            callbackData: getMidnightBlueBuyCallbackData(unsupportedIrmMarket),
          }),
        ),
      });

      expect(output).toBeDefined();
    });

    test("error: MidnightOfferSideMismatchError", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle);

      await expect(
        prepare(handle, {
          offers: rateTree(makerOffer({ buy: false, callback, callbackData })),
        }),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
      expect(handle.request).not.toHaveBeenCalled();
    });

    test("error: MidnightOfferReduceOnlyError", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle);

      await expect(
        prepare(handle, {
          offers: rateTree(blueOffer({ reduceOnly: true })),
        }),
      ).rejects.toThrow(MidnightOfferReduceOnlyError);
    });

    test("error: MidnightOfferMarketLoanTokenMismatchError", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle, {
        marketParams: { ...blueMarket, loanToken: midnightAddresses.dai },
      });

      await expect(
        prepare(handle, {
          blueMarket: { ...blueMarket, loanToken: midnightAddresses.dai },
        }),
      ).rejects.toThrow(MidnightOfferMarketLoanTokenMismatchError);
    });

    test("error: MidnightOfferCallbackMismatchError", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle);

      await expect(
        prepare(handle, {
          offers: rateTree(blueOffer({ callback: zeroAddress })),
        }),
      ).rejects.toThrow(MidnightOfferCallbackMismatchError);
    });

    test("error: MidnightOfferCallbackDataMismatchError", async () => {
      const handle = createMockClient(midnightTestChain);
      mockBlueReads(handle);

      await expect(
        prepare(handle, {
          offers: rateTree(blueOffer({ callbackData: "0x" })),
        }),
      ).rejects.toThrow(MidnightOfferCallbackDataMismatchError);
    });
  });

  describe("makeBorrow", () => {
    const prepare = (
      handle: MidnightMockHandle,
      overrides: Partial<MakeOffersParams> = {},
    ) =>
      midnightWithHandle(handle).makeBorrow({
        accountAddress: midnightAddresses.maker,
        offers: rateTree(makerOffer({ buy: false })),
        deadline: maxUint256,
        validation: offerValidation,
        ...overrides,
      });

    test("behavior: a fresh handle builds the same transaction", async () => {
      const outputA = await prepare(createMockClient(midnightTestChain));
      const outputB = await prepare(createMockClient(midnightTestChain));

      expect(outputB.buildTx()).toEqual(outputA.buildTx());
    });

    test("error: ChainIdMismatchError", async () => {
      await expect(
        new MorphoMidnight(client, midnightChainId + 1).makeBorrow({
          accountAddress: midnightAddresses.maker,
          offers: rateTree(makerOffer({ buy: false })),
          deadline: maxUint256,
          validation: offerValidation,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("error: rejects a mismatched seller receiver before mempool validation", async () => {
      const fetch = vi.fn(offerValidation.fetch);

      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(
            makerOffer({
              buy: false,
              receiverIfMakerIsSeller: zeroAddress,
            }),
          ),
          validation: { ...offerValidation, fetch },
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: "MidnightOfferSellerReceiverMismatchError",
          index: 0,
          expectedReceiver: midnightAddresses.maker,
          actualReceiver: zeroAddress,
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, false);
      const output = await prepare(handle, {
        cancellations: [{ group: previousGroup, maxConsumed: 0n }],
      });
      const tx = output.buildTx();
      const requirements = await output.getRequirements();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(
        requirements.some(({ action }) => action.type === "erc20Approval"),
      ).toBe(false);
      expect(requirements.map(({ action }) => action)).toEqual([
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
      expect(tx.action.args).toMatchObject({
        ratifier: rateRatifierV1,
        root: output.root,
        groups: output.groups,
        collateralSupplies: [],
        cancellations: [{ group: previousGroup, maxConsumed: 0n }],
      });
      expect(decoded.args[4]).toEqual([]);
    });

    test("error: MidnightOfferSideMismatchError", async () => {
      const handle = createMockClient(midnightTestChain);
      await expect(
        prepare(handle, {
          offers: rateTree(makerOffer({ buy: true })),
        }),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
      expect(handle.request).not.toHaveBeenCalled();
    });

    test("error: MidnightOfferReduceOnlyError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(makerOffer({ buy: false, reduceOnly: true })),
        }),
      ).rejects.toThrow(MidnightOfferReduceOnlyError);
    });
  });

  describe.each(["makeWithdraw", "makeRepay"] as const)("%s", (method) => {
    const buy = method === "makeRepay";
    const prepareWithValidation = (validation: typeof offerValidation) => {
      const prepare = (
        handle: MidnightMockHandle,
        offers: MidnightMakerTreeInput,
      ) => {
        const params = {
          accountAddress: midnightAddresses.maker,
          offers,
          deadline: maxUint256,
          validation,
          cancellations: [{ group: previousGroup, maxConsumed: 5n }],
        };
        const entity = midnightWithHandle(handle);
        return method === "makeRepay"
          ? entity.makeRepay({
              ...params,
              loanToken: midnightAddresses.loanToken,
              loanAssets: 1_000n,
              reservedLoanAssets: 500n,
            })
          : entity.makeWithdraw(params);
      };

      return prepare;
    };
    const prepare = prepareWithValidation(offerValidation);

    test.each(["priceV1", "rateV1"] as const)(
      "behavior: publishes an unchanged %s units-capped exit",
      async (type) => {
        const handle = createMockClient(midnightTestChain);
        mockMidnightAuthorization(handle, false);
        if (buy)
          mockAllowance({
            handle,
            token: midnightAddresses.loanToken,
            result: 0n,
          });
        const ratifier = type === "priceV1" ? priceRatifierV1 : rateRatifierV1;
        const offer = makerOffer({
          buy,
          reduceOnly: true,
          maxAssets: 0n,
          maxUnits: 100n,
          ratifier,
        });
        const tree =
          type === "priceV1"
            ? Tree.create({ type, entries: [{ offer }] })
            : Tree.create({ type, entries: [{ offer, rate: 1_000_000_000n }] });
        const output = await prepare(handle, tree);
        const tx = output.buildTx();
        const decoded = decodeFunctionData({
          abi: midnightBundlesV2Abi,
          data: tx.data,
        });
        expect(output.root).toBe(tree.root);
        expect(output.groups).toEqual([makerGroup]);
        expect(output.ratifierType).toBe(type);
        expect(tx.to).toBe(midnightBundlesV2);
        expect(tx.value).toBe(0n);
        expect(Object.isFrozen(tx)).toBe(true);
        expect(decoded.functionName).toBe("midnightBundlesV2CancelAndMake");
        expect(decoded.args[1]).toBe(0n);
        expect(decoded.args[4]).toEqual([]);
        expect(decoded.args[5]).toBe(ratifier);
        expect(decoded.args[6]).toBe(tree.root);
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
        const items =
          tree.type === "priceV1"
            ? PriceRatifierV1.ratify({ tree })
            : RateRatifierV1.ratify({ tree });
        expect(decoded.args[14]).toBe(await Payload.encode(items));
        const requirements = await output.getRequirements();
        expect(requirements.map(({ action }) => action)).toEqual([
          ...(buy
            ? [
                {
                  type: "erc20Approval",
                  args: {
                    spender: midnightAddresses.midnight,
                    amount: maxUint256,
                  },
                },
              ]
            : []),
          {
            type: "midnightAuthorization",
            args: {
              authorized: midnightBundlesV2,
              isAuthorized: true,
              onBehalf: midnightAddresses.maker,
            },
          },
        ]);
        expect(
          requirements.every((requirement) => !("sign" in requirement)),
        ).toBe(true);
        const fresh = await prepare(createMockClient(midnightTestChain), tree);
        expect(fresh.buildTx()).toEqual(tx);
      },
    );

    test("error: rejects a non-reduce-only offer anywhere in the tree", async () => {
      const fetch = vi.fn(offerValidation.fetch);
      await expect(
        prepareWithValidation({ ...offerValidation, fetch })(
          createMockClient(midnightTestChain),
          rateTree(
            makerOffer({
              buy,
              reduceOnly: true,
              maxAssets: 0n,
              maxUnits: 100n,
            }),
            makerOffer({ buy, reduceOnly: false, group: previousGroup }),
          ),
        ),
      ).rejects.toThrow(MidnightOfferNotReduceOnlyError);
      expect(fetch).not.toHaveBeenCalled();
    });

    test("error: rejects the opposite exit side", async () => {
      const fetch = vi.fn(offerValidation.fetch);
      await expect(
        prepareWithValidation({ ...offerValidation, fetch })(
          createMockClient(midnightTestChain),
          rateTree(
            makerOffer({
              buy: !buy,
              reduceOnly: true,
              maxAssets: 0n,
              maxUnits: 100n,
            }),
          ),
        ),
      ).rejects.toThrow(MidnightOfferSideMismatchError);
      expect(fetch).not.toHaveBeenCalled();
    });

    test("error: retains maker validation", async () => {
      await expect(
        prepare(
          createMockClient(midnightTestChain),
          rateTree(
            makerOffer({
              buy,
              reduceOnly: true,
              maxAssets: 0n,
              maxUnits: 100n,
              maker: midnightAddresses.taker,
            }),
          ),
        ),
      ).rejects.toThrow(MidnightOfferMakerMismatchError);
    });

    test("error: ChainIdMismatchError", async () => {
      const entity = new MorphoMidnight(client, midnightChainId + 1);
      const params = {
        accountAddress: midnightAddresses.maker,
        offers: rateTree(
          makerOffer({ buy, reduceOnly: true, maxAssets: 0n, maxUnits: 100n }),
        ),
        deadline: maxUint256,
        validation: offerValidation,
      };
      await expect(
        method === "makeRepay"
          ? entity.makeRepay({
              ...params,
              loanToken: midnightAddresses.loanToken,
              loanAssets: 1_000n,
            })
          : entity.makeWithdraw(params),
      ).rejects.toThrow(ChainIdMismatchError);
    });
  });

  describe("supplyCollateralMakeBorrow", () => {
    const market = new MarketParams({
      ...midnightMarket,
      maturity: apiValidMaturity,
    });
    const params: SupplyCollateralMakeBorrowParams = {
      accountAddress: midnightAddresses.maker,
      offers: rateTree(makerOffer({ buy: false })),
      collateral: {
        market,
        supplies: [{ collateralIndex: 0n, assets: 2_000n }],
      },
      deadline: maxUint256,
      validation: offerValidation,
    };
    const prepare = (
      handle: MidnightMockHandle,
      overrides: Partial<SupplyCollateralMakeBorrowParams> = {},
    ) =>
      midnightWithHandle(handle).supplyCollateralMakeBorrow({
        ...params,
        ...overrides,
      });

    test("behavior: a fresh handle builds the same transaction", async () => {
      const outputA = await prepare(createMockClient(midnightTestChain));
      const outputB = await prepare(createMockClient(midnightTestChain));

      expect(outputB.buildTx()).toEqual(outputA.buildTx());
    });

    test("error: collateral supplies whose per-index sum exceeds uint128", async () => {
      const error = await prepare(createMockClient(midnightTestChain), {
        collateral: {
          market,
          supplies: [
            { collateralIndex: 0n, assets: maxUint128 },
            { collateralIndex: 0n, assets: 1n },
          ],
        },
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(InputExceedsMaxError);
      expect(error).toMatchObject({
        field: "collateral.supplies(collateralIndex=0)",
      });
    });

    test("behavior: collateral supplies may sum to uint128", async () => {
      const output = await prepare(createMockClient(midnightTestChain), {
        collateral: {
          market,
          supplies: [
            { collateralIndex: 0n, assets: maxUint128 - 1n },
            { collateralIndex: 0n, assets: 1n },
          ],
        },
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("behavior: forwards native funding for a wNative collateral supply", async () => {
      const wNativeCollateralParams = new MarketParams({
        ...wNativeCollateralMarket,
        maturity: apiValidMaturity,
      });
      const nativeAmount = 1_000n;
      const output = await prepare(createMockClient(midnightTestChain), {
        offers: rateTree(
          makerOffer({ buy: false, market: wNativeCollateralParams }),
        ),
        collateral: {
          market: wNativeCollateralParams,
          supplies: [{ collateralIndex: 0n, assets: 2_000n }],
        },
        nativeAmount,
      });
      const tx = output.buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.value).toBe(nativeAmount);
      expect(decoded.args.at(-1)).toBe(wNative);
    });

    test("error: MidnightOfferReduceOnlyError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          offers: rateTree(makerOffer({ buy: false, reduceOnly: true })),
        }),
      ).rejects.toThrow(MidnightOfferReduceOnlyError);
    });

    test("behavior: collateral supplies require approval to MidnightBundlesV2", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);
      const output = await prepare(handle);
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
            amount: maxUint256,
          },
        },
      ]);
      expect(decoded.args[3]).toEqual(MarketUtils.toStruct(market));
      expect(decoded.args[4]).toEqual([
        { collateralIndex: 0n, assets: 2_000n },
      ]);
    });

    test("behavior: accepts a plain-object collateral market", async () => {
      const plainMarket = { ...market };
      expect(plainMarket).not.toBeInstanceOf(MarketParams);
      const supplies = [{ collateralIndex: 0n, assets: 2_000n }];

      const marketHandle = createMockClient(midnightTestChain);
      mockAllowance({
        handle: marketHandle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(marketHandle, true);
      const marketOutput = await prepare(marketHandle, {
        collateral: { market, supplies },
      });

      const plainMarketHandle = createMockClient(midnightTestChain);
      mockAllowance({
        handle: plainMarketHandle,
        token: midnightAddresses.collateralToken,
        result: 0n,
      });
      mockMidnightAuthorization(plainMarketHandle, true);
      const plainMarketOutput = await prepare(plainMarketHandle, {
        collateral: { market: plainMarket, supplies },
      });

      expect(plainMarketOutput.buildTx()).toEqual(marketOutput.buildTx());
      const [marketRequirements, plainMarketRequirements] = await Promise.all([
        marketOutput.getRequirements(),
        plainMarketOutput.getRequirements(),
      ]);
      expect(plainMarketRequirements.map(({ action }) => action)).toEqual(
        marketRequirements.map(({ action }) => action),
      );
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
          args: { spender: midnightBundlesV2, amount: maxUint256 },
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
          args: { spender: midnightBundlesV2, amount: maxUint256 },
        },
        {
          type: "erc20Approval",
          args: { spender: midnightBundlesV2, amount: maxUint256 },
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

    test("error: EmptyMidnightCollateralSuppliesError", async () => {
      await expect(
        prepare(createMockClient(midnightTestChain), {
          collateral: { market, supplies: [] },
        }),
      ).rejects.toThrow(EmptyMidnightCollateralSuppliesError);
    });

    test("error: ChainIdMismatchError", async () => {
      await expect(
        new MorphoMidnight(
          client,
          midnightChainId + 1,
        ).supplyCollateralMakeBorrow(params),
      ).rejects.toThrow(ChainIdMismatchError);
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
  });

  describe("repayWithdrawCollateral", () => {
    const defaultMarketData = marketData();
    const defaultPositionHealth = positionHealthParams(defaultMarketData, {
      debt: 1_000n,
    });

    test("error: MidnightZeroReceiverError", () => {
      const build = () =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...defaultPositionHealth,
          accountAddress: midnightAddresses.taker,
          repay: { type: "full", maxBuyerAssets: 1_010n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
          collateralReceiver: zeroAddress,
          deadline: maxUint256,
        });

      expect(build).toThrow(MidnightZeroReceiverError);
      expect(build).toThrow(
        expect.objectContaining({ field: "collateralReceiver" }),
      );
    });

    test("behavior: accepts deadline = maxUint256 because no offers are taken", () => {
      const tx = midnight()
        .repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...defaultPositionHealth,
          accountAddress: midnightAddresses.taker,
          repay: { type: "full", maxBuyerAssets: 1_010n },
          deadline: maxUint256,
        })
        .buildTx();

      expect(tx.action.args.deadline).toBe(maxUint256);
    });

    test("behavior: does not apply the take deadline window", () => {
      const now = 1_700_000_000n;
      const deadline = now + 3_601n;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Number(now) * 1_000));

      try {
        const tx = midnight()
          .repayWithdrawCollateral({
            marketData: defaultMarketData,
            ...defaultPositionHealth,
            accountAddress: midnightAddresses.taker,
            repay: { type: "full", maxBuyerAssets: 1_010n },
            deadline,
          })
          .buildTx();

        expect(tx.action.args.deadline).toBe(deadline);
      } finally {
        vi.useRealTimers();
      }
    });

    test("default", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, false);

      const output = midnightWithHandle(handle).repayWithdrawCollateral({
        marketData: defaultMarketData,
        ...defaultPositionHealth,
        accountAddress: midnightAddresses.taker,
        repay: { type: "full", maxBuyerAssets: 1_010n },
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
        deadline: maxUint256,
      });
      const requirements = await output.getRequirements();
      const tx = output.buildTx();

      expect(tx.to).toBe(midnightBundlesV2);
      expect(tx.action.args).toMatchObject({
        repay: { type: "full", maxBuyerAssets: 1_010n },
        collateralReceiver: midnightAddresses.taker,
      });
      expect(
        requirements.map((requirement) => requirement.action.type),
      ).toEqual(["erc20Approval", "midnightAuthorization"]);
      expect(requirements[0]?.action.args).toMatchObject({
        spender: midnightBundlesV2,
        amount: maxUint256,
      });
      expect(requirements[1]?.action.args).toMatchObject({
        authorized: midnightBundlesV2,
      });
    });

    test("behavior: assets repay approves the repaid assets", async () => {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({
        handle,
        token: midnightAddresses.loanToken,
        result: 0n,
      });
      mockMidnightAuthorization(handle, true);

      const requirements = await midnightWithHandle(handle)
        .repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...defaultPositionHealth,
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 1_000n },
          deadline: maxUint256,
        })
        .getRequirements();

      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action).toMatchObject({
        type: "erc20Approval",
        args: { spender: midnightBundlesV2, amount: maxUint256 },
      });
    });

    test("behavior: withdraw-only flow skips loan approval", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, true);

      const output = midnightWithHandle(handle).repayWithdrawCollateral({
        marketData: defaultMarketData,
        ...defaultPositionHealth,
        accountAddress: midnightAddresses.taker,
        repay: { type: "assets", assets: 0n },
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 2_000n }],
        collateralReceiver: midnightAddresses.maker,
        deadline: maxUint256,
      });

      await expect(output.getRequirements()).resolves.toEqual([]);
      expect(output.buildTx().action.args.collateralReceiver).toBe(
        midnightAddresses.maker,
      );
    });

    test("behavior: forwards native funding for a wNative loan token", () => {
      const nativeAmount = 500n;
      const wNativeMarketData = new Market({
        ...defaultMarketData,
        params: wNativeLoanMarket,
      });
      const tx = midnight()
        .repayWithdrawCollateral({
          marketData: wNativeMarketData,
          ...positionHealthParams(wNativeMarketData, { debt: 1_000n }),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 1_000n },
          nativeAmount,
          deadline: maxUint256,
        })
        .buildTx();
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.value).toBe(nativeAmount);
      expect(decoded.args.at(-1)).toBe(wNative);
    });

    test("error: NonPositiveInputError when nothing is repaid or withdrawn", () => {
      expect(() =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...defaultPositionHealth,
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 0n },
          deadline: maxUint256,
        }),
      ).toThrow(NonPositiveInputError);
    });

    test("error: invalid inputs", () => {
      for (const [overrides, error] of [
        [
          { collateralWithdrawals: [{ collateralIndex: 1n, assets: 1n }] },
          UnknownCollateralIndexError,
        ],
        [{ repay: { type: "assets", assets: -1n } }, NegativeInputError],
        [
          { repay: { type: "full", maxBuyerAssets: maxUint256 } },
          InputExceedsMaxError,
        ],
      ] as const) {
        expect(() =>
          midnight().repayWithdrawCollateral({
            marketData: defaultMarketData,
            ...defaultPositionHealth,
            accountAddress: midnightAddresses.taker,
            repay: { type: "assets", assets: 1n },
            deadline: maxUint256,
            ...overrides,
          }),
        ).toThrow(error);
      }
    });

    test("error: negative repay is rejected before the health check", () => {
      expect(() =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...positionHealthParams(defaultMarketData, {
            debt: 770n,
            collateral: [1_000n],
          }),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: -1n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
          deadline: maxUint256,
        }),
      ).toThrow(NegativeInputError);
    });

    test("error: ChainIdMismatchError", () => {
      const market = defaultMarketData;
      const wrongMarket = new Market({
        ...market,
        params: { ...market.params, chainId: midnightChainId + 1 },
      });
      expect(() =>
        midnight().repayWithdrawCollateral({
          marketData: wrongMarket,
          ...positionHealthParams(wrongMarket),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 1n },
          deadline: maxUint256,
        }),
      ).toThrow(ChainIdMismatchError);
    });

    test("behavior: withdraws only while debt stays below buffered LLTV", () => {
      const withdraw = (debt: bigint) =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...positionHealthParams(defaultMarketData, {
            debt,
            collateral: [1_000n],
          }),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 0n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
          deadline: maxUint256,
        });

      expect(() => withdraw(769n)).toThrow(WithdrawMakesPositionUnhealthyError);
      expect(() => withdraw(765n)).toThrow(WithdrawMakesPositionUnhealthyError);
      expect(() => withdraw(764n).buildTx()).not.toThrow();
    });

    test("behavior: repayment keeps a small withdrawal under buffered LLTV", () => {
      const withdraw = (repayAssets: bigint) =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...positionHealthParams(defaultMarketData, {
            debt: 769n,
            collateral: [1_000n],
          }),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: repayAssets },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
          deadline: maxUint256,
        });

      expect(() => withdraw(0n).buildTx()).toThrow(
        WithdrawMakesPositionUnhealthyError,
      );
      expect(() => withdraw(5n).buildTx()).not.toThrow();
    });

    test("behavior: sparse collateral snapshots are densified before health checks", () => {
      const market = marketWithTwoCollaterals();
      const output = midnight().repayWithdrawCollateral({
        marketData: market,
        positionData: sparsePositionData(market),
        collateralPrices: [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE],
        accountAddress: midnightAddresses.taker,
        repay: { type: "assets", assets: 1n },
        collateralWithdrawals: [{ collateralIndex: 1n, assets: 1n }],
        deadline: maxUint256,
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("behavior: partial repayment without withdrawals needs no prices", () => {
      const output = midnight().repayWithdrawCollateral({
        marketData: defaultMarketData,
        ...positionHealthParams(defaultMarketData, {
          debt: 1_000n,
          collateral: [1_000n],
          collateralPrices: [],
        }),
        accountAddress: midnightAddresses.taker,
        repay: { type: "assets", assets: 400n },
        deadline: maxUint256,
      });

      expect(() => output.buildTx()).not.toThrow();
    });

    test("behavior: full repayment and debt-free withdrawals need no prices", () => {
      const close = midnight().repayWithdrawCollateral({
        marketData: defaultMarketData,
        ...positionHealthParams(defaultMarketData, {
          debt: 1_000n,
          collateral: [1_000n],
          collateralPrices: [],
        }),
        accountAddress: midnightAddresses.taker,
        repay: { type: "full", maxBuyerAssets: 1_000n },
        collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
        deadline: maxUint256,
      });
      expect(() => close.buildTx()).not.toThrow();

      const debtFreeWithdraw = midnight().repayWithdrawCollateral({
        marketData: defaultMarketData,
        ...positionHealthParams(defaultMarketData, {
          collateral: [1_000n],
          collateralPrices: [],
        }),
        accountAddress: midnightAddresses.taker,
        repay: { type: "assets", assets: 0n },
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
        deadline: maxUint256,
      });
      expect(() => debtFreeWithdraw.buildTx()).not.toThrow();
    });

    test("error: MissingMarketPriceError", () => {
      expect(() =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...positionHealthParams(defaultMarketData, {
            debt: 770n,
            collateral: [1_000n],
            collateralPrices: [],
          }),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 1n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
          deadline: maxUint256,
        }),
      ).toThrow(MissingMarketPriceError);
    });

    test("error: withdrawal cannot exceed position collateral", () => {
      expect(() =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...positionHealthParams(defaultMarketData, {
            collateral: [1_000n],
          }),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 0n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1_001n }],
          deadline: maxUint256,
        }),
      ).toThrow(WithdrawExceedsCollateralError);
    });

    test("error: position owner and market must match", () => {
      expect(() =>
        midnight().repayWithdrawCollateral({
          marketData: defaultMarketData,
          ...positionHealthParams(defaultMarketData, {
            user: midnightAddresses.maker,
          }),
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 0n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
          deadline: maxUint256,
        }),
      ).toThrow(AccrualPositionUserMismatchError);
      expect(() =>
        midnight().repayWithdrawCollateral({
          marketData: new Market({
            ...defaultMarketData,
            params: midnightOtherMarket,
          }),
          ...defaultPositionHealth,
          accountAddress: midnightAddresses.taker,
          repay: { type: "assets", assets: 0n },
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
          deadline: maxUint256,
        }),
      ).toThrow(MarketIdMismatchError);
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
        market: zeroHash,
        ratifier: zeroAddress,
        root: zeroHash,
        groups: [],
        cancellations,
        collateralSupplies: [],
        deadline: maxUint256,
      });
    });

    test("behavior: snapshots accountAddress for authorization requirements", async () => {
      const handle = createMockClient(midnightTestChain);
      mockMidnightAuthorization(handle, false);
      let accountAddressReads = 0;
      const output = new MorphoMidnight(
        {
          viemClient: handle.client,
          options: {},
        } as unknown as MorphoClientType,
        midnightChainId,
      ).cancelOffers({
        get accountAddress() {
          accountAddressReads += 1;
          return accountAddressReads === 1
            ? midnightAddresses.maker
            : zeroAddress;
        },
        cancellations: [{ group: previousGroup, maxConsumed: 0n }],
        deadline: maxUint256,
      });

      const requirements = await output.getRequirements();

      expect(accountAddressReads).toBe(1);
      expect(requirements[0]?.action).toEqual({
        type: "midnightAuthorization",
        args: {
          authorized: midnightBundlesV2,
          isAuthorized: true,
          onBehalf: midnightAddresses.maker,
        },
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
          cancellations: [{ group: previousGroup, maxConsumed: 0n }],
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

    test("error: invalid cancellation group throws InvalidMidnightHexInputError", () => {
      expect(() =>
        new MorphoMidnight(client, midnightChainId).cancelOffers({
          accountAddress: midnightAddresses.maker,
          cancellations: [{ group: "0x01", maxConsumed: 0n }],
          deadline: maxUint256,
        }),
      ).toThrow(InvalidMidnightHexInputError);
    });

    test.each(["not-an-address", zeroAddress] as const)(
      "error: rejects invalid cancelOffers account addresses",
      (accountAddress) => {
        expect(() =>
          new MorphoMidnight(client, midnightChainId).cancelOffers({
            accountAddress: accountAddress as Address,
            cancellations: [{ group: previousGroup, maxConsumed: 0n }],
            deadline: maxUint256,
          }),
        ).toThrow(MidnightInvalidAccountAddressError);
      },
    );

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

describe("approval thresholds", () => {
  test.each([
    {
      name: "supplyCollateral approves supplied plus reserved collateral",
      token: midnightAddresses.collateralToken,
      spender: midnightAddresses.midnight,
      expected: 2_500n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .supplyCollateral({
            marketData: marketData(),
            accountAddress: midnightAddresses.taker,
            collateralAssets: 2_000n,
            reservedCollateralAssets: 500n,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "takeLend assets target approves assets",
      token: midnightAddresses.loanToken,
      spender: midnightBundlesV2,
      expected: 1_000n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .takeLend({
            marketData: marketData(),
            accountAddress: midnightAddresses.taker,
            target: { type: "assets", assets: 1_000n, minUnits: 900n },
            takeableOffers: [midnightApiTake()],
            maxContinuousFee: maxUint256,
            deadline: Time.timestamp() + 600n,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "takeLend units target approves maxBuyerAssets",
      token: midnightAddresses.loanToken,
      spender: midnightBundlesV2,
      expected: 1_100n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .takeLend({
            marketData: marketData(),
            accountAddress: midnightAddresses.taker,
            target: { type: "units", units: 1_100n, maxBuyerAssets: 1_100n },
            takeableOffers: [midnightApiTake()],
            maxContinuousFee: maxUint256,
            deadline: Time.timestamp() + 600n,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "repayWithdrawCollateral assets repay approves assets",
      token: midnightAddresses.loanToken,
      spender: midnightBundlesV2,
      expected: 1_000n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .repayWithdrawCollateral({
            marketData: marketData(),
            ...positionHealthParams(marketData(), { debt: 1_000n }),
            accountAddress: midnightAddresses.taker,
            repay: { type: "assets", assets: 1_000n },
            deadline: maxUint256,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "repayWithdrawCollateral full repay approves maxBuyerAssets",
      token: midnightAddresses.loanToken,
      spender: midnightBundlesV2,
      expected: 1_010n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .repayWithdrawCollateral({
            marketData: marketData(),
            ...positionHealthParams(marketData()),
            accountAddress: midnightAddresses.taker,
            repay: { type: "full", maxBuyerAssets: 1_010n },
            collateralWithdrawals: [
              { collateralIndex: 0n, assets: maxUint256 },
            ],
            deadline: maxUint256,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "takeRepayWithdrawCollateral units target approves maxBuyerAssets",
      token: midnightAddresses.loanToken,
      spender: midnightBundlesV2,
      expected: 990n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .takeRepayWithdrawCollateral({
            marketData: marketData(),
            ...positionHealthParams(marketData(), { debt: 1_000n }),
            accountAddress: midnightAddresses.taker,
            target: { type: "units", units: 1_000n, maxBuyerAssets: 990n },
            takeableOffers: [midnightApiTake()],
            repayEnabled: true,
            maxContinuousFee: maxUint256,
            deadline: Time.timestamp() + 600n,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "takeRepayWithdrawCollateral assets target approves assets",
      token: midnightAddresses.loanToken,
      spender: midnightBundlesV2,
      expected: 500n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .takeRepayWithdrawCollateral({
            marketData: marketData(),
            ...positionHealthParams(marketData(), { debt: 1_000n }),
            accountAddress: midnightAddresses.taker,
            target: { type: "assets", assets: 500n, minUnits: 450n },
            takeableOffers: [midnightApiTake()],
            repayEnabled: true,
            maxContinuousFee: maxUint256,
            deadline: Time.timestamp() + 600n,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "supplyBlueMakeLend approves the parked assets",
      token: midnightAddresses.loanToken,
      spender: midnightBundlesV2,
      expected: 1_000n,
      setup: mockBlueReads,
      getRequirements: async (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        (
          await midnightWithHandle(handle).supplyBlueMakeLend({
            accountAddress: midnightAddresses.maker,
            offers: rateTree(blueOffer()),
            deadline: maxUint256,
            validation: offerValidation,
            blueMarket,
            assetsToPark: 1_000n,
            callbackSalt: zeroHash,
          })
        ).getRequirements(requirementsParams),
    },
    {
      name: "supplyCollateralMakeBorrow approves collateral summed per token",
      token: midnightAddresses.collateralToken,
      spender: midnightBundlesV2,
      expected: 2_500n,
      getRequirements: async (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        (
          await midnightWithHandle(handle).supplyCollateralMakeBorrow({
            accountAddress: midnightAddresses.maker,
            offers: rateTree(makerOffer({ buy: false })),
            collateral: {
              market: new MarketParams({
                ...midnightMarket,
                maturity: apiValidMaturity,
              }),
              supplies: [
                { collateralIndex: 0n, assets: 2_000n },
                { collateralIndex: 0n, assets: 500n },
              ],
            },
            deadline: maxUint256,
            validation: offerValidation,
          })
        ).getRequirements(requirementsParams),
    },
    {
      name: "supplyCollateralTakeBorrow approves collateral summed per token",
      token: midnightAddresses.collateralToken,
      spender: midnightBundlesV2,
      expected: 2_500n,
      getRequirements: (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        midnightWithHandle(handle)
          .supplyCollateralTakeBorrow({
            marketData: marketData(),
            ...positionHealthParams(marketData()),
            accountAddress: midnightAddresses.taker,
            collateralSupplies: [
              { collateralIndex: 0n, assets: 2_000n },
              { collateralIndex: 0n, assets: 500n },
            ],
            target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
            takeableOffers: [midnightApiTake({ buy: true })],
            deadline: Time.timestamp() + 600n,
          })
          .getRequirements(requirementsParams),
    },
    {
      name: "makeLend approves offered plus reserved loan assets",
      token: midnightAddresses.loanToken,
      spender: midnightAddresses.midnight,
      expected: 1_500n,
      getRequirements: async (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        (
          await midnightWithHandle(handle).makeLend({
            accountAddress: midnightAddresses.maker,
            offers: rateTree(makerOffer({ buy: true })),
            deadline: maxUint256,
            validation: offerValidation,
            loanToken: midnightAddresses.loanToken,
            loanAssets: 1_000n,
            reservedLoanAssets: 500n,
          })
        ).getRequirements(requirementsParams),
    },
    {
      name: "makeRepay approves loanAssets plus reservedLoanAssets",
      token: midnightAddresses.loanToken,
      spender: midnightAddresses.midnight,
      expected: 1_500n,
      getRequirements: async (
        handle: MidnightMockHandle,
        requirementsParams?: MidnightRequirementsParams,
      ) =>
        (
          await midnightWithHandle(handle).makeRepay({
            accountAddress: midnightAddresses.maker,
            offers: rateTree(makerOffer({ buy: true, reduceOnly: true })),
            deadline: maxUint256,
            validation: offerValidation,
            loanToken: midnightAddresses.loanToken,
            loanAssets: 1_000n,
            reservedLoanAssets: 500n,
          })
        ).getRequirements(requirementsParams),
    },
  ])("$name", async ({ token, spender, expected, setup, getRequirements }) => {
    for (const [allowance, approved] of [
      [expected - 1n, true],
      [expected, false],
    ] as const) {
      const handle = createMockClient(midnightTestChain);
      mockAllowance({ handle, token, result: allowance });
      mockMidnightAuthorization(handle, true);
      setup?.(handle);

      const approvals = (await getRequirements(handle)).filter(
        ({ action }) => action.type === "erc20Approval",
      );

      if (approved) {
        expect(approvals).toHaveLength(1);
        expect(approvals[0]?.action.args).toMatchObject({
          spender,
          amount: maxUint256,
        });

        const overridden = (
          await getRequirements(handle, { approvalAmount: expected })
        ).filter(({ action }) => action.type === "erc20Approval");
        expect(overridden).toHaveLength(1);
        expect(overridden[0]?.action.args).toMatchObject({
          spender,
          amount: expected,
        });
      } else {
        expect(approvals).toEqual([]);
      }
    }
  });

  test("rejects an approvalAmount below one collateral token's pulled assets", async () => {
    const secondCollateralToken = getAddress(
      "0x0000000000000000000000000000000000007100",
    );
    const collateralMarket = new MarketParams({
      ...midnightMarket,
      collateralParams: [
        ...midnightMarket.collateralParams,
        {
          ...midnightMarket.collateralParams[0]!,
          token: secondCollateralToken,
        },
      ],
    });
    const collateralMarketData = new Market({
      ...marketData(),
      params: collateralMarket,
    });
    const handle = createMockClient(midnightTestChain);
    mockAllowance({
      handle,
      token: midnightAddresses.collateralToken,
      result: 0n,
    });
    mockAllowance({ handle, token: secondCollateralToken, result: 0n });
    mockMidnightAuthorization(handle, true);

    const output = midnightWithHandle(handle).supplyCollateralTakeBorrow({
      marketData: collateralMarketData,
      ...positionHealthParams(collateralMarketData, {
        collateralPrices: [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE],
      }),
      accountAddress: midnightAddresses.taker,
      collateralSupplies: [
        { collateralIndex: 0n, assets: 2_000n },
        { collateralIndex: 1n, assets: 3_000n },
      ],
      target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
      takeableOffers: [
        midnightApiTake({ buy: true, market: collateralMarket }),
      ],
      deadline: Time.timestamp() + 600n,
    });

    await expect(
      output.getRequirements({ approvalAmount: 2_500n }),
    ).rejects.toThrow(ApprovalAmountLessThanSpendAmountError);
  });
});
describe("MorphoMidnight observed chain", () => {
  const wrongChainHandle = () => {
    const handle = createMockClient(midnightTestChain);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId")
        return `0x${(midnightChainId + 1).toString(16)}`;
      throw new Error(`unexpected ${method}`);
    });
    return handle;
  };
  const methods = (handle: ReturnType<typeof wrongChainHandle>) =>
    handle.request.mock.calls.map(([{ method }]) => method);

  test("[INV-05] getMarketData: ChainIdMismatchError when eth_chainId reports another chain", async () => {
    const handle = wrongChainHandle();
    await expect(
      midnightWithHandle(handle).getMarketData(midnightMarketId),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(methods(handle)).toEqual(["eth_chainId"]);
  });

  test("[INV-05] getPositionData: ChainIdMismatchError when eth_chainId reports another chain", async () => {
    const handle = wrongChainHandle();
    await expect(
      midnightWithHandle(handle).getPositionData({
        marketId: midnightMarketId,
        accountAddress: midnightAddresses.taker,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(methods(handle)).toEqual(["eth_chainId"]);
  });

  test("[INV-05] getOffersData: ChainIdMismatchError before offer-state reads when eth_chainId reports another chain", async () => {
    const handle = wrongChainHandle();
    const publication =
      await vi.importActual<typeof import("./publication.js")>(
        "./publication.js",
      );
    vi.mocked(fetchMidnightMakerOfferStates).mockImplementationOnce(
      publication.fetchMidnightMakerOfferStates,
    );
    await expect(
      midnightWithHandle(handle).getOffersData({
        accountAddress: midnightAddresses.maker,
        offers: rateTree(makerOffer({ buy: true })),
        validation: offerValidation,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(methods(handle)).toEqual(["eth_chainId"]);
  });
});

describe("take feasibility fallbacks", () => {
  const selfTake = () =>
    midnightApiTake({ buy: true, maker: midnightAddresses.taker });
  const afterMaturity = <T>(run: () => T): T => {
    vi.setSystemTime(2_050_000);
    try {
      return run();
    } finally {
      useFixtureClock();
    }
  };
  const sellParams = (withdrawable: bigint, credit: bigint) => {
    const market = marketData({ withdrawable });
    return {
      marketData: market,
      positionData: positionData(market, { credit, collateral: [10_000n] }),
      collateralPrices: [ORACLE_PRICE_SCALE],
      accountAddress: midnightAddresses.taker,
      target: { type: "assets", assets: 1_000n, maxUnits: 1_100n },
      takeableOffers: [selfTake()] as ReturnType<typeof selfTake>[],
      deadline: 2_090n,
    } as const;
  };
  const borrowFlows = [
    {
      name: "takeBorrow",
      build: (params: ReturnType<typeof sellParams>) =>
        midnight().takeBorrow(params).buildTx(),
    },
    {
      name: "supplyCollateralTakeBorrow",
      build: (params: ReturnType<typeof sellParams>) =>
        midnight()
          .supplyCollateralTakeBorrow({
            ...params,
            collateralSupplies: [{ collateralIndex: 0n, assets: 2_000n }],
          })
          .buildTx(),
    },
  ] as const;

  describe.each(borrowFlows)("$name", ({ build }) => {
    test("error: MidnightTakeTargetUnreachableError when credit exceeds withdrawable before maturity", () => {
      expect(() => build(sellParams(500n, 2_000n))).toThrow(
        MidnightTakeTargetUnreachableError,
      );
    });

    test("error: EmptyMidnightTakeableOffersError with a sufficient fallback", () => {
      expect(() =>
        build({ ...sellParams(2_000n, 2_000n), takeableOffers: [] }),
      ).toThrow(EmptyMidnightTakeableOffersError);
    });

    test("behavior: a zero-price buy offer is dropped from the transaction", () => {
      const live = { ...midnightApiTake({ buy: true }), units: 2_000n };
      const zeroPrice = {
        ...midnightApiTake({ buy: true, tick: 0n }),
        units: 2_000n,
      };
      expect(
        build({ ...sellParams(0n, 0n), takeableOffers: [zeroPrice, live] })
          .data,
      ).toBe(build({ ...sellParams(0n, 0n), takeableOffers: [live] }).data);
    });

    test("behavior: credit within withdrawable fills dead offers", () => {
      expect(build(sellParams(2_000n, 2_000n)).to).toBe(midnightBundlesV2);
    });

    test("behavior: after maturity, credit is sold to live offers", () => {
      const live = { ...midnightApiTake({ buy: true }), units: 2_000n };
      expect(
        afterMaturity(() =>
          build({ ...sellParams(0n, 2_000n), takeableOffers: [live] }),
        ).to,
      ).toBe(midnightBundlesV2);
    });

    test("error: MidnightTakeableOffersNotFillableError after maturity when credit cannot be withdrawn and offers are dead", () => {
      expect(() => afterMaturity(() => build(sellParams(0n, 2_000n)))).toThrow(
        MidnightTakeableOffersNotFillableError,
      );
    });

    test("error: MidnightTakeableOffersNotFillableError after maturity without credit", () => {
      const live = { ...midnightApiTake({ buy: true }), units: 2_000n };
      expect(() =>
        afterMaturity(() =>
          build({ ...sellParams(0n, 0n), takeableOffers: [live] }),
        ),
      ).toThrow(
        expect.objectContaining({
          offers: [{ index: 0, reason: "marketMatured" }],
        }),
      );
    });
  });

  describe("takeWithdraw", () => {
    const params = (withdrawable: bigint, takeableOffers = [selfTake()]) => ({
      marketData: marketData({ withdrawable }),
      accountAddress: midnightAddresses.taker,
      target: { type: "units", units: 1_000n, minSellerAssets: 990n } as const,
      takeableOffers,
      deadline: 2_090n,
    });

    test("error: MidnightTakeableOffersNotFillableError without withdrawable liquidity", () => {
      expect(() => midnight().takeWithdraw(params(0n))).toThrow(
        MidnightTakeableOffersNotFillableError,
      );
    });

    test("behavior: a zero-price buy offer is dropped from the transaction", () => {
      const live = { ...midnightApiTake({ buy: true }), units: 1_000n };
      const zeroPrice = {
        ...midnightApiTake({ buy: true, tick: 0n }),
        units: 1_000n,
      };
      expect(
        midnight()
          .takeWithdraw(params(0n, [zeroPrice, live]))
          .buildTx().data,
      ).toBe(
        midnight()
          .takeWithdraw(params(0n, [live]))
          .buildTx().data,
      );
    });

    test("behavior: withdrawable liquidity fills dead offers", () => {
      expect(midnight().takeWithdraw(params(1_000n)).buildTx().to).toBe(
        midnightBundlesV2,
      );
    });

    test("behavior: does not reject a withdraw after maturity", () => {
      expect(
        afterMaturity(() =>
          midnight()
            .takeWithdraw(params(0n, [midnightApiTake({ buy: true })]))
            .buildTx(),
        ).to,
      ).toBe(midnightBundlesV2);
    });
  });

  describe("takeRepayWithdrawCollateral", () => {
    const params = (
      overrides: Partial<TakeRepayWithdrawCollateralParams> = {},
    ): TakeRepayWithdrawCollateralParams => ({
      marketData: marketData(),
      ...positionHealthParams(marketData(), { debt: 1_000n }),
      accountAddress: midnightAddresses.taker,
      target: { type: "units", units: 1_000n, maxBuyerAssets: 1_000n },
      takeableOffers: [midnightApiTake({ expiry: 999n })],
      repayEnabled: true,
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
      ...overrides,
    });

    test("error: MidnightRepayExceedsDebtError for a units target above the debt", () => {
      expect(() =>
        midnight().takeRepayWithdrawCollateral(
          params({
            target: { type: "units", units: 1_001n, maxBuyerAssets: 2_000n },
          }),
        ),
      ).toThrow(MidnightRepayExceedsDebtError);
    });

    test("behavior: the direct repay fills expired offers", () => {
      expect(
        midnight().takeRepayWithdrawCollateral(params()).buildTx().to,
      ).toBe(midnightBundlesV2);
    });

    test("error: MidnightTakeableOffersNotFillableError for expired offers without repayEnabled", () => {
      expect(() =>
        midnight().takeRepayWithdrawCollateral(params({ repayEnabled: false })),
      ).toThrow(MidnightTakeableOffersNotFillableError);
    });

    test("error: MidnightContinuousFeeAboveMaxError", () => {
      const market = marketData({ continuousFee: 1 });
      expect(() =>
        midnight().takeRepayWithdrawCollateral(
          params({
            marketData: market,
            ...positionHealthParams(market, { debt: 1_000n }),
            maxContinuousFee: 0n,
          }),
        ),
      ).toThrow(MidnightContinuousFeeAboveMaxError);
    });

    test("behavior: drops a zero-price offer from an assets target", () => {
      const tx = midnight()
        .takeRepayWithdrawCollateral({
          marketData: marketData(),
          ...positionHealthParams(marketData(), { debt: 1_000n }),
          accountAddress: midnightAddresses.taker,
          target: { type: "assets", assets: 500n, minUnits: 1n },
          takeableOffers: [midnightApiTake({ tick: 0n }), midnightApiTake()],
          repayEnabled: false,
          maxContinuousFee: maxUint256,
          deadline: Time.timestamp() + 600n,
        })
        .buildTx();

      expect(tx.action.args.takeableOffers).toBe(1);
    });
  });

  describe("repayWithdrawCollateral", () => {
    const params = (repay: RepayWithdrawCollateralParams["repay"]) => ({
      marketData: marketData(),
      ...positionHealthParams(marketData(), { debt: 1_000n }),
      accountAddress: midnightAddresses.taker,
      repay,
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
      deadline: maxUint256,
    });

    test("error: MidnightRepayExceedsDebtError", () => {
      expect(() =>
        midnight().repayWithdrawCollateral(
          params({ type: "assets", assets: 1_001n }),
        ),
      ).toThrow(MidnightRepayExceedsDebtError);
    });

    test("error: MidnightTakeTargetUnreachableError when maxBuyerAssets is below the debt", () => {
      expect(() =>
        midnight().repayWithdrawCollateral(
          params({ type: "full", maxBuyerAssets: 999n }),
        ),
      ).toThrow(MidnightTakeTargetUnreachableError);
    });

    test.each([
      { type: "assets", assets: 1_000n },
      { type: "full", maxBuyerAssets: 1_000n },
    ] as const)("behavior: builds at exactly the debt ($type)", (repay) => {
      expect(
        midnight().repayWithdrawCollateral(params(repay)).buildTx().to,
      ).toBe(midnightBundlesV2);
    });
  });
});
