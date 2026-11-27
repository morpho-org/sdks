import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  AccrualPosition,
  MAX_TICK,
  Market,
  midnightAbi,
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  createMockClient,
  expectReadCall,
  mockRead,
} from "@morpho-org/test/mock";
import {
  decodeFunctionData,
  erc20Abi,
  maxUint128,
  maxUint256,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightMarket,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  savedSupplyBorrow,
  supplyBorrowTransactions,
} from "../../../test/fixtures/midnightSupplyCollateralTakeBorrow.js";
import {
  AccrualPositionUserMismatchError,
  BorrowExceedsSafeLtvError,
  buildTransaction,
  buildTransactions,
  ChainIdMismatchError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightTakeableOffersError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidTransactionPlanError,
  MarketIdMismatchError,
  MidnightCalldataEncodingError,
  MidnightContractReceiverError,
  MidnightOfferSideMismatchError,
  MidnightTakeableOfferMarketMismatchError,
  MidnightTakeableOffersNotFillableError,
  type MidnightTakeBorrowPlanParams,
  MidnightTakeDeadlineTooFarError,
  MidnightTakeTargetUnreachableError,
  MidnightZeroReceiverError,
  MissingContractCodeError,
  NonPositiveInputError,
  parseTransactionPlan,
  prepareMidnightSupplyCollateralTakeBorrow,
  prepareMidnightTakeBorrow,
  serializeTransactionPlan,
} from "../../index.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const marketData = new Market({
  params: midnightMarket,
  totalUnits: 0n,
  lossFactor: 0n,
  withdrawable: 0n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});

function position({
  market = marketData,
  user = account,
  debt = 0n,
  credit = 0n,
} = {}) {
  return new AccrualPosition(
    {
      user,
      debt,
      credit,
      pendingFee: 0n,
      lastAccrual: 1_000n,
      lastLossFactor: 0n,
      collateralBitmap: 1n,
      collateral: [1_000n],
    },
    market,
  );
}

const fill = midnightApiTake({ buy: true, tick: MAX_TICK });
const params = {
  chainId,
  account,
  marketData,
  positionData: position(),
  collateralPrices: [ORACLE_PRICE_SCALE],
  takeableOffers: [fill],
  target: { type: "assets", assets: 50n, maxUnits: 60n },
  now: 1_000n,
  expiresAt: 1_600,
} satisfies MidnightTakeBorrowPlanParams;

