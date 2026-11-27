import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  AccrualPosition,
  Market,
  MarketParams,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256, zeroAddress } from "viem";
import { base } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  AccrualPositionUserMismatchError,
  buildTransaction,
  buildTransactions,
  ChainIdMismatchError,
  InvalidBigIntInputError,
  InvalidTransactionPlanError,
  MidnightContractReceiverError,
  MidnightRepayExceedsDebtError,
  MidnightTakeTargetUnreachableError,
  MidnightZeroReceiverError,
  MissingContractCodeError,
  midnightRepayWithdrawCollateral,
  parseTransactionPlan,
  prepareMidnightRepayWithdrawCollateral,
  serializeTransactionPlan,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
} from "../../index.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const receiver = midnightAddresses.maker;
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const wNative = getChainAddress(chainId, "wNative");
const withdraw = [{ collateralIndex: 0n, assets: 10n }];

function inputs(loanToken = midnightMarket.loanToken) {
  const marketData = new Market({
    params: new MarketParams({ ...midnightMarket, loanToken }),
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
      user: account,
      debt: 100n,
      credit: 0n,
      pendingFee: 0n,
      lastAccrual: 1_000n,
      lastLossFactor: 0n,
      collateralBitmap: 1n,
      collateral: [200n],
    },
    marketData,
  );
  return {
    chainId,
    account,
    marketData,
    positionData,
    collateralPrices: [ORACLE_PRICE_SCALE],
    repay: { type: "assets", assets: 40n } as const,
    collateralWithdrawals: withdraw,
    collateralReceiver: receiver,
    now: 1_000n,
    expiresAt: 1_600,
  };
}

function mockPrerequisites({
  authorized,
  allowance,
  token = midnightMarket.loanToken,
}: {
  authorized: boolean;
  allowance?: bigint;
  token?: typeof midnightMarket.loanToken;
}) {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: midnightMarket.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result: authorized,
  });
  if (allowance !== undefined) {
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: allowance,
    });
  }
  return handle;
}

const savedRecipe = `{
  "version": 2,
  "chainId": 8453,
  "account": "0x000000000000000000000000000000000000A000",
  "expiresAt": 1600,
  "steps": [{
    "id": "midnightRepayWithdrawCollateral",
    "label": "Repay Midnight debt or withdraw collateral",
    "action": {
      "type": "midnightRepayWithdrawCollateral",
      "inputs": {
        "chainId": 8453,
        "account": "0x000000000000000000000000000000000000A000",
        "market": {
          "chainId": { "$bigint": "8453" },
          "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
          "loanToken": "0x0000000000000000000000000000000000006000",
          "collateralParams": [{
            "token": "0x0000000000000000000000000000000000007000",
            "lltv": { "$bigint": "770000000000000000" },
            "liquidationCursor": { "$bigint": "250000000000000000" },
            "oracle": "0x0000000000000000000000000000000000008000"
          }],
          "maturity": { "$bigint": "2000" },
          "rcfThreshold": { "$bigint": "0" },
          "enterGate": "0x0000000000000000000000000000000000000000",
          "liquidatorGate": "0x0000000000000000000000000000000000000000"
        },
        "repay": { "type": "full", "maxBuyerAssets": { "$bigint": "125" } },
        "collateralReceiver": "0x000000000000000000000000000000000000A000",
        "collateralWithdrawals": [{ "collateralIndex": { "$bigint": "0" }, "assets": { "$bigint": "10" } }],
        "deadline": { "$bigint": "1600" }
      }
    }
  }],
  "signatureRequests": []
}`;

test("stored format-2 midnightRepayWithdrawCollateral builds fixed transaction bytes", () => {
  expect(
    buildTransactions(parseTransactionPlan(savedRecipe)).map(
      ({ to, value, data }) => ({ to, value, data }),
    ),
  ).toMatchInlineSnapshot(`
    [
      {
        "data": "0x8261dcb700000000000000000000000000000000000000000000000000000000000001a0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000003400000000000000000000000000000000000000000000000000000000000000360000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d900000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a",
        "to": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        "value": 0n,
      },
    ]
  `);
});

