import {
  type Address,
  encodeFunctionResult,
  erc20Abi,
  getAddress,
  numberToHex,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidSimulationResponseError,
  isSimulationPackageError,
  MissingVerificationEvidenceError,
  SimulationRevertedError,
} from "../../errors.js";
import { makeBalanceRead } from "../../test-helpers/make-balance-read.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { parseSimulationResponse } from "./parse-response.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const NOW = 1_700_000_000n;
const BLOCK_HASH: `0x${string}` = `0x${"ab".repeat(32)}`;

const parsed = parseRequest({
  chainId: 1,
  transactions: [{ from: OWNER, to: TARGET, data: "0x12345678" }],
});

const reads = [makeBalanceRead(TOKEN, OWNER)];

const makePlan = (
  preparations: {
    authorizationIndex: number;
    calls: { from: Address; to: Address; data: `0x${string}`; value: bigint }[];
  }[] = [],
  request = parsed,
) =>
  planExecution({
    request,
    owner: OWNER,
    preparations,
    reads,
  });

const allowanceHex = (value: bigint): `0x${string}` =>
  encodeFunctionResult({
    abi: erc20Abi,
    functionName: "allowance",
    result: value,
  });

const buildBlocks = (
  plan: ReturnType<typeof makePlan>,
  overrides: Record<
    number,
    { status?: "failure" | "success"; data?: `0x${string}` }
  > = {},
) => [
  {
    number: numberToHex(24_000_001n),
    timestamp: numberToHex(NOW),
    hash: `0x${"cd".repeat(32)}`,
    parentHash: `0x${"ab".repeat(32)}`,
    calls: plan.calls.map((call, index) => {
      const override = overrides[index] ?? {};
      const status = override.status ?? "success";
      const data =
        override.data ??
        (call.type === "stateRead" && call.read.kind === "erc20.balance"
          ? allowanceHex(1n)
          : "0x");
      return {
        status: status === "success" ? "0x1" : "0x0",
        returnData: data,
        gasUsed: numberToHex(256n),
        logs: [],
        ...(status === "success" ? {} : { error: { message: "reverted" } }),
      };
    }),
  },
];

const parse = (
  plan: ReturnType<typeof makePlan>,
  blocks: ReturnType<typeof buildBlocks>,
) =>
  parseSimulationResponse({
    plan,
    blocks,
    stateBlockNumber: 24_000_000n,
    stateBlockHash: BLOCK_HASH,
    stateBlockTimestamp: NOW,
    parentHashCheck: true,
  });

const parseWithoutParentHashCheck = (
  plan: ReturnType<typeof makePlan>,
  blocks: ReturnType<typeof buildBlocks>,
) =>
  parseSimulationResponse({
    plan,
    blocks,
    stateBlockNumber: 24_000_000n,
    stateBlockHash: BLOCK_HASH,
    stateBlockTimestamp: NOW,
    parentHashCheck: false,
  });

describe("parseSimulationResponse", () => {
  test("default: state reads grouped by phase, preparations carried", () => {
    const plan = makePlan([
      {
        authorizationIndex: 2,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const execution = parse(plan, buildBlocks(plan));
    const phases = execution.stateReads.map((r) => r.phase);
    expect(phases.filter((p) => p === "before")).toHaveLength(reads.length);
    expect(phases.filter((p) => p === "after")).toHaveLength(reads.length);

    const txs = execution.calls.filter((c) => c.planned.type === "transaction");
    expect(txs).toHaveLength(1);
    const preps = execution.calls.filter(
      (c) => c.planned.type === "preparation",
    );
    expect(
      preps[0]?.planned.type === "preparation" &&
        preps[0].planned.authorizationIndex === 2,
    ).toBe(true);
  });

  test("error: SimulationRevertedError on user call revert", () => {
    const plan = makePlan();
    const txIndex = plan.calls.findIndex((c) => c.type === "transaction");
    expect(() =>
      parse(plan, buildBlocks(plan, { [txIndex]: { status: "failure" } })),
    ).toThrow(SimulationRevertedError);
  });

  test("error: SimulationRevertedError on preparation revert", () => {
    const plan = makePlan([
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const prepIndex = plan.calls.findIndex((c) => c.type === "preparation");
    const error = (() => {
      try {
        parse(plan, buildBlocks(plan, { [prepIndex]: { status: "failure" } }));
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      reasonCode: "UNKNOWN_REVERT",
      context: {
        stage: "preparation",
        chainId: 1,
        mode: "final",
        blockNumber: 24_000_000n,
        authorizationIndex: 0,
        preparationCallIndex: 0,
      },
    });
  });

  test("error: preparation revert wins over the user revert it caused", () => {
    const plan = makePlan([
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const prepIndex = plan.calls.findIndex((c) => c.type === "preparation");
    const txIndex = plan.calls.findIndex((c) => c.type === "transaction");
    const error = (() => {
      try {
        parse(
          plan,
          buildBlocks(plan, {
            [prepIndex]: { status: "failure" },
            [txIndex]: { status: "failure" },
          }),
        );
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      reasonCode: "UNKNOWN_REVERT",
      context: {
        stage: "preparation",
        chainId: 1,
        mode: "final",
        blockNumber: 24_000_000n,
        authorizationIndex: 0,
        preparationCallIndex: 0,
      },
    });
  });

  test("error: MissingVerificationEvidenceError on failed state read", () => {
    const plan = makePlan();
    const readIndex = plan.calls.findIndex((c) => c.type === "stateRead");
    const read = plan.calls[readIndex];
    if (read?.type !== "stateRead") throw new Error("no state read planned");
    const readId = read.read.id;
    const error = (() => {
      try {
        parse(plan, buildBlocks(plan, { [readIndex]: { status: "failure" } }));
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(MissingVerificationEvidenceError);
    expect(isSimulationPackageError(error)).toBe(true);
    expect(error).toMatchObject({
      context: {
        stage: "verification",
        chainId: 1,
        mode: "final",
        blockNumber: 24_000_000n,
        field: readId,
      },
    });
    expect(
      (error as { context?: { operation?: unknown } }).context?.operation,
    ).toBeUndefined();
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
