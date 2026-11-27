import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  AccrualPosition,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import {
  decodeFunctionData,
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
  midnightMarket,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import { midnightWithdrawCollateralBatch } from "../../actions/midnight/withdrawCollateralBatch.js";
import {
  AccrualPositionUserMismatchError,
  ChainIdMismatchError,
  DuplicateMidnightCollateralIndexError,
  EmptyMidnightCollateralWithdrawalsError,
  ExpiredDeadlineError,
  InvalidBigIntInputError,
  MidnightMarketAddressMismatchError,
  MidnightZeroReceiverError,
  MissingContractCodeError,
  MissingMarketPriceError,
  NonPositiveInputError,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
} from "../../types/index.js";
import { InvalidTransactionPlanError, ZeroAccountError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  type MidnightWithdrawCollateralBatchPlanParams,
  prepareMidnightWithdrawCollateralBatch,
  validateMidnightWithdrawCollateralBatchPlanAction,
} from "./withdrawCollateralBatch.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const receiver = midnightAddresses.maker;
const midnight = getChainAddress(chainId, "midnight");
const prices = [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE];

function snapshot({
  market = midnightTwoCollateralMarket,
  debt = 0n,
  collateral = [200n, 50n],
  user = account,
}: {
  market?: MarketParams;
  debt?: bigint;
  collateral?: bigint[];
  user?: typeof account;
} = {}) {
  const marketData = new Market({
    params: market,
    totalUnits: 100n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });
  const positionData = new AccrualPosition(
    {
      user,
      debt,
      credit: 0n,
      pendingFee: 0n,
      lastAccrual: 1_000n,
      lastLossFactor: 0n,
      collateralBitmap: 3n,
      collateral,
    },
    marketData,
  );
  return { marketData, positionData };
}

function inputs(
  overrides: Partial<MidnightWithdrawCollateralBatchPlanParams> = {},
): MidnightWithdrawCollateralBatchPlanParams {
  return {
    chainId,
    account,
    ...snapshot(),
    collateralPrices: [],
    collateralWithdrawals: [
      { collateralIndex: 1n, assets: 5n },
      { collateralIndex: 0n, assets: 10n },
    ],
    now: 1_000n,
    expiresAt: 1_600,
    ...overrides,
  };
}

function prepare(
  overrides: Partial<MidnightWithdrawCollateralBatchPlanParams> = {},
) {
  return prepareMidnightWithdrawCollateralBatch(
    createMockClient(base).client,
    inputs(overrides),
  );
}

function directBuild(
  collateralWithdrawals: MidnightWithdrawCollateralBatchPlanParams["collateralWithdrawals"],
  to = account,
) {
  return midnightWithdrawCollateralBatch({
    chainId,
    market: midnightTwoCollateralMarket,
    collateralWithdrawals,
    onBehalf: account,
    receiver: to,
  });
}

/** Saved format-2 recipe pinned independently of the preparer. */
const savedWithdrawalBatch = `{
  "version": 2,
  "chainId": 8453,
  "account": "0x000000000000000000000000000000000000A000",
  "expiresAt": 1600,
  "steps": [
    {
      "id": "midnightWithdrawCollateralBatch",
      "label": "Withdraw Midnight collateral batch",
      "action": {
        "type": "midnightWithdrawCollateralBatch",
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
          "collateralWithdrawals": [
            {
              "collateralIndex": {
                "$bigint": "1"
              },
              "assets": {
                "$bigint": "5"
              }
            },
            {
              "collateralIndex": {
                "$bigint": "0"
              },
              "assets": {
                "$bigint": "10"
              }
            }
          ],
          "receiver": "0x000000000000000000000000000000000000A000"
        }
      }
    }
  ],
  "signatureRequests": []
}`;

describe("prepareMidnightWithdrawCollateralBatch", () => {
  test("default", async () => {
    const { client, request } = createMockClient(base);
    const plan = await prepareMidnightWithdrawCollateralBatch(client, inputs());
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored).toEqual(plan);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightWithdrawCollateralBatch",
    ]);
    expect(buildTransactions(restored)).toEqual([
      directBuild(inputs().collateralWithdrawals),
    ]);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
    ]);
  });

  test("behavior: the multicall withdraws each entry in order to the shared receiver", async () => {
    const plan = await prepare({ receiver });
    const [tx] = buildTransactions(plan);
    assert(tx);
    expect(tx.to).toBe(midnight);
    const { functionName, args } = decodeFunctionData({
      abi: midnightAbi,
      data: tx.data,
    });
    expect(functionName).toBe("multicall");
    const calls = (args[0] as readonly `0x${string}`[]).map((data) =>
      decodeFunctionData({ abi: midnightAbi, data }),
    );
    expect(
      calls.map((call) => [call.functionName, ...call.args.slice(1)]),
    ).toEqual([
      ["withdrawCollateral", 1n, 5n, account, receiver],
      ["withdrawCollateral", 0n, 10n, account, receiver],
    ]);
  });

  test("behavior: maxUint256 withdraws each index's snapshot balance", async () => {
    const plan = await prepare({
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: maxUint256 },
        { collateralIndex: 1n, assets: maxUint256 },
      ],
    });
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
    expect(step.action.inputs.collateralWithdrawals).toEqual([
      { collateralIndex: 0n, assets: 200n },
      { collateralIndex: 1n, assets: 50n },
    ]);
    expect(buildTransactions(plan)).toEqual([
      directBuild([
        { collateralIndex: 0n, assets: 200n },
        { collateralIndex: 1n, assets: 50n },
      ]),
    ]);
  });

  test("behavior: withdrawals that keep the debt within buffered capacity are prepared", async () => {
    const plan = await prepare({
      ...snapshot({ debt: 100n }),
      collateralPrices: prices,
    });
    expect(buildTransactions(plan)).toEqual([
      directBuild(inputs().collateralWithdrawals),
    ]);
  });

  test.each([
    {
      name: "keeps the pricier collateral and is prepared",
      // 10 at price 1 plus 49 at price 10 is 500 of value; swapped prices would give 149.
      withdrawals: [
        { collateralIndex: 0n, assets: 190n },
        { collateralIndex: 1n, assets: 1n },
      ],
      error: undefined,
    },
    {
      name: "removes the pricier collateral and is rejected",
      // 190 at price 1 plus 1 at price 10 is 200 of value; swapped prices would give 1,901.
      withdrawals: [
        { collateralIndex: 0n, assets: 10n },
        { collateralIndex: 1n, assets: 49n },
      ],
      error: WithdrawMakesPositionUnhealthyError,
    },
  ])(
    "behavior: a batch that $name prices each collateral at its own index",
    async ({ withdrawals, error }) => {
      const prepared = prepare({
        ...snapshot({ debt: 300n }),
        collateralPrices: [ORACLE_PRICE_SCALE, 10n * ORACLE_PRICE_SCALE],
        collateralWithdrawals: withdrawals,
      });
      if (error === undefined) {
        expect(buildTransactions(await prepared)).toEqual([
          directBuild(withdrawals),
        ]);
        return;
      }
      await expect(prepared).rejects.toBeInstanceOf(error);
    },
  );

  test("error: WithdrawExceedsCollateralError before any request", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateralBatch(
        client,
        inputs({
          collateralWithdrawals: [{ collateralIndex: 1n, assets: 51n }],
        }),
      ),
    ).rejects.toBeInstanceOf(WithdrawExceedsCollateralError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: WithdrawMakesPositionUnhealthyError when the remaining collateral cannot cover the debt", async () => {
    await expect(
      prepare({
        ...snapshot({ debt: 100n }),
        collateralPrices: prices,
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: 200n },
          { collateralIndex: 1n, assets: 1n },
        ],
      }),
    ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
  });

  test("error: [INV-03] WithdrawMakesPositionUnhealthyError when withdrawals safe alone together pass only the raw LLTV", async () => {
    const { client, request } = createMockClient(base);
    // 120 remaining collateral covers 92 debt at the raw 77% LLTV but not at 76.5%.
    await expect(
      prepareMidnightWithdrawCollateralBatch(
        client,
        inputs({
          ...snapshot({ debt: 92n }),
          collateralPrices: prices,
          collateralWithdrawals: [{ collateralIndex: 0n, assets: 100n }],
        }),
      ),
    ).resolves.toBeDefined();
    await expect(
      prepareMidnightWithdrawCollateralBatch(
        client,
        inputs({
          ...snapshot({ debt: 92n }),
          collateralPrices: prices,
          collateralWithdrawals: [{ collateralIndex: 1n, assets: 30n }],
        }),
      ),
    ).resolves.toBeDefined();
    const calls = request.mock.calls.length;
    await expect(
      prepareMidnightWithdrawCollateralBatch(
        client,
        inputs({
          ...snapshot({ debt: 92n }),
          collateralPrices: prices,
          collateralWithdrawals: [
            { collateralIndex: 0n, assets: 100n },
            { collateralIndex: 1n, assets: 30n },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
    expect(request.mock.calls).toHaveLength(calls);
  });

  test("error: MissingMarketPriceError when the snapshot has debt and no prices", async () => {
    await expect(prepare(snapshot({ debt: 1n }))).rejects.toBeInstanceOf(
      MissingMarketPriceError,
    );
  });

  test("error: EmptyMidnightCollateralWithdrawalsError", async () => {
    await expect(prepare({ collateralWithdrawals: [] })).rejects.toBeInstanceOf(
      EmptyMidnightCollateralWithdrawalsError,
    );
  });

  test("error: DuplicateMidnightCollateralIndexError", async () => {
    await expect(
      prepare({
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: 1n },
          { collateralIndex: 0n, assets: 1n },
        ],
      }),
    ).rejects.toBeInstanceOf(DuplicateMidnightCollateralIndexError);
  });

  test("error: UnknownCollateralIndexError", async () => {
    await expect(
      prepare({ collateralWithdrawals: [{ collateralIndex: 2n, assets: 1n }] }),
    ).rejects.toBeInstanceOf(UnknownCollateralIndexError);
  });

  test("error: AccrualPositionUserMismatchError for another account's position", async () => {
    await expect(prepare(snapshot({ user: receiver }))).rejects.toBeInstanceOf(
      AccrualPositionUserMismatchError,
    );
  });

  test("error: MidnightZeroReceiverError", async () => {
    await expect(prepare({ receiver: zeroAddress })).rejects.toBeInstanceOf(
      MidnightZeroReceiverError,
    );
  });

  test.each([
    {
      field: "collateralWithdrawals[0].assets",
      entry: { collateralIndex: 0n, assets: 1 },
    },
    {
      field: "collateralWithdrawals[0].collateralIndex",
      entry: { collateralIndex: 0, assets: 1n },
    },
  ])("error: rejects a numeric $field before RPC", async ({ field, entry }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateralBatch(client, {
        ...inputs(),
        collateralWithdrawals: [entry],
      } as unknown as MidnightWithdrawCollateralBatchPlanParams),
    ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
    expect(request).not.toHaveBeenCalled();
  });

  test("behavior: keeps the expiry and calldata origin through restore and build", async () => {
    const plan = await prepare({ calldataOrigin: "0x1234" });
    expect(plan.expiresAt).toBe(1_600);
    expect(plan.calldataOrigin).toBe("0x1234");
    const [tx] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(tx);
    expect(tx.data).toBe(
      `${directBuild(inputs().collateralWithdrawals).data}1234`,
    );
  });

  test.each([
    {
      name: "MidnightMarketAddressMismatchError for another Midnight deployment",
      market: new MarketParams({
        ...midnightTwoCollateralMarket,
        midnight: padHex("0x01", { size: 20 }),
      }),
      error: MidnightMarketAddressMismatchError,
    },
    {
      name: "ChainIdMismatchError for a market on another chain",
      market: new MarketParams({
        ...midnightTwoCollateralMarket,
        chainId: BigInt(mainnet.id),
      }),
      error: ChainIdMismatchError,
    },
  ])("error: $name before any request", async ({ market, error }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateralBatch(
        client,
        inputs(snapshot({ market })),
      ),
    ).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: InvalidBigIntInputError for a numeric collateral price before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateralBatch(client, {
        ...inputs(snapshot({ debt: 1n })),
        collateralPrices: [10n, 10],
      } as unknown as MidnightWithdrawCollateralBatchPlanParams),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "collateralPrices[1]",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: rejects a numeric now before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateralBatch(client, {
        ...inputs(),
        now: 1000,
      } as unknown as MidnightWithdrawCollateralBatchPlanParams),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: InvalidTransactionPlanError for withdrawals that are not an array", async () => {
    await expect(
      prepare({
        collateralWithdrawals:
          {} as unknown as MidnightWithdrawCollateralBatchPlanParams["collateralWithdrawals"],
      }),
    ).rejects.toMatchObject({
      constructor: InvalidTransactionPlanError,
      path: "$.collateralWithdrawals",
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
        prepareMidnightWithdrawCollateralBatch(
          client,
          inputs({
            collateralWithdrawals:
              entries as unknown as MidnightWithdrawCollateralBatchPlanParams["collateralWithdrawals"],
          }),
        ),
      ).rejects.toMatchObject({
        constructor: InvalidTransactionPlanError,
        path: "$.collateralWithdrawals[0]",
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("behavior: stores the market checked before the RPC awaits", async () => {
    const { client, request } = createMockClient(base);
    const params = inputs();
    const checked = MarketUtils.toStruct(params.marketData.params);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      (params.marketData as { params: unknown }).params = midnightMarket;
      return defaultRequest(args);
    });
    const plan = await prepareMidnightWithdrawCollateralBatch(client, params);
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
    expect(step.action.inputs.market).toEqual(checked);
  });

  test.each([
    {
      name: "a zero amount",
      changes: { collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }] },
      error: NonPositiveInputError,
    },
    {
      name: "a negative amount",
      changes: {
        collateralWithdrawals: [{ collateralIndex: 0n, assets: -1n }],
      },
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
  ])("error: rejects $name before any request", async ({ changes, error }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateralBatch(client, inputs(changes)),
    ).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] ChainIdMismatchError for another RPC chain before reading code", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValueOnce(numberToHex(mainnet.id));
    await expect(
      prepareMidnightWithdrawCollateralBatch(client, inputs()),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: MissingContractCodeError for a code-less Midnight core", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === midnight) {
        return "0x";
      }
      return defaultRequest(args);
    });
    await expect(
      prepareMidnightWithdrawCollateralBatch(client, inputs()),
    ).rejects.toMatchObject({
      constructor: MissingContractCodeError,
      role: "midnight",
    });
  });
});