describe("prepareMidnightSupplyCollateralTakeBorrow", () => {
  const token = getChainAddress(chainId, "wNative");
  const market = {
    ...midnightMarket,
    collateralParams: midnightMarket.collateralParams.map((collateral) => ({
      ...collateral,
      token,
    })),
  };
  const snapshot = new Market({ ...marketData, params: market });
  const positionData = new AccrualPosition(
    {
      ...position({ market: snapshot }),
      collateralBitmap: 0n,
      collateral: [0n],
    },
    snapshot,
  );
  const collateralSupplies = [
    { collateralIndex: 0n, assets: 30n },
    { collateralIndex: 0n, assets: 70n },
  ];
  const combined = {
    ...params,
    marketData: snapshot,
    positionData,
    collateralSupplies,
    nativeAmount: 80n,
    takeableOffers: [midnightApiTake({ market, buy: true, tick: MAX_TICK })],
  };

  test.for([
    {
      allowance: 99n,
      authorized: false,
      steps: [
        "erc20Approval",
        "midnightAuthorization",
        "midnightSupplyCollateralTakeBorrow",
      ],
    },
    {
      allowance: 100n,
      authorized: true,
      steps: ["midnightSupplyCollateralTakeBorrow"],
    },
  ])(
    "[INV-06] checks the full summed allowance even with native funding ($allowance)",
    async ({ allowance, authorized, steps }) => {
      const handle = clientWithAuthorization(authorized);
      mockRead(handle, {
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        result: allowance,
      });
      const plan = await prepareMidnightSupplyCollateralTakeBorrow(
        handle.client,
        combined,
      );
      expect(plan.steps.map(({ action }) => action.type)).toEqual(steps);
      expect(
        expectReadCall(handle, {
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
        }).map(({ args }) => args),
      ).toEqual([[combined.account, bundle]]);
      expect(plan.signatureRequests).toEqual([]);
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      const transactions = buildTransactions(restored);
      expect(transactions).toEqual(buildTransactions(plan));
      const sell = transactions.at(-1);
      assert(sell);
      expect(sell).toMatchObject({ to: bundle, value: 80n });
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: sell.data,
      });
      assert(
        decoded.functionName ===
          "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
      );
      const supplies = decoded.args[5];
      expect(
        supplies.every(({ collateralIndex }) => collateralIndex === 0n),
      ).toBe(true);
      expect(supplies.reduce((total, { assets }) => total + assets, 0n)).toBe(
        100n,
      );
      expect(positionData.collateral).toEqual([0n]);
      if (steps[0] === "erc20Approval") {
        expect(transactions[0]?.to).toBe(token);
        expect(
          decodeFunctionData({ abi: erc20Abi, data: transactions[0]!.data })
            .args,
        ).toEqual([bundle, maxUint256]);
      }
    },
  );

  test("[INV-03] checks health against post-supply collateral with the LLTV buffer", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightSupplyCollateralTakeBorrow(client, {
        ...combined,
        collateralSupplies: [{ collateralIndex: 0n, assets: 78n }],
        nativeAmount: undefined,
      }),
    ).rejects.toBeInstanceOf(BorrowExceedsSafeLtvError);
    expect(request).not.toHaveBeenCalled();
  });

  test("stores the collateral token approval with the market's checksummed address", async () => {
    const checksummed = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
    const mixedMarket = {
      ...midnightMarket,
      collateralParams: midnightMarket.collateralParams.map((collateral) => ({
        ...collateral,
        token: checksummed,
      })),
    };
    const mixedSnapshot = new Market({ ...marketData, params: mixedMarket });
    const handle = clientWithAuthorization(true);
    mockRead(handle, {
      address: checksummed,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const plan = await prepareMidnightSupplyCollateralTakeBorrow(
      handle.client,
      {
        ...combined,
        marketData: mixedSnapshot,
        positionData: new AccrualPosition(
          {
            ...position({ market: mixedSnapshot }),
            collateralBitmap: 0n,
            collateral: [0n],
          },
          mixedSnapshot,
        ),
        nativeAmount: undefined,
        takeableOffers: [
          midnightApiTake({ market: mixedMarket, buy: true, tick: MAX_TICK }),
        ],
      },
    );
    const [approval] = plan.steps;
    assert(approval?.action.type === "erc20Approval");
    expect(approval.action.inputs.token).toBe(checksummed);
    expect(buildTransactions(plan)[0]?.to).toBe(checksummed);
  });

  test.for([
    [{ collateralSupplies: [] }, EmptyMidnightCollateralSuppliesError],
    [
      {
        collateralSupplies: [{ collateralIndex: 1n, assets: 100n }],
        nativeAmount: undefined,
      },
      UnknownCollateralIndexError,
    ],
    [{ takeableOffers: [] }, EmptyMidnightTakeableOffersError],
  ] as const)(
    "rejects invalid supply or borrow input before RPC (%#)",
    async ([overrides, error]) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightSupplyCollateralTakeBorrow(client, {
          ...combined,
          ...overrides,
        }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: rejects a numeric collateral index before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightSupplyCollateralTakeBorrow(client, {
        ...combined,
        collateralSupplies: [{ collateralIndex: 0, assets: 100n }],
      } as unknown as Parameters<
        typeof prepareMidnightSupplyCollateralTakeBorrow
      >[1]),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "collateralSupplies[0].collateralIndex",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    { supplies: undefined, path: "$.collateralSupplies" },
    { supplies: null, path: "$.collateralSupplies" },
    { supplies: [null], path: "$.collateralSupplies[0]" },
  ])(
    "error: InvalidTransactionPlanError for a malformed collateral list at $path before RPC",
    async ({ supplies, path }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightSupplyCollateralTakeBorrow(client, {
          ...combined,
          collateralSupplies: supplies,
        } as unknown as Parameters<
          typeof prepareMidnightSupplyCollateralTakeBorrow
        >[1]),
      ).rejects.toMatchObject({
        constructor: InvalidTransactionPlanError,
        path,
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("[INV-05] rejects a wrong transport chain before any allowance or authorization read", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValue("0x1");
    await expect(
      prepareMidnightSupplyCollateralTakeBorrow(client, combined),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test.each([
    { role: "midnightBundlesV2", address: bundle },
    { role: "midnight", address: midnightMarket.midnight },
  ] as const)(
    "[INV-05] rejects missing $role code before prerequisites",
    async ({ role, address }) => {
      const { client, request } = createMockClient(base);
      const defaultRequest = request.getMockImplementation();
      assert(defaultRequest);
      request.mockImplementation(async (args) =>
        args.method === "eth_getCode" && args.params?.[0] === address
          ? "0x"
          : defaultRequest(args),
      );
      await expect(
        prepareMidnightSupplyCollateralTakeBorrow(client, combined),
      ).rejects.toMatchObject({
        constructor: MissingContractCodeError,
        address,
        chainId,
        role,
      });
      expect(request.mock.calls.map(([args]) => args.method)).toEqual([
        "eth_chainId",
        "eth_getCode",
        "eth_getCode",
      ]);
    },
  );
});

describe("stored format-2 midnightSupplyCollateralTakeBorrow", () => {
  test("builds the fixed transaction bytes without prepare", () => {
    expect(
      buildTransactions(parseTransactionPlan(savedSupplyBorrow)).map(
        ({ to, data, value }) => ({ to, data, value }),
      ),
    ).toEqual(supplyBorrowTransactions);
  });

  test.for([
    ['"collateralSupplies": [', '"unused": [', "inputs.collateralSupplies"],
    [
      '"collateralIndex": {',
      '"collateralIndex": 0, "unused": {',
      "inputs.collateralSupplies[0].collateralIndex",
    ],
    [
      '"nativeAssets": {',
      '"nativeAssets": 120, "unused": {',
      "inputs.nativeAssets",
    ],
    [
      '"type": "midnightSupplyCollateralTakeBorrow",',
      '"type": "midnightSupplyCollateralTakeBorrow", "signatureRequestIds": {},',
      "signatureRequestIds",
    ],
  ])("rejects malformed saved %s", ([search, replacement, path]) => {
    expect(() =>
      parseTransactionPlan(savedSupplyBorrow.replace(search!, replacement!)),
    ).toThrow(expect.objectContaining({ path: `$.steps[2].action.${path}` }));
  });

  test.for([
    [
      "an empty supply list",
      (inputs: StoredSupplyInputs) => {
        inputs.collateralSupplies = [];
      },
      EmptyMidnightCollateralSuppliesError,
    ],
    [
      "a zero supply",
      (inputs: StoredSupplyInputs) => {
        inputs.collateralSupplies[0]!.assets.$bigint = "0";
      },
      NonPositiveInputError,
    ],
    [
      "an unconfigured collateral index",
      (inputs: StoredSupplyInputs) => {
        inputs.collateralSupplies[0]!.collateralIndex.$bigint = "1";
      },
      UnknownCollateralIndexError,
    ],
    [
      "a per-index sum above uint128",
      (inputs: StoredSupplyInputs) => {
        inputs.collateralSupplies = [
          {
            collateralIndex: { $bigint: "0" },
            assets: { $bigint: maxUint128.toString() },
          },
          { collateralIndex: { $bigint: "0" }, assets: { $bigint: "1" } },
        ];
      },
      InputExceedsMaxError,
    ],
    [
      "native funding above the wrapped-native pull",
      (inputs: StoredSupplyInputs) => {
        inputs.nativeAssets = { $bigint: "201" };
      },
      InputExceedsMaxError,
    ],
  ] as const)("rejects saved funding with %s at parse", ([, edit, error]) => {
    const saved = JSON.parse(savedSupplyBorrow);
    edit(saved.steps[2].action.inputs);
    const parse = () => parseTransactionPlan(JSON.stringify(saved));
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({
        path: "$.steps[2].action.inputs",
        cause: expect.any(error),
      }),
    );
  });

  test("rejects a saved market with collateral in reverse token order before reading indexes", () => {
    const saved = JSON.parse(savedSupplyBorrow);
    const { inputs } = saved.steps[2].action;
    const [collateral] = inputs.market.collateralParams;
    const reversed = [
      collateral,
      { ...collateral, token: "0x000000000000000000000000000000000000C001" },
    ];
    inputs.market.collateralParams = reversed;
    inputs.takeableOffers[0].offer.market.collateralParams = reversed;
    delete inputs.nativeAssets;
    const parse = () => parseTransactionPlan(JSON.stringify(saved));
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({
        path: "$.steps[2].action.inputs.market.collateralParams",
      }),
    );
  });

  test("rejects a directly built step with collateral in reverse token order", () => {
    const plan = parseTransactionPlan(savedSupplyBorrow);
    const step = plan.steps[2];
    assert(step?.action.type === "midnightSupplyCollateralTakeBorrow");
    const { market } = step.action.inputs;
    const [collateral] = market.collateralParams;
    assert(collateral);
    const reversed = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          market: {
            ...market,
            collateralParams: [
              collateral,
              {
                ...collateral,
                token: "0x000000000000000000000000000000000000C001" as const,
              },
            ],
          },
        },
      },
    };
    const build = () => buildTransactions({ ...plan, steps: [reversed] });
    expect(build).toThrow(InvalidTransactionPlanError);
    expect(build).toThrow(
      expect.objectContaining({ path: "$.inputs.market.collateralParams" }),
    );
  });

  test("rejects a directly built step without collateral supplies", () => {
    const plan = parseTransactionPlan(savedSupplyBorrow);
    const step = plan.steps[2];
    assert(step?.action.type === "midnightSupplyCollateralTakeBorrow");
    const { collateralSupplies: _, ...inputs } = step.action.inputs;
    const edited = {
      ...step,
      action: { ...step.action, inputs },
    } as unknown as typeof step;
    const build = () => buildTransactions({ ...plan, steps: [edited] });
    expect(build).toThrow(InvalidTransactionPlanError);
    expect(build).toThrow(
      expect.objectContaining({ path: "$.inputs.collateralSupplies" }),
    );
  });

  test("error: InvalidTransactionPlanError on a directly built step with an unknown target type", () => {
    const plan = parseTransactionPlan(savedSupplyBorrow);
    const step = plan.steps[2];
    assert(step?.action.type === "midnightSupplyCollateralTakeBorrow");
    const edited = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          target: {
            ...step.action.inputs.target,
            type: "shares",
            units: 60n,
            minSellerAssets: 50n,
          },
        },
      },
    } as unknown as typeof step;
    const expected = expect.objectContaining({ path: "$.inputs.target.type" });
    const buildAll = () => buildTransactions({ ...plan, steps: [edited] });
    expect(buildAll).toThrow(InvalidTransactionPlanError);
    expect(buildAll).toThrow(expected);
    const buildOne = () =>
      buildTransaction({ ...plan, steps: [edited] }, edited);
    expect(buildOne).toThrow(InvalidTransactionPlanError);
    expect(buildOne).toThrow(expected);
  });

  test("error: InvalidTransactionPlanError on a directly built step with a null collateral supply", () => {
    const plan = parseTransactionPlan(savedSupplyBorrow);
    const step = plan.steps[2];
    assert(step?.action.type === "midnightSupplyCollateralTakeBorrow");
    const edited = {
      ...step,
      action: {
        ...step.action,
        inputs: { ...step.action.inputs, collateralSupplies: [null] },
      },
    } as unknown as typeof step;
    const expected = expect.objectContaining({
      path: "$.inputs.collateralSupplies[0]",
    });
    const buildAll = () => buildTransactions({ ...plan, steps: [edited] });
    expect(buildAll).toThrow(InvalidTransactionPlanError);
    expect(buildAll).toThrow(expected);
    const buildOne = () =>
      buildTransaction({ ...plan, steps: [edited] }, edited);
    expect(buildOne).toThrow(InvalidTransactionPlanError);
    expect(buildOne).toThrow(expected);
  });

  test.each([
    ["missing", undefined],
    ["null", null],
  ])(
    "error: InvalidTransactionPlanError on a directly built step with a %s target",
    (_, target) => {
      const plan = parseTransactionPlan(savedSupplyBorrow);
      const step = plan.steps[2];
      assert(step?.action.type === "midnightSupplyCollateralTakeBorrow");
      const edited = {
        ...step,
        action: { ...step.action, inputs: { ...step.action.inputs, target } },
      } as unknown as typeof step;
      const expected = expect.objectContaining({ path: "$.inputs.target" });
      const buildAll = () => buildTransactions({ ...plan, steps: [edited] });
      expect(buildAll).toThrow(InvalidTransactionPlanError);
      expect(buildAll).toThrow(expected);
      const buildOne = () =>
        buildTransaction({ ...plan, steps: [edited] }, edited);
      expect(buildOne).toThrow(InvalidTransactionPlanError);
      expect(buildOne).toThrow(expected);
    },
  );
});

