import {
  type Address,
  encodeFunctionResult,
  erc20Abi,
  getAddress,
  numberToHex,
} from "viem";
import { erc20BalanceAssertion } from "../simulate/assertions.js";
import { evaluateCalls } from "../simulate/backends/evaluate-calls.js";
import { parseSimulationResponse } from "../simulate/backends/parse-response.js";
import { planExecution } from "../simulate/plan/plan-execution.js";
import { parseRequest } from "../simulate/request/index.js";
import type { RawLog, SimulationTransaction } from "../types.js";
import { makeBalanceRead } from "./make-balance-read.js";

export const OWNER: Address = getAddress(
  "0x1111111111111111111111111111111111111111",
);
export const TARGET: Address = getAddress(
  "0x2222222222222222222222222222222222222222",
);
export const TOKEN: Address = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
);
export const SLIPPAGE_REVERT_DATA = "0x8199f5f3" as const;

export const NOW = 1_700_000_000n;
export const BLOCK_HASH: `0x${string}` = `0x${"ab".repeat(32)}`;

/** Build an assertion that `OWNER` holds at least `min` of `TOKEN`. */
export const balanceAssertion = (min: bigint) =>
  erc20BalanceAssertion({ token: TOKEN, account: OWNER, min });

export const parsed = parseRequest(
  {
    limits: "none",
    transactions: [{ from: OWNER, to: TARGET, data: "0x12345678" }],
  },
  1,
);

export const reads = [makeBalanceRead(TOKEN, OWNER)];

/** Plan `request` for `OWNER` with the given preparations and balance reads. */
export const makePlan = (
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

/** Encode `value` as a `balanceOf` result. */
export const balanceHex = (value: bigint): `0x${string}` =>
  encodeFunctionResult({
    abi: erc20Abi,
    functionName: "balanceOf",
    result: value,
  });

/** Plan the given transactions without preparations. */
export const assertionPlan = (transactions: readonly SimulationTransaction[]) =>
  makePlan(
    [],
    parseRequest(
      {
        limits: "none",
        transactions,
      },
      1,
    ),
  );

/** Build a successful `eth_simulateV1` response for `plan`, with per-call overrides. */
export const buildBlocks = (
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

/** Parse `blocks` for `plan` against the pinned test block, with the parent-hash check on. */
export const parseOnly = (plan: ReturnType<typeof makePlan>, blocks: unknown) =>
  parseSimulationResponse({
    plan,
    blocks,
    stateBlockNumber: 24_000_000n,
    stateBlockHash: BLOCK_HASH,
    stateBlockTimestamp: NOW,
    parentHashCheck: true,
  });

/** Parse `blocks` for `plan`, then check every call outcome. */
export const parse = (plan: ReturnType<typeof makePlan>, blocks: unknown) =>
  evaluateCalls(parseOnly(plan, blocks));
