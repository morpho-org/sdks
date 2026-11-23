import { MarketParams } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import {
  CbbtcUsdcBlue,
  deadSeededMarketData,
  WstethWethBlue,
} from "../../../test/fixtures/blue.js";
import { blueSupply } from "../../actions/blue/supply.js";
import {
  NativeAmountOnNonWNativeAssetError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
} from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import { buildBlueSupply, prepareBlueSupply } from "./supply.js";

const account = "0x0000000000000000000000000000000000000001";
const params = {
  chainId: 1,
  account,
  assets: 100n,
  now: 100n,
  expiresAt: 200,
  marketId: CbbtcUsdcBlue.id,
  marketData: { chainId: 1, market: deadSeededMarketData(CbbtcUsdcBlue) },
} as const;

test.each([0n, maxUint256])("funding allowance %s", async (allowance) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: CbbtcUsdcBlue.loanToken,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });
  const plan = await prepareBlueSupply(handle.client, params);
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps.map((step) => step.action.type)).toEqual(
    allowance === 0n ? ["erc20Approval", "blueSupply"] : ["blueSupply"],
  );
  const approval = plan.steps[0]?.action;
  if (approval?.type === "erc20Approval") {
    expect(approval.inputs.assets).toBe(maxUint256);
    expect(approval.inputs.spender).toBe(
      getChainAddress(1, "bundles.blueBundlesV1"),
    );
  }
  const parsed = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(buildTransactions(parsed)).toEqual(buildTransactions(plan));
  const expected = blueSupply({
    market: { chainId: 1, marketParams: CbbtcUsdcBlue },
    args: {
      userAddress: account,
      assets: 100n,
      deadline: 200n,
    },
  });
  expect(buildTransactions(parsed).at(-1)).toEqual(expected);
});

test("building a restored supply plan leaves the market cache unchanged", async () => {
  const mock = createMockClient(mainnet);
  mockRead(mock, {
    address: CbbtcUsdcBlue.loanToken,
    abi: erc20Abi,
    functionName: "allowance",
    result: maxUint256,
  });
  const plan = await prepareBlueSupply(mock.client, params);
  const restored = parseTransactionPlan(serializeTransactionPlan(plan));
  const cached = MarketParams.get(CbbtcUsdcBlue.id);
  expect(buildTransactions(restored)).toHaveLength(1);
  expect(MarketParams.get(CbbtcUsdcBlue.id)).toBe(cached);
});

test("missing referenced signature reports its id", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: CbbtcUsdcBlue.loanToken,
    abi: erc20Abi,
    functionName: "allowance",
    result: maxUint256,
  });
  const plan = structuredClone(await prepareBlueSupply(handle.client, params));
  const action = plan.steps[0]?.action;
  assert(action?.type === "blueSupply");
  const incomplete = {
    ...plan,
    steps: [
      {
        ...plan.steps[0],
        id: "blueSupply",
        label: "Supply",
        action: { ...action, signatureRequestIds: { tokenPermit: "missing" } },
      },
    ],
  };
  expect(() => buildTransactions(incomplete)).toThrow(
    IncompleteTransactionPlanError,
  );
  try {
    buildTransactions(incomplete);
  } catch (error) {
    assert(error instanceof IncompleteTransactionPlanError);
    expect(error.id).toBe("missing");
  }
});

test.each(["assets", "marketParams", "signatureRequestIds"])(
  "parser rejects malformed %s",
  async (field) => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: CbbtcUsdcBlue.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const plan = await prepareBlueSupply(handle.client, params);
    const stored = JSON.parse(serializeTransactionPlan(plan));
    if (field === "signatureRequestIds") {
      stored.steps[0].action[field] = null;
    } else {
      stored.steps[0].action.inputs[field] = "invalid";
    }
    expect(() => parseTransactionPlan(JSON.stringify(stored))).toThrow(
      InvalidTransactionPlanError,
    );
  },
);

test("native funding needs no token prerequisites", async () => {
  const handle = createMockClient(mainnet);
  const market = deadSeededMarketData(WstethWethBlue);
  const plan = await prepareBlueSupply(handle.client, {
    ...params,
    marketId: market.id,
    marketData: { chainId: 1, market },
    funding: { type: "native" },
  });
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps.map((step) => step.action.type)).toEqual(["blueSupply"]);
  const action = plan.steps[0]?.action;
  assert(action?.type === "blueSupply");
  expect(action.inputs.nativeAssets).toBe(params.assets);
  const parsed = parseTransactionPlan(serializeTransactionPlan(plan));
  expect(buildTransactions(parsed)).toEqual(buildTransactions(plan));
  const malformed = JSON.parse(serializeTransactionPlan(plan));
  malformed.steps[0].action.inputs.nativeAssets = "invalid";
  expect(() => parseTransactionPlan(JSON.stringify(malformed))).toThrow(
    InvalidTransactionPlanError,
  );
  expect(buildTransactions(plan)[0]?.value).toBe(params.assets);
});

test.each([0n, params.assets - 1n])(
  "rejects inconsistent nativeAssets %s in parsing and building",
  async (nativeAssets) => {
    const handle = createMockClient(mainnet);
    const market = deadSeededMarketData(WstethWethBlue);
    const plan = await prepareBlueSupply(handle.client, {
      ...params,
      marketId: market.id,
      marketData: { chainId: 1, market },
      funding: { type: "native" },
    });
    const step = plan.steps[0];
    assert(step?.action.type === "blueSupply");
    const action = step.action;
    const malformedAction = {
      ...action,
      inputs: { ...action.inputs, nativeAssets },
    };
    const malformedPlan = {
      ...plan,
      steps: [{ ...step, action: malformedAction }],
    };
    expect(() =>
      parseTransactionPlan(serializeTransactionPlan(malformedPlan)),
    ).toThrow(InvalidTransactionPlanError);
    expect(() => buildBlueSupply(malformedAction, [])).toThrow(
      InvalidTransactionPlanError,
    );
    expect(() => buildTransactions(malformedPlan)).toThrow(
      InvalidTransactionPlanError,
    );
  },
);

test("rejects non-wNative native funding before RPC", async () => {
  const handle = createMockClient(mainnet);
  await expect(
    prepareBlueSupply(handle.client, {
      ...params,
      funding: { type: "native" },
    }),
  ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
  expect(handle.request).not.toHaveBeenCalled();
});

test("rejects empty funding before RPC", async () => {
  const handle = createMockClient(mainnet);
  await expect(
    prepareBlueSupply(handle.client, { ...params, assets: 0n }),
  ).rejects.toBeInstanceOf(NonPositiveInputError);
  expect(handle.request).not.toHaveBeenCalled();
});
