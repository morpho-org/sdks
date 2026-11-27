import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import {
  AccrualPosition,
  MAX_TICK,
  Market,
  MarketParams,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256 } from "viem";
import { base } from "viem/chains";
import { assert, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightMarket,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  savedTakeRepay,
  takeRepayTransaction,
} from "../../../test/fixtures/midnightTakeRepayWithdrawCollateral.js";
import {
  AccrualPositionUserMismatchError,
  buildTransaction,
  buildTransactions,
  ChainIdMismatchError,
  EmptyMidnightTakeableOffersError,
  InvalidBigIntInputError,
  InvalidTransactionPlanError,
  MarketIdMismatchError,
  MidnightContractReceiverError,
  MidnightTakeableOffersNotFillableError,
  type MidnightTakeRepayWithdrawCollateralPlanParams,
  MidnightTakeTargetUnreachableError,
  MissingContractCodeError,
  midnightTakeRepayWithdrawCollateral,
  parseTransactionPlan,
  prepareMidnightTakeRepayWithdrawCollateral,
  serializeTransactionPlan,
  WithdrawMakesPositionUnhealthyError,
} from "../../index.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const wNative = getChainAddress(chainId, "wNative");

function parameters(loanToken = midnightMarket.loanToken) {
  const market = new MarketParams({ ...midnightMarket, loanToken });
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
  return {
    chainId,
    account,
    marketData,
    positionData: new AccrualPosition(
      {
        user: account,
        debt: 100n,
        credit: 0n,
        pendingFee: 0n,
        lastAccrual: 1_000n,
        lastLossFactor: 0n,
        collateralBitmap: 1n,
        collateral: [100n],
      },
      marketData,
    ),
    collateralPrices: [ORACLE_PRICE_SCALE],
    takeableOffers: [midnightApiTake({ market, tick: MAX_TICK })],
    target: { type: "units", units: 40n, maxBuyerAssets: 50n },
    repayEnabled: false,
    maxContinuousFee: 0n,
    now: 1_000n,
    expiresAt: 1_600,
  } satisfies MidnightTakeRepayWithdrawCollateralPlanParams;
}

test("stored format-2 Midnight take-repay builds fixed transaction bytes", () => {
  expect(
    buildTransactions(parseTransactionPlan(savedTakeRepay)).map(
      ({ to, data, value }) => ({ to, data, value }),
    ),
  ).toEqual([takeRepayTransaction]);
});

test.for([
  { field: "repayEnabled", value: "true", path: "repayEnabled" },
  { field: "target", value: { type: "full" }, path: "target.type" },
  {
    field: "collateralWithdrawals",
    value: [{}],
    path: "collateralWithdrawals[0].collateralIndex",
  },
  { field: "takeableOffers", value: [{}], path: "takeableOffers[0].units" },
  { field: "nativeAssets", value: 1, path: "nativeAssets" },
  { field: "collateralReceiver", value: "0x", path: "collateralReceiver" },
])("rejects a malformed stored $field", ({ field, value, path }) => {
  const recipe = JSON.parse(savedTakeRepay);
  recipe.steps[0].action.inputs[field] = value;
  expect(() => parseTransactionPlan(JSON.stringify(recipe))).toThrow(
    expect.objectContaining({
      name: InvalidTransactionPlanError.name,
      path: `$.steps[0].action.inputs.${path}`,
    }),
  );
});

test("rejects a well-formed stored recipe whose values the parser refuses", () => {
  const recipe = JSON.parse(savedTakeRepay);
  recipe.steps[0].action.inputs.target.units = { $bigint: "0" };
  expect(() => parseTransactionPlan(JSON.stringify(recipe))).toThrow(
    expect.objectContaining({ name: InvalidTransactionPlanError.name }),
  );
});

test("[INV-05] rejects the wrong RPC chain before deployment or prerequisite reads", async () => {
  const { client, request } = createMockClient(base);
  request.mockResolvedValue("0x1");
  await expect(
    prepareMidnightTakeRepayWithdrawCollateral(client, parameters()),
  ).rejects.toThrow(ChainIdMismatchError);
  expect(client.chain.id).toBe(chainId);
  expect(request.mock.calls.map(([rpc]) => rpc.method)).toEqual([
    "eth_chainId",
  ]);
});

