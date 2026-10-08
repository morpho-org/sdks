import { type Address, getAddress, zeroAddress } from "viem";
import { makeBalanceRead } from "../../test-helpers/make-balance-read.js";
import { parseRequest } from "../request/index.js";
import { planExecution } from "./plan-execution.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const makeRequest = (count: number) =>
  parseRequest(
    {
      transactions: Array.from({ length: count }, () => ({
        from: OWNER,
        to: TARGET,
        data: "0x12345678",
      })),
    },
    1,
  );

const reads = [makeBalanceRead(TOKEN, OWNER)];

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
  });

describe("planExecution", () => {
  test("order: before reads → preparations → txs → after reads", () => {
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
      "tx1",
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
});
