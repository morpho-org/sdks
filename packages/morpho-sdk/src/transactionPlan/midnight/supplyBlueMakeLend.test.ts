import {
  Market as BlueMarket,
  MarketParams as BlueMarketParams,
  MarketUtils as BlueMarketUtils,
} from "@morpho-org/blue-sdk";
import { fetchMarket } from "@morpho-org/blue-sdk-viem";
import {
  InvalidTreeError,
  MarketParams,
  midnightAbi,
  Offer,
  RateRatifierV1,
} from "@morpho-org/midnight-sdk";
import { getChainAddress, getChainAddresses } from "@morpho-org/morpho-ts";
import {
  createMockClient,
  expectReadCall,
  mockRead,
} from "@morpho-org/test/mock";
import {
  concatHex,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  maxUint128,
  maxUint256,
  padHex,
  zeroHash,
} from "viem";
import { base } from "viem/chains";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { validateMidnightMakerOfferStates } from "../../entities/midnight/publication.js";
import {
  InvalidMidnightRateRatifierV1RateError,
  InvalidMidnightRateRatifierV1TickError,
} from "../../errors.js";
import {
  buildTransaction,
  buildTransactions,
  ChainIdMismatchError,
  EmptyBlueParkingMarketError,
  ExpiredDeadlineError,
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidMidnightHexInputError,
  InvalidTransactionPlanError,
  MidnightOfferCallbackDataMismatchError,
  MidnightOfferCallbackMismatchError,
  MidnightOfferGroupConsumedError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferReduceOnlyError,
  MidnightOfferSideMismatchError,
  MidnightReplacementGroupCancelledError,
  type MidnightSupplyBlueMakeLendPlanParams,
  MissingContractCodeError,
  NativeAmountOnNonWNativeAssetError,
  NonPositiveInputError,
  parseTransactionPlan,
  prepareMidnightSupplyBlueMakeLend,
  serializeTransactionPlan,
  ZeroBlueParkingSharesError,
} from "../../index.js";
import { fetchMidnightMakerOfferStatesBeforeDeadline } from "./publicationState.js";

vi.mock("./publicationState.js", () => ({
  fetchMidnightMakerOfferStatesBeforeDeadline: vi.fn(
    async (_params: unknown, chainCheck: () => Promise<void>) => {
      await chainCheck();
      return { states: [], now: 0n, blockNumber: 4_321n };
    },
  ),
}));
vi.mock("../../entities/midnight/publication.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../entities/midnight/publication.js")
  >()),
  validateMidnightMakerOfferStates: vi.fn(),
}));
vi.mock("@morpho-org/blue-sdk-viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@morpho-org/blue-sdk-viem")>()),
  fetchMarket: vi.fn(),
}));

const saved = `{
  "version": 2,
  "chainId": 8453,
  "account": "0x000000000000000000000000000000000000A000",
  "expiresAt": 1600,
  "steps": [{
    "id": "midnightSupplyBlueMakeLend",
    "label": "Supply Blue liquidity and publish Midnight lend offers",
    "action": {
      "type": "midnightSupplyBlueMakeLend",
      "inputs": {
        "chainId": 8453,
        "account": "0x000000000000000000000000000000000000A000",
        "ratifierType": "priceV1",
        "ratifier": "0x08a0e69772315652165921D722B3caAea4C326e6",
        "root": "0x1111111111111111111111111111111111111111111111111111111111111111",
        "groups": ["0x2222222222222222222222222222222222222222222222222222222222222222"],
        "payload": "0xabcd",
        "cancellations": [{
          "group": "0x3333333333333333333333333333333333333333333333333333333333333333",
          "maxConsumed": {"$bigint": "42"}
        }],
        "deadline": {"$bigint": "1600"},
        "nativeAssets": {"$bigint": "25"},
        "blueSupply": {
          "market": {
            "loanToken": "0x4200000000000000000000000000000000000006",
            "collateralToken": "0x0000000000000000000000000000000000007000",
            "oracle": "0x0000000000000000000000000000000000008000",
            "irm": "0x0000000000000000000000000000000000009000",
            "lltv": {"$bigint": "770000000000000000"}
          },
          "assets": {"$bigint": "100"},
          "callbackSalt": "0x4444444444444444444444444444444444444444444444444444444444444444"
        }
      }
    }
  }],
  "signatureRequests": []
}`;