test.for([
  { role: "midnightBundlesV2" as const },
  { role: "midnight" as const },
])(
  "rejects missing $role code before allowance or authorization reads",
  async ({ role }) => {
    const missing = getChainAddress(chainId, role);
    const { client, request } = createMockClient(base);
    request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_getCode") {
        return params?.[0] === missing ? "0x" : "0x60006000";
      }
      throw new Error(`unexpected ${method}`);
    });
    await expect(
      prepareMidnightTakeRepayWithdrawCollateral(client, parameters()),
    ).rejects.toMatchObject({
      name: MissingContractCodeError.name,
      address: missing,
      role,
    });
    expect(request.mock.calls.some(([rpc]) => rpc.method === "eth_call")).toBe(
      false,
    );
    expect(
      request.mock.calls.filter(([rpc]) => rpc.method === "eth_chainId"),
    ).toHaveLength(1);
  },
);

test.for([
  {
    allowance: 49n,
    authorized: false,
    steps: ["erc20Approval", "midnightAuthorization"],
  },
  { allowance: 50n, authorized: false, steps: ["midnightAuthorization"] },
  { allowance: 49n, authorized: true, steps: ["erc20Approval"] },
  { allowance: 50n, authorized: true, steps: [] },
])(
  "[INV-06] requires allowance for the full wrapped-native pull ($allowance, authorized: $authorized)",
  async ({ allowance, authorized, steps }) => {
    const handle = createMockClient(base);
    mockRead(handle, {
      address: midnightMarket.midnight,
      abi: midnightAbi,
      functionName: "isAuthorized",
      result: authorized,
    });
    mockRead(handle, {
      address: wNative,
      abi: erc20Abi,
      functionName: "allowance",
      result: allowance,
    });
    const plan = await prepareMidnightTakeRepayWithdrawCollateral(
      handle.client,
      {
        ...parameters(wNative),
        nativeAmount: 20n,
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
      },
    );
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      ...steps,
      "midnightTakeRepayWithdrawCollateral",
    ]);
    expect(
      plan.steps.find(({ action }) => action.type === "erc20Approval")?.action
        .inputs,
    ).toEqual(
      allowance < 50n
        ? expect.objectContaining({
            token: wNative,
            spender: bundle,
            assets: maxUint256,
          })
        : undefined,
    );
    expect(plan.signatureRequests).toEqual([]);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    expect(transactions.at(-1)).toMatchObject({ to: bundle, value: 20n });
  },
);

test("rejects a maxBuyerAssets below the cheapest cost of the target units before any read", async () => {
  const { client, request } = createMockClient(base);
  const { marketData } = parameters();
  const market = marketData.params;
  const params = {
    ...parameters(),
    takeableOffers: [
      { ...midnightApiTake({ market, tick: 3_000n }), units: 5n },
      { ...midnightApiTake({ market, tick: MAX_TICK }), units: 100n },
    ],
    target: { type: "units", units: 50n, maxBuyerAssets: 1n },
  } satisfies MidnightTakeRepayWithdrawCollateralPlanParams;
  const planError = await prepareMidnightTakeRepayWithdrawCollateral(
    client,
    params,
  ).catch((error: unknown) => error);

  assert(planError instanceof MidnightTakeTargetUnreachableError);
  expect(planError).toMatchObject({
    field: "target.maxBuyerAssets",
    value: 1n,
    limit: 6n,
  });
  expect(request).not.toHaveBeenCalled();
});

test("rejects a non-boolean repayEnabled before feasibility or any read", async () => {
  const { client, request } = createMockClient(base);
  await expect(
    prepareMidnightTakeRepayWithdrawCollateral(client, {
      ...parameters(),
      repayEnabled: "false" as unknown as boolean,
    }),
  ).rejects.toThrow(
    expect.objectContaining({
      name: InvalidTransactionPlanError.name,
      path: "$.repayEnabled",
    }),
  );
  expect(request).not.toHaveBeenCalled();
});

test("keeps the validated native amount when the caller clears it during preparation", async () => {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: midnightMarket.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result: true,
  });
  mockRead(handle, {
    address: wNative,
    abi: erc20Abi,
    functionName: "allowance",
    result: maxUint256,
  });
  const params: MidnightTakeRepayWithdrawCollateralPlanParams = {
    ...parameters(wNative),
    nativeAmount: 20n,
  };
  const pending = prepareMidnightTakeRepayWithdrawCollateral(
    handle.client,
    params,
  );
  Object.assign(params, { nativeAmount: undefined });
  const plan = await pending;
  expect(buildTransactions(plan).at(-1)).toMatchObject({
    to: bundle,
    value: 20n,
  });
});

test("rejects a stored market with collateral in reverse token order", () => {
  const recipe = JSON.parse(savedTakeRepay);
  const { inputs } = recipe.steps[0].action;
  const [collateral] = inputs.market.collateralParams;
  const reversed = [
    collateral,
    { ...collateral, token: "0x0000000000000000000000000000000000006000" },
  ];
  inputs.market.collateralParams = reversed;
  for (const fill of inputs.takeableOffers) {
    fill.offer.market.collateralParams = reversed;
  }
  expect(() => parseTransactionPlan(JSON.stringify(recipe))).toThrow(
    expect.objectContaining({
      name: InvalidTransactionPlanError.name,
      path: "$.steps[0].action.inputs.market.collateralParams",
    }),
  );
});

