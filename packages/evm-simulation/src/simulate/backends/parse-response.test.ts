import { type Address, encodeFunctionResult, erc20Abi, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type {
  DecodedBundle,
  ParsedRequest,
  ValidatedAuthorizations,
} from "../../domain/stages.js";
import { brandPinned, brandValidated } from "../../domain/stages.js";
import {
  MissingVerificationEvidenceError,
  PermissionChangeMismatchError,
  SimulationRevertedError,
} from "../../errors.js";
import { planExecution } from "../plan/plan-execution.js";
import { parseRequest } from "../request/index.js";
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

const request = {
  chainId: 1,
  transactions: [{ from: OWNER, to: TARGET, data: "0x12345678" }],
};

const parsed: ParsedRequest = parseRequest(request);

const erc20Read = {
  type: "erc20Allowance",
  token: TOKEN,
  owner: OWNER,
  spender: SPENDER,
} as const;

const validated = (withPreparation: boolean): ValidatedAuthorizations =>
  brandValidated({
    inputs: brandPinned({
      bundle: {
        request: parsed,
        owner: OWNER,
        operations: [],
      } as unknown as DecodedBundle,
      context: {
        chainId: 1,
        stateBlockNumber: 24_000_000n,
        stateBlockHash: BLOCK_HASH,
        stateBlockTimestamp: NOW,
        blockNumber: 24_000_000n,
        blockTimestamp: NOW,
      },
      before: {
        wallet: [],
        permissions: [],
        positions: [],
        vaults: [],
        markets: [],
      },
      internals: { vaultData: new Map() },
    }),
    limits: {
      maxSlippageWad: 0n,
      minLltvBufferWad: 0n,
      maxSignatureLifetimeSeconds: 0n,
      wallet: { maxDebit: [], minCredit: [] },
      operations: [],
    },
    preparations: withPreparation
      ? [
          {
            authorizationIndex: 2,
            calls: [{ from: OWNER, to: TOKEN, data: "0x095ea7b3", value: 0n }],
            expected: [
              {
                type: "erc20Allowance",
                token: TOKEN,
                owner: OWNER,
                spender: SPENDER,
                amount: 1n,
              },
            ],
          },
        ]
      : [],
    matches: withPreparation
      ? [{ authorizationIndex: 2, expectedIndex: 0 }]
      : [],
    expected: [],
  }) as ValidatedAuthorizations;

const allowanceHex = (value: bigint): `0x${string}` =>
  encodeFunctionResult({
    abi: erc20Abi,
    functionName: "allowance",
    result: value,
  });
const balanceHex = (value: bigint): `0x${string}` =>
  `0x${value.toString(16).padStart(64, "0")}`;

const buildResponse = (
  plan: ReturnType<typeof planExecution>,
  overrides: Record<
    number,
    { status?: "0x0" | "0x1"; returnData?: `0x${string}` }
  > = {},
) => [
  {
    number: "0x16e3601",
    timestamp: `0x${NOW.toString(16)}`,
    hash: `0x${"cd".repeat(32)}`,
    calls: plan.calls.map((call, index) => {
      const override = overrides[index] ?? {};
      const defaultReturn =
        call.identity.type === "probe" &&
        "read" in call &&
        call.read.type !== "nativeBalance"
          ? allowanceHex(1n)
          : call.identity.type === "probe"
            ? balanceHex(7n)
            : "0x";
      return {
        status: override.status ?? "0x1",
        returnData: override.returnData ?? defaultReturn,
        gasUsed: "0x100",
        logs: [],
      };
    }),
  },
];

const parse = (plan: ReturnType<typeof planExecution>, response: unknown) =>
  parseSimulationResponse({
    plan,
    response,
    stateBlockNumber: 24_000_000n,
    stateBlockHash: BLOCK_HASH,
    stateBlockTimestamp: NOW,
  });

describe("parseSimulationResponse", () => {
  test("default: probes decoded into phase buckets, preparations grouped", () => {
    const plan = planExecution(validated(true), {
      full: [erc20Read],
      permissions: [erc20Read],
    });
    const evidence = parse(plan, buildResponse(plan));
    expect(evidence.probeReads.before.length).toBeGreaterThan(0);
    // prepared phase carries the permissions reads plus the native probe.
    expect(evidence.probeReads.prepared).toHaveLength(2);
    expect(evidence.probeReads.after.length).toBeGreaterThan(0);
    const allowance = evidence.probeReads.prepared.find(
      (r) => r.type === "erc20Allowance",
    );
    expect(allowance?.type).toBe("erc20Allowance");
    expect(evidence.preparations).toHaveLength(1);
    expect(evidence.preparations[0]?.authorizationIndex).toBe(2);
    // user calls keep caller transactionIndex
    const txs = evidence.calls.filter((c) => c.identity.type === "transaction");
    expect(txs).toHaveLength(1);
    expect(
      txs[0]?.identity.type === "transaction"
        ? txs[0].identity.transactionIndex
        : -1,
    ).toBe(0);
  });

  test("error: SimulationRevertedError on user call revert", () => {
    const plan = planExecution(validated(false), {
      full: [erc20Read],
      permissions: [],
    });
    const txIndex = plan.calls.findIndex(
      (c) => c.identity.type === "transaction",
    );
    expect(() =>
      parse(plan, buildResponse(plan, { [txIndex]: { status: "0x0" } })),
    ).toThrow(SimulationRevertedError);
  });

  test("error: PermissionChangeMismatchError on preparation revert", () => {
    const plan = planExecution(validated(true), {
      full: [],
      permissions: [erc20Read],
    });
    const prepIndex = plan.calls.findIndex(
      (c) => c.identity.type === "authorization",
    );
    expect(() =>
      parse(plan, buildResponse(plan, { [prepIndex]: { status: "0x0" } })),
    ).toThrow(PermissionChangeMismatchError);
  });

  test("error: MissingVerificationEvidenceError on probe failure", () => {
    const plan = planExecution(validated(false), {
      full: [erc20Read],
      permissions: [],
    });
    const probeIndex = plan.calls.findIndex((c) => c.identity.type === "probe");
    expect(() =>
      parse(plan, buildResponse(plan, { [probeIndex]: { status: "0x0" } })),
    ).toThrow(MissingVerificationEvidenceError);
  });

  test("error: MissingVerificationEvidenceError on undecodable probe data", () => {
    const plan = planExecution(validated(false), {
      full: [erc20Read],
      permissions: [],
    });
    const probeIndex = plan.calls.findIndex(
      (c) =>
        c.identity.type === "probe" &&
        "read" in c &&
        c.read.type === "erc20Allowance",
    );
    expect(() =>
      parse(
        plan,
        buildResponse(plan, { [probeIndex]: { returnData: "0xdead" } }),
      ),
    ).toThrow(MissingVerificationEvidenceError);
  });
});
