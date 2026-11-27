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
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { assert, describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightMarket,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import { midnightSupplyCollateral } from "../../actions/midnight/supplyCollateral.js";
import {
  ChainIdMismatchError,
  InvalidBigIntInputError,
  MidnightMarketAddressMismatchError,
  MissingContractCodeError,
} from "../../types/index.js";
import { InvalidTransactionPlanError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  type MidnightSupplyCollateralPlanParams,
  prepareMidnightSupplyCollateral,
} from "./supplyCollateral.js";

const midnight = getChainAddress(base.id, "midnight");
const params = {
  chainId: base.id,
  account: midnightAddresses.taker,
  market: midnightTwoCollateralMarket,
  collateralAssets: 100n,
  now: 100n,
} as const;

async function prepareWithAllowance(collateralIndex?: bigint) {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: MarketUtils.getCollateralByIndex(
      params.market,
      collateralIndex ?? 0n,
    ).token,
    abi: erc20Abi,
    functionName: "allowance",
    result: params.collateralAssets,
  });
  return prepareMidnightSupplyCollateral(handle.client, {
    ...params,
    collateralIndex,
  });
}

describe("prepareMidnightSupplyCollateral", () => {
  test("default", async () => {
    const plan = await prepareWithAllowance();
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored).toEqual(plan);
    expect(buildTransactions(restored)).toEqual([
      midnightSupplyCollateral({
        chainId: params.chainId,
        market: params.market,
        assets: params.collateralAssets,
        onBehalf: params.account,
      }),
    ]);
  });

  test("behavior: an allowance below the amount approves Midnight core for the account", async () => {
    const handle = createMockClient(base);
    const token = MarketUtils.getCollateralByIndex(params.market, 0n).token;
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: params.collateralAssets - 1n,
    });
    const plan = await prepareMidnightSupplyCollateral(handle.client, params);

    expect(
      expectReadCall(handle, {
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
      }).map(({ args }) => args),
    ).toEqual([[params.account, midnight]]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "midnightSupplyCollateral",
    ]);
    const [approval] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(approval);
    expect(approval.to).toBe(token);
    expect(decodeFunctionData({ abi: erc20Abi, data: approval.data })).toEqual({
      functionName: "approve",
      args: [midnight, maxUint256],
    });
  });

  test("behavior: a nonzero USDT allowance below the amount is reset before approving Midnight core", async () => {
    const usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const mainnetMidnight = getChainAddress(mainnet.id, "midnight");
    const market = new MarketParams({
      ...midnightMarket,
      chainId: mainnet.id,
      midnight: mainnetMidnight,
      collateralParams: [
        { ...midnightMarket.collateralParams[0]!, token: usdt },
      ],
    });
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdt,
      abi: erc20Abi,
      functionName: "allowance",
      result: params.collateralAssets - 1n,
    });
    const plan = await prepareMidnightSupplyCollateral(handle.client, {
      ...params,
      chainId: mainnet.id,
      market,
    });

    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "erc20Approval",
      "midnightSupplyCollateral",
    ]);
    const [reset, approval] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(reset && approval);
    expect([reset.to, approval.to]).toEqual([usdt, usdt]);
    expect(
      [reset, approval].map(({ data }) =>
        decodeFunctionData({ abi: erc20Abi, data }),
      ),
    ).toEqual([
      { functionName: "approve", args: [mainnetMidnight, 0n] },
      { functionName: "approve", args: [mainnetMidnight, maxUint256] },
    ]);
  });

  test("error: UnknownCollateralIndexError", async () => {
    await expect(
      prepareMidnightSupplyCollateral(createMockClient(base).client, {
        ...params,
        collateralIndex: 2n,
      }),
    ).rejects.toBeInstanceOf(UnknownCollateralIndexError);
  });

  test("behavior: canonical collateral order preserves the selected index and its allowance", async () => {
    const plan = await prepareWithAllowance(1n);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(buildTransactions(restored)).toEqual([
      midnightSupplyCollateral({
        chainId: params.chainId,
        market: params.market,
        collateralIndex: 1n,
        assets: params.collateralAssets,
        onBehalf: params.account,
      }),
    ]);
  });

  test("error: a directly built step with reversed collateral cannot switch the deposited token", async () => {
    const plan = await prepareWithAllowance(1n);
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateral");
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
      expect.objectContaining({
        name: "InvalidTransactionPlanError",
        path: "$.inputs.market.collateralParams",
      }),
    );
  });

  test("error: InvalidTransactionPlanError for a signature reference", async () => {
    const plan = await prepareWithAllowance();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateral");
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
  });

  test("error: ChainIdMismatchError for another market chain", async () => {
    await expect(
      prepareMidnightSupplyCollateral(createMockClient(base).client, {
        ...params,
        market: { ...params.market, chainId: 1n },
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });

  test("error: [INV-05] ChainIdMismatchError for another RPC chain before reading allowance", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValueOnce(numberToHex(mainnet.id));

    await expect(
      prepareMidnightSupplyCollateral(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("error: rejects missing Midnight core code before reading allowance", async () => {
    const { client, request } = createMockClient(base);
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === midnight) {
        return "0x";
      }
      return defaultRequest(args);
    });
    const preparation = prepareMidnightSupplyCollateral(client, params);
    await expect(preparation).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(preparation).rejects.toMatchObject({
      address: midnight,
      role: "midnight",
    });
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
      "eth_call",
    );
  });

  test("behavior: the deployment check precedes the amount check like the entity flow", async () => {
    await expect(
      prepareMidnightSupplyCollateral(createMockClient(base).client, {
        ...params,
        market: { ...params.market, midnight: zeroAddress },
        collateralAssets: 0n,
      }),
    ).rejects.toBeInstanceOf(MidnightMarketAddressMismatchError);
  });

  test.each([
    { field: "collateralAssets", value: 100 },
    { field: "collateralIndex", value: 1 },
    { field: "collateralIndex", value: 0.5 },
  ])(
    "error: rejects a numeric $field of $value before RPC",
    async ({ field, value }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightSupplyCollateral(client, {
          ...params,
          [field]: value,
        } as unknown as MidnightSupplyCollateralPlanParams),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: InvalidBigIntInputError for a decimal-string now before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightSupplyCollateral(client, {
        ...params,
        now: "1800000000" as unknown as bigint,
      }),
    ).rejects.toMatchObject({
      constructor: InvalidBigIntInputError,
      field: "now",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("error: MidnightMarketAddressMismatchError", async () => {
    await expect(
      prepareMidnightSupplyCollateral(createMockClient(base).client, {
        ...params,
        market: { ...params.market, midnight: zeroAddress },
      }),
    ).rejects.toBeInstanceOf(MidnightMarketAddressMismatchError);
  });
});

describe("parseTransactionPlan with Midnight collateral", () => {
  test("behavior: extra market params cannot change collateral supply calldata", async () => {
    const plan = await prepareWithAllowance();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateral");
    const { market } = step.action.inputs;
    const marketWithExtraParams = {
      ...market,
      params: { ...market, maturity: market.maturity + 1n },
    };
    const stored = serializeTransactionPlan({
      ...plan,
      steps: [
        {
          ...step,
          action: {
            ...step.action,
            inputs: { ...step.action.inputs, market: marketWithExtraParams },
          },
        },
      ],
    });
    expect(buildTransactions(parseTransactionPlan(stored))).toEqual(
      buildTransactions(plan),
    );
  });

  test.each([
    [{ collateralIndex: 2n }, "collateralIndex"],
    [{ collateralAssets: "100" }, "collateralAssets"],
    [{ collateralAssets: maxUint128 + 1n }, "collateralAssets"],
    [
      { market: { ...MarketUtils.toStruct(params.market), chainId: 1n } },
      "market.chainId",
    ],
    [
      {
        market: {
          ...MarketUtils.toStruct(params.market),
          collateralParams: [{}],
        },
      },
      "market.collateralParams[0].token",
    ],
    [
      {
        market: {
          ...MarketUtils.toStruct(params.market),
          collateralParams: [
            ...MarketUtils.toStruct(params.market).collateralParams,
          ].reverse(),
        },
      },
      "market.collateralParams",
    ],
  ])("error: InvalidTransactionPlanError for %s", async (overrides, field) => {
    const plan = await prepareWithAllowance();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateral");
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
