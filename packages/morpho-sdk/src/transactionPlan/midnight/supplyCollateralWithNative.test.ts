import {
  MarketParams,
  MarketUtils,
  midnightAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  getChainAddresses,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
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
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { midnightSupplyCollateralWithNative } from "../../actions/midnight/supplyCollateralWithNative.js";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidMidnightNativeAmountTypeError,
  MissingContractCodeError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { InvalidTransactionPlanError, ZeroAccountError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  type MidnightSupplyCollateralWithNativePlanParams,
  prepareMidnightSupplyCollateralWithNative,
  validateMidnightSupplyCollateralWithNativePlanAction,
} from "./supplyCollateralWithNative.js";

const chainId = base.id;
const account = midnightAddresses.taker;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const wNative = getChainAddress(chainId, "wNative");
const market = new MarketParams({
  ...midnightMarket,
  collateralParams: [
    midnightMarket.collateralParams[0]!,
    { ...midnightMarket.collateralParams[0]!, token: wNative },
  ],
});
const wNativeIndex = BigInt(
  market.collateralParams.findIndex(({ token }) => token === wNative),
);
const params = {
  chainId,
  account,
  market,
  collateralIndex: wNativeIndex,
  collateralAssets: 100n,
  nativeAmount: 100n,
  now: 1_000n,
  expiresAt: 1_600,
} as const satisfies MidnightSupplyCollateralWithNativePlanParams;

/** Saved format-2 recipe pinned independently of the preparer: 40 native of 100 collateral. */
const savedNativeSupply = `{
  "version": 2,
  "chainId": 8453,
  "account": "0x000000000000000000000000000000000000A000",
  "expiresAt": 1600,
  "steps": [
    {
      "id": "midnightSupplyCollateralWithNative",
      "label": "Supply Midnight collateral with native currency",
      "action": {
        "type": "midnightSupplyCollateralWithNative",
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
                "token": "0x4200000000000000000000000000000000000006",
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
          "collateralAssets": {
            "$bigint": "100"
          },
          "nativeAssets": {
            "$bigint": "40"
          },
          "deadline": {
            "$bigint": "1600"
          }
        }
      }
    }
  ],
  "signatureRequests": []
}`;

function clientWith({
  allowance = maxUint256,
  authorized = true,
}: {
  allowance?: bigint;
  authorized?: boolean;
} = {}) {
  const handle = createMockClient(base);
  mockRead(handle, {
    address: wNative,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });
  mockRead(handle, {
    address: midnight,
    abi: midnightAbi,
    functionName: "isAuthorized",
    result: authorized,
  });
  return handle;
}

function prepare(
  overrides: Partial<MidnightSupplyCollateralWithNativePlanParams> = {},
  state?: Parameters<typeof clientWith>[0],
) {
  return prepareMidnightSupplyCollateralWithNative(clientWith(state).client, {
    ...params,
    ...overrides,
  });
}

function directBuild(nativeAmount: bigint = params.nativeAmount) {
  return midnightSupplyCollateralWithNative({
    chainId,
    market,
    collateralIndex: wNativeIndex,
    assets: params.collateralAssets,
    accountAddress: account,
    nativeAmount,
    deadline: 1_600n,
  });
}

describe("prepareMidnightSupplyCollateralWithNative", () => {
  test("default", async () => {
    const plan = await prepare();
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    expect(restored).toEqual(plan);
    expect(plan.signatureRequests).toEqual([]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "midnightSupplyCollateralWithNative",
    ]);
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual([directBuild()]);
    expect(transactions[0]).toMatchObject({ to: bundle, value: 100n });
  });

  test("behavior: partial native funding is sent as value and the rest is pulled as wNative", async () => {
    const plan = await prepare({ nativeAmount: 40n });
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
    expect(step.action.inputs).toMatchObject({
      collateralAssets: 100n,
      nativeAssets: 40n,
      deadline: 1_600n,
    });
    expect(buildTransactions(plan)).toEqual([directBuild(40n)]);
  });

  test("behavior: an insufficient allowance and a missing authorization add both prerequisites", async () => {
    const handle = clientWith({ allowance: 99n, authorized: false });
    const plan = await prepareMidnightSupplyCollateralWithNative(
      handle.client,
      params,
    );
    expect(
      expectReadCall(handle, {
        address: wNative,
        abi: erc20Abi,
        functionName: "allowance",
      }).map(({ args }) => args),
    ).toEqual([[account, bundle]]);
    expect(plan.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "midnightAuthorization",
      "midnightSupplyCollateralWithNative",
    ]);
    expect(plan.steps[0]?.id).toBe(
      "midnightSupplyCollateralWithNative:approval:0",
    );
    const [approval, authorization] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(approval && authorization);
    expect(approval.to).toBe(wNative);
    expect(decodeFunctionData({ abi: erc20Abi, data: approval.data })).toEqual({
      functionName: "approve",
      args: [bundle, maxUint256],
    });
    expect(authorization.to).toBe(midnight);
    expect(
      decodeFunctionData({ abi: midnightAbi, data: authorization.data }),
    ).toMatchObject({
      functionName: "setIsAuthorized",
      args: [bundle, true, account],
    });
  });

  test.each([
    {
      state: { allowance: maxUint256, authorized: false },
      steps: ["midnightAuthorization", "midnightSupplyCollateralWithNative"],
    },
    {
      state: { allowance: 99n, authorized: true },
      steps: ["erc20Approval", "midnightSupplyCollateralWithNative"],
    },
    {
      state: { allowance: params.collateralAssets, authorized: true },
      steps: ["midnightSupplyCollateralWithNative"],
    },
    {
      overrides: { nativeAmount: 40n },
      state: { allowance: 50n, authorized: true },
      steps: ["erc20Approval", "midnightSupplyCollateralWithNative"],
    },
  ])(
    "behavior: adds only the missing prerequisites for $state",
    async ({ overrides, state, steps }) => {
      const plan = await prepare(overrides, state);
      expect(plan.steps.map(({ action }) => action.type)).toEqual(steps);
    },
  );

  test.each([
    { collateralAssets: 0n, error: NonPositiveInputError },
    { collateralAssets: maxUint128 + 1n, error: InputExceedsMaxError },
  ])(
    "error: $error.name names collateralAssets for $collateralAssets",
    async ({ collateralAssets, error }) => {
      await expect(
        prepare({ collateralAssets, nativeAmount: 1n }),
      ).rejects.toMatchObject({
        constructor: error,
        field: "collateralAssets",
      });
    },
  );

  test("error: NativeAmountOnNonWNativeAssetError for another collateral", async () => {
    await expect(
      prepare({ collateralIndex: 1n - wNativeIndex }),
    ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
  });

  test("error: InputExceedsMaxError when native funding exceeds the collateral", async () => {
    await expect(prepare({ nativeAmount: 101n })).rejects.toMatchObject({
      constructor: InputExceedsMaxError,
      field: "nativeAmount",
    });
  });

  test("error: NonPositiveInputError for zero native funding", async () => {
    await expect(prepare({ nativeAmount: 0n })).rejects.toMatchObject({
      constructor: NonPositiveInputError,
      field: "nativeAmount",
    });
  });

  test("error: InvalidMidnightNativeAmountTypeError for numeric native funding before RPC", async () => {
    const { client, request } = createMockClient(base);
    await expect(
      prepareMidnightSupplyCollateralWithNative(client, {
        ...params,
        nativeAmount: 100 as unknown as bigint,
      }),
    ).rejects.toBeInstanceOf(InvalidMidnightNativeAmountTypeError);
    expect(request).not.toHaveBeenCalled();
  });

  test.each([
    { field: "collateralAssets", value: 100 },
    { field: "collateralIndex", value: 1 },
    { field: "now", value: 1000 },
  ])(
    "error: rejects a numeric $field of $value before RPC",
    async ({ field, value }) => {
      const { client, request } = createMockClient(base);
      await expect(
        prepareMidnightSupplyCollateralWithNative(client, {
          ...params,
          [field]: value,
        } as unknown as MidnightSupplyCollateralWithNativePlanParams),
      ).rejects.toMatchObject({ constructor: InvalidBigIntInputError, field });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("error: UnknownCollateralIndexError", async () => {
    await expect(prepare({ collateralIndex: 2n })).rejects.toBeInstanceOf(
      UnknownCollateralIndexError,
    );
  });

  test.each([
    {
      name: "zero collateral",
      changes: { collateralAssets: 0n },
      error: NonPositiveInputError,
    },
    {
      name: "negative collateral",
      changes: { collateralAssets: -1n },
      error: NonPositiveInputError,
    },
    {
      name: "negative native funding",
      changes: { nativeAmount: -1n },
      error: NegativeInputError,
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
      prepareMidnightSupplyCollateralWithNative(client, {
        ...params,
        ...changes,
      }),
    ).rejects.toBeInstanceOf(error);
    expect(request).not.toHaveBeenCalled();
  });

  test("error: [INV-05] ChainIdMismatchError for another RPC chain before any read", async () => {
    const { client, request } = createMockClient(base);
    request.mockResolvedValueOnce(numberToHex(mainnet.id));
    await expect(
      prepareMidnightSupplyCollateralWithNative(client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(request.mock.calls.map(([call]) => call.method)).toEqual([
      "eth_chainId",
    ]);
  });

  test.each([
    { role: "midnightBundlesV2", address: bundle },
    { role: "midnight", address: midnight },
  ])(
    "error: rejects missing $role code before reading allowance",
    async ({ role, address }) => {
      const { client, request } = clientWith();
      const defaultRequest = request.getMockImplementation();
      assert(defaultRequest);
      request.mockImplementation(async (args) => {
        if (args.method === "eth_getCode" && args.params?.[0] === address) {
          return "0x";
        }
        return defaultRequest(args);
      });
      await expect(
        prepareMidnightSupplyCollateralWithNative(client, params),
      ).rejects.toMatchObject({ constructor: MissingContractCodeError, role });
      expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
        "eth_call",
      );
    },
  );

  test("behavior: an omitted index supplies the first collateral", async () => {
    const wNativeFirst = new MarketParams({
      ...market,
      collateralParams: [market.collateralParams[Number(wNativeIndex)]!],
    });
    const { collateralIndex: _collateralIndex, ...unindexed } = params;
    const plan = await prepareMidnightSupplyCollateralWithNative(
      clientWith().client,
      { ...unindexed, market: wNativeFirst },
    );
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
    expect(step.action.inputs.collateralIndex).toBe(0n);
  });

  test("behavior: stores the parsed market tuple, the expiry and the calldata origin", async () => {
    const plan = await prepare({ calldataOrigin: "0x1234" });
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
    expect(step.action.inputs.market).toStrictEqual(
      MarketUtils.toStruct(market),
    );
    expect(plan.expiresAt).toBe(1_600);
    expect(plan.calldataOrigin).toBe("0x1234");
    const [tx] = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    assert(tx);
    expect(tx.data).toBe(`${directBuild().data}1234`);
  });

  test("error: rejects missing MidnightBundlesV2 code before reading allowance", async () => {
    const { client, request } = clientWith();
    const defaultRequest = request.getMockImplementation();
    assert(defaultRequest);
    request.mockImplementation(async (args) => {
      if (args.method === "eth_getCode" && args.params?.[0] === bundle) {
        return "0x";
      }
      return defaultRequest(args);
    });
    await expect(
      prepareMidnightSupplyCollateralWithNative(client, params),
    ).rejects.toMatchObject({
      constructor: MissingContractCodeError,
      role: "midnightBundlesV2",
    });
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain(
      "eth_call",
    );
  });
});

describe("parseTransactionPlan with Midnight native collateral supply", () => {
  test("error: a directly built step with reversed collateral cannot switch the supplied token", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
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

  test("error: a directly built step without a collateral index cannot fall back to the first collateral", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
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
    const [tx] = buildTransactions(parseTransactionPlan(savedNativeSupply));
    assert(tx);
    expect({
      to: tx.to,
      value: tx.value,
      data: tx.data,
    }).toMatchInlineSnapshot(`
      {
        "data": "0xb4691380000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000004c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005200000000000000000000000000000000000000000000000000000000000000540000000000000000000000000000000000000000000000000000000000000064000000000000000000000000042000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000042000000000000000000000000000000000000060000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "to": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        "value": 40n,
      }
    `);
  });

  test("error: InvalidTransactionPlanError for a signature reference", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
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
      validateMidnightSupplyCollateralWithNativePlanAction(
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

  test("error: InputExceedsMaxError when a directly built step sends more native funding than collateral", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
    const tampered = {
      ...step,
      action: {
        ...step.action,
        inputs: { ...step.action.inputs, nativeAssets: 101n },
      },
    };
    expect(() => buildTransactions({ ...plan, steps: [tampered] })).toThrow(
      InputExceedsMaxError,
    );
  });

  test.each([
    {
      name: "a non-wNative collateral index",
      tamper: () => ({ collateralIndex: 1n - wNativeIndex }),
      chainId: undefined,
    },
    {
      name: "another Midnight core",
      tamper: () => ({
        market: {
          ...MarketUtils.toStruct(market),
          midnight: padHex("0x01", { size: 20 }),
        },
      }),
      chainId: undefined,
    },
    {
      name: "a chain without a registry entry",
      tamper: () => ({
        chainId: 999_999,
        market: { ...MarketUtils.toStruct(market), chainId: 999_999n },
      }),
      chainId: 999_999,
    },
    {
      name: "a chain whose registry has no MidnightBundlesV2",
      tamper: () => {
        const { midnightBundlesV2: _bundle, ...addresses } =
          getChainAddresses(chainId);
        registerCustomAddresses({ addresses: { 999104: addresses } });
        return {
          chainId: 999_104,
          market: { ...MarketUtils.toStruct(market), chainId: 999_104n },
        };
      },
      chainId: 999_104,
    },
  ])(
    "error: InvalidTransactionPlanError when a restored recipe names $name",
    async ({ tamper, chainId: tamperedChainId }) => {
      const plan = await prepare();
      const step = plan.steps[0];
      assert(step?.action.type === "midnightSupplyCollateralWithNative");
      const stored = serializeTransactionPlan({
        ...plan,
        chainId: tamperedChainId ?? plan.chainId,
        steps: [
          {
            ...step,
            action: {
              ...step.action,
              inputs: { ...step.action.inputs, ...tamper() },
            },
          },
        ],
      } as unknown as typeof plan);
      const parse = () => parseTransactionPlan(stored);
      expect(parse).toThrow(InvalidTransactionPlanError);
      expect(parse).toThrow(
        expect.objectContaining({
          path: expect.stringMatching(/^\$\.steps\[0\]\.action\.inputs/),
        }),
      );
    },
  );

  test("error: InvalidTransactionPlanError when a restored step has no collateral index", async () => {
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
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
        message: expect.stringContaining("uint256 bigint"),
      }),
    );
  });

  test.each([
    [{ collateralIndex: 2n }, "collateralIndex"],
    [{ collateralAssets: 0n }, "collateralAssets"],
    [{ nativeAssets: 0n }, "nativeAssets"],
    [{ nativeAssets: 101n }, "nativeAssets"],
    [{ nativeAssets: maxUint128 + 1n }, "nativeAssets"],
    [{ collateralAssets: "100" }, "collateralAssets"],
    [{ collateralAssets: maxUint128 + 1n }, "collateralAssets"],
    [{ nativeAssets: "100" }, "nativeAssets"],
    [{ deadline: -1n }, "deadline"],
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
    const plan = await prepare();
    const step = plan.steps[0];
    assert(step?.action.type === "midnightSupplyCollateralWithNative");
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
