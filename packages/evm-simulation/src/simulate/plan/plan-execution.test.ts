import { type Address, getAddress } from "viem";
import { parseRequest } from "../request/index.js";
import type { ParsedRequest } from "../request/parse-request.js";
import { planExecution } from "./plan-execution.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);

const makeRequest = (count: number): ParsedRequest =>
  parseRequest({
    chainId: 1,
    transactions: Array.from({ length: count }, () => ({
      from: OWNER,
      to: TARGET,
      data: "0x12345678",
    })),
  });

describe("planExecution", () => {
  test("default: one transaction yields one planned call", () => {
    const plan = planExecution(makeRequest(1));
    expect(plan.owner).toBe(OWNER);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({
      type: "transaction",
      transactionIndex: 0,
    });
  });

  test("behavior: three transactions map 1:1 in order", () => {
    const plan = planExecution(makeRequest(3));
    expect(plan.calls.map((call) => call.transactionIndex)).toEqual([0, 1, 2]);
    expect(plan.calls.every((call) => call.type === "transaction")).toBe(true);
  });

  test("behavior: user transactions default value to 0n", () => {
    const plan = planExecution(makeRequest(1));
    expect(plan.calls[0]!.transaction).toEqual({
      from: OWNER,
      to: TARGET,
      data: "0x12345678",
      value: 0n,
    });
  });

  test("behavior: pure — same input yields structurally equal plans", () => {
    const request = makeRequest(2);
    expect(planExecution(request)).toEqual(planExecution(request));
  });

  test("behavior: output is deep-frozen", () => {
    const plan = planExecution(makeRequest(1));
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.calls)).toBe(true);
    expect(Object.isFrozen(plan.calls[0])).toBe(true);
  });
});