describe("stored format-2 midnightSupplyBlueMakeLend", () => {
  test("builds fixed bytes with an opaque payload, without preparing a plan", () => {
    const word = (value: Hex) => padHex(value, { size: 32 });
    const expected = concatHex([
      "0xb4691380",
      word("0x4200000000000000000000000000000000000006"),
      word("0x7000"),
      word("0x8000"),
      word("0x9000"),
      word("0x0aaf96eb9d0d0000"),
      word("0x64"),
      "0x4444444444444444444444444444444444444444444444444444444444444444",
      word("0x02a0"),
      word("0x03c0"),
      word("0x08a0e69772315652165921D722B3caAea4C326e6"),
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      ...Array<Hex>(6).fill(zeroHash),
      word("0x03e0"),
      word("0x0440"),
      word("0x0640"),
      word("0x4200000000000000000000000000000000000006"),
      ...Array<Hex>(3).fill(zeroHash),
      word("0x0100"),
      ...Array<Hex>(6).fill(zeroHash), // End of empty Midnight market and zero supplies.
      word("0x01"),
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      word("0x2a"),
      word("0x02"),
      padHex("0xabcd", { size: 32, dir: "right" }),
    ]);
    const [tx] = buildTransactions(parseTransactionPlan(saved));
    expect(tx).toMatchObject({
      to: "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
      value: 25n,
    });
    expect(tx?.data.toLowerCase()).toBe(expected.toLowerCase());
    const extra = saved.replace(
      '"payload": "0xabcd"',
      '"payload": "0xabcd", "collateral": {}, "rootSignature": {"v": 27}',
    );
    expect(buildTransactions(parseTransactionPlan(extra))).toEqual([tx]);
    const nestedExtra = saved
      .replace(
        '"lltv": {"$bigint": "770000000000000000"}',
        '"lltv": {"$bigint": "770000000000000000"}, "extra": "0x01"',
      )
      .replace(
        '"assets": {"$bigint": "100"},',
        '"assets": {"$bigint": "100"}, "shares": {"$bigint": "1"},',
      );
    expect(nestedExtra).not.toBe(saved);
    expect(buildTransactions(parseTransactionPlan(nestedExtra))).toEqual([tx]);
  });

  test("rejects building a Blue-backed step directly without Blue funding", () => {
    const plan = parseTransactionPlan(saved);
    const [step] = plan.steps;
    assert(step?.action.type === "midnightSupplyBlueMakeLend");
    const inputs = { ...step.action.inputs, nativeAssets: undefined };
    Reflect.deleteProperty(inputs, "blueSupply");
    const malformed = { ...step, action: { ...step.action, inputs } };
    expect(() => buildTransaction(plan, malformed)).toThrow(
      InvalidTransactionPlanError,
    );
  });

  test.each([
    ['"assets": {"$bigint": "100"}', '"assets": {"$bigint": "0"}'],
    ['"assets": {"$bigint": "100"}', '"assets": 100'],
    ['"nativeAssets": {"$bigint": "25"}', '"nativeAssets": {"$bigint": "101"}'],
    [`"callbackSalt": "0x${"44".repeat(32)}"`, '"callbackSalt": "0x1234"'],
    [
      '"loanToken": "0x4200000000000000000000000000000000000006"',
      '"loanToken": "0x1234"',
    ],
  ])("rejects an invalid stored funding field %s", (from, to) => {
    expect(() => parseTransactionPlan(saved.replace(from, to))).toThrow(
      InvalidTransactionPlanError,
    );
  });
});