test.each([
  { from: '"type": "full"', to: '"type": "shares"', path: "inputs.repay.type" },
  {
    from: '{ "$bigint": "125" }',
    to: "125",
    path: "inputs.repay.maxBuyerAssets",
  },
  {
    from: '"assets": { "$bigint": "10" }',
    to: '"assets": { "$bigint": "-1" }',
    path: "inputs.collateralWithdrawals[0].assets",
  },
  {
    from: '"collateralReceiver":',
    to: '"nativeAssets": "1", "collateralReceiver":',
    path: "inputs.nativeAssets",
  },
  {
    from: '"inputs":',
    to: '"signatureRequestIds": {}, "inputs":',
    path: "signatureRequestIds",
  },
  {
    from: '"collateralParams": [{',
    to: '"collateralParams": [{ "token": "0x0000000000000000000000000000000000009000", "lltv": { "$bigint": "770000000000000000" }, "liquidationCursor": { "$bigint": "250000000000000000" }, "oracle": "0x0000000000000000000000000000000000008000" }, {',
    path: "inputs.market.collateralParams",
  },
])("stored recipe rejects invalid $path", ({ from, to, path }) => {
  const parse = () => parseTransactionPlan(savedRecipe.replace(from, to));
  expect(parse).toThrow(InvalidTransactionPlanError);
  expect(parse).toThrow(
    expect.objectContaining({ path: `$.steps[0].action.${path}` }),
  );
});

test("error: a stored deadline one second after expiresAt cannot be restored or built", () => {
  const tamperedRecipe = savedRecipe.replace(
    '"deadline": { "$bigint": "1600" }',
    '"deadline": { "$bigint": "1601" }',
  );
  expect(tamperedRecipe).not.toBe(savedRecipe);
  const error = expect.objectContaining({
    constructor: InvalidTransactionPlanError,
    path: "$.steps[0].action.inputs.deadline",
    reason: "expected the plan expiresAt",
  });
  expect(() => parseTransactionPlan(tamperedRecipe)).toThrow(error);
  const plan = parseTransactionPlan(savedRecipe);
  const [step] = plan.steps;
  assert(step?.action.type === "midnightRepayWithdrawCollateral");
  const tampered = {
    ...step,
    action: {
      ...step.action,
      inputs: { ...step.action.inputs, deadline: 1_601n },
    },
  };
  const tamperedPlan = { ...plan, steps: [tampered] };
  expect(() =>
    parseTransactionPlan(serializeTransactionPlan(tamperedPlan)),
  ).toThrow(error);
  expect(() => buildTransactions(tamperedPlan)).toThrow(error);
  expect(() => buildTransaction(tamperedPlan, tampered)).toThrow(error);
  expect(() => buildTransaction(plan, { ...tampered, id: "separate" })).toThrow(
    error,
  );
});

test("a directly built step with reversed collateral cannot switch the withdrawn token", () => {
  const plan = parseTransactionPlan(savedRecipe);
  const step = plan.steps[0];
  assert(step?.action.type === "midnightRepayWithdrawCollateral");
  const { action } = step;
  const withCollateral = (
    collateralParams: typeof midnightTwoCollateralMarket.collateralParams,
  ) => ({
    ...plan,
    steps: [
      {
        ...step,
        action: {
          ...action,
          inputs: {
            ...action.inputs,
            market: { ...action.inputs.market, collateralParams },
          },
        },
      },
    ],
  });
  expect(() =>
    buildTransactions(
      withCollateral(midnightTwoCollateralMarket.collateralParams),
    ),
  ).not.toThrow();
  const build = () =>
    buildTransactions(
      withCollateral(
        [...midnightTwoCollateralMarket.collateralParams].reverse(),
      ),
    );
  expect(build).toThrow(InvalidTransactionPlanError);
  expect(build).toThrow(
    expect.objectContaining({
      name: "InvalidTransactionPlanError",
      path: "$.inputs.market.collateralParams",
    }),
  );
});

test.each([
  { name: "missing", repay: {} },
  { name: "null", repay: { repay: null } },
])(
  "error: InvalidTransactionPlanError for a directly built step with $name repay",
  ({ repay }) => {
    const plan = parseTransactionPlan(savedRecipe);
    const step = plan.steps[0];
    assert(step?.action.type === "midnightRepayWithdrawCollateral");
    const { repay: _repay, ...rest } = step.action.inputs;
    const build = () =>
      buildTransactions({
        ...plan,
        steps: [
          {
            ...step,
            action: { ...step.action, inputs: { ...rest, ...repay } as never },
          },
        ],
      });
    expect(build).toThrow(InvalidTransactionPlanError);
    expect(build).toThrow(expect.objectContaining({ path: "$.repay" }));
  },
);

