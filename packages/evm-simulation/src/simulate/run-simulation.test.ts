import * as blueSdk from "@morpho-org/blue-sdk";
import {
  ChainId,
  getChainAddresses,
  type MarketId,
} from "@morpho-org/blue-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { expectFailClosed } from "@morpho-org/test/chaos";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  isAddressEqual,
  numberToHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ConsumerLimitViolationError,
  InvalidChainIdError,
  InvalidSimulationResponseError,
  RpcTransportError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
  UnsupportedChainError,
} from "../errors.js";
import type { StateBlock } from "../params.js";
import type { SimulationConfig, SimulationTransaction } from "../types.js";
import type { executePlan } from "./backends/index.js";
import type { SimulationExecution } from "./backends/parse-response.js";
import type { ExecutionPlan, PlannedCall } from "./plan/plan-execution.js";
import { parseRequest } from "./request/parse-request.js";
import { runSimulation } from "./run-simulation.js";
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

// biome-ignore lint/complexity/useMaxParams: positional fixture builder
function stubFetch(
  calls: readonly unknown[],
  code: Hex = "0x6000",
  servedChainId?: number | "fail",
  mockClient?: ReturnType<typeof createMockClient>,
) {
  const methods: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    const { method, params } = JSON.parse(String(init?.body)) as {
      method: string;
      params?: readonly unknown[];
    };
    methods.push(method);
    if (method === "eth_call" && mockClient !== undefined)
      return rpc(await mockClient.request({ method, params }));
    if (method === "eth_chainId") {
      if (servedChainId === "fail") throw new TypeError("fetch failed");
      return rpc(numberToHex(servedChainId ?? CHAIN_ID));
    }
    if (method === "eth_getCode") return rpc(code);
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
  test.each([
    { label: "owner sends ETH", value: 1n, from: OWNER, guard: true },
    { label: "owner sends no ETH", value: 0n, from: OWNER, guard: false },
    { label: "other sender sends ETH", value: 1n, from: TARGET, guard: false },
  ])(
    "behavior: native value sent wiring — $label",
    async ({ value, from, guard }) => {
      const addresses = getChainAddresses(ChainId.BaseMainnet)!;
      const mockClient = createMockClient(base);
      mockRead(mockClient, {
        address: addresses.midnight!,
        abi: midnightAbi,
        functionName: "toMarket",
        result: {
          chainId: BigInt(ChainId.BaseMainnet),
          midnight: addresses.midnight!,
          loanToken: TARGET as Address,
          collateralParams: [
            {
              token: addresses.wNative! as Address,
              lltv: 0n,
              liquidationCursor: 0n,
              oracle: zeroAddress,
            },
          ],
          maturity: 2_000_000_000n,
          rcfThreshold: 0n,
          enterGate: zeroAddress,
          liquidatorGate: zeroAddress,
        },
      });
      const { fetch } = stubFetch(
        [],
        "0x6000",
        ChainId.BaseMainnet,
        mockClient,
      );
      const request = {
        chainId: ChainId.BaseMainnet,
        transactions: [{ ...TRANSACTION, from, value }],
        limits: {
          operations: [
            {
              type: "midnightRepayWithdrawCollateral" as const,
              marketId: `0x${"11".repeat(32)}` as MarketId,
              quote: {
                collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
              },
            },
          ],
        },
      };
      const simulationConfig = {
        chains: new Map([[ChainId.BaseMainnet, { simulateV1Url: RPC_URL }]]),
      };
      const error =
        from === TARGET
          ? await runSimulation({
              config: simulationConfig,
              request: {
                ...parseRequest({
                  ...request,
                  transactions: [{ ...TRANSACTION, value: 0n }],
                }),
                transactions: [
                  { ...TRANSACTION, value: 0n },
                  { ...TRANSACTION, from: TARGET, value: 1n },
                ],
              },
            }).catch((cause: unknown) => cause)
          : await simulate(simulationConfig, request).catch(
              (cause: unknown) => cause,
            );
      if (guard) {
        expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
        expect(error).toHaveProperty(
          "message",
          expect.stringContaining("native ETH is sent"),
        );
      } else {
        expect(error).not.toHaveProperty(
          "message",
          expect.stringContaining("native ETH is sent"),
        );
      }
      expect(fetch).toHaveBeenCalled();
    },
  );

  test("behavior: combined wNative pull cap uses the exact total from owner transactions", async () => {
    userCallCount = 3;
    const addresses = getChainAddresses(ChainId.BaseMainnet)!;
    const mockClient = createMockClient(base);
    mockRead(mockClient, {
      address: addresses.midnight!,
      abi: midnightAbi,
      functionName: "toMarket",
      result: {
        chainId: BigInt(ChainId.BaseMainnet),
        midnight: addresses.midnight!,
        loanToken: TARGET as Address,
        collateralParams: [
          {
            token: addresses.wNative! as Address,
            lltv: 0n,
            liquidationCursor: 0n,
            oracle: zeroAddress,
          },
        ],
        maturity: 2_000_000_000n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
    });
    let walletDelta = -1n;
    mockExecutePlan.mockImplementation(async ({ plan, stateBlock }) => ({
      ...execution(plan, stateBlock),
      stateReads: plan.calls
        .filter(
          (call): call is Extract<PlannedCall, { type: "stateRead" }> =>
            call.type === "stateRead",
        )
        .map(({ phase, read }) => {
          const before = phase === "before";
          let returnData: Hex;
          if (read.kind === "erc20.balance") {
            const value = isAddressEqual(read.token, addresses.wNative!)
              ? before
                ? 100n
                : 100n + walletDelta
              : before
                ? 0n
                : 1n;
            returnData = encodeFunctionResult({
              abi: erc20Abi,
              functionName: "balanceOf",
              result: value,
            });
          } else if (read.kind === "midnight.collateral") {
            returnData = encodeFunctionResult({
              abi: midnightAbi,
              functionName: "collateral",
              result: before ? 0n : 5n,
            });
          } else if (read.kind === "midnight.credit") {
            returnData = encodeFunctionResult({
              abi: midnightAbi,
              functionName: "updatePositionView",
              result: before ? [100n, 0n, 0n] : [90n, 0n, 0n],
            });
          } else {
            returnData = encodeFunctionResult({
              abi: midnightAbi,
              functionName: "debt",
              result: 20n,
            });
          }
          return { phase, read, returnData };
        }),
    }));
    const { fetch } = stubFetch([], "0x6000", ChainId.BaseMainnet, mockClient);
    const simulationConfig = {
      chains: new Map([[ChainId.BaseMainnet, { simulateV1Url: RPC_URL }]]),
    };
    const request = {
      chainId: ChainId.BaseMainnet,
      transactions: [
        { ...TRANSACTION, from: OWNER, value: 1n },
        { ...TRANSACTION, from: OWNER, value: 2n },
        { ...TRANSACTION, from: TARGET, value: 10n },
      ],
      limits: {
        operations: [
          {
            type: "midnightSupplyCollateralTakeBorrow" as const,
            marketId: `0x${"11".repeat(32)}` as MarketId,
            quote: {
              collateralSupplies: [{ collateralIndex: 0n, assets: 5n }],
              unitsSold: 10n,
              assetsReceived: 1n,
            },
          },
        ],
      },
    };
    const parsedRequest = parseRequest({
      ...request,
      transactions: request.transactions.map((transaction) => ({
        ...transaction,
        from: OWNER,
      })),
    });
    const run = () =>
      runSimulation({
        config: simulationConfig,
        request: {
          ...parsedRequest,
          transactions: request.transactions,
        },
      });
    const result = await run();
    expect(result).toMatchObject({
      verification: {
        operations: [{ operation: "midnightSupplyCollateralTakeBorrow" }],
      },
    });
    expect(result.verification.limits).not.toBe("none");
    if (result.verification.limits !== "none") {
      const checkedLimit = result.verification.limits.operations[0]!;
      expect(Object.hasOwn(checkedLimit, "fieldChecks")).toBe(false);
      expect(checkedLimit).not.toHaveProperty("fieldChecks");
      expect(Object.keys(checkedLimit)).not.toContain("fieldChecks");
    }
    walletDelta = -3n;
    await expect(run()).rejects.toBeInstanceOf(ConsumerLimitViolationError);
    expect(fetch).toHaveBeenCalled();
  });

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
              quote: { assetsPaid: 1n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: mixed parking and Morpho limits require registered addresses", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "midnightSupplyBlueMakeLend",
              loanToken: TARGET,
              marketId: `0x${"11".repeat(32)}` as MarketId,
              callbackSalt: `0x${"22".repeat(32)}` as Hex,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            },
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: native-funded Blue parking on an unregistered chain is unsupported", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        transactions: [{ ...TRANSACTION, value: 1n }],
        limits: {
          operations: [
            {
              type: "midnightSupplyBlueMakeLend",
              loanToken: TARGET,
              marketId: `0x${"11".repeat(32)}` as MarketId,
              callbackSalt: `0x${"22".repeat(32)}` as Hex,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: midnightSupplyCollateral on a chain without a Midnight address", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(
        {
          chains: new Map([
            [ChainId.ArbitrumMainnet, { simulateV1Url: RPC_URL }],
          ]),
        },
        {
          chainId: ChainId.ArbitrumMainnet,
          transactions: [TRANSACTION],
          limits: {
            operations: [
              {
                type: "midnightSupplyCollateral",
                marketId: `0x${"11".repeat(32)}` as MarketId,
                collateralIndex: 0n,
                quote: { assetsPaid: 1n, collateralSupplied: 1n },
              },
            ],
          },
        },
      ),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: midnightRedeem on a chain without a Midnight address", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(
        {
          chains: new Map([
            [ChainId.ArbitrumMainnet, { simulateV1Url: RPC_URL }],
          ]),
        },
        {
          chainId: ChainId.ArbitrumMainnet,
          transactions: [TRANSACTION],
          limits: {
            operations: [
              {
                type: "midnightRedeem",
                marketId: `0x${"11".repeat(32)}` as Hex,
                quote: { creditRedeemed: 1n, assetsReceived: 1n },
              },
            ],
          },
        },
      ),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    "midnightTakeBorrow",
    "midnightTakeWithdraw",
    "midnightSupplyCollateralTakeBorrow",
    "midnightTakeLend",
    "midnightRepayWithdrawCollateral",
    "midnightTakeRepayWithdrawCollateral",
  ] as const)(
    "error: %s on a chain without a Midnight address",
    async (type) => {
      const { fetch } = stubFetch([]);
      const operation =
        type === "midnightTakeBorrow"
          ? {
              type,
              marketId: `0x${"11".repeat(32)}` as Hex,
              quote: { unitsSold: 1n, assetsReceived: 1n },
            }
          : type === "midnightTakeLend"
            ? {
                type,
                marketId: `0x${"11".repeat(32)}` as Hex,
                quote: { assetsPaid: 1n, unitsBought: 1n },
              }
            : type === "midnightSupplyCollateralTakeBorrow"
              ? {
                  type,
                  marketId: `0x${"11".repeat(32)}` as MarketId,
                  quote: {
                    collateralSupplies: [{ collateralIndex: 0n, assets: 1n }],
                    unitsSold: 1n,
                    assetsReceived: 1n,
                  },
                }
              : type === "midnightTakeWithdraw"
                ? {
                    type,
                    marketId: `0x${"11".repeat(32)}` as Hex,
                    quote: { creditRedeemed: 1n, assetsReceived: 1n },
                  }
                : {
                    type,
                    marketId: `0x${"11".repeat(32)}` as Hex,
                    quote: { assetsPaid: 1n, debtRepaid: 1n },
                  };
      await expect(
        simulate(
          {
            chains: new Map([
              [ChainId.ArbitrumMainnet, { simulateV1Url: RPC_URL }],
            ]),
          },
          {
            chainId: ChainId.ArbitrumMainnet,
            transactions: [TRANSACTION],
            limits: { operations: [operation] },
          },
        ),
      ).rejects.toBeInstanceOf(UnsupportedChainError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("error: preview authorizations on an unregistered chain require Morpho addresses", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        mode: "preview",
        limits: "none",
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
      limits: "none",
      transactions: [TRANSACTION],
    });
    expect(result.calls).toHaveLength(1);
    expect(result.verification.limits).toBe("none");
    expect(mockExecutePlan).toHaveBeenCalledOnce();
    expect(methods).toEqual([
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_simulateV1",
    ]);
    expect(pinnedBlockParam(fetch)).toBe("latest");
    expect(mockExecutePlan.mock.calls[0]?.[0].validation).toBe(false);
    expect(mockExecutePlan.mock.calls[0]?.[0].blockGasLimit).toBeUndefined();
    expect(mockExecutePlan.mock.calls[0]?.[0].callGasLimit).toBeUndefined();
    expect(mockExecutePlan.mock.calls[0]?.[0].parentHashCheck).toBe(true);
  });

  test("error: Blue parking requires registered protocol addresses", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "midnightSupplyBlueMakeLend",
              loanToken: TARGET,
              marketId: `0x${"11".repeat(32)}` as MarketId,
              callbackSalt: `0x${"22".repeat(32)}` as Hex,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("error: Blue parking requires a registered callback factory", async () => {
    const { fetch } = stubFetch([]);
    const addresses = {
      ...getChainAddresses(ChainId.BaseMainnet),
      midnightBlueBuyCallbackFactory: undefined,
    };
    const getChainAddressesSpy = vi
      .spyOn(blueSdk, "getChainAddresses")
      .mockReturnValueOnce(addresses);
    try {
      await expect(
        simulate(
          {
            chains: new Map([
              [ChainId.BaseMainnet, { simulateV1Url: RPC_URL }],
            ]),
          },
          {
            chainId: ChainId.BaseMainnet,
            transactions: [TRANSACTION],
            limits: {
              operations: [
                {
                  type: "midnightSupplyBlueMakeLend",
                  loanToken: TARGET,
                  marketId: `0x${"11".repeat(32)}` as MarketId,
                  callbackSalt: `0x${"22".repeat(32)}` as Hex,
                  quote: { assetsPaid: 1n, sharesMinted: 1n },
                },
              ],
            },
          },
        ),
      ).rejects.toBeInstanceOf(UnsupportedChainError);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      getChainAddressesSpy.mockRestore();
    }
  });

  test("error: Blue parking requires a registered Midnight address", async () => {
    const { fetch } = stubFetch([]);
    const addresses = {
      ...getChainAddresses(ChainId.BaseMainnet),
      midnight: undefined,
    };
    expect(addresses.blue).toBeDefined();
    expect(addresses.midnightBlueBuyCallbackFactory).toBeDefined();
    const getChainAddressesSpy = vi
      .spyOn(blueSdk, "getChainAddresses")
      .mockReturnValueOnce(addresses);
    try {
      await expect(
        simulate(
          {
            chains: new Map([
              [ChainId.BaseMainnet, { simulateV1Url: RPC_URL }],
            ]),
          },
          {
            chainId: ChainId.BaseMainnet,
            transactions: [TRANSACTION],
            limits: {
              operations: [
                {
                  type: "midnightSupplyBlueMakeLend",
                  loanToken: TARGET,
                  marketId: `0x${"11".repeat(32)}` as MarketId,
                  callbackSalt: `0x${"22".repeat(32)}` as Hex,
                  quote: { assetsPaid: 1n, sharesMinted: 1n },
                },
              ],
            },
          },
        ),
      ).rejects.toBeInstanceOf(UnsupportedChainError);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      getChainAddressesSpy.mockRestore();
    }
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
      { chainId: CHAIN_ID, limits: "none", transactions: [TRANSACTION] },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].blockGasLimit).toBe(16_777_216n);
  });

  test("behavior: a configured call gas limit is forwarded to execution", async () => {
    stubFetch([]);
    await simulate(
      {
        chains: new Map([
          [CHAIN_ID, { simulateV1Url: RPC_URL, callGasLimit: 30_000_000n }],
        ]),
      },
      { chainId: CHAIN_ID, limits: "none", transactions: [TRANSACTION] },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].callGasLimit).toBe(30_000_000n);
  });

  test("behavior: Stable turns the parentHash check off by default", async () => {
    stubFetch([]);
    await simulate(
      {
        chains: new Map([[ChainId.StableMainnet, { simulateV1Url: RPC_URL }]]),
      },
      {
        chainId: ChainId.StableMainnet,
        limits: "none",
        transactions: [TRANSACTION],
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
        limits: "none",
        transactions: [TRANSACTION],
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
      { chainId: CHAIN_ID, limits: "none", transactions: [TRANSACTION] },
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
        limits: "none",
        transactions: [TRANSACTION],
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
        limits: "none",
        transactions: [TRANSACTION],
        blockNumber: STATE_BLOCK,
      },
    );
    expect(pinnedBlockParam(fetch)).toBe(numberToHex(STATE_BLOCK));
    expect(mockExecutePlan.mock.calls[0]?.[0].validation).toBe(true);
  });

  test("behavior: a supplied block skips the block lookup only", async () => {
    const actual = await vi.importActual<typeof import("./backends/index.js")>(
      "./backends/index.js",
    );
    mockExecutePlan.mockImplementationOnce(actual.executePlan);
    const { fetch, methods } = stubFetch([
      { status: "0x1", gasUsed: "0x5208", returnData: "0x", logs: [] },
    ]);
    const result = await simulate(config, {
      chainId: CHAIN_ID,
      limits: "none",
      transactions: [TRANSACTION],
      block: {
        number: STATE_BLOCK,
        hash: STATE_BLOCK_HASH,
        timestamp: STATE_BLOCK_TIMESTAMP,
      },
    });
    expect(result.calls).toHaveLength(1);
    expect(methods).toEqual(["eth_getCode", "eth_simulateV1"]);
    const request = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as {
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
      limits: "none",
      transactions: [TRANSACTION],
      block: {
        number: STATE_BLOCK,
        hash: STATE_BLOCK_HASH.toUpperCase().replace("0X", "0x") as Hex,
        timestamp: STATE_BLOCK_TIMESTAMP,
      },
    });
    expect(result.calls).toHaveLength(1);
    expect(methods).toEqual(["eth_getCode", "eth_simulateV1"]);
  });

  test("error: block lookup transport failures omit viem diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new Error(`request failed: ${RPC_URL}`)),
    );
    const error = await simulate(config, {
      chainId: CHAIN_ID,
      limits: "none",
      transactions: [TRANSACTION],
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(RpcTransportError);
    expect((error as Error).message).not.toContain(RPC_URL);
  });

  test.each([
    { label: "different", served: 1, mismatch: true },
    { label: "matching", served: CHAIN_ID, mismatch: false },
  ])(
    "error: execution service failure probes the served chain ($label)",
    async ({ served, mismatch }) => {
      const { fetch } = stubFetch([]);
      const original = new RpcTransportError("execution failed");
      mockExecutePlan.mockRejectedValueOnce(original);
      fetch.mockImplementation(async (_input, init) => {
        const { method } = JSON.parse(String(init?.body)) as { method: string };
        if (method === "eth_getBlockByNumber")
          return rpc({
            number: numberToHex(STATE_BLOCK),
            hash: STATE_BLOCK_HASH,
            timestamp: numberToHex(STATE_BLOCK_TIMESTAMP),
          });
        if (method === "eth_getCode") return rpc("0x6000");
        if (method === "eth_chainId") return rpc(numberToHex(served));
        throw new Error(`Unexpected RPC method ${method}`);
      });
      const error = await simulate(config, {
        chainId: CHAIN_ID,
        limits: "none",
        transactions: [TRANSACTION],
      }).catch((cause: unknown) => cause);
      if (mismatch) {
        expect(error).toBeInstanceOf(InvalidChainIdError);
      } else {
        expect(error).toBe(original);
      }
    },
  );

  test("error: SlippageCheckUnavailableError carries context for an empty state read", async () => {
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
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              assetPaid: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              quote: { sharesMinted: 1n, assetsPaid: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      },
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(plannedReadId);
  });

  test("error: a user-call count mismatch is an invalid response", async () => {
    const { methods } = stubFetch([]);
    userCallCount = 0;
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        limits: "none",
        transactions: [TRANSACTION],
      }),
    ).rejects.toBeInstanceOf(InvalidSimulationResponseError);
    expect(methods).toEqual(["eth_getBlockByNumber", "eth_getCode"]);
  });

  test("error: a code-less calldata target fails before eth_simulateV1", async () => {
    const { methods } = stubFetch([], "0x");
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        limits: "none",
        transactions: [TRANSACTION],
      }),
    ).rejects.toBeInstanceOf(SimulationValidationError);
    expect(methods).not.toContain("eth_simulateV1");
  });

  test("error: a code-less target on a wrong-chain endpoint reports InvalidChainIdError", async () => {
    const { methods } = stubFetch([], "0x", 8453);
    const promise = simulate(config, {
      chainId: CHAIN_ID,
      limits: "none",
      transactions: [TRANSACTION],
    });
    await expectFailClosed(promise, "chain");
    await expect(promise).rejects.toBeInstanceOf(InvalidChainIdError);
    expect(methods).not.toContain("eth_simulateV1");
    expect(methods).toContain("eth_chainId");
  });

  test("error: a code-less target on the right chain keeps SimulationValidationError", async () => {
    const { methods } = stubFetch([], "0x", CHAIN_ID);
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        limits: "none",
        transactions: [TRANSACTION],
      }),
    ).rejects.toBeInstanceOf(SimulationValidationError);
    expect(methods).not.toContain("eth_simulateV1");
  });

  test("error: a failed eth_chainId probe keeps SimulationValidationError", async () => {
    stubFetch([], "0x", "fail");
    await expect(
      simulate(config, {
        chainId: CHAIN_ID,
        limits: "none",
        transactions: [TRANSACTION],
      }),
    ).rejects.toBeInstanceOf(SimulationValidationError);
  });
});
