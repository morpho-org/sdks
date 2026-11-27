import {
  InvalidTreeError,
  midnightAbi,
  Offer,
  Payload,
  PriceRatifierV1,
  RateRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { concatHex, type Hex, maxUint128, padHex, zeroHash } from "viem";
import { base, mainnet } from "viem/chains";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { validateMidnightMakerOfferStates } from "../../entities/midnight/publication.js";
import {
  InvalidMidnightRateRatifierV1RateError,
  InvalidMidnightRateRatifierV1TickError,
  MidnightMempoolValidationError,
} from "../../errors.js";
import {
  buildTransactions,
  ChainIdMismatchError,
  DuplicateMidnightGroupCancellationError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidMidnightHexInputError,
  InvalidTransactionPlanError,
  type MidnightMakeBorrowPlanParams,
  MidnightOfferExpiredError,
  MidnightReplacementGroupCancelledError,
  MissingContractCodeError,
  NegativeInputError,
  parseTransactionPlan,
  prepareMidnightMakeBorrow,
} from "../../index.js";
import { fetchMidnightMakerOfferStatesBeforeDeadline } from "./publicationState.js";

vi.mock("./publicationState.js", () => ({
  fetchMidnightMakerOfferStatesBeforeDeadline: vi.fn(
    async (_params: unknown, chainCheck: () => Promise<void>) => {
      await chainCheck();
      return { states: [], now: 0n };
    },
  ),
}));
vi.mock("../../entities/midnight/publication.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../entities/midnight/publication.js")
  >()),
  validateMidnightMakerOfferStates: vi.fn(),
}));

const saved = `{
  "version": 2,
  "chainId": 8453,
  "account": "0x000000000000000000000000000000000000A000",
  "expiresAt": 1600,
  "steps": [
    {
      "id": "midnightAuthorization",
      "label": "Authorize Midnight bundle",
      "action": {
        "type": "midnightAuthorization",
        "inputs": {
          "chainId": 8453,
          "account": "0x000000000000000000000000000000000000A000"
        }
      }
    },
    {
      "id": "midnightMakeBorrow",
      "label": "Publish Midnight borrow offers",
      "action": {
        "type": "midnightMakeBorrow",
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
            "maxConsumed": { "$bigint": "42" }
          }],
          "deadline": { "$bigint": "1600" }
        }
      }
    }
  ],
  "signatureRequests": []
}`;

describe("stored format-2 midnightMakeBorrow", () => {
  test("builds fixed transaction bytes without decoding the opaque payload", () => {
    const word = (value: Hex) => padHex(value, { size: 32 });
    const makerCalldata = concatHex([
      "0xb4691380",
      ...Array<Hex>(7).fill(zeroHash),
      word("0x02a0"),
      word("0x03c0"),
      "0x00000000000000000000000008a0e69772315652165921d722b3caaea4c326e6",
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      ...Array<Hex>(6).fill(zeroHash),
      word("0x03e0"),
      word("0x0440"),
      word("0x0640"),
      ...Array<Hex>(4).fill(zeroHash),
      word("0x0100"),
      ...Array<Hex>(6).fill(zeroHash),
      word("0x01"),
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      word("0x2a"), // cancellation maxConsumed
      word("0x02"),
      padHex("0xabcd", { size: 32, dir: "right" }),
    ]);
    const txs = buildTransactions(parseTransactionPlan(saved));
    expect(txs.map(({ to, data, value }) => ({ to, data, value }))).toEqual([
      {
        to: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        value: 0n,
        data: "0xb78212ab0000000000000000000000000bf30b530f816a619c3f28a3b9f44c441122555d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000a000",
      },
      {
        to: "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        value: 0n,
        data: makerCalldata,
      },
    ]);
    const withUnknownFields = saved.replace(
      '"payload": "0xabcd"',
      '"payload": "0xabcd", "nativeAmount": { "$bigint": "1" }, "rootSignature": {"v": 27}, "collateral": {}',
    );
    expect(buildTransactions(parseTransactionPlan(withUnknownFields))).toEqual(
      txs,
    );
  });

  test.each([
    ['"priceV1"', '"rateV1"'],
    ['"priceV1"', '"setter"'],
    ['"0xabcd"', '"0x"'],
    ['"0xabcd"', '"0xabc"'],
    [
      '"0x1111111111111111111111111111111111111111111111111111111111111111"',
      `"${zeroHash}"`,
    ],
    [
      '"0x3333333333333333333333333333333333333333333333333333333333333333"',
      '"0x2222222222222222222222222222222222222222222222222222222222222222"',
    ],
    [
      '"maxConsumed": { "$bigint": "42" }',
      '"maxConsumed": { "$bigint": "340282366920938463463374607431768211456" }',
    ],
    ['"deadline": { "$bigint": "1600" }', '"deadline": 1600'],
    [
      '"type": "midnightMakeBorrow"',
      '"type": "midnightMakeBorrow", "signatureRequestIds": {}',
    ],
  ])("rejects saved recipe replacing %s with %s", (original, replacement) => {
    expect(() =>
      parseTransactionPlan(saved.replace(original, replacement)),
    ).toThrow(InvalidTransactionPlanError);
  });
});

