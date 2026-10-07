import { ChainId } from "@morpho-org/blue-sdk";
import { type Address, type Hex, numberToHex } from "viem";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ExternalServiceError,
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
  UnsupportedChainError,
} from "../errors.js";
import type { StateBlock } from "../params.js";
import type { SimulationConfig, SimulationTransaction } from "../types.js";
import type { executePlan } from "./backends/index.js";
import type { SimulationExecution } from "./backends/parse-response.js";
import type { ExecutionPlan, PlannedCall } from "./plan/plan-execution.js";
import { simulate } from "./simulate.js";

const mockExecutePlan = vi.fn<typeof executePlan>();
vi.mock("./backends/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backends/index.js")>();
  return {
    ...actual,
    executePlan: (
      ...args: Parameters<typeof executePlan>
    ): ReturnType<typeof executePlan> => mockExecutePlan(...args),
  };
});

const CHAIN_ID = 987_654_321;
const RPC_URL = "https://rpc.example";
const OWNER: Address = "0x1111111111111111111111111111111111111111";
const TARGET: Address = "0x2222222222222222222222222222222222222222";
const STATE_BLOCK = 20_000_000n;
const STATE_BLOCK_HASH: Hex = `0x${"ab".repeat(32)}`;
const STATE_BLOCK_TIMESTAMP = 1_700_000_000n;
const TRANSACTION: SimulationTransaction = {
  chainId: CHAIN_ID,
  from: OWNER,
  to: TARGET,
  data: "0x12345678" as Hex,
};

const rpc = (result: unknown) =>
  Response.json({ jsonrpc: "2.0", id: 1, result });

let userCallCount = 1;

const execution = (
  plan: ExecutionPlan,
  stateBlock: StateBlock,
): SimulationExecution =>
  ({
    plan,
    block: {
      chainId: plan.request.chainId,
      stateBlockNumber: stateBlock.number,
      stateBlockHash: stateBlock.hash,
      stateBlockTimestamp: stateBlock.timestamp,
      blockNumber: stateBlock.number,
      blockTimestamp: stateBlock.timestamp,
    },
    calls: plan.calls
      .filter(
        (call): call is Extract<PlannedCall, { type: "transaction" }> =>
          call.type === "transaction",
      )
      .slice(0, userCallCount)
      .map((planned) => ({
        planned,
        result: {
          status: true,
          gasUsed: 21_000n,
          returnData: "0x",
          logs: [],
        },
      })),
    stateReads: [],
  }) as unknown as SimulationExecution;

function pinnedBlockParam(fetch: ReturnType<typeof stubFetch>["fetch"]) {
  return fetch.mock.calls
    .map(
      ([, init]) =>
        JSON.parse(String(init?.body)) as { method: string; params: unknown[] },
    )
    .find(({ method }) => method === "eth_getBlockByNumber")?.params[0];
}

