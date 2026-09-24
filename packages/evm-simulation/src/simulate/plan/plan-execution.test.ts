import { type Address, getAddress, zeroAddress } from "viem";
import type { ParsedRequest } from "../../domain/stages.js";
import { parseRequest } from "../request/index.js";
import {
  encodeNativeBalanceProbe,
  NATIVE_BALANCE_PROBE_ADDRESS,
  NATIVE_BALANCE_PROBE_BYTECODE,
} from "./native-balance-probe.js";
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
  test("default: one transaction yields probe → tx → probe", () => {
    const plan = planExecution(makeRequest(1));
    expect(plan.owner).toBe(OWNER);
    expect(plan.calls).toHaveLength(3);
    expect(plan.calls.map((call) => call.identity)).toEqual([
      { type: "probe", probeId: "native-balance:before", phase: "before" },
      { type: "transaction", transactionIndex: 0 },
      { type: "probe", probeId: "native-balance:after:0", phase: "after" },
    ]);
  });

  test("behavior: three transactions interleave intermediate probes", () => {
    const plan = planExecution(makeRequest(3));
    expect(plan.calls).toHaveLength(7);
    expect(plan.calls.map((call) => call.identity)).toEqual([
      { type: "probe", probeId: "native-balance:before", phase: "before" },
      { type: "transaction", transactionIndex: 0 },
      {
        type: "probe",
        probeId: "native-balance:after:0",
        phase: "intermediate",
      },
      { type: "transaction", transactionIndex: 1 },
      {
        type: "probe",
        probeId: "native-balance:after:1",
        phase: "intermediate",
      },
      { type: "transaction", transactionIndex: 2 },
      { type: "probe", probeId: "native-balance:after:2", phase: "after" },
    ]);
  });

  test("behavior: probe calls read the owner balance via the code override", () => {
    const plan = planExecution(makeRequest(1));
    const probe = plan.calls[0]!;
    expect(probe.transaction).toEqual({
      from: zeroAddress,
      to: NATIVE_BALANCE_PROBE_ADDRESS,
      data: encodeNativeBalanceProbe(OWNER),
      value: 0n,
    });
    expect(probe).toMatchObject({
      read: { type: "nativeBalance", account: OWNER },
    });
    expect(plan.stateOverrides).toEqual([
      {
        address: NATIVE_BALANCE_PROBE_ADDRESS,
        code: NATIVE_BALANCE_PROBE_BYTECODE,
      },
    ]);
  });

  test("behavior: user transactions default value to 0n and keep identity", () => {
    const plan = planExecution(makeRequest(1));
    const userCall = plan.calls[1]!;
    expect(userCall.transaction).toEqual({
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
    expect(Object.isFrozen(plan.stateOverrides)).toBe(true);
  });
});
