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
import { midnightWithdrawCollateral } from "../../actions/midnight/withdrawCollateral.js";
import {
  AccrualPositionUserMismatchError,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InvalidBigIntInputError,
  MarketIdMismatchError,
  MidnightContractReceiverError,
  MidnightMarketAddressMismatchError,
  MidnightZeroReceiverError,
  MissingContractCodeError,
  MissingMarketPriceError,
  NonPositiveInputError,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
} from "../../types/index.js";
import {
  InvalidTransactionPlanError,
  NonIntegerInputError,
  ZeroAccountError,
} from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  type MidnightWithdrawCollateralPlanParams,
  prepareMidnightWithdrawCollateral,
  validateMidnightWithdrawCollateralPlanAction,
} from "./withdrawCollateral.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const receiver = midnightAddresses.maker;
const midnight = getChainAddress(chainId, "midnight");

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
  overrides: Partial<MidnightWithdrawCollateralPlanParams> = {},
): MidnightWithdrawCollateralPlanParams {
  return {
    chainId,
    account,
    ...snapshot(),
    collateralPrices: [],
    assets: 10n,
    now: 1_000n,
    expiresAt: 1_600,
    ...overrides,
  };
}

function prepare(
  overrides: Partial<MidnightWithdrawCollateralPlanParams> = {},
) {
  return prepareMidnightWithdrawCollateral(
    createMockClient(base).client,
    inputs(overrides),
  );
}

function directBuild(params: {
  collateralIndex?: bigint;
  assets: bigint;
  receiver?: typeof receiver;
}) {
  return midnightWithdrawCollateral({
    chainId,
    market: midnightTwoCollateralMarket,
    collateralIndex: params.collateralIndex ?? 0n,
    assets: params.assets,
    onBehalf: account,
    receiver: params.receiver ?? account,
  });
}

/** Saved format-2 recipe pinned independently of the preparer: 5 of index 1 to another receiver. */
const savedWithdrawal = `{
  "version": 2,
  "chainId": 8453,
  "account": "0x000000000000000000000000000000000000A000",
  "expiresAt": 1600,
  "steps": [
    {
      "id": "midnightWithdrawCollateral",
      "label": "Withdraw Midnight collateral",
      "action": {
        "type": "midnightWithdrawCollateral",
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
          "collateralIndex": {
            "$bigint": "1"
          },
          "assets": {
            "$bigint": "5"
          },
          "receiver": "0x0000000000000000000000000000000000009000"
        }
      }
    }
  ],
  "signatureRequests": []
}`;