describe("prepareMidnightRepayWithdrawCollateral", () => {
  test("default: exact repayment needs no withdrawal or prices", async () => {
    const { client } = mockPrerequisites({ authorized: true, allowance: 40n });
    const plan = await prepareMidnightRepayWithdrawCollateral(client, {
      ...inputs(),
      collateralWithdrawals: undefined,
      collateralReceiver: undefined,
      collateralPrices: [],
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightRepayWithdrawCollateral",
    ]);
    expect(plan.steps[0]?.action.inputs).toMatchObject({
      collateralWithdrawals: [],
      collateralReceiver: account,
    });
  });

  test.each([
    {
      repay: { type: "assets", assets: 40n },
      allowance: 39n,
      prerequisites: ["erc20Approval", "midnightAuthorization"],
    },
    {
      repay: { type: "full", maxBuyerAssets: 125n },
      allowance: 125n,
      prerequisites: ["midnightAuthorization"],
    },
    {
      repay: { type: "assets", assets: 0n },
      allowance: undefined,
      prerequisites: ["midnightAuthorization"],
    },
  ] as const)(
    "behavior: matches stable raw encoding for $repay",
    async ({ repay, allowance, prerequisites }) => {
      const { client, request } = mockPrerequisites({
        authorized: false,
        allowance,
      });
      const params = { ...inputs(), repay };
      const plan = await prepareMidnightRepayWithdrawCollateral(client, params);
      expect(plan.steps.map(({ action }) => action.type)).toEqual([
        ...prerequisites,
        "midnightRepayWithdrawCollateral",
      ]);
      expect(request.mock.calls.map(([call]) => call.method)).toEqual([
        "eth_chainId",
        "eth_getCode",
        "eth_getCode",
        ...(allowance === undefined ? [] : ["eth_call"]),
        "eth_call",
      ]);
      const saved = serializeTransactionPlan(plan);
      expect(saved).not.toMatch(
        /positionData|marketData|collateralPrices|takeableOffers|referralFee/,
      );
      const restored = parseTransactionPlan(saved);
      expect(restored.signatureRequests).toEqual([]);
      const transactions = buildTransactions(restored);
      expect(transactions).toEqual(buildTransactions(plan));
      expect(transactions.at(-1)).toEqual(
        midnightRepayWithdrawCollateral({
          market: params.marketData.params,
          chainId,
          repay,
          collateralWithdrawals: withdraw,
          collateralReceiver: receiver,
          deadline: 1_600n,
        }),
      );
    },
  );

  test.each([124n, 125n])(
    "behavior: native funding applies the full wrap-and-pull approval threshold (%s)",
    async (allowance) => {
      const { client } = mockPrerequisites({
        authorized: true,
        allowance,
        token: wNative,
      });
      const plan = await prepareMidnightRepayWithdrawCollateral(client, {
        ...inputs(wNative),
        repay: { type: "full", maxBuyerAssets: 125n },
        nativeAmount: 125n,
      });
      const [first] = plan.steps;
      expect(plan.steps.map(({ action }) => action.type)).toEqual(
        allowance === 125n
          ? ["midnightRepayWithdrawCollateral"]
          : ["erc20Approval", "midnightRepayWithdrawCollateral"],
      );
      if (allowance < 125n) {
        expect(first?.action.inputs).toMatchObject({
          token: wNative,
          spender: bundle,
          assets: maxUint256,
        });
      }
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      expect(restored.signatureRequests).toEqual([]);
      expect(buildTransactions(restored)).toEqual(buildTransactions(plan));
      expect(buildTransactions(restored).at(-1)?.value).toBe(125n);
    },
  );

  test("behavior: accepts a withdrawal leaving exactly enough collateral for the remaining debt", async () => {
    const { client } = mockPrerequisites({ authorized: true, allowance: 40n });
    const plan = await prepareMidnightRepayWithdrawCollateral(client, {
      ...inputs(),
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 121n }],
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightRepayWithdrawCollateral",
    ]);
  });

  test("behavior: accepts a 69n withdrawal at the buffered limit with zero repayment", async () => {
    const { client } = mockPrerequisites({ authorized: true });
    const plan = await prepareMidnightRepayWithdrawCollateral(client, {
      ...inputs(),
      repay: { type: "assets", assets: 0n },
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 69n }],
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightRepayWithdrawCollateral",
    ]);
  });

  test.each([
    [
      { repay: { type: "assets", assets: 101n } },
      MidnightRepayExceedsDebtError,
    ],
    [
      { repay: { type: "full", maxBuyerAssets: 99n } },
      MidnightTakeTargetUnreachableError,
    ],
    [
      {
        collateralWithdrawals: [
          ...withdraw,
          { collateralIndex: 0n, assets: 191n },
        ],
      },
      WithdrawExceedsCollateralError,
    ],
    [
      { collateralWithdrawals: [{ collateralIndex: 0n, assets: 122n }] },
      WithdrawMakesPositionUnhealthyError,
    ],
    [
      {
        repay: { type: "assets", assets: 0n },
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 70n }],
      },
      WithdrawMakesPositionUnhealthyError,
    ],
    [{ collateralReceiver: zeroAddress }, MidnightZeroReceiverError],
    [
      { collateralReceiver: midnightMarket.loanToken },
      MidnightContractReceiverError,
    ],
    [{ account: receiver }, AccrualPositionUserMismatchError],
  ] as const)(
    "error: rejects invalid preparation before reading state (%#)",
    async (overrides, error) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightRepayWithdrawCollateral(client, {
          ...inputs(),
          ...overrides,
        }),
      ).rejects.toBeInstanceOf(error);
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: rejects an unknown repayment type before reading state", async () => {
    const { client, request } = createMockClient(base);
    const prepare = prepareMidnightRepayWithdrawCollateral(client, {
      ...inputs(),
      repay: { type: "shares", assets: 40n } as never,
    });
    await expect(prepare).rejects.toBeInstanceOf(InvalidTransactionPlanError);
    await expect(prepare).rejects.toMatchObject({ path: "$.repay.type" });
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    { name: "missing", repay: {} },
    { name: "null", repay: { repay: null } },
  ])(
    "error: InvalidTransactionPlanError for $name repay before reading state",
    async ({ repay }) => {
      const { client, request } = createMockClient(base);
      const { repay: _repay, ...rest } = inputs();
      const prepare = prepareMidnightRepayWithdrawCollateral(client, {
        ...rest,
        ...repay,
      } as never);
      await expect(prepare).rejects.toBeInstanceOf(InvalidTransactionPlanError);
      await expect(prepare).rejects.toMatchObject({ path: "$.repay" });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: InvalidBigIntInputError for a string now before reading state", async () => {
    const { client, request } = createMockClient(base);
    const { expiresAt: _expiresAt, ...rest } = inputs();
    await expect(
      prepareMidnightRepayWithdrawCollateral(client, {
        ...rest,
        now: "1700000000",
      } as never),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: InvalidBigIntInputError for a numeric collateral index before reading state", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightRepayWithdrawCollateral(client, {
        ...inputs(),
        collateralWithdrawals: [{ collateralIndex: 0, assets: 10n }],
      } as never),
    ).rejects.toMatchObject({
      name: "InvalidBigIntInputError",
      field: "collateralWithdrawals[0].collateralIndex",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: InvalidBigIntInputError for a numeric withdrawal amount before reading state", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightRepayWithdrawCollateral(client, {
        ...inputs(),
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 10 }],
      } as never),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "collateralWithdrawals[0].assets",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    { field: "repay.assets", repay: { type: "assets", assets: 40 } },
    {
      field: "repay.maxBuyerAssets",
      repay: { type: "full", maxBuyerAssets: 125 },
    },
  ])("error: rejects a numeric $field before RPC", async ({ field, repay }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightRepayWithdrawCollateral(client, {
        ...inputs(),
        repay,
      } as never),
    ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] configured Base client with mainnet RPC cannot read prerequisites", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValue("0x1");
    await expect(
      prepareMidnightRepayWithdrawCollateral(client, inputs()),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test.each([bundle, midnightMarket.midnight])(
    "error: missing code at %s precedes prerequisite reads",
    async (address) => {
      const { client, request } = createMockClient(base);
      request.mockImplementation(async (call) => {
        if (call.method === "eth_chainId") {
          return "0x2105";
        }
        assert(call.method === "eth_getCode");
        return call.params?.[0] === address ? "0x" : "0x01";
      });
      await expect(
        prepareMidnightRepayWithdrawCollateral(client, inputs()),
      ).rejects.toBeInstanceOf(MissingContractCodeError);
      expect(
        request.mock.calls.filter(([call]) => call.method === "eth_chainId"),
      ).toHaveLength(1);
    },
  );
});
