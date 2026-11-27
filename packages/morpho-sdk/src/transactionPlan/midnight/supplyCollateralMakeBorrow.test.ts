import {
  InvalidTreeError,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  RateRatifierV1,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  concatHex,
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  maxUint128,
  maxUint256,
  numberToHex,
  padHex,
  parseAbi,
  zeroAddress,
  zeroHash,
} from "viem";
import { base } from "viem/chains";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
  midnightTwoCollateralMarket,
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
  EmptyMidnightCollateralSuppliesError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidMidnightHexInputError,
  InvalidTransactionPlanError,
  MarketIdMismatchError,
  MidnightOfferExpiredError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketChainMismatchError,
  MidnightOfferReduceOnlyError,
  MidnightOfferSideMismatchError,
  MidnightReplacementGroupCancelledError,
  type MidnightSupplyCollateralMakeBorrowPlanParams,
  MissingContractCodeError,
  NativeAmountOnNonWNativeAssetError,
  NonPositiveInputError,
  parseTransactionPlan,
  prepareMidnightSupplyCollateralMakeBorrow,
  serializeTransactionPlan,
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
      "id": "midnightSupplyCollateralMakeBorrow:approval:0:0",
      "label": "Approve token spending",
      "action": {
        "type": "erc20Approval",
        "inputs": {
          "chainId": 8453,
          "account": "0x000000000000000000000000000000000000A000",
          "token": "0x4200000000000000000000000000000000000006",
          "spender": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
          "assets": {"$bigint": "115792089237316195423570985008687907853269984665640564039457584007913129639935"}
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
      "id": "midnightSupplyCollateralMakeBorrow",
      "label": "Supply collateral and publish Midnight borrow offers",
      "action": {
        "type": "midnightSupplyCollateralMakeBorrow",
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
          "collateral": {
            "market": {
              "chainId": {"$bigint": "8453"},
              "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
              "loanToken": "0x0000000000000000000000000000000000006000",
              "collateralParams": [{
                "token": "0x4200000000000000000000000000000000000006",
                "lltv": {"$bigint": "770000000000000000"},
                "liquidationCursor": {"$bigint": "250000000000000000"},
                "oracle": "0x0000000000000000000000000000000000008000"
              }],
              "maturity": {"$bigint": "2000"},
              "rcfThreshold": {"$bigint": "0"},
              "enterGate": "0x0000000000000000000000000000000000000000",
              "liquidatorGate": "0x0000000000000000000000000000000000000000"
            },
            "supplies": [{"collateralIndex": {"$bigint": "0"}, "assets": {"$bigint": "100"}}]
          }
        }
      }
    }
  ],
  "signatureRequests": []
}`;

describe("stored format-2 midnightSupplyCollateralMakeBorrow", () => {
  test("builds fixed approval, authorization and bundle bytes without decoding the payload", () => {
    const word = (value: Hex) => padHex(value, { size: 32 });
    const makerCalldata = concatHex([
      "0xb4691380",
      ...Array<Hex>(7).fill(zeroHash), // No Blue supply.
      word("0x02a0"), // Market.
      word("0x0440"), // Collateral supplies.
      word("0x08a0e69772315652165921D722B3caAea4C326e6"),
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      ...Array<Hex>(6).fill(zeroHash), // No root signature.
      word("0x04a0"), // Cancellations.
      word("0x0500"), // Opaque payload.
      word("0x0640"), // Deadline.
      word("0x4200000000000000000000000000000000000006"),
      word("0x2105"), // Market tuple.
      word("0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A"),
      word("0x6000"),
      word("0x0100"),
      word("0x07d0"),
      ...Array<Hex>(3).fill(zeroHash),
      word("0x01"), // Collateral parameters.
      word("0x4200000000000000000000000000000000000006"),
      numberToHex(770_000_000_000_000_000n, { size: 32 }),
      numberToHex(250_000_000_000_000_000n, { size: 32 }),
      word("0x8000"),
      word("0x01"), // Collateral supplies.
      zeroHash,
      word("0x64"),
      word("0x01"), // Cancellations.
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      word("0x2a"),
      word("0x02"),
      padHex("0xabcd", { size: 32, dir: "right" }),
    ]);
    const transactions = buildTransactions(parseTransactionPlan(saved));
    expect(
      transactions.map(({ to, data, value }) => ({
        to,
        data: data.toLowerCase(),
        value,
      })),
    ).toEqual([
      {
        to: "0x4200000000000000000000000000000000000006",
        value: 0n,
        data: "0x095ea7b30000000000000000000000000bf30b530f816a619c3f28a3b9f44c441122555dffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      {
        to: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        value: 0n,
        data: "0xb78212ab0000000000000000000000000bf30b530f816a619c3f28a3b9f44c441122555d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000a000",
      },
      {
        to: "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        value: 25n,
        data: makerCalldata.toLowerCase(),
      },
    ]);
    const withUnknownFields = saved.replace(
      '"payload": "0xabcd"',
      '"payload": "0xabcd", "nativeAmount": {"$bigint": "40"}, "rootSignature": {"v": 27}, "blueSupply": {}',
    );
    expect(buildTransactions(parseTransactionPlan(withUnknownFields))).toEqual(
      transactions,
    );
  });

  test("rejects building a collateral-backed step directly without collateral", () => {
    const plan = parseTransactionPlan(saved);
    const step = plan.steps.at(-1);
    assert(step?.action.type === "midnightSupplyCollateralMakeBorrow");
    const inputs = { ...step.action.inputs, nativeAssets: undefined };
    Reflect.deleteProperty(inputs, "collateral");
    const malformed = { ...step, action: { ...step.action, inputs } };
    expect(() => buildTransaction(plan, malformed)).toThrow(
      InvalidTransactionPlanError,
    );
  });

  test.each([
    [
      '[{"collateralIndex": {"$bigint": "0"}, "assets": {"$bigint": "100"}}]',
      "[]",
    ],
    [
      '"collateralIndex": {"$bigint": "0"}',
      '"collateralIndex": {"$bigint": "1"}',
    ],
    ['"assets": {"$bigint": "100"}', '"assets": {"$bigint": "0"}'],
    ['"assets": {"$bigint": "100"}', '"assets": 100'],
    ['"nativeAssets": {"$bigint": "25"}', '"nativeAssets": {"$bigint": "101"}'],
    ['"nativeAssets": {"$bigint": "25"}', '"nativeAssets": null'],
    ['"chainId": {"$bigint": "8453"}', '"chainId": {"$bigint": "1"}'],
    [
      '"midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A"',
      '"midnight": "0x0000000000000000000000000000000000001000"',
    ],
    [
      '"type": "midnightSupplyCollateralMakeBorrow"',
      '"type": "midnightSupplyCollateralMakeBorrow", "signatureRequestIds": {}',
    ],
  ])(
    "rejects malformed recipe replacing %s with %s",
    (original, replacement) => {
      expect(() =>
        parseTransactionPlan(saved.replace(original, replacement)),
      ).toThrow(InvalidTransactionPlanError);
    },
  );

  test.each([
    {
      name: "a lower-address token after a higher one",
      token: "0x0000000000000000000000000000000000000001",
    },
    {
      name: "a repeated token",
      token: "0x4200000000000000000000000000000000000006",
    },
  ])(
    "rejects stored collateral tokens with $name, so an index cannot point at another token",
    ({ token }) => {
      const second = `, {"token": "${token}", "lltv": {"$bigint": "770000000000000000"}, "liquidationCursor": {"$bigint": "250000000000000000"}, "oracle": "0x0000000000000000000000000000000000008000"}`;
      const unordered = saved.replace(
        '"oracle": "0x0000000000000000000000000000000000008000"\n              }]',
        `"oracle": "0x0000000000000000000000000000000000008000"\n              }${second}]`,
      );
      expect(unordered).not.toBe(saved);
      expect(() => parseTransactionPlan(unordered)).toThrow(
        expect.objectContaining({
          name: "InvalidTransactionPlanError",
          path: "$.steps[2].action.inputs.collateral.market.collateralParams",
        }),
      );
    },
  );

  test("error: a directly built plan with reversed collateral cannot switch the supplied token", () => {
    const plan = parseTransactionPlan(saved);
    const step = plan.steps[2];
    assert(step?.action.type === "midnightSupplyCollateralMakeBorrow");
    const { collateral } = step.action.inputs;
    const [weth] = collateral.market.collateralParams;
    assert(weth);
    const reversed = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          collateral: {
            ...collateral,
            market: {
              ...collateral.market,
              collateralParams: [
                weth,
                {
                  ...weth,
                  token: "0x0000000000000000000000000000000000000001",
                },
              ],
            },
          },
        },
      },
    } satisfies typeof step;
    const build = () => buildTransactions({ ...plan, steps: [reversed] });
    expect(build).toThrow(InvalidTransactionPlanError);
    expect(build).toThrow(
      expect.objectContaining({
        name: "InvalidTransactionPlanError",
        path: "$.inputs.collateral.market.collateralParams",
      }),
    );
  });
});

const ratifier = getChainAddress(base.id, "priceRatifierV1");
const maturity = 1_767_279_600n;
const market = { ...midnightMarket, maturity };
const otherMarket = { ...midnightMarket, maturity: maturity + 86_400n };
const bundle = getChainAddress(base.id, "midnightBundlesV2");
const offer = Offer.create({
  market,
  maker: midnightAddresses.maker,
  buy: false,
  start: 1000n,
  expiry: 1800n,
  tick: 5000n,
  ratifier,
  maxUnits: 100n,
  group: numberToHex(1, { size: 32 }),
});
const supply = { collateralIndex: 0n, assets: 100n };
const params = {
  chainId: base.id,
  account: offer.maker,
  now: 1000n,
  offers: { type: "priceV1", entries: [{ offer }] },
  collateral: { market, supplies: [supply] },
  validation: false,
} satisfies MidnightSupplyCollateralMakeBorrowPlanParams;

const useActualPublicationReads = async () => {
  const reads = await vi.importActual<typeof import("./publicationState.js")>(
    "./publicationState.js",
  );
  vi.mocked(fetchMidnightMakerOfferStatesBeforeDeadline).mockImplementationOnce(
    reads.fetchMidnightMakerOfferStatesBeforeDeadline,
  );
  return vi.importActual<
    typeof import("../../entities/midnight/publication.js")
  >("../../entities/midnight/publication.js");
};

const publicationStateAbi = [
  ...midnightAbi,
  ...erc20Abi,
  ...parseAbi([
    "function defaultContinuousFee(address loanToken) view returns (uint32)",
  ]),
];

const readFunctionNames = (
  calls: readonly (readonly [
    { readonly method: string; readonly params?: unknown },
  ])[],
) =>
  calls.flatMap(([{ method, params: rpcParams }]) =>
    method === "eth_call"
      ? [
          decodeFunctionData({
            abi: publicationStateAbi,
            data: (rpcParams as [{ data: Hex }])[0].data,
          }).functionName,
        ]
      : [],
  );

const mockPublicationStateReads = (timestamp: bigint) => {
  const handle = createMockClient(base);
  handle.request.mockImplementation(async ({ method, params: rpcParams }) => {
    if (method === "eth_chainId") return numberToHex(base.id);
    if (method === "eth_getCode") return "0x01";
    if (method === "eth_blockNumber") return "0x1";
    if (method === "eth_getBlockByNumber") {
      return { number: "0x1", timestamp: numberToHex(timestamp) };
    }
    assert(method === "eth_call");
    const [{ data }] = rpcParams as [{ data: Hex }];
    const call = decodeFunctionData({ abi: publicationStateAbi, data });
    switch (call.functionName) {
      case "marketState":
        return encodeFunctionResult({
          abi: midnightAbi,
          functionName: "marketState",
          result: [1n, 0n, 0n, 0n, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        });
      case "defaultContinuousFee":
        return encodeFunctionResult({
          abi: publicationStateAbi,
          functionName: "defaultContinuousFee",
          result: 0,
        });
      case "consumed":
      case "credit":
      case "debt":
        return encodeFunctionResult({
          abi: midnightAbi,
          functionName: call.functionName,
          result: 0n,
        });
      case "isLltvEnabled":
      case "isLiquidationCursorEnabled":
        return encodeFunctionResult({
          abi: midnightAbi,
          functionName: call.functionName,
          result: true,
        });
      case "allowance":
        return encodeFunctionResult({
          abi: erc20Abi,
          functionName: "allowance",
          result: maxUint256,
        });
      case "isAuthorized":
        return encodeFunctionResult({
          abi: midnightAbi,
          functionName: "isAuthorized",
          result: true,
        });
      default:
        throw new Error(`unexpected read ${call.functionName}`);
    }
  });
  return handle;
};

describe.sequential("prepareMidnightSupplyCollateralMakeBorrow", () => {
  afterEach(() => vi.clearAllMocks());

  const mockReads = ({
    allowance,
    isAuthorized,
  }: {
    readonly allowance: bigint;
    readonly isAuthorized: boolean;
  }) => {
    const handle = createMockClient(base);
    for (const address of [
      midnightAddresses.collateralToken,
      midnightAddresses.secondCollateralToken,
    ]) {
      mockRead(handle, {
        address,
        abi: erc20Abi,
        functionName: "allowance",
        result: allowance,
      });
    }
    mockRead(handle, {
      address: getChainAddress(base.id, "midnight"),
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: isAuthorized,
    });
    return handle;
  };

  test("default", async () => {
    const handle = mockReads({ allowance: 99n, isAuthorized: false });
    const plan = await prepareMidnightSupplyCollateralMakeBorrow(
      handle.client,
      params,
    );
    expect(plan.expiresAt).toBe(1799);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ id }) => id)).toEqual([
      "midnightSupplyCollateralMakeBorrow:approval:0:0",
      "midnightAuthorization",
      "midnightSupplyCollateralMakeBorrow",
    ]);
    expect(plan.steps[0]?.action).toEqual({
      type: "erc20Approval",
      inputs: {
        chainId: base.id,
        account: midnightAddresses.maker,
        token: midnightAddresses.collateralToken,
        spender: bundle,
        assets: maxUint256,
      },
    });
    const action = plan.steps[2]?.action;
    assert(action?.type === "midnightSupplyCollateralMakeBorrow");
    expect(action.inputs).toMatchObject({
      chainId: base.id,
      account: midnightAddresses.maker,
      deadline: 1799n,
      cancellations: [],
      ratifierType: "priceV1",
      ratifier,
      groups: [offer.group],
      collateral: { supplies: [supply] },
    });
    expect(action.inputs.collateral.market.collateralParams).toEqual(
      midnightMarket.collateralParams.map(
        ({ token, lltv, liquidationCursor, oracle }) => ({
          token,
          lltv,
          liquidationCursor,
          oracle,
        }),
      ),
    );
    expect(action.inputs).not.toHaveProperty("nativeAssets");
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

  test("behavior: stores the collateral validated before the reads, not later caller changes", async () => {
    const handle = mockReads({ allowance: 0n, isAuthorized: true });
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
    const supplies = [{ ...supply }];
    const preparation = prepareMidnightSupplyCollateralMakeBorrow(
      handle.client,
      { ...params, collateral: { market, supplies } },
    );
    await requested;
    supplies[0] = { collateralIndex: 1n, assets: 1_000n };
    supplies.push({ ...supply });
    release();
    const plan = await preparation;

    const [approval] = plan.steps;
    assert(approval?.action.type === "erc20Approval");
    expect(approval.action.inputs.token).toBe(
      midnightAddresses.collateralToken,
    );
    const action = plan.steps.at(-1)?.action;
    assert(action?.type === "midnightSupplyCollateralMakeBorrow");
    expect(action.inputs.collateral.supplies).toEqual([supply]);
  });

  test("behavior: sums supplies that pull the same token into one approval, as entity getRequirements does", async () => {
    const { client } = mockReads({ allowance: 99n, isAuthorized: true });
    const supplies = [
      { collateralIndex: 0n, assets: 60n },
      { collateralIndex: 0n, assets: 40n },
    ];
    const plan = await prepareMidnightSupplyCollateralMakeBorrow(client, {
      ...params,
      collateral: { ...params.collateral, supplies },
    });
    expect(plan.steps.map(({ id }) => id)).toEqual([
      "midnightSupplyCollateralMakeBorrow:approval:0:0",
      "midnightSupplyCollateralMakeBorrow",
    ]);
    const action = plan.steps[1]?.action;
    assert(action?.type === "midnightSupplyCollateralMakeBorrow");
    expect(action.inputs.collateral.supplies).toEqual(supplies);
  });

  test("behavior: checks each collateral token's allowance to the bundle separately", async () => {
    const { client } = mockReads({ allowance: 0n, isAuthorized: true });
    const twoCollateralMarket = { ...midnightTwoCollateralMarket, maturity };
    const plan = await prepareMidnightSupplyCollateralMakeBorrow(client, {
      ...params,
      offers: {
        type: "priceV1",
        entries: [
          { offer: Offer.create({ ...offer, market: twoCollateralMarket }) },
        ],
      },
      collateral: {
        market: twoCollateralMarket,
        supplies: [
          { collateralIndex: 0n, assets: 10n },
          { collateralIndex: 1n, assets: 20n },
        ],
      },
    });
    expect(
      plan.steps.map(({ id, action }) => [
        id,
        action.type === "erc20Approval" ? action.inputs.token : undefined,
      ]),
    ).toEqual([
      [
        "midnightSupplyCollateralMakeBorrow:approval:0:0",
        midnightAddresses.collateralToken,
      ],
      [
        "midnightSupplyCollateralMakeBorrow:approval:1:0",
        midnightAddresses.secondCollateralToken,
      ],
      ["midnightSupplyCollateralMakeBorrow", undefined],
    ]);
  });

  test("behavior: resolves a collateral index in ascending token order when the caller lists the higher token first", async () => {
    const { client } = mockReads({ allowance: 0n, isAuthorized: true });
    const [lower, higher] = midnightTwoCollateralMarket.collateralParams;
    assert(lower?.token === midnightAddresses.collateralToken);
    assert(higher?.token === midnightAddresses.secondCollateralToken);
    const unsortedMarket = {
      ...midnightTwoCollateralMarket,
      maturity,
      collateralParams: [higher, lower],
    };
    const plan = await prepareMidnightSupplyCollateralMakeBorrow(client, {
      ...params,
      offers: {
        type: "priceV1",
        entries: [
          { offer: Offer.create({ ...offer, market: unsortedMarket }) },
        ],
      },
      collateral: { market: unsortedMarket, supplies: [supply] },
    });
    expect(
      plan.steps.flatMap(({ action }) =>
        action.type === "erc20Approval" ? [action.inputs.token] : [],
      ),
    ).toEqual([lower.token]);

    const [approval, maker] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    expect(approval?.to).toBe(lower.token);
    assert(maker);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: maker.data,
    });
    assert(decoded.functionName === "midnightBundlesV2CancelAndMake");
    const [, , , bundleMarket, bundleSupplies] = decoded.args;
    expect(bundleSupplies).toEqual([supply]);
    expect(
      bundleSupplies.map(
        ({ collateralIndex }) =>
          bundleMarket.collateralParams[Number(collateralIndex)]?.token,
      ),
    ).toEqual([lower.token]);
  });

  test("behavior: reuses an allowance covering the full pull and a granted bundle", async () => {
    const { client } = mockReads({ allowance: 100n, isAuthorized: true });
    const plan = await prepareMidnightSupplyCollateralMakeBorrow(
      client,
      params,
    );
    expect(plan.steps.map(({ id }) => id)).toEqual([
      "midnightSupplyCollateralMakeBorrow",
    ]);
  });

  test.each([
    { error: InvalidTreeError, offers: { type: "priceV1", entries: [] } },
    {
      error: MidnightOfferSideMismatchError,
      offers: {
        type: "priceV1",
        entries: [
          {
            offer: Offer.create({
              ...offer,
              buy: true,
              receiverIfMakerIsSeller: zeroAddress,
            }),
          },
        ],
      },
    },
    {
      error: MidnightOfferReduceOnlyError,
      offers: {
        type: "priceV1",
        entries: [{ offer: Offer.create({ ...offer, reduceOnly: true }) }],
      },
    },
    {
      error: MidnightOfferMakerMismatchError,
      account: midnightAddresses.taker,
    },
    { error: InputExceedsMaxError, expiresAt: 1800 },
    { error: InputExceedsMaxError, expiresAt: 1801 },
    {
      error: InvalidMidnightHexInputError,
      cancellations: [{ group: "0x1234", maxConsumed: 0n }],
    },
    {
      error: MidnightReplacementGroupCancelledError,
      cancellations: [{ group: offer.group, maxConsumed: 0n }],
    },
  ] satisfies readonly (Partial<MidnightSupplyCollateralMakeBorrowPlanParams> & {
    error: new (...args: never[]) => Error;
  })[])(
    "error: rejects $error.name before any RPC or API call",
    async ({ error, ...overrides }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      await expect(
        prepareMidnightSupplyCollateralMakeBorrow(client, {
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
        prepareMidnightSupplyCollateralMakeBorrow(client, {
          ...params,
          cancellations,
          validation: { fetch },
        } as unknown as MidnightSupplyCollateralMakeBorrowPlanParams),
      ).rejects.toMatchObject({
        constructor: InvalidTransactionPlanError,
        path,
      });
      expect(request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  const anotherMarketOffer = Offer.create({
    ...offer,
    market: otherMarket,
    group: numberToHex(2, { size: 32 }),
  });
  test.each([
    {
      error: MarketIdMismatchError,
      collateral: {
        ...params.collateral,
        market: otherMarket,
      },
    },
    {
      error: MarketIdMismatchError,
      offers: {
        type: "priceV1",
        entries: [{ offer }, { offer: anotherMarketOffer }],
      },
    },
    {
      error: EmptyMidnightCollateralSuppliesError,
      collateral: { ...params.collateral, supplies: [] },
    },
    {
      error: UnknownCollateralIndexError,
      collateral: {
        ...params.collateral,
        supplies: [{ ...supply, collateralIndex: 1n }],
      },
    },
    {
      error: NonPositiveInputError,
      collateral: {
        ...params.collateral,
        supplies: [{ ...supply, assets: 0n }],
      },
    },
    {
      error: InvalidBigIntInputError,
      collateral: {
        ...params.collateral,
        supplies: [{ ...supply, collateralIndex: 0 as unknown as bigint }],
      },
    },
    {
      error: InvalidBigIntInputError,
      collateral: {
        ...params.collateral,
        supplies: [{ ...supply, assets: "100" as unknown as bigint }],
      },
    },
    {
      error: InputExceedsMaxError,
      collateral: {
        ...params.collateral,
        supplies: [{ ...supply, assets: maxUint128 + 1n }],
      },
    },
    { error: NativeAmountOnNonWNativeAssetError, nativeAmount: 1n },
    {
      error: MidnightOfferMarketChainMismatchError,
      offers: {
        type: "priceV1",
        entries: [
          {
            offer: Offer.create({
              ...offer,
              market: { ...market, chainId: 1 },
            }),
          },
        ],
      },
    },
  ] satisfies readonly (Partial<MidnightSupplyCollateralMakeBorrowPlanParams> & {
    error: new (...args: never[]) => Error;
  })[])(
    "error: rejects a malformed collateral or market input with $error.name before any RPC or API call",
    async ({ error, ...overrides }) => {
      const { client, request } = createMockClient(base);
      const fetch = vi.fn();
      await expect(
        prepareMidnightSupplyCollateralMakeBorrow(client, {
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

  test.each([
    {
      error: InvalidMidnightRateRatifierV1RateError,
      tick: RateRatifierV1.MIN_TICK,
      rate: -1n,
    },
    { error: InvalidMidnightRateRatifierV1TickError, tick: 0n, rate: 0n },
  ])(
    "error: rejects a Rate V1 request with $error.name",
    async ({ error, tick, rate }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightSupplyCollateralMakeBorrow(client, {
          ...params,
          offers: {
            type: "rateV1",
            entries: [
              {
                offer: Offer.create({
                  ...offer,
                  tick,
                  ratifier: getChainAddress(base.id, "rateRatifierV1"),
                }),
                rate,
              },
            ],
          },
        }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: [INV-05] rejects the wrong RPC chain before prerequisite reads even when the client declares Base", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValue("0x1");
    await expect(
      prepareMidnightSupplyCollateralMakeBorrow(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: checks deployment code before publication-state, allowance and authorization reads", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) =>
      args.method === "eth_getCode" && args.params?.[0] === ratifier
        ? "0x"
        : defaultRequest(args),
    );
    await expect(
      prepareMidnightSupplyCollateralMakeBorrow(client, params),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
    ]);
  });

  test.each([
    { expiresAt: 1200, timestamp: 1201n },
    { expiresAt: 1201, timestamp: 1201n },
    { expiresAt: undefined, timestamp: 1799n },
  ])(
    "error: rejects deadline $expiresAt at pinned time $timestamp before contract reads or API admission",
    async ({ expiresAt, timestamp }) => {
      const { client, request } = createMockClient(base);
      const defaultRequest = request.getMockImplementation();
      assert(defaultRequest);
      request.mockImplementation(async (args) => {
        if (args.method === "eth_blockNumber") return "0x1";
        if (args.method === "eth_getBlockByNumber") {
          expect(args.params?.[0]).toBe("0x1");
          return { number: "0x1", timestamp: numberToHex(timestamp) };
        }
        return defaultRequest(args);
      });
      await useActualPublicationReads();
      const fetch = vi.fn();
      await expect(
        prepareMidnightSupplyCollateralMakeBorrow(client, {
          ...params,
          expiresAt,
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(ExpiredDeadlineError);
      expect(
        request.mock.calls.some(([args]) => args.method === "eth_call"),
      ).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("reads the pinned block header once for a publication with a deadline", async () => {
    const { client, request } = mockPublicationStateReads(1000n);
    const actual = await useActualPublicationReads();
    vi.mocked(validateMidnightMakerOfferStates).mockImplementationOnce(
      actual.validateMidnightMakerOfferStates,
    );
    const plan = await prepareMidnightSupplyCollateralMakeBorrow(client, {
      ...params,
      expiresAt: 1500,
    });
    expect(plan.expiresAt).toBe(1500);
    expect(
      request.mock.calls.filter(
        ([{ method }]) => method === "eth_getBlockByNumber",
      ),
    ).toHaveLength(1);
  });

  test("error: an offer expired at the pinned block wins over an expired deadline with the real reader", async () => {
    const { client, request } = mockPublicationStateReads(1800n);
    const actual = await useActualPublicationReads();
    vi.mocked(validateMidnightMakerOfferStates).mockImplementationOnce(
      actual.validateMidnightMakerOfferStates,
    );
    const liveOffer = Offer.create({
      ...offer,
      expiry: 1900n,
      group: numberToHex(2, { size: 32 }),
    });
    await expect(
      prepareMidnightSupplyCollateralMakeBorrow(client, {
        ...params,
        expiresAt: 1200,
        offers: {
          type: "priceV1",
          entries: [{ offer }, { offer: liveOffer }],
        },
      }),
    ).rejects.toMatchObject({
      constructor: MidnightOfferExpiredError,
      index: 0,
      now: 1800n,
    });
    const readFunctions = readFunctionNames(request.mock.calls);
    expect(readFunctions).not.toContain("isAuthorized");
    expect(readFunctions).not.toContain("allowance");
  });

  test("error: an offer expired by now but live at the pinned block throws ExpiredDeadlineError without API validation", async () => {
    const { client, request } = createMockClient(base);
    const fetch = vi.fn();
    await expect(
      prepareMidnightSupplyCollateralMakeBorrow(client, {
        ...params,
        offers: {
          type: "priceV1",
          entries: [
            { offer: Offer.create({ ...offer, start: 900n, expiry: 999n }) },
          ],
        },
        validation: { fetch },
      }),
    ).rejects.toMatchObject({
      constructor: ExpiredDeadlineError,
      deadline: 998n,
    });
    expect(fetchMidnightMakerOfferStatesBeforeDeadline).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    const readFunctions = readFunctionNames(request.mock.calls);
    expect(readFunctions).not.toContain("isAuthorized");
    expect(readFunctions).not.toContain("allowance");
  });

  test("error: reports an offer expired at the pinned block as MidnightOfferExpiredError, as entity supplyCollateralMakeBorrow does", async () => {
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
      prepareMidnightSupplyCollateralMakeBorrow(client, {
        ...params,
        expiresAt: 1500,
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
