import {
  type Address,
  encodeErrorResult,
  encodeFunctionResult,
  erc20Abi,
  ethAddress,
  getAddress,
  type Hex,
  numberToHex,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidSimulationResponseError,
  isSimulationPackageError,
  SimulationAssertError,
  SimulationLogAssertError,
  SimulationRevertedError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import { makeBalanceRead } from "../../test-helpers/make-balance-read.js";
import type {
  LogAssertion,
  RawLog,
  SimulationTransaction,
} from "../../types.js";
import { erc20BalanceAssertion } from "../assertions.js";
import { parseTransfers, TRANSFER_TOPIC } from "../parsing/transfers.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { REVERT_ERRORS_ABI } from "./decode-revert.js";
import { parseSimulationResponse } from "./parse-response.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SLIPPAGE_REVERT_DATA = "0x8199f5f3" as const;

const NOW = 1_700_000_000n;
const INVALID_NONCE = encodeErrorResult({
  abi: REVERT_ERRORS_ABI,
  errorName: "InvalidNonce",
});
const ALL_CAPS_REACHED = encodeErrorResult({
  abi: REVERT_ERRORS_ABI,
  errorName: "AllCapsReached",
});
const BLOCK_HASH: `0x${string}` = `0x${"ab".repeat(32)}`;
const balanceAssertion = (min: bigint) =>
  erc20BalanceAssertion({ token: TOKEN, account: OWNER, min });

const parsed = parseRequest({
  limits: "none",
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

const balanceHex = (value: bigint): `0x${string}` =>
  encodeFunctionResult({
    abi: erc20Abi,
    functionName: "balanceOf",
    result: value,
  });

const assertionPlan = (transactions: readonly SimulationTransaction[]) =>
  makePlan(
    [],
    parseRequest({
      chainId: 1,
      limits: "none",
      transactions,
    }),
  );

const buildBlocks = (
  plan: ReturnType<typeof makePlan>,
  overrides: Record<
    number,
    {
      status?: "failure" | "success";
      data?: `0x${string}`;
      errorData?: `0x${string}`;
      errorMessage?: string;
      logs?: readonly RawLog[];
    }
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
        logs: override.logs ?? [],
        ...(status === "success"
          ? {}
          : {
              error: {
                message: override.errorMessage ?? "reverted",
                ...(override.errorData === undefined
                  ? {}
                  : { data: override.errorData }),
              },
            }),
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

const userRevertError = (
  plan: ReturnType<typeof makePlan>,
  {
    data,
    errorData,
  }: {
    readonly data?: `0x${string}`;
    readonly errorData?: `0x${string}`;
  } = {},
) => {
  const txIndex = plan.calls.findIndex((call) => call.type === "transaction");
  const blocks = buildBlocks(plan, {
    [txIndex]: { status: "failure", data },
  });
  const block = blocks[0];
  const blocksWithErrorData =
    block === undefined || errorData === undefined
      ? blocks
      : [
          {
            ...block,
            calls: block.calls.map((call, index) => {
              if (index !== txIndex) return call;
              const error = { message: "reverted", data: errorData };
              return { ...call, error };
            }),
          },
        ];
  try {
    parse(plan, blocksWithErrorData);
  } catch (error) {
    return error;
  }
};

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

  test("error: failing assertBefore takes precedence over its transaction revert", () => {
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertBefore: [balanceAssertion(5n)],
      },
    ]);
    const assertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [assertionIndex]: { data: balanceHex(4n) },
          [transactionIndex]: { status: "failure" },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationAssertError);
    expect(error).not.toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      code: "SIMULATION_ASSERT_FAILED",
      transactionIndex: 0,
      phase: "before",
      assertionIndex: 0,
      assertion: { to: TOKEN },
      returnData: balanceHex(4n),
    });
  });

  test("error: failing assertBefore prevents log assertions", () => {
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
              return undefined;
            },
          },
        ],
      },
    ]);
    const assertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [assertionIndex]: { data: balanceHex(4n) },
        }),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SimulationAssertError);
    expect(error).toMatchObject({ phase: "before" });
    expect(checked).toBe(false);
  });

  test("error: transaction revert takes precedence over a failing assertAfter", () => {
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertAfter: [balanceAssertion(5n)],
      },
    ]);
    const assertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [assertionIndex]: { data: balanceHex(4n) },
          [transactionIndex]: { status: "failure" },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).not.toBeInstanceOf(SimulationAssertError);
    expect(error).toMatchObject({ transactionIndex: 0 });
  });

  test("error: transaction revert takes precedence over a failing log assertion", () => {
    let checked = false;
    const logAssertion: LogAssertion = {
      check: () => {
        checked = true;
        return "Approval event is missing.";
      },
    };
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [logAssertion],
      },
    ]);
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    expect(() =>
      parse(
        plan,
        buildBlocks(plan, {
          [transactionIndex]: { status: "failure" },
        }),
      ),
    ).toThrow(SimulationRevertedError);
    expect(checked).toBe(false);
  });

  test("error: failing log assertion takes precedence over a failing assertAfter", () => {
    const logAssertion: LogAssertion = {
      check: () => "Approval event is missing.",
    };
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [logAssertion],
        assertAfter: [balanceAssertion(5n)],
      },
    ]);
    const afterAssertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion" && call.phase === "after",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [afterAssertionIndex]: { data: balanceHex(4n) },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationLogAssertError);
    expect(error).toMatchObject({
      code: "SIMULATION_ASSERT_FAILED",
      message: "Transaction 0 assertLogs[0] failed: Approval event is missing.",
      transactionIndex: 0,
      assertionIndex: 0,
      assertion: logAssertion,
      logs: [],
    });
  });

  test("error: reports log assertion indices after earlier checks", () => {
    const order: string[] = [];
    const logAssertion = (label: string, failure?: string): LogAssertion => ({
      check: () => {
        order.push(label);
        return failure;
      },
    });
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [logAssertion("tx0/a0"), logAssertion("tx0/a1")],
      },
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [logAssertion("tx1/a0"), logAssertion("tx1/a1", "failure")],
      },
    ]);
    let error: unknown;
    try {
      parse(plan, buildBlocks(plan));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SimulationLogAssertError);
    expect(error).toMatchObject({ transactionIndex: 1, assertionIndex: 1 });
    expect((error as Error).message).toContain("Transaction 1 assertLogs[1]");
    expect(order).toEqual(["tx0/a0", "tx0/a1", "tx1/a0", "tx1/a1"]);
  });

  test("behavior: log assertions receive only their transaction's logs", () => {
    const firstLog: RawLog = { address: TOKEN, topics: [], data: "0x" };
    const secondLog: RawLog = { address: TARGET, topics: [], data: "0x" };
    const received: (readonly RawLog[])[] = [];
    const firstAssertion: LogAssertion = {
      check: (logs) => {
        received.push(logs);
        return undefined;
      },
    };
    const secondAssertion: LogAssertion = {
      check: (logs) => {
        received.push(logs);
        return undefined;
      },
    };
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [firstAssertion],
      },
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [secondAssertion],
      },
    ]);
    const firstTransactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction" && call.transactionIndex === 0,
    );
    const secondTransactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction" && call.transactionIndex === 1,
    );
    const execution = parse(
      plan,
      buildBlocks(plan, {
        [firstTransactionIndex]: { logs: [firstLog] },
        [secondTransactionIndex]: { logs: [secondLog] },
      }),
    );
    expect(received).toEqual([
      [{ ...firstLog, address: firstLog.address.toLowerCase() }],
      [{ ...secondLog, address: secondLog.address.toLowerCase() }],
    ]);
    expect(
      execution.calls
        .filter((call) => call.planned.type === "transaction")
        .map((call) => call.result.logs),
    ).toEqual([[firstLog], [secondLog]]);
  });

  test("behavior: assertLogs preserves mixed-case synthetic native and ERC-20 logs in emission order", () => {
    const topicFor = (address: Address): Hex =>
      `0x${address.slice(2).toUpperCase().padStart(64, "0")}`;
    const mixedTransferTopic =
      `0x${TRANSFER_TOPIC.slice(2).toUpperCase()}` as Hex;
    const emittedLogs: RawLog[] = [
      {
        address: TOKEN,
        topics: [mixedTransferTopic, topicFor(OWNER), topicFor(TARGET)],
        data: `0x${"AB".repeat(32)}` as Hex,
      },
      {
        address: ethAddress,
        topics: [mixedTransferTopic, topicFor(TARGET), topicFor(TOKEN)],
        data: `0x${"CD".repeat(32)}` as Hex,
      },
      {
        address: TARGET,
        topics: [mixedTransferTopic, topicFor(TOKEN), topicFor(OWNER)],
        data: `0x${"EF".repeat(32)}` as Hex,
      },
    ];
    let receivedLogs: readonly RawLog[] | undefined;
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [
          {
            check: (logs) => {
              receivedLogs = logs;
              return undefined;
            },
          },
        ],
      },
    ]);
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );

    parse(
      plan,
      buildBlocks(plan, {
        [transactionIndex]: { logs: emittedLogs },
      }),
    );

    expect(receivedLogs).toEqual(
      emittedLogs.map(({ address, topics, data }) => ({
        address: address.toLowerCase(),
        topics: topics.map((topic) => topic.toLowerCase()),
        data: data.toLowerCase(),
      })),
    );
  });

  test("error: assertLogs requires logs in the transaction result", () => {
    let checked = false;
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [
          {
            check: () => {
              checked = true;
              return undefined;
            },
          },
        ],
      },
    ]);
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    const blocks = buildBlocks(plan);
    Reflect.deleteProperty(blocks[0]!.calls[transactionIndex]!, "logs");

    expect(() => parse(plan, blocks)).toThrow(
      expect.objectContaining({
        name: "InvalidSimulationResponseError",
        message:
          "eth_simulateV1 omitted logs for transaction 0. Log assertions cannot be evaluated.",
      }),
    );
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

  test("behavior: checks receive a frozen lowercase copy without changing calls or transfers", () => {
    const recipient = getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    const mixedCaseLog: RawLog = {
      address: TOKEN,
      topics: [
        `0x${TRANSFER_TOPIC.slice(2).toUpperCase()}` as Hex,
        `0x${TOKEN.slice(2).toUpperCase().padStart(64, "0")}` as Hex,
        `0x${recipient.slice(2).toUpperCase().padStart(64, "0")}` as Hex,
      ],
      data: `0x${"AB".repeat(32)}` as Hex,
    };
    let receivedLogs: readonly RawLog[] | undefined;
    let secondReceivedLogs: readonly RawLog[] | undefined;
    const transaction: SimulationTransaction = {
      from: OWNER,
      to: TARGET,
      data: "0x12345678",
    };
    const plan = assertionPlan([
      {
        ...transaction,
        assertLogs: [
          {
            check: (logs) => {
              receivedLogs = logs;
              return undefined;
            },
          },
          {
            check: (logs) => {
              secondReceivedLogs = logs;
              return undefined;
            },
          },
        ],
      },
    ]);
    const baselinePlan = assertionPlan([transaction]);
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    const baselineTransactionIndex = baselinePlan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    const execution = parse(
      plan,
      buildBlocks(plan, {
        [transactionIndex]: { logs: [mixedCaseLog] },
      }),
    );
    const baseline = parse(
      baselinePlan,
      buildBlocks(baselinePlan, {
        [baselineTransactionIndex]: { logs: [mixedCaseLog] },
      }),
    );

    expect(receivedLogs).toEqual([
      {
        address: TOKEN.toLowerCase(),
        topics: mixedCaseLog.topics.map((topic) => topic.toLowerCase()),
        data: mixedCaseLog.data.toLowerCase(),
      },
    ]);
    expect(Object.isFrozen(receivedLogs)).toBe(true);
    expect(Object.isFrozen(receivedLogs?.[0])).toBe(true);
    expect(Object.isFrozen(receivedLogs?.[0]?.topics)).toBe(true);
    expect(secondReceivedLogs).toBe(receivedLogs);
    const transactionCalls = execution.calls.filter(
      (call) => call.planned.type === "transaction",
    );
    const baselineTransactionCalls = baseline.calls.filter(
      (call) => call.planned.type === "transaction",
    );
    expect(transactionCalls.map(({ result }) => result.logs)).toEqual([
      [mixedCaseLog],
    ]);
    expect(transactionCalls.map(({ result }) => result.logs)).toEqual(
      baselineTransactionCalls.map(({ result }) => result.logs),
    );
    expect(parseTransfers(execution.calls.map(({ result }) => result))).toEqual(
      parseTransfers(baseline.calls.map(({ result }) => result)),
    );
  });

  test("error: mutating log assertion input preserves the frozen copy and TypeError cause", () => {
    const log: RawLog = { address: TOKEN, topics: [], data: "0xAB" as Hex };
    const assertion: LogAssertion = {
      check: (logs) => {
        (logs as RawLog[]).push(log);
        return undefined;
      },
    };
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertLogs: [assertion],
      },
    ]);
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [transactionIndex]: { logs: [log] },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationLogAssertError);
    expect(error).toMatchObject({
      cause: expect.any(TypeError),
      logs: [{ address: TOKEN.toLowerCase(), data: "0xab" }],
    });
  });

  test("error: passing assertBefore preserves the transaction UNKNOWN_REVERT", () => {
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertBefore: [balanceAssertion(5n)],
      },
    ]);
    const assertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    const transactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [assertionIndex]: { data: balanceHex(5n) },
          [transactionIndex]: { status: "failure" },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({ transactionIndex: 0 });
  });

  test("error: failing assertAfter is reported for its transaction", () => {
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertAfter: [balanceAssertion(5n)],
      },
    ]);
    const assertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [assertionIndex]: { data: balanceHex(4n) },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationAssertError);
    expect(error).not.toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      code: "SIMULATION_ASSERT_FAILED",
      transactionIndex: 0,
      phase: "after",
      assertionIndex: 0,
      assertion: { to: TOKEN },
      returnData: balanceHex(4n),
    });
  });

  test("error: failing second assertBefore reports assertionIndex 1", () => {
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertBefore: [
          balanceAssertion(1n),
          erc20BalanceAssertion({ token: TARGET, account: OWNER, min: 5n }),
        ],
      },
    ]);
    const assertionCallIndexes = plan.calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.type === "assertion")
      .map(({ index }) => index);
    expect(assertionCallIndexes).toHaveLength(2);
    const [firstAssertionIndex, secondAssertionIndex] = assertionCallIndexes;
    if (firstAssertionIndex === undefined || secondAssertionIndex === undefined)
      throw new Error("Expected two assertion calls");

    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [firstAssertionIndex]: { data: balanceHex(10n) },
          [secondAssertionIndex]: { data: balanceHex(4n) },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationAssertError);
    expect(error).not.toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      code: "SIMULATION_ASSERT_FAILED",
      transactionIndex: 0,
      phase: "before",
      assertionIndex: 1,
      assertion: { to: TARGET },
      returnData: balanceHex(4n),
    });
    expect((error as Error).message).toContain("assertBefore[1]");
  });

  test("error: an earlier transaction revert precedes later assertBefore", () => {
    const plan = assertionPlan([
      { from: OWNER, to: TARGET, data: "0x12345678" },
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertBefore: [balanceAssertion(5n)],
      },
    ]);
    const laterAssertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    const firstTransactionIndex = plan.calls.findIndex(
      (call) => call.type === "transaction" && call.transactionIndex === 0,
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [laterAssertionIndex]: { data: balanceHex(4n) },
          [firstTransactionIndex]: { status: "failure" },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({ transactionIndex: 0 });
  });

  test("error: reverted assertion read reports SimulationAssertError", () => {
    const plan = assertionPlan([
      {
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
        assertBefore: [balanceAssertion(5n)],
      },
    ]);
    const assertionIndex = plan.calls.findIndex(
      (call) => call.type === "assertion",
    );
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [assertionIndex]: { status: "failure" },
        }),
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulationAssertError);
    expect((error as Error).message).toContain(
      "Transaction 0 assertBefore[0] read reverted",
    );
    expect(error).toMatchObject({ returnData: "0x", transactionIndex: 0 });
  });

  test("user revert reason: decodes error.data", () => {
    const error = userRevertError(makePlan(), {
      errorData: SLIPPAGE_REVERT_DATA,
    });
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({ revertData: SLIPPAGE_REVERT_DATA });
  });

  test("user revert reason: falls back to returnData when error.data is absent", () => {
    const error = userRevertError(makePlan(), {
      data: SLIPPAGE_REVERT_DATA,
    });
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({ revertData: SLIPPAGE_REVERT_DATA });
  });

  test("user revert reason: falls back to returnData when error.data is 0x", () => {
    const error = userRevertError(makePlan(), {
      data: SLIPPAGE_REVERT_DATA,
      errorData: "0x",
    });
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({ revertData: SLIPPAGE_REVERT_DATA });
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
      message: expect.stringContaining(
        "Authorization 0 preparation call 0 reverted:",
      ),
      revertData: "0x",
    });
  });

  test("error: preparation revert named from error.data", () => {
    const plan = makePlan([
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const prepIndex = plan.calls.findIndex((c) => c.type === "preparation");
    expect(() =>
      parse(
        plan,
        buildBlocks(plan, {
          [prepIndex]: { status: "failure", errorData: INVALID_NONCE },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        revertData: INVALID_NONCE,
        message: "Authorization 0 preparation call 0 reverted: InvalidNonce()",
      }),
    );
  });

  test("error: revert data falls back to returnData without error.data", () => {
    const plan = makePlan();
    const txIndex = plan.calls.findIndex((c) => c.type === "transaction");
    expect(() =>
      parse(
        plan,
        buildBlocks(plan, {
          [txIndex]: { status: "failure", data: ALL_CAPS_REACHED },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        revertData: ALL_CAPS_REACHED,
        message: "Transaction 0 reverted: AllCapsReached()",
      }),
    );
  });

  test("error: error.data takes precedence over returnData", () => {
    const plan = makePlan();
    const txIndex = plan.calls.findIndex((c) => c.type === "transaction");
    expect(() =>
      parse(
        plan,
        buildBlocks(plan, {
          [txIndex]: {
            status: "failure",
            data: ALL_CAPS_REACHED,
            errorData: INVALID_NONCE,
          },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        revertData: INVALID_NONCE,
        message: "Transaction 0 reverted: InvalidNonce()",
      }),
    );
  });

  test.each(["0x", "0xDEADBEEF", "0x1234", INVALID_NONCE] as const)(
    "error: preparation preserves original bytes %s",
    (data) => {
      const plan = makePlan([
        {
          authorizationIndex: 2,
          calls: [{ from: OWNER, to: TOKEN, data: "0x", value: 0n }],
        },
      ]);
      const index = plan.calls.findIndex((call) => call.type === "preparation");
      let error: unknown;
      try {
        parse(
          plan,
          buildBlocks(plan, {
            [index]: { status: "failure", errorData: data },
          }),
        );
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SimulationRevertedError);
      expect(error).toMatchObject({
        revertData: data,
        message: expect.stringContaining(
          "Authorization 2 preparation call 0 reverted:",
        ),
      });
    },
  );

  test("error: empty error.data does not discard populated returnData", () => {
    const plan = makePlan();
    const index = plan.calls.findIndex((call) => call.type === "transaction");
    expect(() =>
      parse(
        plan,
        buildBlocks(plan, {
          [index]: {
            status: "failure",
            errorData: "0x",
            data: ALL_CAPS_REACHED,
          },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        revertData: ALL_CAPS_REACHED,
        message: "Transaction 0 reverted: AllCapsReached()",
      }),
    );
  });

  test("error: transaction message uses the user index after state reads and preparations", () => {
    const plan = makePlan(
      [
        {
          authorizationIndex: 0,
          calls: [{ from: OWNER, to: TOKEN, data: "0x", value: 0n }],
        },
      ],
      parseRequest({
        chainId: 1,
        limits: "none",
        transactions: [
          { from: OWNER, to: TARGET, data: "0x" },
          { from: OWNER, to: TARGET, data: "0x" },
        ],
      }),
    );
    const index = plan.calls.findIndex(
      (call) => call.type === "transaction" && call.transactionIndex === 1,
    );
    const data = encodeErrorResult({
      abi: REVERT_ERRORS_ABI,
      errorName: "ERC20InsufficientBalance",
      args: [OWNER, 1283n, 2000n],
    });
    expect(() =>
      parse(
        plan,
        buildBlocks(plan, { [index]: { status: "failure", errorData: data } }),
      ),
    ).toThrow(
      expect.objectContaining({
        revertData: data,
        transactionIndex: 1,
        message: `Transaction 1 reverted: ERC20InsufficientBalance(sender="${OWNER}", balance=1283, needed=2000)`,
      }),
    );
  });

  test.each(["preparation", "transaction"] as const)(
    "error: %s fallback hides provider text and preserves diagnostics",
    (type) => {
      const plan = makePlan([
        {
          authorizationIndex: 0,
          calls: [{ from: OWNER, to: TOKEN, data: "0x", value: 0n }],
        },
      ]);
      const index = plan.calls.findIndex((call) => call.type === type);
      const providerMessage =
        "request failed https://rpc.example/private-token";
      const blocks = buildBlocks(plan, {
        [index]: {
          status: "failure",
          errorData: "0xdeadbeef",
          errorMessage: providerMessage,
        },
      });
      let error: unknown;
      try {
        parse(plan, blocks);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(SimulationRevertedError);
      const reverted = error as SimulationRevertedError;
      expect(reverted.message).toContain("Revert reason unavailable");
      expect(reverted.message).not.toContain(providerMessage);
      expect(reverted.cause).toBe(blocks[0]!.calls[index]!.error);
      expect(reverted.revertData).toBe("0xdeadbeef");
      expect(reverted.transactionIndex).toBe(
        type === "transaction" ? 0 : undefined,
      );
    },
  );

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
      message: expect.stringContaining(
        "Authorization 0 preparation call 0 reverted:",
      ),
      revertData: "0x",
    });
  });

  test("error: revertData decodes returnData when error.data is not hex", () => {
    const plan = makePlan();
    const txIndex = plan.calls.findIndex((c) => c.type === "transaction");
    const blocks = buildBlocks(plan, { [txIndex]: { status: "failure" } });
    Object.assign(blocks[0]!.calls[txIndex]!, {
      returnData: "0x756688fe",
      error: { message: "execution reverted", data: "execution reverted" },
    });
    expect(() => parse(plan, blocks)).toThrow(
      expect.objectContaining({
        name: "SimulationRevertedError",
        revertData: "0x756688fe",
      }),
    );
  });

  test("error: revertData decodes authorization selector when error.data is empty", () => {
    const plan = makePlan();
    const txIndex = plan.calls.findIndex((c) => c.type === "transaction");
    const blocks = buildBlocks(plan, { [txIndex]: { status: "failure" } });
    Object.assign(blocks[0]!.calls[txIndex]!, {
      returnData: "0x756688fe",
      error: { message: "execution reverted", data: "0x" },
    });

    expect(() => parse(plan, blocks)).toThrow(
      expect.objectContaining({
        name: "SimulationRevertedError",
        revertData: "0x756688fe",
      }),
    );
  });

  test("error: preparation revertData prefers error.data over returnData", () => {
    const plan = makePlan([
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const prepIndex = plan.calls.findIndex((c) => c.type === "preparation");
    const blocks = buildBlocks(plan, { [prepIndex]: { status: "failure" } });
    Object.assign(blocks[0]!.calls[prepIndex]!, {
      returnData: "0x",
      error: { message: "execution reverted", data: "0x70f65caa" },
    });

    expect(() => parse(plan, blocks)).toThrow(
      expect.objectContaining({
        name: "SimulationRevertedError",
        revertData: "0x70f65caa",
      }),
    );
  });

  test("error: user-call revertData prefers error.data over returnData", () => {
    const plan = makePlan();
    const txIndex = plan.calls.findIndex((c) => c.type === "transaction");
    const blocks = buildBlocks(plan, { [txIndex]: { status: "failure" } });
    Object.assign(blocks[0]!.calls[txIndex]!, {
      returnData: "0x756688fe",
      error: { message: "execution reverted", data: "0x70f65caa" },
    });

    expect(() => parse(plan, blocks)).toThrow(
      expect.objectContaining({
        name: "SimulationRevertedError",
        revertData: "0x70f65caa",
      }),
    );
  });

  test("error: revertData falls back to returnData and applies to preparation reverts", () => {
    const plan = makePlan([
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const prepIndex = plan.calls.findIndex((c) => c.type === "preparation");
    expect(() =>
      parse(
        plan,
        buildBlocks(plan, {
          [prepIndex]: { status: "failure", data: "0x756688fe" },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        name: "SimulationRevertedError",
        revertData: "0x756688fe",
      }),
    );
  });

  test("error: preparation revertData falls back to returnData when error.data is 0x", () => {
    const plan = makePlan([
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const prepIndex = plan.calls.findIndex((c) => c.type === "preparation");
    const blocks = buildBlocks(plan, {
      [prepIndex]: { status: "failure", data: SLIPPAGE_REVERT_DATA },
    });
    Object.assign(blocks[0]!.calls[prepIndex]!, {
      error: { message: "reverted", data: "0x" },
    });
    const error = (() => {
      try {
        parse(plan, blocks);
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SimulationRevertedError);
    expect(error).toMatchObject({
      revertData: SLIPPAGE_REVERT_DATA,
    });
  });

  test("error: SlippageCheckUnavailableError on failed state read", () => {
    const plan = makePlan();
    const readIndex = plan.calls.findIndex((c) => c.type === "stateRead");
    const read = plan.calls[readIndex];
    if (read?.type !== "stateRead") throw new Error("no state read planned");
    const readId = read.read.id;
    const error = (() => {
      try {
        parse(
          plan,
          buildBlocks(plan, {
            [readIndex]: { status: "failure", errorMessage: "node secret" },
          }),
        );
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect(isSimulationPackageError(error)).toBe(true);
    expect((error as Error).message).toContain(readId);
    expect((error as Error).message).not.toContain("node secret");
    expect((error as Error).cause).toMatchObject({ message: "node secret" });
    expect(error).not.toHaveProperty("context");
  });

  test("error: failed derivation names the operation and subject with its cause", () => {
    const plan = planExecution({
      request: parsed,
      owner: OWNER,
      preparations: [],
      reads: [
        {
          kind: "derivation",
          id: "derive:2:preview",
          operationIndex: 2,
          subject: `vault ${TARGET}`,
          to: TARGET,
          data: "0x12345678",
        },
      ],
    });
    const readIndex = plan.calls.findIndex((call) => call.type === "stateRead");
    let error: unknown;
    try {
      parse(
        plan,
        buildBlocks(plan, {
          [readIndex]: { status: "failure", errorMessage: "original revert" },
        }),
      );
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect(error).toMatchObject({ cause: { message: "original revert" } });
    expect((error as Error).message).toContain("limits.operations[2]");
    expect((error as Error).message).toContain("derive:2:preview");
    expect((error as Error).message).toContain(`vault ${TARGET}`);
    expect((error as Error).message).not.toContain("Re-submit");
  });

  test("error: InvalidSimulationResponseError on call-count mismatch", () => {
    const plan = makePlan();
    const blocks = buildBlocks(plan);
    blocks[0]!.calls.pop();
    expect(() => parse(plan, blocks)).toThrow(InvalidSimulationResponseError);
  });

  test("error: reports a missing transaction result when call counts match", () => {
    const plan = assertionPlan([
      { from: OWNER, to: TARGET, data: "0x12345678" },
    ]);
    const incompletePlan = {
      ...plan,
      calls: plan.calls.filter((call) => call.type !== "transaction"),
    };
    const blocks = buildBlocks(incompletePlan);

    expect(blocks[0]?.calls).toHaveLength(incompletePlan.calls.length);
    let error: unknown;
    try {
      parse(incompletePlan, blocks);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect((error as Error).message).toBe(
      "eth_simulateV1 plan is missing transaction result 0.",
    );
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
