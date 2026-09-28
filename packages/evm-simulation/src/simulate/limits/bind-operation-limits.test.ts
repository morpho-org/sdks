import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { DecodedOperation } from "../../decode/operation.js";
import { SimulationValidationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import {
  bindOperationLimits,
  compareOperationIdentity,
} from "./bind-operation-limits.js";

const VAULT: Address = getAddress("0x4444444444444444444444444444444444444444");
const MARKET_A = `0x${"aa".repeat(32)}` as MarketId;

const op = (
  fields: object,
  identity: { transactionIndex: number; callPath?: readonly number[] },
): DecodedOperation =>
  ({
    callPath: [0],
    ...identity,
    ...fields,
  }) as unknown as DecodedOperation;

const supply = (
  transactionIndex: number,
  callPath?: readonly number[],
): DecodedOperation =>
  op(
    { type: "blueSupply", market: { marketId: MARKET_A } },
    { transactionIndex, callPath },
  );

const deposit = (transactionIndex: number): DecodedOperation =>
  op(
    { type: "vaultV1Deposit", vault: VAULT.toLowerCase() },
    { transactionIndex },
  );

describe("bindOperationLimits", () => {
  test("default: binds by type and subject, case-insensitively", () => {
    const bound = bindOperationLimits([deposit(0)], {
      operations: [{ type: "vaultV1Deposit", vault: VAULT }],
    });
    expect(bound).toHaveLength(1);
    expect(bound[0]?.operation.transactionIndex).toBe(0);
  });

  test("behavior: returns bound pairs in operation order regardless of limit order", () => {
    const operations = [
      supply(1, [0]),
      supply(0, [1]),
      supply(0, [0]),
      deposit(2),
    ];
    const limits: OperationLimit[] = [
      { type: "vaultV1Deposit", vault: VAULT },
      { type: "blueSupply", marketId: MARKET_A, transactionIndex: 1 },
    ];
    const bound = bindOperationLimits(operations, { operations: limits });
    expect(bound.map((b) => b.operation.transactionIndex)).toEqual([1, 2]);
    expect(
      [...operations]
        .sort(compareOperationIdentity)
        .map((o) => [o.transactionIndex, o.callPath]),
    ).toEqual([
      [0, [0]],
      [0, [1]],
      [1, [0]],
      [2, [0]],
    ]);
  });

  test("behavior: an empty limit list binds nothing", () => {
    expect(bindOperationLimits([supply(0)], { operations: [] })).toEqual([]);
  });

  test("error: SimulationValidationError lists every rejected limit with its index", () => {
    const run = () =>
      bindOperationLimits([supply(0), supply(1)], {
        operations: [
          { type: "blueSupply", marketId: MARKET_A },
          { type: "blueSupply", marketId: MARKET_A, transactionIndex: 5 },
          { type: "blueSupply", marketId: MARKET_A, transactionIndex: 0 },
          { type: "blueSupply", marketId: MARKET_A, transactionIndex: 0 },
        ],
      });
    expect(run).toThrow(SimulationValidationError);
    try {
      run();
    } catch (error) {
      expect((error as SimulationValidationError).fieldErrors).toEqual([
        expect.stringMatching(
          /^limits\.operations\[0\]: .*\(ambiguous limit\)$/,
        ),
        expect.stringMatching(
          /^limits\.operations\[1\]: .*\(inapplicable limit\)$/,
        ),
        expect.stringMatching(
          /^limits\.operations\[3\]: .*limits\.operations\[2\].*\(duplicate limit\)$/,
        ),
      ]);
    }
  });
});
