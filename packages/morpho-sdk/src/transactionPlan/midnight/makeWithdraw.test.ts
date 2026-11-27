import {
  InvalidTreeError,
  MidnightMempoolValidationError,
  midnightAbi,
  Offer,
  Payload,
  PriceRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { concatHex, type Hex, padHex, zeroHash } from "viem";
import { base } from "viem/chains";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import {
  buildTransactions,
  ChainIdMismatchError,
  InputExceedsMaxError,
  InvalidMidnightHexInputError,
  InvalidTransactionPlanError,
  type MidnightMakeWithdrawPlanParams,
  MidnightOfferNotReduceOnlyError,
  MidnightOfferSideMismatchError,
  MidnightReplacementGroupCancelledError,
  MissingContractCodeError,
  parseTransactionPlan,
  prepareMidnightMakeWithdraw,
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
  "expiresAt": 1601,
  "steps": [{
    "id": "midnightMakeWithdraw",
    "label": "Publish Midnight withdrawal offers",
    "action": {
      "type": "midnightMakeWithdraw",
      "inputs": {
        "chainId": 8453,
        "account": "0x000000000000000000000000000000000000A000",
        "ratifierType": "priceV1",
        "ratifier": "0x08a0e69772315652165921D722B3caAea4C326e6",
        "root": "0x1111111111111111111111111111111111111111111111111111111111111111",
        "groups": ["0x2222222222222222222222222222222222222222222222222222222222222222"],
        "payload": "0xcafe",
        "cancellations": [{
          "group": "0x3333333333333333333333333333333333333333333333333333333333333333",
          "maxConsumed": { "$bigint": "43" }
        }],
        "deadline": { "$bigint": "1601" }
      }
    }
  }],
  "signatureRequests": []
}`;

describe("stored format-2 midnightMakeWithdraw", () => {
  test("builds fixed cancel-and-publish bytes from the opaque saved recipe", () => {
    const word = (value: Hex) => padHex(value, { size: 32 });
    const calldata = concatHex([
      "0xb4691380",
      ...Array<Hex>(7).fill(zeroHash),
      word("0x02a0"),
      word("0x03c0"),
      "0x00000000000000000000000008a0e69772315652165921d722b3caaea4c326e6",
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      ...Array<Hex>(6).fill(zeroHash),
      word("0x03e0"),
      word("0x0440"),
      word("0x0641"), // deadline
      ...Array<Hex>(4).fill(zeroHash),
      word("0x0100"),
      ...Array<Hex>(6).fill(zeroHash),
      word("0x01"),
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      word("0x2b"), // cancellation maxConsumed
      word("0x02"),
      padHex("0xcafe", { size: 32, dir: "right" }),
    ]);
    const transactions = buildTransactions(parseTransactionPlan(saved));
    expect(
      transactions.map(({ to, data, value }) => ({ to, data, value })),
    ).toEqual([
      {
        to: "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        value: 0n,
        data: calldata,
      },
    ]);
  });

  test.each([
    ['"priceV1"', '"rateV1"'],
    ['"0xcafe"', '"0x"'],
    ['"0xcafe"', '"0x1"'],
    [
      '"0x3333333333333333333333333333333333333333333333333333333333333333"',
      '"0x2222222222222222222222222222222222222222222222222222222222222222"',
    ],
    ['"deadline": { "$bigint": "1601" }', '"deadline": 1601'],
    [
      '"type": "midnightMakeWithdraw"',
      '"type": "midnightMakeWithdraw", "signatureRequestIds": {}',
    ],
  ])("rejects saved recipe replacing %s with %s", (original, replacement) => {
    expect(() =>
      parseTransactionPlan(saved.replace(original, replacement)),
    ).toThrow(InvalidTransactionPlanError);
  });
});

const terms = {
  market: { ...midnightMarket, maturity: 1_767_279_600n },
  maker: midnightAddresses.maker,
  buy: false,
  reduceOnly: true,
  start: 1000n,
  expiry: 1800n,
  tick: 5000n,
  ratifier: getChainAddress(base.id, "priceRatifierV1"),
  maxUnits: 100n,
};
const params = {
  chainId: base.id,
  account: terms.maker,
  now: 1000n,
  offers: { type: "priceV1", entries: [{ offer: Offer.create(terms) }] },
  validation: false,
} satisfies MidnightMakeWithdrawPlanParams;

describe.sequential("prepareMidnightMakeWithdraw", () => {
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
    const plan = await prepareMidnightMakeWithdraw(handle.client, {
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
          id: "midnightMakeWithdraw",
          label: "Publish Midnight withdrawal offers",
          action: {
            type: "midnightMakeWithdraw",
            inputs: {
              chainId: base.id,
              account: midnightAddresses.maker,
              deadline: 1799n,
              cancellations: [{ group, maxConsumed: 42n }],
              root: tree.root,
              ratifierType: "priceV1",
              ratifier: getChainAddress(base.id, "priceRatifierV1"),
              groups: tree.offers.map((leaf) => leaf.group),
              payload: await Payload.encode(PriceRatifierV1.ratify({ tree })),
            },
          },
        },
      ],
      signatureRequests: [],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
    expect(handle.request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
      "eth_call",
    ]);
  });

  test("behavior: reuses a granted bundle authorization", async () => {
    const { client } = mockAuthorization(true);
    const plan = await prepareMidnightMakeWithdraw(client, params);
    expect(plan.steps.map(({ id }) => id)).toEqual(["midnightMakeWithdraw"]);
  });

  test.each([
    { overrides: { buy: true }, error: MidnightOfferSideMismatchError },
    {
      overrides: { reduceOnly: false },
      error: MidnightOfferNotReduceOnlyError,
    },
  ])(
    "rejects $error.name before RPC or API validation",
    async ({ overrides, error }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      await expect(
        prepareMidnightMakeWithdraw(client, {
          ...params,
          offers: {
            type: "priceV1",
            entries: [{ offer: Offer.create({ ...terms, ...overrides }) }],
          },
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("error: a mempool API rejection stops preparation before the authorization read", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { issues: [{ rule: "offer_count" }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    await expect(
      prepareMidnightMakeWithdraw(client, { ...params, validation: { fetch } }),
    ).rejects.toMatchObject({
      constructor: MidnightMempoolValidationError,
      issues: [{ rule: "offer_count" }],
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
      "eth_call",
    );
  });

  test("rejects an empty tree request", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightMakeWithdraw(client, {
        ...params,
        offers: { type: "priceV1", entries: [] },
      }),
    ).rejects.toBeInstanceOf(InvalidTreeError);
    expect(request).not.toHaveBeenCalled();
  });

  test.each([1800, 1801])(
    "rejects expiry %i at or after offer expiry",
    async (expiresAt) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightMakeWithdraw(client, { ...params, expiresAt }),
      ).rejects.toBeInstanceOf(InputExceedsMaxError);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("validates cancellation shape before comparison and rejects overlap before API validation", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    const offers = Tree.from(params.offers);
    const [offer] = offers.offers;
    assert(offer);
    await expect(
      prepareMidnightMakeWithdraw(client, {
        ...params,
        offers,
        cancellations: [
          { group: offer.group, maxConsumed: 0n },
          { group: "0x01", maxConsumed: 0n },
        ],
        validation: { fetch },
      }),
    ).rejects.toBeInstanceOf(InvalidMidnightHexInputError);
    await expect(
      prepareMidnightMakeWithdraw(client, {
        ...params,
        offers,
        cancellations: [{ group: offer.group, maxConsumed: 0n }],
        validation: { fetch },
      }),
    ).rejects.toBeInstanceOf(MidnightReplacementGroupCancelledError);
    expect(request).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("[INV-05] rejects a wrong transport chain even when the client declares Base", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValue("0x1");
    await expect(
      prepareMidnightMakeWithdraw(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("checks deployment code before reading offer state or authorization", async () => {
    const { client, request } = createMockClient(base);
    const rpc = request.getMockImplementation();
    assert(rpc);
    request.mockImplementation(async (args) =>
      args.method === "eth_getCode" && args.params?.[0] === terms.ratifier
        ? "0x"
        : rpc(args),
    );
    await expect(
      prepareMidnightMakeWithdraw(client, params),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
    ]);
  });
});