describe("prepareMidnightWithdrawCollateral", () => {
  test("default", async () => {
    const { client, request } = createMockClient(base);
    const plan = await prepareMidnightWithdrawCollateral(client, inputs());
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored).toEqual(plan);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightWithdrawCollateral",
    ]);
    expect(buildTransactions(restored)).toEqual([directBuild({ assets: 10n })]);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
    ]);
  });

  test("behavior: keeps the expiry and calldata origin through restore and build", async () => {
    const plan = await prepare({ calldataOrigin: "0x1234" });
    expect(plan.expiresAt).toBe(1_600);
    expect(plan.calldataOrigin).toBe("0x1234");
    const [tx] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(tx);
    expect(tx.data).toBe(`${directBuild({ assets: 10n }).data}1234`);
  });

  test("behavior: the built transaction withdraws the selected collateral to the receiver", async () => {
    const plan = await prepare({ collateralIndex: 1n, assets: 5n, receiver });
    const [tx] = buildTransactions(plan);
    assert(tx);
    expect(tx).toEqual(
      directBuild({ collateralIndex: 1n, assets: 5n, receiver }),
    );
    expect(tx.to).toBe(midnight);
    expect(tx.value).toBe(0n);
  });

  test("behavior: maxUint256 withdraws the snapshot balance at the selected index", async () => {
    const plan = await prepare({ collateralIndex: 1n, assets: maxUint256 });
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateral");
    expect(step.action.inputs.assets).toBe(50n);
    expect(buildTransactions(plan)).toEqual([
      directBuild({ collateralIndex: 1n, assets: 50n }),
    ]);
  });

  test("behavior: a withdrawal that keeps the debt within buffered capacity is prepared", async () => {
    const plan = await prepare({
      ...snapshot({ debt: 100n }),
      collateralPrices: [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE],
      assets: 10n,
    });
    expect(buildTransactions(plan)).toEqual([directBuild({ assets: 10n })]);
  });

  test("behavior: the health check removes the collateral at the withdrawn index", async () => {
    // 200 at price 1 and 50 at price 10: withdrawing 30 of index 0 keeps 170 + 500 of value.
    const plan = await prepare({
      ...snapshot({ debt: 400n }),
      collateralPrices: [ORACLE_PRICE_SCALE, 10n * ORACLE_PRICE_SCALE],
      collateralIndex: 0n,
      assets: 30n,
    });
    expect(buildTransactions(plan)).toEqual([
      directBuild({ collateralIndex: 0n, assets: 30n }),
    ]);
  });

  test("error: WithdrawMakesPositionUnhealthyError when the same amount leaves the pricier index", async () => {
    // Withdrawing 30 of index 1 keeps 200 + 200 of value, below the debt at the buffered LLTV.
    await expect(
      prepare({
        ...snapshot({ debt: 400n }),
        collateralPrices: [ORACLE_PRICE_SCALE, 10n * ORACLE_PRICE_SCALE],
        collateralIndex: 1n,
        assets: 30n,
      }),
    ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
  });

  test("error: WithdrawExceedsCollateralError before any request", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateral(client, inputs({ assets: 201n })),
    ).rejects.toBeInstanceOf(WithdrawExceedsCollateralError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: NonPositiveInputError for maxUint256 at an empty index", async () => {
    await expect(
      prepare({
        ...snapshot({ collateral: [200n] }),
        collateralIndex: 1n,
        assets: maxUint256,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);
  });

  test("error: WithdrawMakesPositionUnhealthyError when the remaining collateral cannot cover the debt", async () => {
    await expect(
      prepare({
        ...snapshot({ debt: 100n }),
        collateralPrices: [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE],
        assets: 200n,
      }),
    ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
  });

  test("error: [INV-03] WithdrawMakesPositionUnhealthyError when only the LLTV buffer rejects the withdrawal, before any request", async () => {
    const { client, request } = createMockClient(base);
    // 240 remaining collateral covers 184 debt at the raw 77% LLTV but not at 76.5%.
    await expect(
      prepareMidnightWithdrawCollateral(
        client,
        inputs({
          ...snapshot({ debt: 184n }),
          collateralPrices: [ORACLE_PRICE_SCALE, ORACLE_PRICE_SCALE],
          assets: 10n,
        }),
      ),
    ).rejects.toBeInstanceOf(WithdrawMakesPositionUnhealthyError);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: MissingMarketPriceError when the snapshot has debt and no prices", async () => {
    await expect(
      prepare({ ...snapshot({ debt: 1n }), collateralPrices: [] }),
    ).rejects.toBeInstanceOf(MissingMarketPriceError);
  });

  test("error: AccrualPositionUserMismatchError for another account's position", async () => {
    await expect(prepare(snapshot({ user: receiver }))).rejects.toBeInstanceOf(
      AccrualPositionUserMismatchError,
    );
  });

  test("error: MarketIdMismatchError for a position from another market", async () => {
    const { marketData } = snapshot({ market: midnightMarket });
    await expect(prepare({ marketData })).rejects.toBeInstanceOf(
      MarketIdMismatchError,
    );
  });

  test("error: UnknownCollateralIndexError", async () => {
    await expect(prepare({ collateralIndex: 2n })).rejects.toBeInstanceOf(
      UnknownCollateralIndexError,
    );
  });

  test("error: MidnightZeroReceiverError", async () => {
    await expect(prepare({ receiver: zeroAddress })).rejects.toBeInstanceOf(
      MidnightZeroReceiverError,
    );
  });

  test("error: MidnightContractReceiverError for Midnight core", async () => {
    await expect(prepare({ receiver: midnight })).rejects.toBeInstanceOf(
      MidnightContractReceiverError,
    );
  });

  test("error: MidnightMarketAddressMismatchError", async () => {
    const market = new MarketParams({
      ...midnightTwoCollateralMarket,
      midnight: padHex("0x01", { size: 20 }),
    });
    await expect(prepare(snapshot({ market }))).rejects.toBeInstanceOf(
      MidnightMarketAddressMismatchError,
    );
  });

  test("error: ChainIdMismatchError for a market on another chain", async () => {
    const market = new MarketParams({
      ...midnightTwoCollateralMarket,
      chainId: BigInt(mainnet.id),
    });
    await expect(prepare(snapshot({ market }))).rejects.toBeInstanceOf(
      ChainIdMismatchError,
    );
  });

  test.each([
    { field: "collateralPrices[1]", prices: [10n, 10] },
    { field: "collateralPrices[0]", prices: [1.5] },
  ])(
    "error: InvalidBigIntInputError for $field before RPC",
    async ({ field, prices }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightWithdrawCollateral(client, {
          ...inputs(snapshot({ debt: 1n })),
          collateralPrices: prices,
        } as unknown as MidnightWithdrawCollateralPlanParams),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: InvalidTransactionPlanError for non-array collateralPrices before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateral(client, {
        ...inputs(),
        collateralPrices: {},
      } as unknown as MidnightWithdrawCollateralPlanParams),
    ).rejects.toMatchObject({
      constructor: InvalidTransactionPlanError,
      path: "$.collateralPrices",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    { field: "assets", value: 10 },
    { field: "collateralIndex", value: 1 },
    { field: "now", value: 1000 },
  ])(
    "error: rejects a numeric $field of $value before RPC",
    async ({ field, value }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightWithdrawCollateral(client, {
          ...inputs(),
          [field]: value,
        } as unknown as MidnightWithdrawCollateralPlanParams),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test.each([
    {
      name: "zero assets",
      changes: { assets: 0n },
      error: NonPositiveInputError,
    },
    {
      name: "negative assets",
      changes: { assets: -1n },
      error: NonPositiveInputError,
    },
    {
      name: "an expired expiresAt",
      changes: { expiresAt: 999 },
      error: ExpiredDeadlineError,
    },
    {
      name: "a non-integer expiresAt",
      changes: { expiresAt: 1_600.5 },
      error: NonIntegerInputError,
    },
    {
      name: "the zero account",
      changes: { account: zeroAddress },
      error: ZeroAccountError,
    },
  ])("error: rejects $name before any request", async ({ changes, error }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightWithdrawCollateral(client, inputs(changes)),
    ).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] ChainIdMismatchError for another RPC chain before reading code", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValueOnce(numberToHex(mainnet.id));
    await expect(
      prepareMidnightWithdrawCollateral(client, inputs()),
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
    const preparation = prepareMidnightWithdrawCollateral(client, inputs());
    await expect(preparation).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(preparation).rejects.toMatchObject({
      address: midnight,
      role: "midnight",
    });
  });
});

describe("parseTransactionPlan with Midnight collateral withdrawals", () => {
  test("error: a directly built step with reversed collateral cannot switch the withdrawn token", async () => {
    const plan = await prepare({ collateralIndex: 1n });
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateral");
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

  test("error: InvalidTransactionPlanError when a restored step has no collateral index", async () => {
    const plan = await prepare({ collateralIndex: 1n });
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateral");
    const { collateralIndex: _collateralIndex, ...unindexed } =
      step.action.inputs;
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [{ ...step, action: { ...step.action, inputs: unindexed } }],
    } as unknown as typeof plan);
    const parse = () => parseTransactionPlan(stored);
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.inputs.collateralIndex",
      }),
    );
  });

  test("error: a directly built step without a collateral index cannot fall back to the first collateral", async () => {
    const plan = await prepare({ collateralIndex: 1n });
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateral");
    const { collateralIndex: _collateralIndex, ...stored } = step.action.inputs;
    const stripped = { ...step, action: { ...step.action, inputs: stored } };
    const build = () =>
      buildTransactions({
        ...plan,
        steps: [stripped],
      } as unknown as typeof plan);
    expect(build).toThrow(InvalidTransactionPlanError);
    expect(build).toThrow(
      expect.objectContaining({ path: "$.inputs.collateralIndex" }),
    );
  });

  test("behavior: a saved recipe restores to its committed calldata", () => {
    const [tx] = buildTransactions(parseTransactionPlan(savedWithdrawal));
    assert(tx);
    expect({
      to: tx.to,
      value: tx.value,
      data: tx.data,
    }).toMatchInlineSnapshot(`
      {
        "data": "0xa121e2a900000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d900000000000000000000000000000000000000000000000000000000000000008000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      }
    `);
  });

  test("error: InvalidTransactionPlanError for a signature reference", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightWithdrawCollateral");
    const action = { ...step.action, signatureRequestIds: {} };
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [{ ...step, action }],
    });
    const parse = () => parseTransactionPlan(stored);
    expect(parse).toThrow(InvalidTransactionPlanError);
    expect(parse).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.signatureRequestIds",
      }),
    );
    expect(() =>
      validateMidnightWithdrawCollateralPlanAction(action, "$.steps[0].action"),
    ).toThrow(
      expect.objectContaining({
        path: "$.steps[0].action.signatureRequestIds",
        reason: "Midnight steps do not consume signatures",
      }),
    );
  });

  test("behavior: the stored recipe decodes to Midnight core withdrawCollateral", async () => {
    const plan = await prepare({ collateralIndex: 1n, assets: 5n, receiver });
    const [tx] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(tx);
    const { functionName, args } = decodeFunctionData({
      abi: midnightAbi,
      data: tx.data,
    });
    expect(functionName).toBe("withdrawCollateral");
    expect(args.slice(1)).toEqual([1n, 5n, account, receiver]);
  });

  test.each([
    [{ collateralIndex: 2n }, "collateralIndex"],
    [{ assets: "10" }, "assets"],
    [{ assets: maxUint128 + 1n }, "assets"],
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
    assert(step?.action.type === "midnightWithdrawCollateral");
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
      expect.objectContaining({
        path: `$.steps[0].action.inputs.${field}`,
      }),
    );
  });
});
