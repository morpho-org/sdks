import { type Address, encodeFunctionResult, erc20Abi, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidSimulationResponseError,
  SimulationRevertedError,
} from "../../errors.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
import { erc20Reads } from "../state/erc20.js";
import { nativeReads } from "../state/native.js";
import { parseSimulationResponse } from "./parse-response.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const NOW = 1_700_000_000n;
const BLOCK_HASH: `0x${string}` = `0x${"ab".repeat(32)}`;

const parsed = parseRequest({
  chainId: 1,
  transactions: [{ from: OWNER, to: TARGET, data: "0x12345678" }],
});

const reads = erc20Reads({
  balances: [],
  allowances: [{ token: TOKEN, owner: OWNER, spender: SPENDER }],
  nonces: [],
});

const makePlan = (
  preparations: {
    authorizationIndex: number;
    calls: { from: Address; to: Address; data: `0x${string}`; value: bigint }[];
  }[] = [],
) =>
  planExecution({
    request: parsed,
    owner: OWNER,
    preparations,
    reads,
    intermediateReads: nativeReads([OWNER]),
  });

const allowanceHex = (value: bigint): `0x${string}` =>
  encodeFunctionResult({
    abi: erc20Abi,
    functionName: "allowance",
    result: value,
  });

const buildResponse = (
  plan: ReturnType<typeof makePlan>,
  overrides: Record<
    number,
    { status?: "0x0" | "0x1"; returnData?: `0x${string}` }
  > = {},
) => [
  {
    number: "0x16e3601",
    timestamp: `0x${NOW.toString(16)}`,
    hash: `0x${"cd".repeat(32)}`,
    parentHash: `0x${"ab".repeat(32)}`,
    calls: plan.calls.map((call, index) => {
      const override = overrides[index] ?? {};
      return {
        status: override.status ?? "0x1",
        returnData:
          override.returnData ??
          (call.type === "stateRead" && call.read.kind === "erc20.allowance"
            ? allowanceHex(1n)
            : "0x"),
        gasUsed: "0x100",
        logs: [],
      };
    }),
  },
];

const parse = (plan: ReturnType<typeof makePlan>, response: unknown) =>
  parseSimulationResponse({
    plan,
    response,
    stateBlockNumber: 24_000_000n,
    stateBlockHash: BLOCK_HASH,
    stateBlockTimestamp: NOW,
  });

describe("parseSimulationResponse", () => {
  test("default: state reads grouped by phase, preparations carried", () => {
    const plan = makePlan([
      {
        authorizationIndex: 2,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const execution = parse(plan, buildResponse(plan));
    const phases = execution.stateReads.map((r) => r.phase);
    expect(phases.filter((p) => p === "before")).toHaveLength(reads.length);
    expect(phases.filter((p) => p === "intermediate")).toHaveLength(1);
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
      parse(plan, buildResponse(plan, { [txIndex]: { status: "0x0" } })),
    ).toThrow(SimulationRevertedError);
  });

  test("error: InvalidSimulationResponseError on preparation revert", () => {
    const plan = makePlan([
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]);
    const prepIndex = plan.calls.findIndex((c) => c.type === "preparation");
    expect(() =>
      parse(plan, buildResponse(plan, { [prepIndex]: { status: "0x0" } })),
    ).toThrow(InvalidSimulationResponseError);
  });

  test("error: InvalidSimulationResponseError on failed state read", () => {
    const plan = makePlan();
    const readIndex = plan.calls.findIndex((c) => c.type === "stateRead");
    expect(() =>
      parse(plan, buildResponse(plan, { [readIndex]: { status: "0x0" } })),
    ).toThrow(InvalidSimulationResponseError);
  });

  test("error: InvalidSimulationResponseError on call-count mismatch", () => {
    const plan = makePlan();
    const response = buildResponse(plan);
    response[0]!.calls.pop();
    expect(() => parse(plan, response)).toThrow(InvalidSimulationResponseError);
  });
});
