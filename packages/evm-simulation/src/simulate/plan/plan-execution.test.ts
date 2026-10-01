import { type Address, getAddress, zeroAddress } from "viem";
import { parseRequest } from "../request/index.js";
import { erc20Reads } from "../state/erc20.js";
import { nativeReads } from "../state/native.js";
import { planExecution } from "./plan-execution.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const makeRequest = (count: number) =>
  parseRequest({
    chainId: 1,
    transactions: Array.from({ length: count }, () => ({
      from: OWNER,
      to: TARGET,
      data: "0x12345678",
    })),
  });

const reads = erc20Reads({
  balances: [],
  allowances: [{ token: TOKEN, owner: OWNER, spender: SPENDER }],
  nonces: [],
});
const intermediateReads = nativeReads([OWNER]);

const plan = (
  txCount: number,
  preparations: {
    authorizationIndex: number;
    calls: { from: Address; to: Address; data: `0x${string}`; value: bigint }[];
  }[] = [],
) =>
  planExecution({
    request: makeRequest(txCount),
    owner: OWNER,
    preparations,
    reads,
    intermediateReads,
  });

describe("planExecution", () => {
  test("order: before reads → preparations → txs with intermediate reads → after reads", () => {
    const types = plan(2, [
      {
        authorizationIndex: 0,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]).calls.map((c) =>
      c.type === "transaction"
        ? `tx${c.transactionIndex}`
        : c.type === "preparation"
          ? "prep"
          : `read:${c.phase}`,
    );

    const prepIndex = types.indexOf("prep");
    const beforeCount = types.filter((t) => t === "read:before").length;
    expect(types.slice(0, beforeCount)).toEqual(
      Array.from({ length: beforeCount }, () => "read:before"),
    );
    expect(prepIndex).toBe(beforeCount);
    expect(types).toEqual([
      ...Array.from({ length: reads.length }, () => "read:before"),
      "prep",
      "tx0",
      "read:intermediate",
      "tx1",
      "read:intermediate",
      ...Array.from({ length: reads.length }, () => "read:after"),
    ]);
  });

  test("user txs keep public transactionIndex; reads run from zeroAddress", () => {
    const calls = plan(1).calls;
    const tx = calls.find((c) => c.type === "transaction");
    expect(tx?.type === "transaction" && tx.transactionIndex).toBe(0);
    for (const call of calls)
      if (call.type === "stateRead")
        expect(call.transaction.from).toBe(zeroAddress);
    const prep = calls.find((c) => c.type === "preparation");
    expect(prep).toBeUndefined();
  });

  test("preparations run from the owner", () => {
    const calls = plan(1, [
      {
        authorizationIndex: 2,
        calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
      },
    ]).calls;
    const prep = calls.find((c) => c.type === "preparation");
    expect(prep?.type === "preparation" && prep.authorizationIndex === 2).toBe(
      true,
    );
    expect(prep?.transaction.from).toBe(OWNER);
  });

  test("intermediate read ids are suffixed per transaction", () => {
    const calls = plan(2).calls.filter(
      (c) => c.type === "stateRead" && c.phase === "intermediate",
    );
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.type === "stateRead" && c.read.id)).toEqual([
      `${intermediateReads[0]!.id}#tx0`,
      `${intermediateReads[0]!.id}#tx1`,
    ]);
  });

  test("native probe bytecode is a state override", () => {
    const result = plan(1);
    expect(result.stateOverrides).toHaveLength(1);
    expect(result.stateOverrides[0]?.code.length).toBeGreaterThan(2);
  });
});
