import {
  MarketParams,
  MarketUtils,
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
  numberToHex,
  padHex,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import { midnightSupplyCollateralBatch } from "../../actions/midnight/supplyCollateralBatch.js";
import {
  ChainIdMismatchError,
  DuplicateMidnightCollateralIndexError,
  EmptyMidnightCollateralSuppliesError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  MidnightCalldataEncodingError,
  MissingContractCodeError,
  NonPositiveInputError,
} from "../../types/index.js";
import { InvalidTransactionPlanError, ZeroAccountError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  type MidnightSupplyCollateralBatchPlanParams,
  prepareMidnightSupplyCollateralBatch,
  validateMidnightSupplyCollateralBatchPlanAction,
} from "./supplyCollateralBatch.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const midnight = getChainAddress(chainId, "midnight");
const market = midnightTwoCollateralMarket;
const first = market.collateralParams[0]!.token;
const second = market.collateralParams[1]!.token;
const params = {
  chainId,
  account,
  market,
  collateralSupplies: [
    { collateralIndex: 1n, assets: 200n },
    { collateralIndex: 0n, assets: 100n },
  ],
  now: 1_000n,
  expiresAt: 1_600,
} as const satisfies MidnightSupplyCollateralBatchPlanParams;

function clientWith(allowances: { first?: bigint; second?: bigint } = {}) {
  const handle = createMockClient(base);
  for (const [address, result] of [
    [first, allowances.first ?? maxUint256],
    [second, allowances.second ?? maxUint256],
  ] as const) {
    mockRead(handle, {
      address,
      abi: erc20Abi,
      functionName: "allowance",
      result,
    });
  }
  return handle;
}

function prepare(
  overrides: Partial<MidnightSupplyCollateralBatchPlanParams> = {},
  allowances?: Parameters<typeof clientWith>[0],
) {
  return prepareMidnightSupplyCollateralBatch(clientWith(allowances).client, {
    ...params,
    ...overrides,
  });
}

/** Saved format-2 recipe pinned independently of the preparer. */
const savedSupplyBatch = `{
  "version": 2,
  "chainId": 8453,
  "account": "0x000000000000000000000000000000000000A000",
  "expiresAt": 1600,
  "steps": [
    {
      "id": "midnightSupplyCollateralBatch",
      "label": "Supply Midnight collateral batch",
      "action": {
        "type": "midnightSupplyCollateralBatch",
        "inputs": {
          "account": "0x000000000000000000000000000000000000A000",
          "chainId": 8453,
          "market": {
            "chainId": {
              "$bigint": "8453"
            },
            "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
            "loanToken": "0x0000000000000000000000000000000000006000",
            "collateralParams": [
              {
                "token": "0x0000000000000000000000000000000000007000",
                "lltv": {
                  "$bigint": "770000000000000000"
                },
                "liquidationCursor": {
                  "$bigint": "250000000000000000"
                },
                "oracle": "0x0000000000000000000000000000000000008000"
              },
              {
                "token": "0x0000000000000000000000000000000000007100",
                "lltv": {
                  "$bigint": "770000000000000000"
                },
                "liquidationCursor": {
                  "$bigint": "250000000000000000"
                },
                "oracle": "0x0000000000000000000000000000000000008000"
              }
            ],
            "maturity": {
              "$bigint": "2000"
            },
            "rcfThreshold": {
              "$bigint": "0"
            },
            "enterGate": "0x0000000000000000000000000000000000000000",
            "liquidatorGate": "0x0000000000000000000000000000000000000000"
          },
          "collateralSupplies": [
            {
              "collateralIndex": {
                "$bigint": "1"
              },
              "assets": {
                "$bigint": "200"
              }
            },
            {
              "collateralIndex": {
                "$bigint": "0"
              },
              "assets": {
                "$bigint": "100"
              }
            }
          ]
        }
      }
    }
  ],
  "signatureRequests": []
}`;

describe("prepareMidnightSupplyCollateralBatch", () => {
  test("default", async () => {
    const plan = await prepare();
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored).toEqual(plan);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightSupplyCollateralBatch",
    ]);
    expect(buildTransactions(restored)).toEqual([
      midnightSupplyCollateralBatch({
        chainId,
        market,
        collateralSupplies: params.collateralSupplies,
        onBehalf: account,
      }),
    ]);
  });

  test("behavior: one entry still builds a multicall", async () => {
    const collateralSupplies = [{ collateralIndex: 0n, assets: 100n }];
    const plan = await prepare({ collateralSupplies });
    const [tx] = buildTransactions(plan);
    assert(tx);
    expect(tx).toEqual(
      midnightSupplyCollateralBatch({
        chainId,
        market,
        collateralSupplies,
        onBehalf: account,
      }),
    );
    expect(tx).toMatchObject({ to: midnight, value: 0n });
  });

  test("behavior: approves only the tokens whose allowance is short, in supply order", async () => {
    const handle = clientWith({ first: 99n, second: 199n });
    const plan = await prepareMidnightSupplyCollateralBatch(
      handle.client,
      params,
    );
    expect(
      [first, second].flatMap((address) =>
        expectReadCall(handle, {
          address,
          abi: erc20Abi,
          functionName: "allowance",
        }).map(({ args }) => args),
      ),
    ).toEqual([
      [account, midnight],
      [account, midnight],
    ]);
    expect(plan.steps.map(({ id }) => id)).toEqual([
      "midnightSupplyCollateralBatch:approval:0:0",
      "midnightSupplyCollateralBatch:approval:1:0",
      "midnightSupplyCollateralBatch",
    ]);
    const [secondApproval, firstApproval] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(secondApproval && firstApproval);
    expect(secondApproval.to).toBe(second);
    expect(firstApproval.to).toBe(first);
    for (const approval of [secondApproval, firstApproval]) {
      expect(
        decodeFunctionData({ abi: erc20Abi, data: approval.data }),
      ).toEqual({ functionName: "approve", args: [midnight, maxUint256] });
    }

    const covered = await prepare({}, { first: 100n, second: 199n });
    expect(covered.steps.map(({ id }) => id)).toEqual([
      "midnightSupplyCollateralBatch:approval:0:0",
      "midnightSupplyCollateralBatch",
    ]);
  });

  test("behavior: a nonzero USDT allowance below its total is reset before approving, beside another token's approval", async () => {
    const usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const mainnetMidnight = getChainAddress(mainnet.id, "midnight");
    const usdtMarket = new MarketParams({
      ...market,
      chainId: mainnet.id,
      midnight: mainnetMidnight,
      collateralParams: [
        market.collateralParams[0]!,
        { ...market.collateralParams[1]!, token: usdt },
      ],
    });
    const handle = createMockClient(mainnet);
    for (const [address, result] of [
      [first, 99n],
      [usdt, 199n],
    ] as const) {
      mockRead(handle, {
        address,
        abi: erc20Abi,
        functionName: "allowance",
        result,
      });
    }
    const plan = await prepareMidnightSupplyCollateralBatch(handle.client, {
      ...params,
      chainId: mainnet.id,
      market: usdtMarket,
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "erc20Approval",
      "erc20Approval",
      "midnightSupplyCollateralBatch",
    ]);
    const [reset, usdtApproval, firstApproval] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(reset && usdtApproval && firstApproval);
    expect([reset.to, usdtApproval.to, firstApproval.to]).toEqual([
      usdt,
      usdt,
      first,
    ]);
    expect(
      [reset, usdtApproval, firstApproval].map(({ data }) =>
        decodeFunctionData({ abi: erc20Abi, data }),
      ),
    ).toEqual([
      { functionName: "approve", args: [mainnetMidnight, 0n] },
      { functionName: "approve", args: [mainnetMidnight, maxUint256] },
      { functionName: "approve", args: [mainnetMidnight, maxUint256] },
    ]);
  });

  test("behavior: ignores an entity entry's reservedCollateralAssets when checking allowances", async () => {
    const entries = [
      { collateralIndex: 1n, assets: 200n, reservedCollateralAssets: 1_000n },
      { collateralIndex: 0n, assets: 100n, reservedCollateralAssets: 1_000n },
    ];
    const plan = await prepare(
      { collateralSupplies: entries },
      { first: 100n, second: 200n },
    );
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightSupplyCollateralBatch",
    ]);
  });

  test("error: EmptyMidnightCollateralSuppliesError", async () => {
    await expect(prepare({ collateralSupplies: [] })).rejects.toBeInstanceOf(
      EmptyMidnightCollateralSuppliesError,
    );
  });

  test("error: DuplicateMidnightCollateralIndexError", async () => {
    await expect(
      prepare({
        collateralSupplies: [
          { collateralIndex: 0n, assets: 1n },
          { collateralIndex: 0n, assets: 2n },
        ],
      }),
    ).rejects.toBeInstanceOf(DuplicateMidnightCollateralIndexError);
  });

  test("error: NonPositiveInputError for a zero amount", async () => {
    await expect(
      prepare({ collateralSupplies: [{ collateralIndex: 0n, assets: 0n }] }),
    ).rejects.toMatchObject({
      constructor: NonPositiveInputError,
      field: "assets",
    });
  });

  test("error: InputExceedsMaxError above uint128", async () => {
    await expect(
      prepare({
        collateralSupplies: [{ collateralIndex: 0n, assets: maxUint128 + 1n }],
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
  });

  test("error: UnknownCollateralIndexError", async () => {
    await expect(
      prepare({ collateralSupplies: [{ collateralIndex: 2n, assets: 1n }] }),
    ).rejects.toBeInstanceOf(UnknownCollateralIndexError);
  });

  test.each([
    {
      field: "collateralSupplies[0].collateralIndex",
      entry: { collateralIndex: 0, assets: 1n },
    },
    {
      field: "collateralSupplies[0].assets",
      entry: { collateralIndex: 0n, assets: 1 },
    },
  ])(
    "error: InvalidBigIntInputError for $field before RPC",
    async ({ field, entry }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightSupplyCollateralBatch(client, {
          ...params,
          collateralSupplies: [entry],
        } as unknown as MidnightSupplyCollateralBatchPlanParams),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: InvalidBigIntInputError for a numeric now before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightSupplyCollateralBatch(client, {
        ...params,
        now: 1000,
      } as unknown as MidnightSupplyCollateralBatchPlanParams),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: InvalidTransactionPlanError when supplies are not an array", async () => {
    await expect(
      prepare({
        collateralSupplies:
          {} as unknown as MidnightSupplyCollateralBatchPlanParams["collateralSupplies"],
      }),
    ).rejects.toMatchObject({
      constructor: InvalidTransactionPlanError,
      path: "$.collateralSupplies",
    });
  });

  test.each([
    { name: "null", entries: [null] },
    { name: "a hole", entries: Array.from({ length: 1 }) },
  ])(
    "error: InvalidTransactionPlanError for $name entry before RPC",
    async ({ entries }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightSupplyCollateralBatch(client, {
          ...params,
          collateralSupplies:
            entries as unknown as MidnightSupplyCollateralBatchPlanParams["collateralSupplies"],
        }),
      ).rejects.toMatchObject({
        constructor: InvalidTransactionPlanError,
        path: "$.collateralSupplies[0]",
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("behavior: stores the market checked before the RPC awaits", async () => {
    const { client, request } = clientWith();
    const mutable = {
      ...MarketUtils.toStruct(midnightTwoCollateralMarket),
      collateralParams: [...midnightTwoCollateralMarket.collateralParams],
    };
    const checked = MarketUtils.toStruct(mutable);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      mutable.collateralParams = mutable.collateralParams.slice(0, 1);
      return defaultRequest(args);
    });
    const plan = await prepareMidnightSupplyCollateralBatch(client, {
      ...params,
      market: mutable,
    });
    const step = plan.steps.at(-1);
    assert(step?.action.type === "midnightSupplyCollateralBatch");
    expect(step.action.inputs.market).toEqual(checked);
  });

  test.each([
    {
      name: "a negative amount",
      changes: { collateralSupplies: [{ collateralIndex: 0n, assets: -1n }] },
      error: NonPositiveInputError,
    },
    {
      name: "an expired expiresAt",
      changes: { expiresAt: 999 },
      error: ExpiredDeadlineError,
    },
    {
      name: "the zero account",
      changes: { account: zeroAddress },
      error: ZeroAccountError,
    },
    {
      name: "a market on another chain",
      changes: { market: new MarketParams({ ...market, chainId: mainnet.id }) },
      error: ChainIdMismatchError,
    },
    {
      name: "a market gate that cannot be ABI-encoded",
      changes: {
        market: {
          ...MarketUtils.toStruct(market),
          enterGate: "0x01",
        } as unknown as MarketParams,
      },
      error: MidnightCalldataEncodingError,
    },
  ])("error: rejects $name before any request", async ({ changes, error }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightSupplyCollateralBatch(client, { ...params, ...changes }),
    ).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    { entries: 16, error: undefined },
    { entries: 17, error: InputExceedsMaxError },
  ])(
    "behavior: a batch of $entries collaterals against Midnight's 16-collateral cap",
    async ({ entries, error }) => {
      const collateralParams = Array.from({ length: entries }, (_, index) => ({
        ...market.collateralParams[0]!,
        token: padHex(numberToHex(0x7000 + index), { size: 20 }),
      }));
      const wide = new MarketParams({ ...market, collateralParams });
      const handle = createMockClient(base);
      for (const { token } of collateralParams) {
        mockRead(handle, {
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          result: maxUint256,
        });
      }
      const prepared = prepareMidnightSupplyCollateralBatch(handle.client, {
        ...params,
        market: wide,
        collateralSupplies: collateralParams.map((_, index) => ({
          collateralIndex: BigInt(index),
          assets: 1n,
        })),
      });
      if (error === undefined) {
        const plan = await prepared;
        expect(plan.steps).toHaveLength(1);
        return;
      }
      await expect(prepared).rejects.toMatchObject({
        constructor: error,
        field: "collateralSupplies.length",
      });
      expect(handle.request).not.toHaveBeenCalled();
    },
  );

  test("behavior: keeps the expiry and calldata origin through restore and build", async () => {
    const plan = await prepare({ calldataOrigin: "0x1234" });
    expect(plan.expiresAt).toBe(1_600);
    expect(plan.calldataOrigin).toBe("0x1234");
    const step = plan.steps.at(-1);
    assert(step?.action.type === "midnightSupplyCollateralBatch");
    const [tx] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(tx);
    expect(tx.data.endsWith("1234")).toBe(true);
    expect(tx.data.slice(0, -4)).toBe(
      buildTransactions({ ...plan, calldataOrigin: undefined })[0]?.data,
    );
  });

  test("error: [INV-05] ChainIdMismatchError for another RPC chain before any read", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValueOnce(numberToHex(mainnet.id));
    await expect(
      prepareMidnightSupplyCollateralBatch(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: rejects missing Midnight core code before reading allowances", async () => {
    const { client, request } = clientWith();
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === midnight) {
        return "0x";
      }
      return defaultRequest(args);
    });
    await expect(
      prepareMidnightSupplyCollateralBatch(client, params),
    ).rejects.toMatchObject({
      constructor: MissingContractCodeError,
      role: "midnight",
    });
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
      "eth_call",
    );
  });
});

