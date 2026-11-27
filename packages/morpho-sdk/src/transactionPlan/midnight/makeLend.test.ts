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
import {
  concatHex,
  erc20Abi,
  type Hex,
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
  buildTransactions,
  ChainIdMismatchError,
  DuplicateMidnightGroupCancellationError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidMidnightHexInputError,
  InvalidTransactionPlanError,
  type MidnightMakeLendPlanParams,
  MidnightOfferExpiredError,
  MidnightOfferMarketLoanTokenMismatchError,
  MidnightOfferReduceOnlyError,
  MidnightOfferSideMismatchError,
  MidnightReplacementGroupCancelledError,
  MissingContractCodeError,
  NegativeInputError,
  NonPositiveInputError,
  parseTransactionPlan,
  prepareMidnightMakeLend,
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
      "id": "midnightMakeLend:approval:0",
      "label": "Approve token spending",
      "action": {
        "type": "erc20Approval",
        "inputs": {
          "chainId": 8453,
          "account": "0x000000000000000000000000000000000000A000",
          "token": "0x4200000000000000000000000000000000000006",
          "spender": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
          "assets": { "$bigint": "1000" }
        }
      }
    },
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
      "id": "midnightMakeLend",
      "label": "Publish Midnight lend offers",
      "action": {
        "type": "midnightMakeLend",
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

describe("stored format-2 midnightMakeLend", () => {
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
        to: "0x4200000000000000000000000000000000000006",
        value: 0n,
        data: "0x095ea7b3000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a00000000000000000000000000000000000000000000000000000000000003e8",
      },
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
      '"payload": "0xabcd", "nativeAssets": { "$bigint": "1" }, "loanAssets": { "$bigint": "1" }, "reservedLoanAssets": { "$bigint": "1" }, "rootSignature": {"v": 27}, "collateral": {}',
    );
    expect(buildTransactions(parseTransactionPlan(withUnknownFields))).toEqual(
      txs,
    );
  });

  test.each([
    ['"assets": { "$bigint": "1000" }', '"assets": 1000'],
    [
      '"token": "0x4200000000000000000000000000000000000006"',
      '"token": "0x12"',
    ],
    [
      '"spender": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A"',
      '"spender": "0x12"',
    ],
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
      '"type": "midnightMakeLend"',
      '"type": "midnightMakeLend", "signatureRequestIds": {}',
    ],
  ])("rejects saved recipe replacing %s with %s", (original, replacement) => {
    expect(() =>
      parseTransactionPlan(saved.replace(original, replacement)),
    ).toThrow(InvalidTransactionPlanError);
  });
});

const offer = Offer.create({
  market: { ...midnightMarket, maturity: 1_767_279_600n },
  maker: midnightAddresses.maker,
  buy: true,
  start: 1000n,
  expiry: 1800n,
  tick: 5000n,
  ratifier: getChainAddress(base.id, "priceRatifierV1"),
  maxAssets: 100n,
});

const params = {
  chainId: base.id,
  account: midnightAddresses.maker,
  loanToken: midnightMarket.loanToken,
  loanAssets: 100n,
  reservedLoanAssets: 20n,
  now: 1000n,
  offers: { type: "priceV1", entries: [{ offer }] },
  validation: false,
} as const satisfies MidnightMakeLendPlanParams;