const chainId = base.id;
const account = midnightAddresses.maker;
const callbackSalt = zeroHash;
const blueMarket = {
  loanToken: midnightMarket.loanToken,
  collateralToken: midnightAddresses.collateralToken,
  oracle: midnightAddresses.oracle,
  irm: getChainAddress(chainId, "adaptiveCurveIrm"),
  lltv: 770_000_000_000_000_000n,
};
const offer = Offer.create({
  market: midnightMarket,
  maker: account,
  buy: true,
  start: 1000n,
  expiry: 1800n,
  tick: 5000n,
  ratifier: getChainAddress(chainId, "priceRatifierV1"),
  maxUnits: 100n,
  group: padHex("0x01", { size: 32 }),
  callback: getMidnightBlueBuyCallbackAddress({
    chainId,
    owner: account,
    salt: callbackSalt,
  }),
  callbackData: getMidnightBlueBuyCallbackData(blueMarket),
});
const priceTree = (...offers: readonly Offer[]) => ({
  type: "priceV1" as const,
  entries: offers.map((entry) => ({ offer: entry })),
});
const params = {
  chainId,
  account,
  callbackSalt,
  blueMarket,
  assetsToPark: 100n,
  now: 1000n,
  offers: priceTree(offer),
} satisfies MidnightSupplyBlueMakeLendPlanParams;