test("stores only the fills that cannot revert the whole bundle", async () => {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: midnightMarket.midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result: true,
  });
  mockRead(handle, {
    address: midnightMarket.loanToken,
    abi: erc20Abi,
    functionName: "allowance",
    result: maxUint256,
  });
  const { marketData } = parameters();
  const market = marketData.params;
  const live = midnightApiTake({ market, tick: MAX_TICK });
  const target = { type: "assets", assets: 50n, minUnits: 40n } as const;
  const plan = await prepareMidnightTakeRepayWithdrawCollateral(handle.client, {
    ...parameters(),
    takeableOffers: [midnightApiTake({ market, tick: MAX_TICK + 1n }), live],
    target,
  });
  const step = plan.steps.at(-1);
  assert(step?.action.type === "midnightTakeRepayWithdrawCollateral");
  expect(step.action.inputs.takeableOffers).toEqual([
    {
      units: live.units,
      offer: expect.objectContaining({ tick: MAX_TICK }),
      ratifierData: live.ratifierData,
    },
  ]);
  const { to, data, value } = midnightTakeRepayWithdrawCollateral({
    chainId,
    market,
    target,
    takeableOffers: [live],
    repayEnabled: false,
    collateralWithdrawals: [],
    collateralReceiver: account,
    maxContinuousFee: 0n,
    deadline: 1_600n,
  });
  const transactions = buildTransactions(
    parseTransactionPlan(serializeTransactionPlan(plan)),
  );
  expect(transactions).toHaveLength(1);
  expect(transactions[0]).toMatchObject({ to, data, value });
});