describe("parseTransactionPlan with Midnight collateral supply batches", () => {
  async function storedWith(overrides: Record<string, unknown>) {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralBatch");
    return serializeTransactionPlan({
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: { ...step.action.inputs, ...overrides },
          },
        },
      ],
    } as typeof plan);
  }

  test("error: a directly built step with reversed collateral cannot switch the supplied tokens", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralBatch");
    const stored = step.action.inputs.market;
    const reversed = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          market: {
            ...stored,
            collateralParams: [...stored.collateralParams].reverse(),
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

  test("error: DuplicateMidnightCollateralIndexError when a restored recipe repeats an index", async () => {
    const restored = parseTransactionPlan(
      await storedWith({
        collateralSupplies: [
          { collateralIndex: 0n, assets: 1n },
          { collateralIndex: 0n, assets: 2n },
        ],
      }),
    );
    expect(() => buildTransactions(restored)).toThrow(
      DuplicateMidnightCollateralIndexError,
    );
  });

  test("error: a directly built step whose entry has no collateral index cannot fall back to the first collateral", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralBatch");
    const stripped = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          collateralSupplies: step.action.inputs.collateralSupplies.map(
            ({ assets }) => ({ assets }),
          ),
        },
      },
    };
    const build = () =>
      buildTransactions({
        ...plan,
        steps: [stripped],
      } as unknown as typeof plan);
    expect(build).toThrow(
      expect.objectContaining({
        constructor: InvalidBigIntInputError,
        field: "inputs.collateralSupplies[0].collateralIndex",
      }),
    );
  });

  test("error: InvalidTransactionPlanError when a restored entry has no collateral index", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralBatch");
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: {
              ...step.action.inputs,
              collateralSupplies: [{ assets: 1n }],
            },
          },
        },
      ],
    } as unknown as typeof plan);
    const parse = () => parseTransactionPlan(stored);
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.inputs.collateralSupplies[0].collateralIndex",
      }),
    );
  });

  test.each([
    { name: "null", entry: null },
    { name: "a hole", entry: undefined },
  ])(
    "error: a directly built step with a $name entry throws InvalidTransactionPlanError",
    async ({ entry }) => {
      const plan = await prepare();
      const step = plan.steps[0];
      assert(step?.action.type === "midnightSupplyCollateralBatch");
      const collateralSupplies = [...step.action.inputs.collateralSupplies];
      if (entry === null) {
        collateralSupplies[0] = entry as never;
      } else {
        delete collateralSupplies[0];
      }
      const malformed = {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, collateralSupplies },
        },
      };
      const build = () => buildTransactions({ ...plan, steps: [malformed] });
      expect(build).toThrow(InvalidTransactionPlanError);
      expect(build).toThrow(
        expect.objectContaining({ path: "$.inputs.collateralSupplies[0]" }),
      );
    },
  );

  test("behavior: a saved recipe restores to its committed calldata", (context) => {
    const [tx] = buildTransactions(parseTransactionPlan(savedSupplyBatch));
    assert(tx);
    context
      .expect({
        to: tx.to,
        value: tx.value,
        data: tx.data,
      })
      .toMatchInlineSnapshot(`
      {
        "data": "0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000002a432292d960000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c8000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a432292d96000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      }
    `);
  });

  test("error: InvalidTransactionPlanError for a signature reference", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralBatch");
    const action = { ...step.action, signatureRequestIds: {} };
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [{ ...step, action }],
    });
    expect(() => parseTransactionPlan(stored)).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.signatureRequestIds",
      }),
    );
    expect(() =>
      validateMidnightSupplyCollateralBatchPlanAction(
        action,
        "$.steps[0].action",
      ),
    ).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.signatureRequestIds",
        reason: "Midnight steps do not consume signatures",
      }),
    );
  });

  test.each([
    [{ collateralSupplies: {} }, "collateralSupplies"],
    [{ collateralSupplies: [null] }, "collateralSupplies[0]"],
    [
      { collateralSupplies: [{ collateralIndex: 2n, assets: 1n }] },
      "collateralSupplies[0].collateralIndex",
    ],
    [
      { collateralSupplies: [{ collateralIndex: "0", assets: 1n }] },
      "collateralSupplies[0].collateralIndex",
    ],
    [
      {
        collateralSupplies: [{ collateralIndex: 0n, assets: maxUint128 + 1n }],
      },
      "collateralSupplies[0].assets",
    ],
    [
      { market: { ...MarketUtils.toStruct(market), chainId: 1n } },
      "market.chainId",
    ],
    [
      {
        market: {
          ...MarketUtils.toStruct(market),
          collateralParams: [
            ...MarketUtils.toStruct(market).collateralParams,
          ].reverse(),
        },
      },
      "market.collateralParams",
    ],
  ])("error: InvalidTransactionPlanError for %s", async (overrides, field) => {
    const json = await storedWith(overrides);
    const parse = () => parseTransactionPlan(json);
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({ path: `$.steps[0].action.inputs.${field}` }),
    );
  });
});