describe.sequential("prepareMidnightMakeLend", () => {
  afterEach(() => vi.clearAllMocks());

  const mockReads = ({
    allowance,
    isAuthorized,
  }: {
    readonly allowance: bigint;
    readonly isAuthorized: boolean;
  }) => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: midnightMarket.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: allowance,
    });
    mockRead(handle, {
      address: getChainAddress(base.id, "midnight"),
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: isAuthorized,
    });
    return handle;
  };

  test("default", async () => {
    const handle = mockReads({ allowance: 119n, isAuthorized: false });
    const group = padHex("0x33", { size: 32 });
    const plan = await prepareMidnightMakeLend(handle.client, {
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
          id: "midnightMakeLend:approval:0",
          label: "Approve token spending",
          action: {
            type: "erc20Approval",
            inputs: {
              chainId: base.id,
              account: midnightAddresses.maker,
              token: midnightMarket.loanToken,
              spender: getChainAddress(base.id, "midnight"),
              assets: maxUint256,
            },
          },
        },
        {
          id: "midnightAuthorization",
          label: "Authorize Midnight bundle",
          action: {
            type: "midnightAuthorization",
            inputs: { chainId: base.id, account: midnightAddresses.maker },
          },
        },
        {
          id: "midnightMakeLend",
          label: "Publish Midnight lend offers",
          action: {
            type: "midnightMakeLend",
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
    expect(handle.request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
      "eth_call",
      "eth_call",
    ]);
  });

  test("behavior: reuses an allowance at the bound and a granted bundle", async () => {
    const { client } = mockReads({ allowance: 120n, isAuthorized: true });
    const plan = await prepareMidnightMakeLend(client, params);
    expect(plan.steps.map(({ id }) => id)).toEqual(["midnightMakeLend"]);
  });

  test("error: rejects a wrong RPC chain even with the expected client chain before prerequisite reads", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValue("0x1");
    await expect(
      prepareMidnightMakeLend(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: checks the selected ratifier deployment before publication-state reads", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) =>
      args.method === "eth_getCode" && args.params?.[0] === offer.ratifier
        ? "0x"
        : defaultRequest(args),
    );
    await expect(
      prepareMidnightMakeLend(client, params),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
    ]);
  });

  test.each([
    { overrides: { expiresAt: 1800 }, error: InputExceedsMaxError },
    { overrides: { expiresAt: 1801 }, error: InputExceedsMaxError },
    { overrides: { loanAssets: 0n }, error: NonPositiveInputError },
    { overrides: { reservedLoanAssets: -1n }, error: NegativeInputError },
    {
      overrides: { offers: { type: "priceV1", entries: [] } },
      error: InvalidTreeError,
    },
    {
      overrides: { cancellations: [{ group: "0x1234", maxConsumed: 0n }] },
      error: InvalidMidnightHexInputError,
    },
    {
      overrides: {
        cancellations: [
          { group: padHex("0xab", { size: 32 }), maxConsumed: 0n },
          { group: padHex("0xAB", { size: 32 }), maxConsumed: 0n },
        ],
      },
      error: DuplicateMidnightGroupCancellationError,
    },
    {
      overrides: {
        cancellations: [
          {
            group: Tree.from(params.offers).offers[0]?.group ?? zeroHash,
            maxConsumed: 0n,
          },
        ],
      },
      error: MidnightReplacementGroupCancelledError,
    },
    {
      overrides: {
        offers: {
          type: "priceV1",
          entries: [
            {
              offer: Offer.create({
                ...offer,
                buy: false,
                receiverIfMakerIsSeller: midnightAddresses.maker,
              }),
            },
          ],
        },
      },
      error: MidnightOfferSideMismatchError,
    },
    {
      overrides: {
        offers: {
          type: "priceV1",
          entries: [{ offer: Offer.create({ ...offer, reduceOnly: true }) }],
        },
      },
      error: MidnightOfferReduceOnlyError,
    },
  ] as const)(
    "error: rejects $error.name before any RPC or API call",
    async ({ overrides, error }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      await expect(
        prepareMidnightMakeLend(client, {
          ...params,
          ...overrides,
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(
        fetchMidnightMakerOfferStatesBeforeDeadline,
      ).not.toHaveBeenCalled();
    },
  );

  test("error: a mempool API rejection stops preparation before the allowance and authorization reads", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { issues: [{ rule: "offer_count" }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    await expect(
      prepareMidnightMakeLend(client, { ...params, validation: { fetch } }),
    ).rejects.toMatchObject({
      constructor: MidnightMempoolValidationError,
      issues: [{ rule: "offer_count" }],
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
      "eth_call",
    );
  });

  test("error: rejects a mismatched loan token after publication-state reads, in entity makeLend order", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightMakeLend(client, {
        ...params,
        loanToken: midnightAddresses.dai,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferMarketLoanTokenMismatchError);
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
      "eth_call",
    );
  });

  test("error: rejects an allowance bound above uint256 before allowance reads, as entity getRequirements does", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightMakeLend(client, {
        ...params,
        loanAssets: maxUint256,
        reservedLoanAssets: 1n,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
      "eth_call",
    );
  });

  test.each([
    ["loanAssets", { loanAssets: "100" }],
    ["reservedLoanAssets", { reservedLoanAssets: "20" }],
  ] as const)(
    "error: rejects a string %s as InvalidBigIntInputError before any request",
    async (field, override) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightMakeLend(client, {
          ...params,
          ...(override as unknown as Partial<MidnightMakeLendPlanParams>),
        }),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(
        fetchMidnightMakerOfferStatesBeforeDeadline,
      ).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: rejects zero loanAssets as NonPositiveInputError before a string reservedLoanAssets, as entity makeLend does", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightMakeLend(client, {
        ...params,
        loanAssets: 0n,
        reservedLoanAssets: "20" as unknown as bigint,
      }),
    ).rejects.toMatchObject({
      constructor: NonPositiveInputError,
      field: "loanAssets",
    });
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  test("error: rejects a string now as InvalidBigIntInputError before resolving the default expiry", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightMakeLend(client, {
        ...params,
        now: "1000" as unknown as bigint,
      }),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  test("error: reports an offer expired at the pinned block as MidnightOfferExpiredError, as entity makeLend does", async () => {
    const { client } = createMockClient(base);
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
      prepareMidnightMakeLend(client, {
        ...params,
        offers: {
          type: "priceV1",
          entries: [
            { offer: Offer.create({ ...offer, start: 900n, expiry: 999n }) },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiredError);
  });
});
