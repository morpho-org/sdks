import type { MarketId } from "@morpho-org/blue-sdk";
import { getAddress, maxUint256 } from "viem";
import { describe, expect, test, vi } from "vitest";
import type { DecodedOperation } from "../../decode/operation.js";
import { ConsumerLimitViolationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import {
  emptyDiff,
  makeCheckContext,
  makeMarketState,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import * as blueModule from "./blue.js";
import { checkOperations } from "./index.js";

const MARKET_ID =
  "0xb8c25cd0a6f03f8b34c8b9b12e24a2a1b3f0f0f0f0f0f0f0f0f0f0f0f0f0f0f" as MarketId;

const market = {
  marketId: MARKET_ID,
  params: {
    loanToken: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    oracle: getAddress("0x0000000000000000000000000000000000000001"),
    irm: getAddress("0x0000000000000000000000000000000000000002"),
    lltv: 900000000000000000n,
  },
} as const;

const supplyOp: DecodedOperation = {
  type: "blueSupply",
  route: "blueBundlesV1",
  transactionIndex: 0,
  market,
  assets: 100n,
  shares: undefined,
  onBehalf: TEST_OWNER,
  receiver: TEST_OWNER,
  funding: { type: "erc20", token: market.params.loanToken, assets: 100n },
} as unknown as DecodedOperation;

const stubCheck = () => {
  const state = makeMarketState({ marketId: MARKET_ID });
  return {
    state,
    args: {
      operations: [supplyOp],
      accruedBefore: state,
      after: state,
      diff: { ...emptyDiff },
      actionDiff: { ...emptyDiff },
      transfers: [],
    },
  };
};

describe("checkOperations — consumer limits", () => {
  test("no limits → checked operations returned", () => {
    const { args, state } = stubCheck();
    const spy = vi.spyOn(blueModule, "checkBlueOperation").mockReturnValue({
      operation: supplyOp,
      outcome: { supplySharesMinted: 100n },
    } as never);
    const result = checkOperations({ ctx: makeCheckContext(), ...args });
    expect(result.operations).toHaveLength(1);
    spy.mockRestore();
    void state;
  });

  test("equals mismatch → ConsumerLimitViolationError", () => {
    const { args } = stubCheck();
    const spy = vi.spyOn(blueModule, "checkBlueOperation").mockReturnValue({
      operation: supplyOp,
      outcome: { supplySharesMinted: 100n },
    } as never);
    const limit: OperationLimit = {
      type: "blueSupply",
      marketId: MARKET_ID,
      expectedAssets: 999n,
    };
    expect(() =>
      checkOperations({
        ctx: makeCheckContext({
          limits: { ...makeCheckContext().limits, operations: [limit] },
        }),
        ...args,
      }),
    ).toThrow(ConsumerLimitViolationError);
    spy.mockRestore();
  });

  test("min bound fail → ConsumerLimitViolationError", () => {
    const { args } = stubCheck();
    const spy = vi.spyOn(blueModule, "checkBlueOperation").mockReturnValue({
      operation: supplyOp,
      outcome: { supplySharesMinted: 10n },
    } as never);
    const limit: OperationLimit = {
      type: "blueSupply",
      marketId: MARKET_ID,
      minSupplySharesMinted: 100n,
    };
    expect(() =>
      checkOperations({
        ctx: makeCheckContext({
          limits: { ...makeCheckContext().limits, operations: [limit] },
        }),
        ...args,
      }),
    ).toThrow(ConsumerLimitViolationError);
    spy.mockRestore();
  });

  test("max bound vs non-finite RiskMetric → ConsumerLimitViolationError", () => {
    const op = {
      ...supplyOp,
      type: "blueSupplyCollateral",
      collateralAssets: 100n,
    } as unknown as DecodedOperation;
    const { state } = stubCheck();
    const spy = vi.spyOn(blueModule, "checkBlueOperation").mockReturnValue({
      operation: op,
      outcome: {
        ltvAfterWad: { type: "unbounded", reason: "zeroCollateral" },
      },
    } as never);
    const limit: OperationLimit = {
      type: "blueSupplyCollateral",
      marketId: MARKET_ID,
      maxLtvAfterWad: maxUint256 - 1n,
    };
    expect(() =>
      checkOperations({
        ctx: makeCheckContext({
          limits: { ...makeCheckContext().limits, operations: [limit] },
        }),
        operations: [op],
        accruedBefore: state,
        after: state,
        diff: { ...emptyDiff },
        actionDiff: { ...emptyDiff },
        transfers: [],
      }),
    ).toThrow(ConsumerLimitViolationError);
    spy.mockRestore();
  });

  test("unmatched limit type → ConsumerLimitViolationError", () => {
    const { args } = stubCheck();
    const spy = vi.spyOn(blueModule, "checkBlueOperation").mockReturnValue({
      operation: supplyOp,
      outcome: { supplySharesMinted: 100n },
    } as never);
    const limit: OperationLimit = {
      type: "blueRepay",
      marketId: MARKET_ID,
    };
    expect(() =>
      checkOperations({
        ctx: makeCheckContext({
          limits: { ...makeCheckContext().limits, operations: [limit] },
        }),
        ...args,
      }),
    ).toThrow(ConsumerLimitViolationError);
    spy.mockRestore();
  });
});
