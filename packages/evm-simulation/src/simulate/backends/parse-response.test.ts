import { numberToHex } from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidSimulationResponseError,
  SimulationAssertError,
  SimulationRevertedError,
} from "../../errors.js";
import {
  assertionPlan,
  BLOCK_HASH,
  balanceAssertion,
  balanceHex,
  buildBlocks,
  makePlan,
  NOW,
  OWNER,
  parse,
  parseOnly,
  SLIPPAGE_REVERT_DATA,
  TARGET,
} from "../../test-helpers/simulation-response.js";
import { evaluateCalls } from "./evaluate-calls.js";
import { parseSimulationResponse } from "./parse-response.js";

const parseWithoutParentHashCheck = (
  plan: ReturnType<typeof makePlan>,
  blocks: unknown,
) =>
  evaluateCalls(
    parseSimulationResponse({
      plan,
      blocks,
      stateBlockNumber: 24_000_000n,
      stateBlockHash: BLOCK_HASH,
      stateBlockTimestamp: NOW,
      parentHashCheck: false,
    }),
  );

describe("parseSimulationResponse", () => {
  test.each(["absent", "null"])(
    "behavior: records %s per-call logs while returning an empty list",
    (variant) => {
      const plan = makePlan();
      const block = buildBlocks(plan)[0]!;
      const transactionIndex = plan.calls.findIndex(
        (call) => call.type === "transaction",
      );
      const blocks = [
        {
          ...block,
          calls: block.calls.map((call, index) => {
            if (index !== transactionIndex) return call;
            const withoutLogs = Object.fromEntries(
              Object.entries(call).filter(([key]) => key !== "logs"),
            );
            return variant === "absent"
              ? withoutLogs
              : { ...withoutLogs, logs: null };
          }),
        },
      ];
      const execution = parse(plan, blocks);
      const transaction = execution.calls.find(
        (call) => call.planned.type === "transaction",
      );
      expect(transaction?.result.logs).toEqual([]);
      expect(transaction?.logsMissing).toBe(true);
    },
  );

  test("behavior: parsing keeps failed calls and leaves call checks to evaluateCalls", () => {
    let checked = false;
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertBefore: [balanceAssertion(5n)],
        assertLogs: [
          {
            check: () => {
              checked = true;
              return "unreachable";
            },
          },
        ],
      },
    ]);
    const assertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    const blocks = buildBlocks(plan, {
      [assertionIndex]: { data: balanceHex(4n) },
      [transactionIndex]: {
        status: "failure",
        errorData: SLIPPAGE_REVERT_DATA,
      },
    });
    Reflect.deleteProperty(blocks[0]!.calls[transactionIndex]!, "logs");

    const response = parseOnly(plan, blocks);

    expect(checked).toBe(false);
    expect(response.calls).toHaveLength(plan.calls.length);
    expect(response.calls[transactionIndex]).toMatchObject({
      planned: { type: "transaction", transactionIndex: 0 },
      result: { status: false },
      revertData: SLIPPAGE_REVERT_DATA,
      error: { message: "reverted", data: SLIPPAGE_REVERT_DATA },
      logsMissing: true,
    });
    expect(response.calls[assertionIndex]).toMatchObject({
      planned: { type: "assertion", phase: "before" },
      result: { status: true, returnData: balanceHex(4n) },
    });
    const execution = evaluateCalls(response);
    expect(execution.reverted).toBe(true);
    expect(execution.failures).toEqual([
      expect.any(SimulationAssertError),
      expect.any(SimulationRevertedError),
    ]);
    expect(checked).toBe(false);
  });

  test("behavior: missing logs without assertLogs still normalizes to an empty array", () => {
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
      },
    ]);
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    const blocks = buildBlocks(plan);
    Reflect.deleteProperty(blocks[0]!.calls[transactionIndex]!, "logs");

    const execution = parse(plan, blocks);

    expect(
      execution.calls.find(({ planned }) => planned.type === "transaction")
        ?.result.logs,
    ).toEqual([]);
  });

  test("error: InvalidSimulationResponseError on call-count mismatch", () => {
    const plan = makePlan();
    const blocks = buildBlocks(plan);
    blocks[0]!.calls.pop();
    expect(() => parse(plan, blocks)).toThrow(InvalidSimulationResponseError);
  });

  test("error: InvalidSimulationResponseError for a block beyond the successor", () => {
    const plan = makePlan();
    const blocks = buildBlocks(plan);
    blocks[0]!.number = numberToHex(24_000_002n);
    expect(() => parse(plan, blocks)).toThrow(InvalidSimulationResponseError);
  });

  test("error: InvalidSimulationResponseError when the successor reports no parentHash", () => {
    const plan = makePlan();
    const blocks = buildBlocks(plan);
    delete (blocks[0] as { parentHash?: string }).parentHash;
    expect(() => parse(plan, blocks)).toThrow(InvalidSimulationResponseError);
  });

  test("error: InvalidSimulationResponseError when the successor parentHash is not the pinned hash", () => {
    const plan = makePlan();
    const blocks = buildBlocks(plan);
    blocks[0]!.parentHash = `0x${"ef".repeat(32)}`;
    expect(() => parse(plan, blocks)).toThrow(InvalidSimulationResponseError);
  });

  describe("parentHashCheck off", () => {
    test("behavior: a successor parentHash that is not the pinned hash is accepted", () => {
      const plan = makePlan();
      const blocks = buildBlocks(plan);
      blocks[0]!.parentHash = `0x${"ef".repeat(32)}`;
      expect(parseWithoutParentHashCheck(plan, blocks).block.blockNumber).toBe(
        24_000_001n,
      );
    });

    test("behavior: a successor with no parentHash is accepted", () => {
      const plan = makePlan();
      const blocks = buildBlocks(plan);
      delete (blocks[0] as { parentHash?: string }).parentHash;
      expect(parseWithoutParentHashCheck(plan, blocks).block.blockNumber).toBe(
        24_000_001n,
      );
    });

    test("error: InvalidSimulationResponseError for a block beyond the successor", () => {
      const plan = makePlan();
      const blocks = buildBlocks(plan);
      blocks[0]!.parentHash = `0x${"ef".repeat(32)}`;
      blocks[0]!.number = numberToHex(24_000_002n);
      expect(() => parseWithoutParentHashCheck(plan, blocks)).toThrow(
        InvalidSimulationResponseError,
      );
    });

    test("error: InvalidSimulationResponseError for a timestamp behind the pinned block", () => {
      const plan = makePlan();
      const blocks = buildBlocks(plan);
      blocks[0]!.parentHash = `0x${"ef".repeat(32)}`;
      blocks[0]!.timestamp = numberToHex(NOW - 1n);
      expect(() => parseWithoutParentHashCheck(plan, blocks)).toThrow(
        InvalidSimulationResponseError,
      );
    });
  });
});
