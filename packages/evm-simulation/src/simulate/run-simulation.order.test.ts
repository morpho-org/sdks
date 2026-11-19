import { fc, test } from "@fast-check/vitest";
import { type Address, type Hex, numberToHex } from "viem";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
  ApprovalCheckUnavailableError,
  BlacklistViolationError,
  InvalidSimulationResponseError,
  RpcTransportError,
  type SimulationPackageError,
  SimulationValidationError,
} from "../errors.js";
import { simulate } from "../index.js";
import { simulationClientFor } from "../test-helpers/index.js";
import type { SimulationTransaction } from "../types.js";
import type { executePlan } from "./backends/index.js";
import type { SimulationExecution } from "./backends/parse-response.js";

const CHECKS = [
  "approvalEvents",
  "preparationTransfers",
  "signedAuthorizationUse",
  "slippage",
  "retention",
] as const;
type Check = (typeof CHECKS)[number];

const forced = vi.hoisted(
  () => new Map<string, readonly SimulationPackageError[]>(),
);
const failuresOf = <T>(check: Check) => (forced.get(check) ?? []) as T;

vi.mock("./backends/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./backends/index.js")>()),
  executePlan: async ({
    plan,
    stateBlock,
  }: Parameters<typeof executePlan>[0]): Promise<SimulationExecution> =>
    ({
      plan,
      block: {
        stateBlockNumber: stateBlock.number,
        stateBlockHash: stateBlock.hash,
        stateBlockTimestamp: stateBlock.timestamp,
        blockNumber: stateBlock.number,
        blockTimestamp: stateBlock.timestamp,
      },
      calls: plan.calls
        .filter((call) => call.type === "transaction")
        .map((planned) => ({
          planned,
          result: {
            status: true,
            gasUsed: 21_000n,
            returnData: "0x",
            logs: [],
          },
          logsMissing: false,
        })),
      failures: [],
      stateReads: [],
    }) as unknown as SimulationExecution,
}));
vi.mock("./approvals.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./approvals.js")>()),
  findApprovalEventFailures: () => failuresOf("approvalEvents"),
}));
vi.mock("./prepare.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./prepare.js")>()),
  findPreparationTransferFailures: () => failuresOf("preparationTransfers"),
}));
vi.mock("./signed-authorizations.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./signed-authorizations.js")>()),
  findSignedAuthorizationUseFailures: () =>
    failuresOf("signedAuthorizationUse"),
}));
vi.mock("./verify-slippage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./verify-slippage.js")>()),
  findOperationSlippageFailures: () => ({
    failures: failuresOf("slippage"),
    checked: [],
  }),
}));
vi.mock("./pipeline/bundles-retention.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pipeline/bundles-retention.js")>()),
  findBundlesRetentionFailures: () => failuresOf("retention"),
}));

const OWNER: Address = "0x1111111111111111111111111111111111111111";
const TARGET: Address = "0x2222222222222222222222222222222222222222";
const RPC_URL = "https://rpc.example";
const TRANSACTION: SimulationTransaction = {
  from: OWNER,
  to: TARGET,
  data: "0x12345678" as Hex,
};
const FAILURES: Record<Check, () => SimulationPackageError> = {
  approvalEvents: () => new ApprovalCheckUnavailableError("approval event"),
  preparationTransfers: () => new SimulationValidationError("preparation"),
  signedAuthorizationUse: () => new RpcTransportError("signed use"),
  slippage: () => new InvalidSimulationResponseError("slippage"),
  retention: () => new BlacklistViolationError("retention"),
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      const result =
        method === "eth_chainId"
          ? numberToHex(1)
          : method === "eth_getCode"
            ? "0x6000"
            : method === "eth_getBlockByNumber"
              ? {
                  number: numberToHex(20_000_000n),
                  hash: `0x${"ab".repeat(32)}`,
                  timestamp: numberToHex(1_700_000_000n),
                }
              : `0x${"c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".padStart(64, "0")}`;
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    }),
  );
});
afterEach(() => {
  forced.clear();
  vi.unstubAllGlobals();
});

describe("runSimulation failure order", () => {
  test.prop([fc.subarray([...CHECKS], { minLength: 1 })], { numRuns: 50 })(
    "[INV-08] behavior: failures match the failing post-execution checks in pipeline order",
    async (failing) => {
      forced.clear();
      const expected = failing.map((check) => FAILURES[check]());
      failing.forEach((check, index) => forced.set(check, [expected[index]!]));
      const report = await simulate(simulationClientFor(RPC_URL, 1), {
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      });
      expect(report.ok).toBe(false);
      if (report.ok) return;
      expect(report.failures).toEqual(expected);
      report.failures.forEach((failure, index) =>
        expect(failure).toBe(expected[index]),
      );
    },
  );
});