function stubFetch(calls: readonly unknown[]) {
  const methods: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    const { method } = JSON.parse(String(init?.body)) as { method: string };
    methods.push(method);
    if (method === "eth_getBlockByNumber")
      return rpc({
        number: numberToHex(STATE_BLOCK),
        hash: STATE_BLOCK_HASH,
        timestamp: numberToHex(STATE_BLOCK_TIMESTAMP),
      });
    if (method === "eth_simulateV1")
      return rpc([
        {
          number: numberToHex(STATE_BLOCK),
          hash: STATE_BLOCK_HASH,
          timestamp: numberToHex(STATE_BLOCK_TIMESTAMP),
          calls,
        },
      ]);
    throw new Error(`Unexpected RPC method ${method}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, methods };
}

const config: SimulationConfig = {
  chains: new Map([[CHAIN_ID, { simulateV1Url: RPC_URL }]]),
};

beforeEach(() => {
  vi.clearAllMocks();
  userCallCount = 1;
  mockExecutePlan.mockImplementation(async ({ plan, stateBlock }) =>
    execution(plan, stateBlock),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe.sequential("runSimulation", () => {
  test("error: an unregistered chain requires Morpho addresses for limits", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              quote: { assetsPaid: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: preview authorizations on an unregistered chain require Morpho addresses", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        mode: "preview",
        transactions: [TRANSACTION],
        authorizations: [
          {
            type: "erc20Approval",
            token: TARGET,
            owner: OWNER,
            spender: TARGET,
            amount: 1n,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("behavior: an unregistered configured chain works without limits", async () => {
    const actual = await vi.importActual<typeof import("./backends/index.js")>(
      "./backends/index.js",
    );
    mockExecutePlan.mockImplementationOnce(actual.executePlan);
    const { fetch, methods } = stubFetch([
      { status: "0x1", gasUsed: "0x5208", returnData: "0x", logs: [] },
    ]);
    const result = await simulate(config, {
      chainId: CHAIN_ID,
      transactions: [TRANSACTION],
    });
    expect(result.calls).toHaveLength(1);
    expect(mockExecutePlan).toHaveBeenCalledOnce();
    expect(methods).toEqual(["eth_getBlockByNumber", "eth_simulateV1"]);
    expect(pinnedBlockParam(fetch)).toBe("latest");
    expect(mockExecutePlan.mock.calls[0]?.[0].validation).toBe(false);
    expect(mockExecutePlan.mock.calls[0]?.[0].blockGasLimit).toBeUndefined();
    expect(mockExecutePlan.mock.calls[0]?.[0].parentHashCheck).toBe(true);
  });

  test("behavior: a configured block gas limit is forwarded to execution", async () => {
    stubFetch([]);
    await simulate(
      {
        chains: new Map([
          [
            CHAIN_ID,
            {
              simulateV1Url: RPC_URL,
              blockOverrides: { gasLimit: 16_777_216n },
            },
          ],
        ]),
      },
      { chainId: CHAIN_ID, transactions: [TRANSACTION] },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].blockGasLimit).toBe(16_777_216n);
  });

  test("behavior: Stable turns the parentHash check off by default", async () => {
    stubFetch([]);
    await simulate(
      {
        chains: new Map([[ChainId.StableMainnet, { simulateV1Url: RPC_URL }]]),
      },
      {
        chainId: ChainId.StableMainnet,
        transactions: [{ ...TRANSACTION, chainId: ChainId.StableMainnet }],
      },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].parentHashCheck).toBe(false);
  });

  test("behavior: a configured parentHashCheck overrides the chain default", async () => {
    stubFetch([]);
    await simulate(
      {
        chains: new Map([
          [
            ChainId.StableMainnet,
            { simulateV1Url: RPC_URL, parentHashCheck: true },
          ],
        ]),
      },
      {
        chainId: ChainId.StableMainnet,
        transactions: [{ ...TRANSACTION, chainId: ChainId.StableMainnet }],
      },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].parentHashCheck).toBe(true);

    stubFetch([]);
    await simulate(
      {
        chains: new Map([
          [CHAIN_ID, { simulateV1Url: RPC_URL, parentHashCheck: false }],
        ]),
      },
      { chainId: CHAIN_ID, transactions: [TRANSACTION] },
    );
    expect(mockExecutePlan.mock.calls[1]?.[0].parentHashCheck).toBe(false);
  });

  test("behavior: Monad pins to the finalized block and sends validation: true", async () => {
    const { fetch } = stubFetch([]);
    await simulate(
      {
        chains: new Map([[ChainId.MonadMainnet, { simulateV1Url: RPC_URL }]]),
      },
      {
        chainId: ChainId.MonadMainnet,
        transactions: [{ ...TRANSACTION, chainId: ChainId.MonadMainnet }],
      },
    );
    expect(pinnedBlockParam(fetch)).toBe("finalized");
    expect(mockExecutePlan.mock.calls[0]?.[0].validation).toBe(true);
  });

  test("behavior: Monad keeps an explicit blockNumber", async () => {
    const { fetch } = stubFetch([]);
    await simulate(
      {
        chains: new Map([[ChainId.MonadMainnet, { simulateV1Url: RPC_URL }]]),
      },
      {
        chainId: ChainId.MonadMainnet,
        transactions: [{ ...TRANSACTION, chainId: ChainId.MonadMainnet }],
        blockNumber: STATE_BLOCK,
      },
    );
    expect(pinnedBlockParam(fetch)).toBe(numberToHex(STATE_BLOCK));
    expect(mockExecutePlan.mock.calls[0]?.[0].validation).toBe(true);
  });

  test("behavior: a supplied block sends only eth_simulateV1", async () => {
    const actual = await vi.importActual<typeof import("./backends/index.js")>(
      "./backends/index.js",
    );
    mockExecutePlan.mockImplementationOnce(actual.executePlan);
    const { fetch, methods } = stubFetch([
      { status: "0x1", gasUsed: "0x5208", returnData: "0x", logs: [] },
    ]);
    const result = await simulate(config, {
      chainId: CHAIN_ID,
      transactions: [TRANSACTION],
      block: {
        number: STATE_BLOCK,
        hash: STATE_BLOCK_HASH,
        timestamp: STATE_BLOCK_TIMESTAMP,
      },
    });
    expect(result.calls).toHaveLength(1);
    expect(methods).toEqual(["eth_simulateV1"]);
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as {
      params: unknown[];
    };
    expect(request.params[1]).toBe(numberToHex(STATE_BLOCK));
  });

  test("behavior: a mixed-case supplied block hash matches the successor parentHash", async () => {
    const actual = await vi.importActual<typeof import("./backends/index.js")>(
      "./backends/index.js",
    );
    mockExecutePlan.mockImplementationOnce(actual.executePlan);
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        const { method } = JSON.parse(String(init?.body)) as { method: string };
        methods.push(method);
        return rpc([
          {
            number: numberToHex(STATE_BLOCK + 1n),
            hash: `0x${"cd".repeat(32)}`,
            parentHash: STATE_BLOCK_HASH,
            timestamp: numberToHex(STATE_BLOCK_TIMESTAMP + 12n),
            calls: [
              { status: "0x1", gasUsed: "0x5208", returnData: "0x", logs: [] },
            ],
          },
        ]);
      }),
    );
    const result = await simulate(config, {
      chainId: CHAIN_ID,
      transactions: [TRANSACTION],
      block: {
        number: STATE_BLOCK,
        hash: STATE_BLOCK_HASH.toUpperCase().replace("0X", "0x") as Hex,
        timestamp: STATE_BLOCK_TIMESTAMP,
      },
    });
    expect(result.calls).toHaveLength(1);
    expect(methods).toEqual(["eth_simulateV1"]);
  });

  test("error: block lookup transport failures do not expose the RPC URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new Error(`request failed: ${RPC_URL}`)),
    );
    const error = await simulate(config, {
      chainId: CHAIN_ID,
      transactions: [TRANSACTION],
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as Error).message).not.toContain(RPC_URL);
  });

  test("error: MissingVerificationEvidenceError carries context for an empty state read", async () => {
    stubFetch([]);
    let plannedReadId: string | undefined;
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => ({
      ...execution(plan, stateBlock),
      stateReads: plan.calls
        .filter(
          (call): call is Extract<PlannedCall, { type: "stateRead" }> =>
            call.type === "stateRead",
        )
        .map((call) => {
          plannedReadId ??= call.read.id;
          return {
            phase: call.phase,
            read: call.read,
            returnData: "0x" as Hex,
          };
        }),
    }));
    const error = await simulate(
      { chains: new Map([[1, { simulateV1Url: RPC_URL }]]) },
      {
        chainId: 1,
        transactions: [{ ...TRANSACTION, chainId: 1 }],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              quote: { sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(MissingVerificationEvidenceError);
    expect(error).toMatchObject({
      context: {
        stage: "verification",
        chainId: 1,
        mode: "final",
        blockNumber: STATE_BLOCK,
        field: plannedReadId,
      },
    });
  });

  test("error: a user-call count mismatch is an invalid response", async () => {
    const { methods } = stubFetch([]);
    userCallCount = 0;
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        transactions: [TRANSACTION],
      }),
    ).rejects.toBeInstanceOf(InvalidSimulationResponseError);
    expect(methods).toEqual(["eth_getBlockByNumber"]);
  });
});