describe("prepareMidnightSupplyBlueMakeLend", () => {
  test.each([
    { error: InvalidTreeError, offers: priceTree() },
    { error: NonPositiveInputError, assetsToPark: 0n },
    { error: InvalidBigIntInputError, assetsToPark: 100 as unknown as bigint },
    { error: InputExceedsMaxError, assetsToPark: maxUint128 + 1n },
    { error: NativeAmountOnNonWNativeAssetError, nativeAmount: 1n },
    { error: InvalidMidnightHexInputError, callbackSalt: "0x12" },
    {
      error: MidnightOfferCallbackMismatchError,
      callbackSalt: padHex("0x01", { size: 32 }),
    },
    {
      error: MidnightOfferCallbackDataMismatchError,
      blueMarket: { ...blueMarket, lltv: 0n },
    },
    {
      error: MidnightOfferMarketLoanTokenMismatchError,
      offers: priceTree(
        Offer.create({
          ...offer,
          market: new MarketParams({
            ...midnightMarket,
            loanToken: midnightAddresses.dai,
          }),
        }),
      ),
    },
    {
      error: MidnightOfferSideMismatchError,
      offers: priceTree(
        Offer.create({
          ...offer,
          buy: false,
          receiverIfMakerIsSeller: account,
        }),
      ),
    },
    {
      error: MidnightOfferReduceOnlyError,
      offers: priceTree(Offer.create({ ...offer, reduceOnly: true })),
    },
    { error: InputExceedsMaxError, expiresAt: 1800 },
    { error: InputExceedsMaxError, expiresAt: 1801 },
    {
      error: InvalidMidnightHexInputError,
      cancellations: [{ group: "0x12", maxConsumed: 0n }],
    },
    {
      error: MidnightReplacementGroupCancelledError,
      cancellations: [{ group: offer.group, maxConsumed: 0n }],
    },
    ...[
      {
        error: InvalidMidnightRateRatifierV1RateError,
        tick: RateRatifierV1.MIN_TICK,
        rate: -1n,
      },
      { error: InvalidMidnightRateRatifierV1TickError, tick: 0n, rate: 0n },
    ].map(({ error, tick, rate }) => ({
      error,
      offers: {
        type: "rateV1" as const,
        entries: [
          {
            offer: Offer.create({
              ...offer,
              tick,
              ratifier: getChainAddress(chainId, "rateRatifierV1"),
            }),
            rate,
          },
        ],
      },
    })),
  ] satisfies readonly (Partial<MidnightSupplyBlueMakeLendPlanParams> & {
    error: new (...args: never[]) => Error;
  })[])(
    "rejects $error.name without state or API reads",
    async ({ error, ...overrides }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      await expect(
        prepareMidnightSupplyBlueMakeLend(client, {
          ...params,
          ...overrides,
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test.each([
    { cancellations: [null], path: "$.cancellations[0]" },
    {
      cancellations: Object.assign(new Array(2), {
        1: { group: zeroHash, maxConsumed: 0n },
      }),
      path: "$.cancellations[0]",
    },
    { cancellations: "0x", path: "$.cancellations" },
  ])(
    "error: rejects malformed cancellations at $path before any RPC or API call",
    async ({ cancellations, path }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      await expect(
        prepareMidnightSupplyBlueMakeLend(client, {
          ...params,
          cancellations,
          validation: { fetch },
        } as unknown as MidnightSupplyBlueMakeLendPlanParams),
      ).rejects.toMatchObject({
        constructor: InvalidTransactionPlanError,
        path,
      });
      expect(request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("[INV-05] rejects a wrong transport chain on a client configured for Base", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValue("0x1");
    await expect(
      prepareMidnightSupplyBlueMakeLend(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test.each(["blue", "midnightBlueBuyCallbackFactory"] as const)(
    "requires deployment code for %s before prerequisite reads",
    async (role) => {
      const { client, request } = createMockClient(base);
      const defaultRequest = request.getMockImplementation();
      assert(defaultRequest);
      request.mockImplementation(async (args) =>
        args.method === "eth_getCode" &&
        args.params?.[0] === getChainAddress(chainId, role)
          ? "0x"
          : defaultRequest(args),
      );
      await expect(
        prepareMidnightSupplyBlueMakeLend(client, params),
      ).rejects.toBeInstanceOf(MissingContractCodeError);
      expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
        "eth_call",
      );
    },
  );

  test("rejects another maker before any read or API admission", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    vi.mocked(fetchMarket).mockImplementation(() => new Promise(() => {}));
    await expect(
      prepareMidnightSupplyBlueMakeLend(client, {
        ...params,
        offers: priceTree(
          Offer.create({ ...offer, maker: midnightAddresses.taker }),
        ),
        validation: { fetch },
      }),
    ).rejects.toBeInstanceOf(MidnightOfferMakerMismatchError);
    expect(request).not.toHaveBeenCalled();
    expect(fetchMarket).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: rejects a decimal-string Blue market LLTV before any read or API admission", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    const lltv = blueMarket.lltv.toString() as unknown as bigint;
    await expect(
      prepareMidnightSupplyBlueMakeLend(client, {
        ...params,
        blueMarket: { ...blueMarket, lltv },
        validation: { fetch },
      }),
    ).rejects.toMatchObject({
      name: "InvalidBigIntInputError",
      field: "blueMarket.lltv",
      value: blueMarket.lltv.toString(),
    });
    expect(request).not.toHaveBeenCalled();
    expect(fetchMarket).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe.sequential("prepareMidnightSupplyBlueMakeLend with publication and Blue state", () => {
  afterEach(() => vi.clearAllMocks());

  const bundle = getChainAddress(chainId, "midnightBundlesV2");
  const { wNative } = getChainAddresses(chainId);
  assert(wNative);
  const wNativeBlueMarket = { ...blueMarket, loanToken: wNative };
  const maturity = 1_767_279_600n;
  const payloadParams = {
    ...params,
    validation: false,
    offers: priceTree(
      Offer.create({
        ...offer,
        market: new MarketParams({ ...midnightMarket, maturity }),
      }),
    ),
  } satisfies MidnightSupplyBlueMakeLendPlanParams;
  const wNativeParams = {
    ...params,
    validation: false,
    blueMarket: wNativeBlueMarket,
    offers: priceTree(
      Offer.create({
        ...offer,
        market: new MarketParams({
          ...midnightMarket,
          loanToken: wNative,
          maturity,
        }),
        callbackData: getMidnightBlueBuyCallbackData(wNativeBlueMarket),
      }),
    ),
    nativeAmount: 50n,
  } satisfies MidnightSupplyBlueMakeLendPlanParams;
  const mockBlueMarket = (
    market: typeof blueMarket,
    { totalSupplyAssets = 1_000n, totalSupplyShares = 1_000_000n } = {},
  ) =>
    vi.mocked(fetchMarket).mockResolvedValue(
      new BlueMarket({
        params: new BlueMarketParams(market),
        totalSupplyAssets,
        totalSupplyShares,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        lastUpdate: 1000n,
        fee: 0n,
      }),
    );

  test.for([
    {
      allowance: 99n,
      isAuthorized: false,
      steps: [
        "erc20Approval",
        "midnightAuthorization",
        "midnightSupplyBlueMakeLend",
      ],
    },
    {
      allowance: 100n,
      isAuthorized: true,
      steps: ["midnightSupplyBlueMakeLend"],
    },
  ])(
    "[INV-06] checks the full parking allowance to MidnightBundlesV2 even with native funding ($allowance)",
    async ({ allowance, isAuthorized, steps }) => {
      const handle = createMockClient(base);
      mockRead(handle, {
        address: wNative,
        abi: erc20Abi,
        functionName: "allowance",
        result: allowance,
      });
      mockRead(handle, {
        address: getChainAddress(chainId, "midnight"),
        abi: midnightAbi,
        functionName: "isAuthorized",
        result: isAuthorized,
      });
      mockBlueMarket(wNativeBlueMarket);

      const plan = await prepareMidnightSupplyBlueMakeLend(
        handle.client,
        wNativeParams,
      );

      expect(plan.steps.map(({ action }) => action.type)).toEqual(steps);
      expect(handle.request.mock.calls.map(([args]) => args.method)).toEqual([
        "eth_chainId",
        ...Array(5).fill("eth_getCode"),
        "eth_call",
        "eth_call",
      ]);
      expect(
        expectReadCall(handle, {
          address: wNative,
          abi: erc20Abi,
          functionName: "allowance",
        }).map(({ args }) => args),
      ).toEqual([[account, bundle]]);
      const transactions = buildTransactions(plan);
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      expect(buildTransactions(restored)).toEqual(transactions);
      const publication = transactions.at(-1);
      expect(publication).toMatchObject({ to: bundle, value: 50n });
      if (steps.length === 1) return;
      const [approval] = transactions;
      expect(approval?.to).toBe(wNative);
      expect(
        decodeFunctionData({ abi: erc20Abi, data: approval?.data ?? "0x" })
          .args,
      ).toEqual([bundle, maxUint256]);
    },
  );

  test("behavior: stores the Blue market preparation validated, not later caller changes", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: blueMarket.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    mockRead(handle, {
      address: getChainAddress(chainId, "midnight"),
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: true,
    });
    mockBlueMarket(blueMarket);
    const defaultRequest = handle.request.getMockImplementation();
    assert(defaultRequest);
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    const { promise: requested, resolve: markRequested } =
      Promise.withResolvers<void>();
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_chainId") {
        markRequested();
        await held;
      }
      return defaultRequest(args);
    });
    const callerMarket = { ...blueMarket };
    const preparation = prepareMidnightSupplyBlueMakeLend(handle.client, {
      ...payloadParams,
      blueMarket: callerMarket,
    });
    await requested;
    callerMarket.collateralToken = midnightAddresses.secondCollateralToken;
    callerMarket.lltv = 860_000_000_000_000_000n;
    release();
    const plan = await preparation;

    const action = plan.steps.at(-1)?.action;
    assert(action?.type === "midnightSupplyBlueMakeLend");
    expect(action.inputs.blueSupply.market).toEqual(blueMarket);
  });

  test("reads the Blue market at the pinned publication block, after the offer-state reads", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: blueMarket.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    mockRead(handle, {
      address: getChainAddress(chainId, "midnight"),
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: true,
    });
    mockBlueMarket(blueMarket);

    await prepareMidnightSupplyBlueMakeLend(handle.client, payloadParams);

    expect(fetchMarket).toHaveBeenCalledExactlyOnceWith(
      BlueMarketUtils.getMarketId(blueMarket),
      handle.client,
      { blockNumber: 4_321n, deployless: undefined },
    );
    expect(
      vi.mocked(fetchMidnightMakerOfferStatesBeforeDeadline).mock
        .invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(fetchMarket).mock.invocationCallOrder[0] ?? 0);
  });

  test("error: rejects an invalid offer state before reading the Blue market", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    const error = new MidnightOfferGroupConsumedError({
      index: 0,
      group: offer.group,
      consumed: offer.maxUnits,
    });
    vi.mocked(validateMidnightMakerOfferStates).mockImplementationOnce(() => {
      throw error;
    });
    await expect(
      prepareMidnightSupplyBlueMakeLend(client, {
        ...payloadParams,
        validation: { fetch },
      }),
    ).rejects.toBe(error);
    expect(validateMidnightMakerOfferStates).toHaveBeenCalledOnce();
    expect(fetchMarket).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
  });

  test("error: an offer expired by now but live at the pinned block throws ExpiredDeadlineError before the Blue market, API and prerequisite reads", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    mockBlueMarket(blueMarket);
    const [entry] = payloadParams.offers.entries;
    assert(entry);
    await expect(
      prepareMidnightSupplyBlueMakeLend(client, {
        ...payloadParams,
        offers: priceTree(
          Offer.create({ ...entry.offer, start: 900n, expiry: 999n }),
        ),
        validation: { fetch },
      }),
    ).rejects.toMatchObject({
      constructor: ExpiredDeadlineError,
      deadline: 998n,
    });
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
    expect(fetchMarket).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
  });

  test("error: rejects a deadline reached at the pinned block with the real reader before contract reads", async () => {
    const { client, request } = createMockClient(base);
    request.mockImplementation(async ({ method, params: rpcParams }) => {
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_getCode") return "0x01";
      if (method === "eth_blockNumber") return "0x1";
      if (method === "eth_getBlockByNumber") {
        return (rpcParams as [string, boolean])[0] === "0x1"
          ? { number: "0x1", timestamp: "0x707" }
          : { number: "0x2", timestamp: "0x63f" };
      }
      throw new Error(`unexpected ${method}`);
    });
    const actual = await vi.importActual<
      typeof import("./publicationState.js")
    >("./publicationState.js");
    vi.mocked(
      fetchMidnightMakerOfferStatesBeforeDeadline,
    ).mockImplementationOnce(
      actual.fetchMidnightMakerOfferStatesBeforeDeadline,
    );
    const fetch = vi.fn();
    await expect(
      prepareMidnightSupplyBlueMakeLend(client, {
        ...payloadParams,
        validation: { fetch },
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
  });

  test("error: rejects parking that buys shares before accrual but none at the pinned block", async () => {
    const { client, request } = createMockClient(base);
    const market = new BlueMarket({
      params: new BlueMarketParams(blueMarket),
      totalSupplyAssets: 100_000_000n,
      totalSupplyShares: 1n,
      totalBorrowAssets: 100_000_000n,
      totalBorrowShares: 100_000_000n,
      lastUpdate: 1000n,
      fee: 0n,
      rateAtTarget: 10_000_000_000n,
    });
    expect(market.toSupplyShares(100n, "Down")).toBeGreaterThan(0n);
    expect(market.accrueInterest(1_700n).toSupplyShares(100n, "Down")).toBe(0n);
    vi.mocked(fetchMarket).mockResolvedValue(market);
    vi.mocked(
      fetchMidnightMakerOfferStatesBeforeDeadline,
    ).mockImplementationOnce(async (_params, chainCheck) => {
      await chainCheck();
      return { states: [], now: 1_700n, blockNumber: 4_321n };
    });
    await expect(
      prepareMidnightSupplyBlueMakeLend(client, payloadParams),
    ).rejects.toBeInstanceOf(ZeroBlueParkingSharesError);
    expect(
      request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
  });

  test("accrues the Blue parking market to the pinned block timestamp, not the reference time", async () => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: blueMarket.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    mockRead(handle, {
      address: getChainAddress(chainId, "midnight"),
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: true,
    });
    mockBlueMarket(blueMarket);
    vi.mocked(
      fetchMidnightMakerOfferStatesBeforeDeadline,
    ).mockImplementationOnce(async (_params, chainCheck) => {
      await chainCheck();
      return { states: [], now: 1_700n, blockNumber: 4_321n };
    });
    const accrueInterest = vi.spyOn(BlueMarket.prototype, "accrueInterest");
    const plan = await prepareMidnightSupplyBlueMakeLend(
      handle.client,
      payloadParams,
    );
    expect(plan.steps.at(-1)?.action.type).toBe("midnightSupplyBlueMakeLend");
    expect(accrueInterest).toHaveBeenCalledExactlyOnceWith(1_700n);
    accrueInterest.mockRestore();
  });

  test.each([
    { error: EmptyBlueParkingMarketError, totalSupplyShares: 0n },
    {
      error: ZeroBlueParkingSharesError,
      totalSupplyAssets: 10n ** 18n,
      totalSupplyShares: 1n,
    },
  ])(
    "error: rejects $error.name from the Blue market state before the mempool API and prerequisite reads",
    async ({ error, ...state }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      mockBlueMarket(blueMarket, state);
      await expect(
        prepareMidnightSupplyBlueMakeLend(client, {
          ...payloadParams,
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(error);
      expect(fetch).not.toHaveBeenCalled();
      expect(
        request.mock.calls.some(([args]) => args.method === "eth_call"),
      ).toBe(false);
    },
  );
});