describe("parseTransactionPlan with Midnight collateral withdrawal batches", () => {
  test("error: a directly built step with reversed collateral cannot switch the withdrawn tokens", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
    const market = step.action.inputs.market;
    const reversed = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          market: {
            ...market,
            collateralParams: [...market.collateralParams].reverse(),
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

  test("error: a directly built step whose entry has no collateral index cannot fall back to the first collateral", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
    const stripped = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          collateralWithdrawals: step.action.inputs.collateralWithdrawals.map(
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
        field: "inputs.collateralWithdrawals[0].collateralIndex",
      }),
    );
  });

  test("error: InvalidTransactionPlanError when a restored entry has no collateral index", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: {
              ...step.action.inputs,
              collateralWithdrawals: [{ assets: 1n }],
            },
          },
        },
      ],
    } as unknown as typeof plan);
    const parse = () => parseTransactionPlan(stored);
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.inputs.collateralWithdrawals[0].collateralIndex",
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
      assert(step?.action.type === "midnightWithdrawCollateralBatch");
      const collateralWithdrawals = [
        ...step.action.inputs.collateralWithdrawals,
      ];
      if (entry === null) {
        collateralWithdrawals[0] = entry as never;
      } else {
        delete collateralWithdrawals[0];
      }
      const malformed = {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, collateralWithdrawals },
        },
      };
      const build = () => buildTransactions({ ...plan, steps: [malformed] });
      expect(build).toThrow(InvalidTransactionPlanError);
      expect(build).toThrow(
        expect.objectContaining({ path: "$.inputs.collateralWithdrawals[0]" }),
      );
    },
  );

  test("behavior: a saved recipe restores to its committed calldata", () => {
    const [tx] = buildTransactions(parseTransactionPlan(savedWithdrawalBatch));
    assert(tx);
    expect({
      to: tx.to,
      value: tx.value,
      data: tx.data,
    }).toMatchInlineSnapshot(`
      {
        "data": "0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000002c4a121e2a900000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c4a121e2a900000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      }
    `);
  });

  test("error: InvalidTransactionPlanError for a signature reference", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
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
      validateMidnightWithdrawCollateralBatchPlanAction(
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

  test("error: DuplicateMidnightCollateralIndexError when a restored recipe repeats an index", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
    const duplicated = {
      ...step,
      action: {
        ...step.action,
        inputs: {
          ...step.action.inputs,
          collateralWithdrawals: [
            { collateralIndex: 0n, assets: 1n },
            { collateralIndex: 0n, assets: 1n },
          ],
        },
      },
    };
    const restored = parseTransactionPlan(
      serializeTransactionPlan({ ...plan, steps: [duplicated] }),
    );
    expect(() => buildTransactions(restored)).toThrow(
      DuplicateMidnightCollateralIndexError,
    );
  });

  test.each([
    [{ collateralWithdrawals: {} }, "collateralWithdrawals"],
    [
      { collateralWithdrawals: [{ collateralIndex: 2n, assets: 1n }] },
      "collateralWithdrawals[0].collateralIndex",
    ],
    [
      { collateralWithdrawals: [{ collateralIndex: 0n, assets: "1" }] },
      "collateralWithdrawals[0].assets",
    ],
    [
      {
        collateralWithdrawals: [
          { collateralIndex: 0n, assets: maxUint128 + 1n },
        ],
      },
      "collateralWithdrawals[0].assets",
    ],
    [{ collateralWithdrawals: [null] }, "collateralWithdrawals[0]"],
    [{ receiver: "0x01" }, "receiver"],
    [
      {
        market: {
          ...MarketUtils.toStruct(midnightTwoCollateralMarket),
          chainId: 1n,
        },
      },
      "market.chainId",
    ],
    [
      {
        market: {
          ...MarketUtils.toStruct(midnightTwoCollateralMarket),
          collateralParams: [
            ...MarketUtils.toStruct(midnightTwoCollateralMarket)
              .collateralParams,
          ].reverse(),
        },
      },
      "market.collateralParams",
    ],
  ])("error: InvalidTransactionPlanError for %s", async (overrides, field) => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateralBatch");
    const json = serializeTransactionPlan({
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
    const parse = () => parseTransactionPlan(json);
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({ path: `$.steps[0].action.inputs.${field}` }),
    );
  });
});