const params = {
  chainId: base.id,
  account: midnightAddresses.maker,
  now: 1000n,
  offers: {
    type: "priceV1",
    entries: [
      {
        offer: Offer.create({
          market: { ...midnightMarket, maturity: 1_767_279_600n },
          maker: midnightAddresses.maker,
          buy: false,
          start: 1000n,
          expiry: 1800n,
          tick: 5000n,
          ratifier: getChainAddress(base.id, "priceRatifierV1"),
          maxUnits: 100n,
        }),
      },
    ],
  },
  validation: false,
} satisfies MidnightMakeBorrowPlanParams;

describe.sequential("prepareMidnightMakeBorrow", () => {
  afterEach(() => vi.clearAllMocks());

  const mockAuthorization = (isAuthorized: boolean) => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: getChainAddress(base.id, "midnight"),
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: isAuthorized,
    });
    return handle;
  };

  test("default", async () => {
    const handle = mockAuthorization(false);
    const group = padHex("0x33", { size: 32 });
    const plan = await prepareMidnightMakeBorrow(handle.client, {
      ...params,
      cancellations: [{ group, maxConsumed: 42n }],
    });
    const tree = Tree.from(params.offers);
    expect(plan).toEqual({
      version: 2,
      chainId: base.id,
      account: midnightAddresses.maker,
      expiresAt: 1799,
      steps: [
        {
          id: "midnightAuthorization",
          label: "Authorize Midnight bundle",
          action: {
            type: "midnightAuthorization",
            inputs: { chainId: base.id, account: midnightAddresses.maker },
          },
        },
        {
          id: "midnightMakeBorrow",
          label: "Publish Midnight borrow offers",
          action: {
            type: "midnightMakeBorrow",
            inputs: {
              chainId: base.id,
              account: midnightAddresses.maker,
              deadline: 1799n,
              cancellations: [{ group, maxConsumed: 42n }],
              root: tree.root,
              ratifierType: "priceV1",
              ratifier: getChainAddress(base.id, "priceRatifierV1"),
              groups: tree.offers.map((offer) => offer.group),
              payload: await Payload.encode(PriceRatifierV1.ratify({ tree })),
            },
          },
        },
      ],
      signatureRequests: [],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(handle.request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
      "eth_call",
    ]);
  });

  test("behavior: omits the bundle authorization once granted", async () => {
    const { client } = mockAuthorization(true);
    const plan = await prepareMidnightMakeBorrow(client, params);
    expect(plan.steps.map(({ id }) => id)).toEqual(["midnightMakeBorrow"]);
  });

  test("error: an omitted validation runs the default mempool API check before the authorization read", async () => {
    const handle = mockAuthorization(false);
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { issues: [{ rule: "offer_count" }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const { validation: _, ...withoutValidation } = params;
    try {
      await expect(
        prepareMidnightMakeBorrow(handle.client, withoutValidation),
      ).rejects.toBeInstanceOf(MidnightMempoolValidationError);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(handle.request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
    ]);
  });

  test.each([1800, 1801])(
    "error: rejects explicit expiry %i at or after the first offer expiry",
    async (expiresAt) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightMakeBorrow(client, { ...params, expiresAt }),
      ).rejects.toBeInstanceOf(InputExceedsMaxError);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: rejects an explicit deadline reached at the pinned block before contract reads", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_blockNumber") return "0x1";
      if (args.method === "eth_getBlockByNumber") {
        return { number: "0x1", timestamp: "0x4b0" };
      }
      return defaultRequest(args);
    });
    const actual = await vi.importActual<
      typeof import("./publicationState.js")
    >("./publicationState.js");
    vi.mocked(
      fetchMidnightMakerOfferStatesBeforeDeadline,
    ).mockImplementationOnce(
      actual.fetchMidnightMakerOfferStatesBeforeDeadline,
    );
    await expect(
      prepareMidnightMakeBorrow(client, { ...params, expiresAt: 1200 }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(
      request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
  });

  test("error: rejects a deadline capped at or before now before RPC or API validation", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    const [entry] = params.offers.entries;
    assert(entry);
    await expect(
      prepareMidnightMakeBorrow(client, {
        ...params,
        offers: {
          type: "priceV1",
          entries: [{ offer: Offer.create({ ...entry.offer, expiry: 1001n }) }],
        },
        validation: { fetch },
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(request).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: InvalidBigIntInputError for a decimal string now without expiresAt before RPC", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    await expect(
      prepareMidnightMakeBorrow(client, {
        ...params,
        now: "1000" as unknown as bigint,
        validation: { fetch },
      }),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    {
      error: MidnightReplacementGroupCancelledError,
      cancellations: [
        { group: Tree.from(params.offers).offers[0]?.group, maxConsumed: 0n },
      ],
    },
    {
      error: InvalidMidnightHexInputError,
      cancellations: [{ group: "0x1234", maxConsumed: 0n }],
    },
    {
      error: InvalidMidnightHexInputError,
      cancellations: [{ group: null, maxConsumed: 0n }],
    },
    {
      error: DuplicateMidnightGroupCancellationError,
      cancellations: [
        { group: padHex("0xab", { size: 32 }), maxConsumed: 0n },
        { group: padHex("0xAB", { size: 32 }), maxConsumed: 0n },
      ],
    },
    {
      error: NegativeInputError,
      cancellations: [{ group: zeroHash, maxConsumed: -1n }],
    },
    {
      error: InputExceedsMaxError,
      cancellations: [{ group: zeroHash, maxConsumed: maxUint128 + 1n }],
    },
    {
      error: InvalidTransactionPlanError,
      cancellations: [null],
      details: { path: "$.cancellations[0]", reason: "expected an object" },
    },
    {
      error: InvalidTransactionPlanError,
      cancellations: [{ group: zeroHash, maxConsumed: 0n }, "0x"],
      details: { path: "$.cancellations[1]", reason: "expected an object" },
    },
    {
      error: InvalidTransactionPlanError,
      cancellations: Object.assign(new Array(2), {
        1: { group: zeroHash, maxConsumed: 0n },
      }),
      details: { path: "$.cancellations[0]", reason: "expected an object" },
    },
    {
      error: InvalidTransactionPlanError,
      cancellations: "0x",
      details: { path: "$.cancellations", reason: "expected array" },
    },
    {
      error: InvalidTransactionPlanError,
      cancellations: { group: zeroHash, maxConsumed: 0n },
      details: { path: "$.cancellations", reason: "expected array" },
    },
  ])(
    "error: rejects cancellations with $error.name before any RPC or API call",
    async ({ error, cancellations, details = {} }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      const prepared = prepareMidnightMakeBorrow(client, {
        ...params,
        cancellations:
          cancellations as unknown as MidnightMakeBorrowPlanParams["cancellations"],
        validation: { fetch },
      });
      await expect(prepared).rejects.toBeInstanceOf(error);
      await expect(prepared).rejects.toMatchObject(details);
      expect(request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(
        fetchMidnightMakerOfferStatesBeforeDeadline,
      ).not.toHaveBeenCalled();
    },
  );

  test.each([42, -1])(
    "error: rejects a non-bigint cancellation ceiling %i before any request",
    async (maxConsumed) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      await expect(
        prepareMidnightMakeBorrow(client, {
          ...params,
          cancellations: [
            { group: zeroHash, maxConsumed: maxConsumed as unknown as bigint },
          ],
          validation: { fetch },
        }),
      ).rejects.toMatchObject({
        constructor: InvalidBigIntInputError,
        field: "cancellations[0].maxConsumed",
      });
      expect(request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("error: an offer expired by now but live at the pinned block throws ExpiredDeadlineError without API validation", async () => {
    const { client } = createMockClient(base);
    const fetch = vi.fn();
    const [entry] = params.offers.entries;
    assert(entry);
    await expect(
      prepareMidnightMakeBorrow(client, {
        ...params,
        offers: {
          type: "priceV1",
          entries: [
            {
              offer: Offer.create({
                ...entry.offer,
                start: 900n,
                expiry: 999n,
              }),
            },
          ],
        },
        validation: { fetch },
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: ExpiredDeadlineError for an offer expired by now wins over a payload encoding failure", async () => {
    const { client } = createMockClient(base);
    const [entry] = params.offers.entries;
    assert(entry);
    const ratify = vi.spyOn(PriceRatifierV1, "ratify");
    const encode = vi
      .spyOn(Payload, "encode")
      .mockRejectedValue(new Error("payload too large"));
    try {
      await expect(
        prepareMidnightMakeBorrow(client, {
          ...params,
          offers: {
            type: "priceV1",
            entries: [
              {
                offer: Offer.create({
                  ...entry.offer,
                  start: 900n,
                  expiry: 999n,
                }),
              },
            ],
          },
        }),
      ).rejects.toMatchObject({
        constructor: ExpiredDeadlineError,
        deadline: 998n,
      });
      expect(
        fetchMidnightMakerOfferStatesBeforeDeadline,
      ).toHaveBeenCalledOnce();
      expect(ratify).not.toHaveBeenCalled();
      expect(encode).not.toHaveBeenCalled();
    } finally {
      ratify.mockRestore();
      encode.mockRestore();
    }
  });

  test("error: rechecks the deadline at the timestamp the offers were validated at", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    vi.mocked(
      fetchMidnightMakerOfferStatesBeforeDeadline,
    ).mockImplementationOnce(async (_params, chainCheck) => {
      await chainCheck();
      return { states: [], now: 1799n, blockNumber: 1n };
    });
    await expect(
      prepareMidnightMakeBorrow(client, { ...params, validation: { fetch } }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      request.mock.calls.some(([args]) => args.method === "eth_call"),
    ).toBe(false);
  });

  test("behavior: stores the cancellations validated before state reads", async () => {
    const { client } = mockAuthorization(true);
    const validated = { group: padHex("0xab", { size: 32 }), maxConsumed: 0n };
    const cancellations = [validated];
    vi.mocked(
      fetchMidnightMakerOfferStatesBeforeDeadline,
    ).mockImplementationOnce(async (_params, chainCheck) => {
      await chainCheck();
      cancellations.splice(0, 1, {
        group: padHex("0xcd", { size: 32 }),
        maxConsumed: 1n,
      });
      return { states: [], now: 0n, blockNumber: 0n };
    });
    const plan = await prepareMidnightMakeBorrow(client, {
      ...params,
      cancellations,
    });
    const step = plan.steps.at(-1);
    assert(step?.action.type === "midnightMakeBorrow");
    expect(step.action.inputs.cancellations).toEqual([validated]);
  });

  test.each([{ expiresAt: undefined }, { expiresAt: 1500 }])(
    "error: reports an offer expired at the pinned block as MidnightOfferExpiredError, as entity makeBorrow does (expiresAt $expiresAt)",
    async ({ expiresAt }) => {
      const { client } = createMockClient(base);
      const [entry] = params.offers.entries;
      assert(entry);
      vi.mocked(
        fetchMidnightMakerOfferStatesBeforeDeadline,
      ).mockImplementationOnce(async (_params, chainCheck) => {
        await chainCheck();
        return {
          states: [{ market: { id: zeroHash } }] as never,
          now: 1000n,
          blockNumber: 1n,
        };
      });
      const { validateMidnightMakerOfferStates: validateStates } =
        await vi.importActual<
          typeof import("../../entities/midnight/publication.js")
        >("../../entities/midnight/publication.js");
      vi.mocked(validateMidnightMakerOfferStates).mockImplementationOnce(
        validateStates,
      );
      await expect(
        prepareMidnightMakeBorrow(client, {
          ...params,
          ...(expiresAt !== undefined && { expiresAt }),
          offers: {
            type: "priceV1",
            entries: [
              {
                offer: Offer.create({
                  ...entry.offer,
                  start: 900n,
                  expiry: 999n,
                }),
              },
            ],
          },
        }),
      ).rejects.toBeInstanceOf(MidnightOfferExpiredError);
      expect(
        fetchMidnightMakerOfferStatesBeforeDeadline,
      ).toHaveBeenCalledOnce();
    },
  );

  test.each([
    {
      error: InvalidMidnightRateRatifierV1RateError,
      rate: -1n,
      tick: RateRatifierV1.MIN_TICK,
    },
    {
      error: InvalidMidnightRateRatifierV1TickError,
      rate: 0n,
      tick: 0n,
    },
  ])(
    "error: rejects raw Rate V1 requests with $error.name",
    async ({ error, rate, tick }) => {
      const { client, request } = createMockClient(base);
      const [entry] = params.offers.entries;
      assert(entry);
      const offer = Offer.create({
        ...entry.offer,
        ratifier: getChainAddress(base.id, "rateRatifierV1"),
        tick,
      });
      await expect(
        prepareMidnightMakeBorrow(client, {
          ...params,
          offers: { type: "rateV1", entries: [{ offer, rate }] },
        }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: [INV-05] rejects a mismatched configured or RPC chain before reads", async () => {
    const configured = createMockClient(mainnet);
    await expect(
      prepareMidnightMakeBorrow(configured.client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(configured.request).not.toHaveBeenCalled();

    const transported = createMockClient(base);
    transported.request.mockResolvedValue("0x1");
    await expect(
      prepareMidnightMakeBorrow(transported.client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(transported.request.mock.calls.map(([args]) => args.method)).toEqual(
      ["eth_chainId"],
    );
  });

  test("error: checks the selected ratifier deployment before publication-state reads", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) =>
      args.method === "eth_getCode" &&
      args.params?.[0] === params.offers.entries[0]?.offer.ratifier
        ? "0x"
        : defaultRequest(args),
    );
    const error = await prepareMidnightMakeBorrow(client, params).catch(
      (cause: unknown) => cause,
    );
    assert(error instanceof MissingContractCodeError);
    expect(error.role).toBe("priceRatifierV1");
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
    ]);
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
  });

  test("error: rejects an empty tree request", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightMakeBorrow(client, {
        ...params,
        offers: { type: "priceV1", entries: [] },
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);
    expect(request).not.toHaveBeenCalled();
  });
});