test("rejects a directly built step with collateral in reverse token order", () => {
  const plan = parseTransactionPlan(savedTakeRepay);
  const [step] = plan.steps;
  assert(step?.action.type === "midnightTakeRepayWithdrawCollateral");
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
              token: "0x0000000000000000000000000000000000006001" as const,
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

test("rejects a directly built step with an unknown target type", () => {
  const plan = parseTransactionPlan(savedTakeRepay);
  const [step] = plan.steps;
  assert(step?.action.type === "midnightTakeRepayWithdrawCollateral");
  const mistyped = {
    ...step,
    action: {
      ...step.action,
      inputs: {
        ...step.action.inputs,
        target: {
          ...step.action.inputs.target,
          type: "full",
        } as unknown as typeof step.action.inputs.target,
      },
    },
  };
  const build = () => buildTransactions({ ...plan, steps: [mistyped] });
  expect(build).toThrow(InvalidTransactionPlanError);
  expect(build).toThrow(
    expect.objectContaining({ path: "$.inputs.target.type" }),
  );
});

test("rejects an unknown target type on build as restore does", () => {
  const plan = parseTransactionPlan(savedTakeRepay);
  const [step] = plan.steps;
  assert(step?.action.type === "midnightTakeRepayWithdrawCollateral");
  const edited = {
    ...step,
    action: {
      ...step.action,
      inputs: {
        ...step.action.inputs,
        target: {
          type: "shares",
          units: 60n,
          maxBuyerAssets: 100n,
        },
      },
    },
  } as unknown as typeof step;
  const editedPlan = { ...plan, steps: [edited] };
  const restore = () =>
    parseTransactionPlan(serializeTransactionPlan(editedPlan));
  expect(restore).toThrow(InvalidTransactionPlanError);
  expect(restore).toThrow(
    expect.objectContaining({ path: "$.steps[0].action.inputs.target.type" }),
  );
  const expected = expect.objectContaining({ path: "$.inputs.target.type" });
  const buildAll = () => buildTransactions(editedPlan);
  expect(buildAll).toThrow(InvalidTransactionPlanError);
  expect(buildAll).toThrow(expected);
  const buildOne = () => buildTransaction(editedPlan, edited);
  expect(buildOne).toThrow(InvalidTransactionPlanError);
  expect(buildOne).toThrow(expected);
});

test.for([
  { case: "missing", target: undefined },
  { case: "null", target: null },
])("rejects a directly built step with a $case target", ({ target }) => {
  const plan = parseTransactionPlan(savedTakeRepay);
  const [step] = plan.steps;
  assert(step?.action.type === "midnightTakeRepayWithdrawCollateral");
  const inputs: Record<string, unknown> = { ...step.action.inputs, target };
  if (target === undefined) delete inputs.target;
  const untargeted = {
    ...step,
    action: {
      ...step.action,
      inputs: inputs as unknown as typeof step.action.inputs,
    },
  };
  const build = () => buildTransactions({ ...plan, steps: [untargeted] });
  expect(build).toThrow(InvalidTransactionPlanError);
  expect(build).toThrow(expect.objectContaining({ path: "$.inputs.target" }));
});

test("rejects a missing target before any read", async () => {
  const { client, request } = createMockClient(base);
  const { target: _target, ...untargeted } = parameters();
  await expect(
    prepareMidnightTakeRepayWithdrawCollateral(
      client,
      untargeted as unknown as MidnightTakeRepayWithdrawCollateralPlanParams,
    ),
  ).rejects.toMatchObject({
    constructor: InvalidTransactionPlanError,
    path: "$.target",
  });
  expect(request).not.toHaveBeenCalled();
});

test.for([
  { field: "now", overrides: { now: 1_000 } },
  { field: "maxContinuousFee", overrides: { maxContinuousFee: 0 } },
  {
    field: "target.assets",
    overrides: { target: { type: "assets", assets: 10, minUnits: 10n } },
  },
  {
    field: "target.minUnits",
    overrides: { target: { type: "assets", assets: 10n, minUnits: 10 } },
  },
  {
    field: "target.units",
    overrides: { target: { type: "units", units: 10, maxBuyerAssets: 10n } },
  },
  {
    field: "target.maxBuyerAssets",
    overrides: { target: { type: "units", units: 10n, maxBuyerAssets: 10 } },
  },
  {
    field: "collateralWithdrawals[0].collateralIndex",
    overrides: { collateralWithdrawals: [{ collateralIndex: 0, assets: 1n }] },
  },
  {
    field: "collateralWithdrawals[0].assets",
    overrides: { collateralWithdrawals: [{ collateralIndex: 0n, assets: 10 }] },
  },
])(
  "error: rejects a numeric $field before RPC",
  async ({ field, overrides }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeRepayWithdrawCollateral(client, {
        ...parameters(),
        ...overrides,
      } as unknown as Parameters<
        typeof prepareMidnightTakeRepayWithdrawCollateral
      >[1]),
    ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
    expect(request).not.toHaveBeenCalled();
  },
);

test.for([
  { name: "units", target: undefined },
  {
    name: "assets",
    target: { type: "assets", assets: 50n, minUnits: 40n } as const,
  },
])(
  "[INV-03] rejects a $name-target withdrawal that leaves debt between buffered and raw LLTV",
  async ({ target }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeRepayWithdrawCollateral(client, {
        ...parameters(),
        ...(target && { target }),
        collateralWithdrawals: [{ collateralIndex: 0n, assets: 22n }],
      }),
    ).rejects.toThrow(WithdrawMakesPositionUnhealthyError);
    expect(request).not.toHaveBeenCalled();
  },
);

test.for([
  {
    overrides: { takeableOffers: [] },
    error: EmptyMidnightTakeableOffersError,
  },
  {
    overrides: {
      takeableOffers: [midnightApiTake({ tick: MAX_TICK, expiry: 999n })],
    },
    error: MidnightTakeableOffersNotFillableError,
  },
  {
    overrides: {
      collateralWithdrawals: [{ collateralIndex: 0n, assets: 10n }],
      collateralReceiver: bundle,
    },
    error: MidnightContractReceiverError,
  },
  {
    overrides: {
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint256 }],
    },
    error: WithdrawMakesPositionUnhealthyError,
  },
])(
  "rejects $error.name before prerequisite reads",
  async ({ overrides, error }) => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightTakeRepayWithdrawCollateral(client, {
        ...parameters(),
        ...overrides,
      }),
    ).rejects.toThrow(error);
    expect(request).not.toHaveBeenCalled();
  },
);

test.for([
  {
    case: "another owner",
    user: midnightAddresses.maker,
    market: midnightMarket,
    error: AccrualPositionUserMismatchError,
  },
  {
    case: "another market",
    user: account,
    market: midnightOtherMarket,
    error: MarketIdMismatchError,
  },
])(
  "rejects a position on $case before any read",
  async ({ user, market, error }) => {
    const { client, request } = createMockClient(base);
    const params = parameters();
    const positionData = new AccrualPosition(
      {
        user,
        debt: 100n,
        credit: 0n,
        pendingFee: 0n,
        lastAccrual: 1_000n,
        lastLossFactor: 0n,
        collateralBitmap: 1n,
        collateral: [100n],
      },
      new Market({ ...params.marketData, params: market }),
    );
    await expect(
      prepareMidnightTakeRepayWithdrawCollateral(client, {
        ...params,
        positionData,
      }),
    ).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  },
);