type StoredBigint = { $bigint: string };
type StoredSupplyInputs = {
  collateralSupplies: { collateralIndex: StoredBigint; assets: StoredBigint }[];
  nativeAssets?: StoredBigint;
};

function clientWithAuthorization(authorized: boolean) {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: midnightMarket.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result: authorized,
  });
  return handle;
}

test("stored format-2 midnightTakeBorrow builds fixed transaction bytes", () => {
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
        "id": "midnightTakeBorrow",
        "label": "Borrow on Midnight",
        "action": {
          "type": "midnightTakeBorrow",
          "inputs": {
            "chainId": 8453,
            "account": "0x000000000000000000000000000000000000A000",
            "market": {
              "chainId": { "$bigint": "8453" },
              "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
              "loanToken": "0x0000000000000000000000000000000000006000",
              "collateralParams": [
                {
                  "token": "0x0000000000000000000000000000000000007000",
                  "lltv": { "$bigint": "770000000000000000" },
                  "liquidationCursor": { "$bigint": "250000000000000000" },
                  "oracle": "0x0000000000000000000000000000000000008000"
                }
              ],
              "maturity": { "$bigint": "2000" },
              "rcfThreshold": { "$bigint": "0" },
              "enterGate": "0x0000000000000000000000000000000000000000",
              "liquidatorGate": "0x0000000000000000000000000000000000000000"
            },
            "target": {
              "type": "assets",
              "assets": { "$bigint": "50" },
              "maxUnits": { "$bigint": "60" }
            },
            "receiver": "0x000000000000000000000000000000000000A000",
            "takeableOffers": [
              {
                "units": { "$bigint": "100" },
                "offer": {
                  "market": {
                    "chainId": { "$bigint": "8453" },
                    "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
                    "loanToken": "0x0000000000000000000000000000000000006000",
                    "collateralParams": [
                      {
                        "token": "0x0000000000000000000000000000000000007000",
                        "lltv": { "$bigint": "770000000000000000" },
                        "liquidationCursor": { "$bigint": "250000000000000000" },
                        "oracle": "0x0000000000000000000000000000000000008000"
                      }
                    ],
                    "maturity": { "$bigint": "2000" },
                    "rcfThreshold": { "$bigint": "0" },
                    "enterGate": "0x0000000000000000000000000000000000000000",
                    "liquidatorGate": "0x0000000000000000000000000000000000000000"
                  },
                  "buy": true,
                  "maker": "0x0000000000000000000000000000000000009000",
                  "start": { "$bigint": "0" },
                  "expiry": { "$bigint": "2100" },
                  "tick": { "$bigint": "6744" },
                  "group": "0x2f5df906f5d6199308d9e9f3f4630c2150ce1790a89071d59a9bd9d84a822d7c",
                  "callback": "0x0000000000000000000000000000000000000000",
                  "callbackData": "0x",
                  "receiverIfMakerIsSeller": "0x0000000000000000000000000000000000000000",
                  "ratifier": "0xd6e70365C8E8DDa9a4ca662C07bbE663b017755E",
                  "reduceOnly": false,
                  "maxUnits": { "$bigint": "100" },
                  "maxAssets": { "$bigint": "0" },
                  "continuousFeeCap": { "$bigint": "0" }
                },
                "ratifierData": "0x1234"
              }
            ],
            "deadline": { "$bigint": "1600" },
            "referralFeePct": { "$bigint": "0" },
            "referralFeeRecipient": "0x0000000000000000000000000000000000000000"
          }
        }
      }
    ],
    "signatureRequests": []
  }`;
  const transactions = buildTransactions(parseTransactionPlan(saved));
  expect(
    transactions.map(({ to, data, value }) => ({ to, data, value })),
  ).toMatchInlineSnapshot(`
    [
      {
        "data": "0xb78212ab0000000000000000000000000bf30b530f816a619c3f28a3b9f44c441122555d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000a000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      },
      {
        "data": "0xca7de09c00000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000009000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008340000000000000000000000000000000000000000000000000000000000001a582f5df906f5d6199308d9e9f3f4630c2150ce1790a89071d59a9bd9d84a822d7c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d6e70365c8e8dda9a4ca662c07bbe663b017755e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d900000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000021234000000000000000000000000000000000000000000000000000000000000",
        "to": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        "value": 0n,
      },
    ]
  `);
});

describe("prepareMidnightTakeBorrow", () => {
  test("default: restores an assets-target plan with standalone authorization", async () => {
    const { client } = clientWithAuthorization(false);
    const plan = await prepareMidnightTakeBorrow(client, params);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      "midnightAuthorization",
      "midnightTakeBorrow",
    ]);
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    const [authorization, borrow] = txs;
    assert(authorization && borrow);
    expect(authorization.to).toBe(midnightMarket.midnight);
    expect(
      decodeFunctionData({ abi: midnightAbi, data: authorization.data }),
    ).toEqual({
      functionName: "setIsAuthorized",
      args: [bundle, true, account],
    });
    expect(borrow.to).toBe(bundle);
    expect(borrow.value).toBe(0n);
    expect(
      decodeFunctionData({ abi: midnightBundlesV2Abi, data: borrow.data }),
    ).toMatchObject({
      functionName: "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
      args: [
        expect.anything(),
        50n,
        60n,
        false,
        account,
        [],
        expect.anything(),
        0n,
        zeroAddress,
        1_600n,
        zeroAddress,
      ],
    });
  });

  test("behavior: projects and freezes units, fills and collateral before RPC, dropping bundle-aborting fills", async () => {
    const target = {
      type: "units",
      units: 50n,
      minSellerAssets: 49n,
      extra: 0n,
    } as const;
    const collateral = fill.offer.market.collateralParams.map((entry) => ({
      ...entry,
      extra: 0n,
    }));
    const takeable = {
      ...fill,
      offer: {
        ...fill.offer,
        market: { ...fill.offer.market, collateralParams: collateral },
      },
    };
    const { client, request } = clientWithAuthorization(true);
    const pending = prepareMidnightTakeBorrow(client, {
      ...params,
      target,
      receiver: midnightAddresses.oracle,
      referralFee: { bps: 20, recipient: midnightAddresses.maker },
      takeableOffers: [
        { ...fill, offer: { ...fill.offer, tick: MAX_TICK + 1n } },
        takeable,
      ],
    });
    takeable.units = 1n;
    for (const entry of collateral) {
      entry.lltv = 1n;
    }
    const plan = await pending;
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeBorrow");
    expect(plan.steps).toHaveLength(1);
    expect(plan.signatureRequests).toEqual([]);
    const { inputs } = step.action;
    expect(inputs.target).toEqual({
      type: "units",
      units: 50n,
      minSellerAssets: 49n,
    });
    expect(inputs.takeableOffers).toEqual([
      { units: fill.units, offer: fill.offer, ratifierData: fill.ratifierData },
    ]);
    expect(inputs).not.toHaveProperty("positionData");
    expect(inputs).not.toHaveProperty("collateralPrices");
    expect(
      Object.isFrozen(
        inputs.takeableOffers[0]?.offer.market.collateralParams[0],
      ),
    ).toBe(true);
    const reads = request.mock.calls.length;
    const [tx] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    expect(request.mock.calls).toHaveLength(reads);
    assert(tx);
    expect(
      decodeFunctionData({ abi: midnightBundlesV2Abi, data: tx.data }),
    ).toMatchObject({
      functionName: "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
      args: [
        expect.anything(),
        50n,
        49n,
        false,
        midnightAddresses.oracle,
        [],
        expect.anything(),
        2_000_000_000_000_000n,
        midnightAddresses.maker,
        1_600n,
        zeroAddress,
      ],
    });
  });

  test.each([
    [{ takeableOffers: [midnightApiTake()] }, MidnightOfferSideMismatchError],
    [
      {
        takeableOffers: [
          midnightApiTake({ buy: true, market: midnightOtherMarket }),
        ],
      },
      MidnightTakeableOfferMarketMismatchError,
    ],
    [
      {
        positionData: position({
          market: new Market({ ...marketData, params: midnightOtherMarket }),
        }),
      },
      MarketIdMismatchError,
    ],
    [
      { positionData: position({ user: midnightAddresses.maker }) },
      AccrualPositionUserMismatchError,
    ],
    [{ receiver: zeroAddress }, MidnightZeroReceiverError],
    [{ receiver: midnightMarket.loanToken }, MidnightContractReceiverError],
    [
      { referralFee: { bps: 1_001, recipient: midnightAddresses.maker } },
      InputExceedsMaxError,
    ],
    [{ expiresAt: 1_000 }, ExpiredDeadlineError],
    [{ expiresAt: 4_601 }, MidnightTakeDeadlineTooFarError],
    [
      {
        takeableOffers: [
          midnightApiTake({ buy: true, tick: MAX_TICK, expiry: 999n }),
        ],
      },
      MidnightTakeableOffersNotFillableError,
    ],
    [
      {
        takeableOffers: [{ ...fill, offer: { ...fill.offer, group: "0x01" } }],
      },
      MidnightCalldataEncodingError,
    ],
  ] as const)(
    "error: rejects invalid borrowing intent before RPC (%#)",
    async (overrides, error) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightTakeBorrow(client, { ...params, ...overrides }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test.each([
    {
      field: "target.assets",
      target: { type: "assets", assets: 50, maxUnits: 60n },
    },
    {
      field: "target.maxUnits",
      target: { type: "assets", assets: 50n, maxUnits: 60 },
    },
    {
      field: "target.units",
      target: { type: "units", units: 50, minSellerAssets: 49n },
    },
    {
      field: "target.minSellerAssets",
      target: { type: "units", units: 50n, minSellerAssets: 49 },
    },
  ])(
    "error: rejects a numeric $field before RPC",
    async ({ field, target }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightTakeBorrow(client, {
          ...params,
          target,
        } as unknown as MidnightTakeBorrowPlanParams),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: rejects a numeric now before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeBorrow(client, {
        ...params,
        now: 1_000,
      } as unknown as MidnightTakeBorrowPlanParams),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-03] rejects a raw-LLTV-safe borrow above the buffered limit", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeBorrow(client, {
        ...params,
        positionData: position({ debt: 706n }),
      }),
    ).rejects.toBeInstanceOf(BorrowExceedsSafeLtvError);
    expect(request).not.toHaveBeenCalled();
  });

  test("[INV-03] accepts a borrow exactly at the buffered limit", async () => {
    const { client } = clientWithAuthorization(true);
    const plan = await prepareMidnightTakeBorrow(client, {
      ...params,
      positionData: position({ debt: 705n }),
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightTakeBorrow",
    ]);
  });

  test("error: rejects a borrow that only raw credit can cover", async () => {
    const lossMarket = new Market({
      ...marketData,
      totalUnits: 100n,
      lossFactor: (maxUint128 * 3n) / 5n,
      withdrawable: 100n,
    });
    const positionData = position({ market: lossMarket, credit: 100n });
    expect(positionData.accrueInterest(params.now).credit).toBe(40n);
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeBorrow(client, {
        ...params,
        marketData: lossMarket,
        positionData,
        takeableOffers: [{ ...fill, units: 5n }],
      }),
    ).rejects.toBeInstanceOf(MidnightTakeTargetUnreachableError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: accrues credit from the market snapshot that caps withdrawals", async () => {
    const lossMarket = new Market({
      ...marketData,
      totalUnits: 100n,
      lossFactor: (maxUint128 * 3n) / 5n,
      withdrawable: 100n,
    });
    const stalePosition = position({
      market: new Market({ ...lossMarket, lossFactor: 0n }),
      credit: 100n,
    });
    expect(stalePosition.marketId).toBe(lossMarket.id);
    expect(stalePosition.accrueInterest(params.now).credit).toBe(100n);
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeBorrow(client, {
        ...params,
        marketData: lossMarket,
        positionData: stalePosition,
        takeableOffers: [{ ...fill, units: 5n }],
      }),
    ).rejects.toBeInstanceOf(MidnightTakeTargetUnreachableError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] rejects a mismatched chain before authorization", async () => {
    const { client, request } = createMockClient(mainnet);
    await expect(
      prepareMidnightTakeBorrow(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] a transport on another chain cannot read prerequisites", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) =>
      args.method === "eth_chainId" ? "0x1" : defaultRequest(args),
    );
    await expect(
      prepareMidnightTakeBorrow(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: checks registry code before authorization", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) =>
      args.method === "eth_getCode" ? "0x" : defaultRequest(args),
    );
    await expect(
      prepareMidnightTakeBorrow(client, params),
    ).rejects.toBeInstanceOf(MissingContractCodeError);
    const methods = request.mock.calls.map(([args]) => args.method);
    expect(methods).not.toContain("eth_call");
    expect(methods.filter((method) => method === "eth_chainId")).toHaveLength(
      1,
    );
  });

  test("error: rejects malformed stored borrow recipes", async () => {
    const { client } = clientWithAuthorization(true);
    const plan = await prepareMidnightTakeBorrow(client, params);
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeBorrow");
    const { inputs } = step.action;
    const malformed = [
      {
        ...step.action,
        inputs: {
          ...inputs,
          target: { ...inputs.target, maxUnits: maxUint128 + 1n },
        },
      },
      { ...step.action, inputs: { ...inputs, receiver: "0x12" } },
      {
        ...step.action,
        inputs: { ...inputs, market: { ...inputs.market, chainId: 1n } },
      },
      {
        ...step.action,
        inputs: {
          ...inputs,
          takeableOffers: [{ ...fill, ratifierData: "not hex" }],
        },
      },
      { ...step.action, signatureRequestIds: {} },
    ];
    for (const action of malformed) {
      const json = serializeTransactionPlan({
        ...plan,
        steps: [{ ...step, action }],
      } as typeof plan);
      expect(() => parseTransactionPlan(json)).toThrow(
        InvalidTransactionPlanError,
      );
    }
  });

  test("error: build rejects an unknown stored target type like restore", async () => {
    const { client } = clientWithAuthorization(true);
    const plan = await prepareMidnightTakeBorrow(client, params);
    const [step] = plan.steps;
    assert(step?.action.type === "midnightTakeBorrow");
    const tampered = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          target: { type: "shares", units: 60n, minSellerAssets: 50n },
        },
      },
    } as unknown as typeof step;
    const tamperedPlan = { ...plan, steps: [tampered] };

    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(tamperedPlan)),
    ).toThrow(
      expect.objectContaining({
        constructor: InvalidTransactionPlanError,
        path: "$.steps[0].action.inputs.target.type",
      }),
    );
    expect(() => buildTransactions(tamperedPlan)).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => buildTransaction(tamperedPlan, tampered)).toThrow(
      InvalidTransactionPlanError,
    );
  });
});
