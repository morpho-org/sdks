import * as blueSdk from "@morpho-org/blue-sdk";
import {
  ChainId,
  getChainAddresses,
  type MarketId,
} from "@morpho-org/blue-sdk";
import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { MarketUtils as MidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  createPublicClient,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionResult,
  erc20Abi,
  erc4626Abi,
  ethAddress,
  fallback,
  type Hex,
  http,
  isAddressEqual,
  numberToHex,
  offchainLookupAbiItem,
  parseAbi,
  zeroAddress,
} from "viem";
import { base, mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  Erc2612PermitAuthorization,
  MidnightAuthorizationSignature,
} from "../authorizations.js";
import {
  ApprovalCheckUnavailableError,
  BlacklistViolationError,
  ConsumerLimitViolationError,
  InvalidSimulationResponseError,
  RpcTransportError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
  UnexpectedTokenApprovalError,
  UnsupportedChainError,
  UnusedAuthorizationError,
} from "../errors.js";
import { simulate } from "../index.js";
import type { StateBlock } from "../params.js";
import {
  encodeUint256,
  firstFailure,
  padAddress,
  simulateOrThrow,
  simulationClientFor,
  unwrapReport,
} from "../test-helpers/index.js";
import type {
  RawLog,
  SimulationOptions,
  SimulationTransaction,
} from "../types.js";
import type { executePlan } from "./backends/index.js";
import type { SimulationExecution } from "./backends/parse-response.js";
import { TRANSFER_TOPIC, WITHDRAWAL_TOPIC } from "./parsing/transfers.js";
import type { ExecutionPlan, PlannedCall } from "./plan/plan-execution.js";
import { parseRequest } from "./request/parse-request.js";
import { NO_WNATIVE_MIRROR_WRAPPERS, runSimulation } from "./run-simulation.js";

const mockExecutePlan = vi.fn<typeof executePlan>();
const runOrThrow = async (...args: Parameters<typeof runSimulation>) =>
  unwrapReport(await runSimulation(...args));

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
const PERMIT: Erc2612PermitAuthorization = {
  type: "erc2612Permit",
  typedData: {
    domain: { chainId: 1, verifyingContract: TARGET },
    primaryType: "Permit",
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    message: {
      owner: OWNER,
      spender: TARGET,
      value: 1n,
      nonce: 0n,
      deadline: 2_000_000_000n,
    },
  },
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
    failures: [],
    stateReads: [],
  }) as unknown as SimulationExecution;

const executeWithMissingLogs =
  (
    omitted: "transaction" | "preparation" | "assertion" | number | undefined,
    transactionLogs: readonly (RawLog | Omit<RawLog, "data">)[] = [],
  ) =>
  async (
    params: Parameters<typeof executePlan>[0],
  ): Promise<SimulationExecution> => {
    const handle = createMockClient(mainnet);
    const defaultRequest = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params: rpcParams }) => {
      if (method !== "eth_simulateV1")
        return defaultRequest?.({ method, params: rpcParams });
      return [
        {
          number: numberToHex(STATE_BLOCK),
          timestamp: numberToHex(STATE_BLOCK_TIMESTAMP),
          hash: STATE_BLOCK_HASH,
          calls: params.plan.calls.map((call, index) => ({
            status: "0x1",
            returnData: "0x",
            gasUsed: "0x5208",
            ...(call.type === omitted || index === omitted
              ? {}
              : { logs: call.type === "transaction" ? transactionLogs : [] }),
          })),
        },
      ];
    });
    const actual = await vi.importActual<typeof import("./backends/index.js")>(
      "./backends/index.js",
    );
    return actual.executePlan({
      ...params,
      client: handle.client as unknown as typeof params.client,
    });
  };

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
    if (method === "eth_call")
      return rpc(
        `0x${"c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".padStart(64, "0")}`,
      );
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

const config = simulationClientFor(RPC_URL, CHAIN_ID);

beforeEach(() => {
  vi.clearAllMocks();
  userCallCount = 1;
  mockExecutePlan.mockImplementation(async ({ plan, stateBlock }) =>
    execution(plan, stateBlock),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe.sequential("runSimulation", () => {
  test.each([1, 14, 123456789])(
    "behavior: reports retention coverage and skip warnings on chain %s",
    async (chainId) => {
      stubFetch([]);
      const report = await simulate(simulationClientFor(RPC_URL, chainId), {
        transactions: [TRANSACTION],
        limits: "none",
      });
      expect(report.ok).toBe(true);
      expect(report.verification).toEqual({
        retention: chainId === 1 ? "checked" : "skipped-unsupported-chain",
      });
      expect(Object.isFrozen(report.verification)).toBe(true);
      expect(report.warnings).toEqual(
        chainId === 1
          ? []
          : [
              expect.objectContaining({
                code: "RETENTION_CHECK_SKIPPED",
                severity: "warn",
                chainId,
                reason:
                  chainId === 14
                    ? "missing-restricted-addresses"
                    : "unsupported-chain",
              }),
            ],
      );
    },
  );

  test("behavior: a failed report preserves parser warnings but omits incomplete retention coverage", async () => {
    stubFetch([]);
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
      const result = execution(plan, stateBlock);
      return {
        ...result,
        failures: [new InvalidSimulationResponseError("assertion evidence")],
        calls: result.calls.map((call) => ({
          ...call,
          result: {
            ...call.result,
            logs: [
              {
                address: TARGET,
                topics: [TRANSFER_TOPIC, padAddress(OWNER), padAddress(TARGET)],
                data: "0x" as Hex,
              },
            ],
          },
        })),
      };
    });
    const report = await simulate(simulationClientFor(RPC_URL, 14), {
      transactions: [TRANSACTION],
      limits: "none",
    });
    expect(report.ok).toBe(false);
    expect(report).not.toHaveProperty("verification");
    expect(report.warnings).toMatchObject([
      {
        code: "MALFORMED_TRANSFER_LOG",
        severity: "warn",
        chainId: 14,
        txIdx: 0,
      },
      { code: "RETENTION_CHECK_SKIPPED", severity: "warn", chainId: 14 },
    ]);
  });

  test("behavior: deprecated logger methods are ignored and leave reports unchanged", async () => {
    const { fetch } = stubFetch([]);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    Object.values(logger).forEach((method) =>
      method.mockImplementation(() => {
        throw new Error("must not run");
      }),
    );
    const baseline = await simulate(config, {
      transactions: [TRANSACTION],
      limits: "none",
    });
    const report = await simulate(
      config,
      { transactions: [TRANSACTION], limits: "none" },
      { logger },
    );
    expect(report.ok).toBe(true);
    expect(report).toEqual(baseline);
    expect(report.warnings).not.toEqual([]);
    expect(fetch).toHaveBeenCalled();
    Object.values(logger).forEach((method) =>
      expect(method).not.toHaveBeenCalled(),
    );
  });

  test.each([false, true])(
    "behavior: reports swept balances and checked retention even with retained funds (%s)",
    async (retained) => {
      stubFetch([]);
      const bundles = getChainAddresses(1).bundles!.vaultBundlesV1!;
      mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
        const result = execution(plan, stateBlock);
        return {
          ...result,
          calls: result.calls.map((call) => ({
            ...call,
            result: {
              ...call.result,
              logs: [
                {
                  address: TARGET,
                  topics: [
                    TRANSFER_TOPIC,
                    padAddress(bundles),
                    padAddress(OWNER),
                  ],
                  data: encodeUint256(101n),
                },
                ...(retained
                  ? [
                      {
                        address: OWNER,
                        topics: [
                          TRANSFER_TOPIC,
                          padAddress(OWNER),
                          padAddress(bundles),
                        ] as const,
                        data: encodeUint256(102n),
                      },
                    ]
                  : []),
              ],
            },
          })),
        };
      });
      const report = await simulate(simulationClientFor(RPC_URL, 1), {
        transactions: [TRANSACTION],
        limits: "none",
      });
      expect(report.ok).toBe(!retained);
      expect(report.verification).toEqual({ retention: "checked" });
      expect(report.warnings).toMatchObject([
        {
          code: "BUNDLES_BALANCE_SWEPT",
          severity: "warn",
          chainId: 1,
          address: bundles,
          token: TARGET,
          netSwept: 101n,
        },
      ]);
      if (!report.ok)
        expect(report.failures).toEqual([expect.any(BlacklistViolationError)]);
    },
  );

  test.each([0n, 1n, 10n ** 18n, 123456789n * 10n ** 18n])(
    "behavior: declared USDC deposit with undeclared WETH transfer/sweep %s",
    async (amount) => {
      const usdc: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
      const weth: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: TARGET,
        abi: erc4626Abi,
        functionName: "asset",
        result: usdc,
      });
      stubFetch([], "0x6000", 1, handle);
      mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
        const result = execution(plan, stateBlock);
        return {
          ...result,
          calls: result.calls.map((call) => ({
            ...call,
            result: {
              ...call.result,
              logs: [
                {
                  address: usdc,
                  topics: [
                    TRANSFER_TOPIC,
                    padAddress(OWNER),
                    padAddress(TARGET),
                  ],
                  data: encodeUint256(1n),
                },
                {
                  address: weth,
                  topics: [
                    TRANSFER_TOPIC,
                    padAddress(OWNER),
                    padAddress(TARGET),
                  ],
                  data: encodeUint256(amount),
                },
              ],
            },
          })),
          stateReads: plan.calls.flatMap((call) =>
            call.type === "stateRead"
              ? [
                  {
                    phase: call.phase,
                    read: call.read,
                    returnData: encodeUint256(
                      call.phase === "before"
                        ? 100n
                        : call.read.kind === "erc20.balance" &&
                            isAddressEqual(call.read.token, usdc)
                          ? 99n
                          : 101n,
                    ),
                  },
                ]
              : [],
          ),
        };
      });
      const report = await simulate(simulationClientFor(RPC_URL, 1), {
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            },
          ],
          approvals: [
            { type: "token", token: weth, owner: OWNER, spender: TARGET },
          ],
        },
      });
      if (amount === 0n) {
        expect(report.ok).toBe(true);
        expect(report.warnings).toEqual([]);
        return;
      }
      expect(report.ok).toBe(true);
      expect(report.warnings).toContainEqual(
        expect.objectContaining({
          code: "UNEXPECTED_TOKEN_TRANSFER",
          severity: "warn",
          chainId: 1,
        }),
      );
    },
  );

  test.each(["erc20", "alias", "typed"] as const)(
    "behavior: WETH deposit only permits measured ETH funding (%s)",
    async (funding) => {
      const weth: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      const recipient: Address = "0x3333333333333333333333333333333333333333";
      const native = funding !== "erc20";
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: TARGET,
        abi: erc4626Abi,
        functionName: "asset",
        result: weth,
      });
      stubFetch([], "0x6000", 1, handle);
      userCallCount = native ? 1 : 2;
      mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => ({
        ...execution(plan, stateBlock),
        calls: execution(plan, stateBlock).calls.map((call, index) => ({
          ...call,
          result: {
            ...call.result,
            logs: [
              {
                address: !native && index === 0 ? weth : ethAddress,
                topics: [
                  TRANSFER_TOPIC,
                  padAddress(OWNER),
                  padAddress(!native && index === 1 ? recipient : TARGET),
                ],
                data: encodeUint256(1n),
              },
            ],
          },
        })),
        stateReads: plan.calls.flatMap((call) =>
          call.type === "stateRead"
            ? [
                {
                  phase: call.phase,
                  read: call.read,
                  returnData: encodeUint256(
                    call.phase === "before"
                      ? 100n
                      : call.read.kind === "erc20.balance" &&
                          isAddressEqual(call.read.token, weth)
                        ? native
                          ? 100n
                          : 99n
                        : 101n,
                  ),
                },
              ]
            : [],
        ),
      }));
      const report = await simulate(simulationClientFor(RPC_URL, 1), {
        transactions: native
          ? [{ ...TRANSACTION, value: 1n }]
          : [
              TRANSACTION,
              { from: OWNER, to: recipient, data: "0x", value: 1n },
            ],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              ...(funding === "alias" ? { assetPaid: ethAddress } : {}),
              ...(funding === "typed" ? { inputs: { assets: 1n } } : {}),
              quote: { assetsPaid: 1n, sharesMinted: 1n },
              slippageTolerance: 0n,
            },
          ],
        },
      });
      if (native) {
        expect(report).toMatchObject({ ok: true, warnings: [] });
      } else {
        expect(report).toMatchObject({
          ok: true,
          warnings: [
            expect.objectContaining({
              code: "UNEXPECTED_TOKEN_TRANSFER",
              token: ethAddress,
              sender: OWNER,
              recipients: [recipient],
            }),
          ],
        });
      }
    },
  );

  describe.each([
    "blueSupplyCollateralBorrow",
    "blueRepayWithdrawCollateral",
  ] as const)("mixed-operation %s native placeholder", (type) => {
    test.each([0n, 1n])(
      "warns on undeclared ETH round trip %s without borrowing another operation's spend permission",
      async (amount) => {
        const weth: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        const usdc: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        const recipient: Address = "0x3333333333333333333333333333333333333333";
        const market = {
          loanToken: usdc,
          collateralToken: weth,
          oracle: zeroAddress,
          irm: zeroAddress,
          lltv: 0n,
        };
        const handle = createMockClient(mainnet);
        mockRead(handle, {
          address: TARGET,
          abi: erc4626Abi,
          functionName: "asset",
          result: weth,
        });
        mockRead(handle, {
          address: getChainAddresses(1)!.blue!,
          abi: blueAbi,
          functionName: "idToMarketParams",
          result: [usdc, weth, zeroAddress, zeroAddress, 0n],
        });
        stubFetch([], "0x6000", 1, handle);
        userCallCount = 3;
        mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
          const executed = execution(plan, stateBlock);
          return {
            ...executed,
            calls: executed.calls.map((call, index) => ({
              ...call,
              result: {
                ...call.result,
                logs: [
                  {
                    address: index === 0 ? weth : ethAddress,
                    topics: [
                      TRANSFER_TOPIC,
                      padAddress(index === 2 ? recipient : OWNER),
                      padAddress(
                        index === 0 ? TARGET : index === 1 ? recipient : OWNER,
                      ),
                    ],
                    data: encodeUint256(index === 0 ? 1n : amount),
                  },
                ],
              },
            })),
            stateReads: plan.calls.flatMap((call) =>
              call.type === "stateRead"
                ? [
                    {
                      phase: call.phase,
                      read: call.read,
                      returnData:
                        call.read.kind === "morpho.position"
                          ? encodeFunctionResult({
                              abi: blueAbi,
                              functionName: "position",
                              result: [
                                100n,
                                call.phase === "after" &&
                                type === "blueSupplyCollateralBorrow"
                                  ? 102n
                                  : 100n,
                                call.phase === "after" &&
                                type === "blueRepayWithdrawCollateral"
                                  ? 99n
                                  : 100n,
                              ],
                            })
                          : encodeUint256(
                              call.phase === "before"
                                ? 100n
                                : call.read.kind === "erc20.balance" &&
                                    isAddressEqual(call.read.token, weth) &&
                                    isAddressEqual(call.read.account, OWNER)
                                  ? 99n
                                  : 101n,
                            ),
                    },
                  ]
                : [],
            ),
          };
        });
        const report = await simulate(simulationClientFor(RPC_URL, 1), {
          transactions: [
            TRANSACTION,
            { from: OWNER, to: recipient, data: "0x", value: amount },
            TRANSACTION,
          ],
          limits: {
            operations: [
              {
                type: "vaultV2Deposit",
                vault: TARGET,
                quote: { assetsPaid: 1n, sharesMinted: 1n },
                slippageTolerance: 0n,
              },
              {
                type,
                marketId: blueSdk.MarketUtils.getMarketId(market),
                assetPaid: ethAddress,
                receiver: recipient,
                quote:
                  type === "blueSupplyCollateralBorrow"
                    ? { assetsPaid: 1n, sharesMinted: 2n, assetsReceived: 1n }
                    : {
                        assetsPaid: 1n,
                        collateralWithdrawn: 1n,
                        assetsReceived: 1n,
                      },
                slippageTolerance: 0n,
              },
            ],
          },
        });
        if (amount === 0n) {
          expect(report).toMatchObject({ ok: true, warnings: [] });
        } else {
          expect(report).toMatchObject({
            ok: true,
            warnings: [
              expect.objectContaining({
                code: "UNEXPECTED_TOKEN_TRANSFER",
                token: ethAddress,
                sender: OWNER,
                recipients: [recipient],
              }),
            ],
          });
        }
      },
    );
  });

  test("behavior: none preserves sender outflows used by funded Markets review bundles", async () => {
    stubFetch([]);
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
      const result = execution(plan, stateBlock);
      return {
        ...result,
        calls: result.calls.map((call) => ({
          ...call,
          result: {
            ...call.result,
            logs: [
              {
                address: TARGET,
                topics: [
                  TRANSFER_TOPIC,
                  padAddress(OWNER),
                  padAddress(zeroAddress),
                ],
                data: encodeUint256(10n ** 18n),
              },
            ],
          },
        })),
      };
    });
    const report = await simulate(simulationClientFor(RPC_URL, 1), {
      transactions: [TRANSACTION],
      limits: "none",
    });
    expect(report).toMatchObject({ ok: true, warnings: [] });
  });

  test("behavior: a state read returning no data in both phases is reported once", async () => {
    stubFetch([]);
    let readIds: string[] = [];
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
      const baseExecution = execution(plan, stateBlock);
      const stateReads = plan.calls.flatMap((planned) =>
        planned.type === "stateRead"
          ? [
              {
                phase: planned.phase,
                read: planned.read,
                returnData: "0x" as Hex,
              },
            ]
          : [],
      );
      readIds = [...new Set(stateReads.map(({ read }) => read.id))];
      return { ...baseExecution, stateReads, failures: [] };
    });
    const report = await simulate(simulationClientFor(RPC_URL, 1), {
      transactions: [TRANSACTION],
      limits: {
        operations: [
          {
            type: "vaultV2Deposit",
            vault: TARGET,
            assetPaid: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            quote: { assetsPaid: 1n, sharesMinted: 1n },
          },
        ],
      },
    });
    expect(report.ok).toBe(false);
    if (report.ok) throw new Error("Expected collected failures");
    const emptyReads = report.failures.flatMap((failure) =>
      failure instanceof SlippageCheckUnavailableError &&
      failure.reason === "emptyData"
        ? [failure.field]
        : [],
    );
    expect(readIds.length).toBeGreaterThan(0);
    expect(emptyReads).toEqual(readIds);
  });

  test.each(["count", "undecodable", "failed"] as const)(
    "error: unexpected approval alongside %s data",
    async (kind) => {
      const { methods } = stubFetch([], "0x6000", 1);
      mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
        const baseExecution = execution(plan, stateBlock);
        const stateReads = plan.calls.flatMap((planned) =>
          planned.type === "stateRead"
            ? [
                {
                  phase: planned.phase,
                  read: planned.read,
                  returnData: encodeUint256(0n),
                },
              ]
            : [],
        );
        const failed = stateReads[0]!;
        const calls = baseExecution.calls.map((call) => ({
          ...call,
          result: {
            ...call.result,
            logs: [
              {
                address: TARGET,
                topics: encodeEventTopics({
                  abi: erc20Abi,
                  eventName: "Approval",
                  args: { owner: OWNER, spender: TARGET },
                }) as readonly Hex[],
                data: encodeUint256(1n),
              },
            ],
          },
        }));
        return {
          ...baseExecution,
          calls: kind === "count" ? [...calls, ...calls] : calls,
          stateReads:
            kind === "failed"
              ? stateReads.filter((read) => read !== failed)
              : stateReads.map((read) =>
                  read === failed
                    ? { ...read, returnData: "0x12" as Hex }
                    : read,
                ),
          failures:
            kind === "failed"
              ? [
                  new SlippageCheckUnavailableError("planned read failed", {
                    field: failed.read.id,
                    reason: "missingRead",
                  }),
                ]
              : [],
        };
      });
      const error = await simulateOrThrow(simulationClientFor(RPC_URL, 1), {
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              assetPaid: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            },
          ],
        },
      }).catch((cause: unknown) => cause);
      if (kind === "count") {
        expect(error).toBeInstanceOf(InvalidSimulationResponseError);
      } else {
        expect(error).toBeInstanceOf(AggregateError);
        const failures: unknown[] = (error as AggregateError).errors;
        expect(failures).toContainEqual(
          expect.any(UnexpectedTokenApprovalError),
        );
        expect(failures).toContainEqual(
          expect.any(
            kind === "undecodable"
              ? InvalidSimulationResponseError
              : SlippageCheckUnavailableError,
          ),
        );
        if (kind === "failed") {
          const readFailures = failures.filter(
            (finding: unknown) =>
              finding instanceof SlippageCheckUnavailableError &&
              finding.reason === "missingRead",
          );
          expect(readFailures).toHaveLength(1);
        }
      }
      expect(methods).not.toContain("eth_chainId");
    },
  );

  test.each([
    { chainId: CHAIN_ID, omitAssertionLogs: false },
    { chainId: 1, omitAssertionLogs: true },
  ])(
    "behavior: final permits work on chain $chainId with omitted assertion logs $omitAssertionLogs",
    async ({ chainId, omitAssertionLogs }) => {
      stubFetch([], "0x6000", chainId);
      mockExecutePlan.mockImplementationOnce(
        executeWithMissingLogs("assertion", [
          {
            address: TARGET,
            topics: encodeEventTopics({
              abi: erc20Abi,
              eventName: "Approval",
              args: { owner: OWNER, spender: TARGET },
            }) as readonly Hex[],
            data: encodeAbiParameters([{ type: "uint256" }], [1n]),
          },
        ]),
      );
      const result = await simulateOrThrow(
        simulationClientFor(RPC_URL, chainId),
        {
          mode: "final",
          limits: "none",
          authorizations: [
            {
              ...PERMIT,
              typedData: {
                ...PERMIT.typedData,
                domain: { ...PERMIT.typedData.domain, chainId },
              },
            },
          ],
          transactions: [
            {
              ...TRANSACTION,
              assertBefore: omitAssertionLogs
                ? [{ to: TARGET, data: "0x12345678", check: () => undefined }]
                : [],
            },
          ],
        },
      );
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]?.logs).toHaveLength(1);
      const plan = mockExecutePlan.mock.calls[0]?.[0].plan;
      expect(
        plan?.calls.filter((call) => call.type === "assertion"),
      ).toHaveLength(omitAssertionLogs ? 1 : 0);
    },
  );

  test("error: final signature-use checks require transaction logs with limits none", async () => {
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(
      executeWithMissingLogs("transaction"),
    );
    await expect(
      simulateOrThrow(simulationClientFor(RPC_URL, 1), {
        limits: "none",
        authorizations: [PERMIT],
        transactions: [TRANSACTION],
      }),
    ).rejects.toMatchObject({
      code: "APPROVAL_CHECK_UNAVAILABLE",
      message: expect.stringContaining("omitted user-transaction logs"),
    });
  });

  test("behavior: final unsigned descriptors do not require transaction logs", async () => {
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(
      executeWithMissingLogs("transaction"),
    );
    await expect(
      simulateOrThrow(simulationClientFor(RPC_URL, 1), {
        limits: "none",
        authorizations: [
          {
            type: "erc20Approval",
            token: TARGET,
            owner: OWNER,
            spender: TARGET,
            amount: 1n,
          },
        ],
        transactions: [TRANSACTION],
      }),
    ).resolves.toBeDefined();
  });

  test("error: truncated user calls fail before final signature-use checks", async () => {
    stubFetch([], "0x6000", 1);
    userCallCount = 0;
    await expect(
      simulateOrThrow(simulationClientFor(RPC_URL, 1), {
        limits: "none",
        authorizations: [PERMIT],
        transactions: [TRANSACTION],
      }),
    ).rejects.toBeInstanceOf(InvalidSimulationResponseError);
  });

  test("behavior: final permits bypass pending approval policy with real limits", async () => {
    stubFetch([], "0x6000", 1);
    await expect(
      simulateOrThrow(simulationClientFor(RPC_URL, 1), {
        authorizations: [PERMIT],
        transactions: [TRANSACTION],
        limits: {
          operations: [
            {
              type: "vaultV2Deposit",
              vault: TARGET,
              assetPaid: TARGET,
              quote: { assetsPaid: 1n, sharesMinted: 1n },
            },
          ],
          approvals: [],
        },
      }).catch(firstFailure),
    ).resolves.toBeInstanceOf(UnusedAuthorizationError);
    expect(mockExecutePlan).toHaveBeenCalledOnce();
  });

  test("error: final Blue signatures need registered Morpho addresses", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulateOrThrow(config, {
        limits: "none",
        transactions: [TRANSACTION],
        authorizations: [
          {
            type: "blueAuthorizationSignature",
            typedData: {
              domain: { chainId: CHAIN_ID, verifyingContract: TARGET },
              primaryType: "Authorization",
              types: {
                Authorization: [
                  { name: "authorizer", type: "address" },
                  { name: "authorized", type: "address" },
                  { name: "isAuthorized", type: "bool" },
                  { name: "nonce", type: "uint256" },
                  { name: "deadline", type: "uint256" },
                ],
              },
              message: {
                authorizer: OWNER,
                authorized: TARGET,
                isAuthorized: true,
                nonce: 0n,
                deadline: 2_000_000_000n,
              },
            },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each(["ecrecoverAuthorizer", "midnight"] as const)(
    "error: Midnight authorization signatures require a registered %s address",
    async (missingAddress) => {
      const { fetch } = stubFetch([]);
      const registeredAddresses = getChainAddresses(ChainId.BaseMainnet);
      const addresses = {
        ...registeredAddresses,
        [missingAddress]: undefined,
      };
      const authorization: MidnightAuthorizationSignature = {
        type: "midnightAuthorizationSignature",
        typedData: {
          domain: {
            chainId: ChainId.BaseMainnet,
            verifyingContract: registeredAddresses.ecrecoverAuthorizer!,
          },
          primaryType: "Authorization",
          types: {
            Authorization: [
              { name: "authorizer", type: "address" },
              { name: "authorized", type: "address" },
              { name: "isAuthorized", type: "bool" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          message: {
            authorizer: OWNER,
            authorized: TARGET,
            isAuthorized: true,
            nonce: 0n,
            deadline: 2_000_000_000n,
          },
        },
      };
      const getChainAddressesSpy = vi
        .spyOn(blueSdk, "getChainAddresses")
        .mockReturnValueOnce(addresses);
      try {
        await expect(
          simulateOrThrow(simulationClientFor(RPC_URL, ChainId.BaseMainnet), {
            transactions: [TRANSACTION],
            limits: "none",
            authorizations: [authorization],
          }),
        ).rejects.toBeInstanceOf(UnsupportedChainError);
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        getChainAddressesSpy.mockRestore();
      }
    },
  );

  test.each([
    "erc20",
    "native",
    "deposit",
    "withdrawal",
    "malformed",
    "four-topic",
    "approval",
    "empty",
  ] as const)("preview preparation transfer guard: %s", async (kind) => {
    stubFetch([]);
    const addresses = getChainAddresses(ChainId.BaseMainnet);
    const transfers = kind !== "approval" && kind !== "empty";
    const log =
      kind === "deposit" || kind === "withdrawal"
        ? {
            address: addresses.wNative!,
            topics: encodeEventTopics({
              abi: parseAbi([
                "event Deposit(address indexed account, uint256 amount)",
                "event Withdrawal(address indexed account, uint256 amount)",
              ]),
              eventName: kind === "deposit" ? "Deposit" : "Withdrawal",
              args: { account: OWNER },
            }),
            data: encodeAbiParameters([{ type: "uint256" }], [400n]),
          }
        : {
            address: kind === "native" ? ethAddress : TARGET,
            topics: encodeEventTopics({
              abi: erc20Abi,
              eventName: kind === "approval" ? "Approval" : "Transfer",
              args:
                kind === "approval"
                  ? { owner: OWNER, spender: TARGET }
                  : { from: OWNER, to: TARGET },
            }),
            data: encodeAbiParameters([{ type: "uint256" }], [400n]),
          };
    mockExecutePlan.mockImplementation(async ({ plan, stateBlock }) => {
      const baseExecution = execution(plan, stateBlock);
      const planned = plan.calls.find((call) => call.type === "preparation")!;
      return {
        ...baseExecution,
        calls: [
          {
            planned,
            result: {
              status: true,
              gasUsed: 21_000n,
              returnData: "0x",
              logs:
                kind === "empty"
                  ? []
                  : [
                      {
                        ...log,
                        topics: [
                          ...log.topics.filter(
                            (topic): topic is Hex => typeof topic === "string",
                          ),
                          ...(kind === "four-topic"
                            ? [numberToHex(400n, { size: 32 })]
                            : []),
                        ],
                        data: kind === "malformed" ? "0x" : log.data,
                      },
                    ],
            },
            logsMissing: false,
          },
          ...baseExecution.calls,
        ],
      };
    });
    const result = simulateOrThrow(
      simulationClientFor(RPC_URL, ChainId.BaseMainnet),
      {
        mode: "preview",
        limits: "none",
        authorizations: [
          {
            type: "erc20Approval",
            owner: OWNER,
            token: TARGET,
            spender: TARGET,
            amount: 1n,
          },
        ],
        transactions: [TRANSACTION],
      },
    );
    if (transfers) {
      await expect(result).rejects.toBeInstanceOf(SimulationValidationError);
      await expect(result).rejects.toMatchObject({
        message:
          'Preview authorization "0" preparation call "0" emitted asset transfers. Simulate the authorization as a transaction in final mode to check its asset flows.',
      });
    } else {
      const output = await result;
      expect(output.transfers).toEqual([]);
      expect(output.calls).toHaveLength(1);
      expect(output.verification.authorizations).toHaveLength(1);
    }
  });

  test.each([
    { label: "owner sends ETH", value: 1n, from: OWNER, guard: true },
    { label: "owner sends no ETH", value: 0n, from: OWNER, guard: false },
    { label: "other sender sends ETH", value: 1n, from: TARGET, guard: false },
  ])(
    "behavior: native value sent wiring — $label",
    async ({ value, from, guard }) => {
      const addresses = getChainAddresses(ChainId.BaseMainnet)!;
      const mockClient = createMockClient(base);
      const midnightMarket = {
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
      };
      mockRead(mockClient, {
        address: addresses.midnight!,
        abi: midnightAbi,
        functionName: "toMarket",
        result: midnightMarket,
      });
      const { fetch } = stubFetch(
        [],
        "0x6000",
        ChainId.BaseMainnet,
        mockClient,
      );
      const request = {
        transactions: [{ ...TRANSACTION, from, value }],
        limits: {
          operations: [
            {
              type: "midnightRepayWithdrawCollateral" as const,
              marketId: MidnightMarketUtils.toId(midnightMarket),
              quote: {
                collateralWithdrawals: [{ collateralIndex: 0n, assets: 1n }],
              },
            },
          ],
        },
      };
      const simulationConfig = simulationClientFor(
        RPC_URL,
        ChainId.BaseMainnet,
      );
      const error =
        from === TARGET
          ? await runOrThrow({
              client: simulationConfig,
              options: {},
              request: {
                ...parseRequest(
                  {
                    ...request,
                    transactions: [{ ...TRANSACTION, value: 0n }],
                  },
                  ChainId.BaseMainnet,
                ),
                transactions: [
                  { ...TRANSACTION, value: 0n },
                  { ...TRANSACTION, from: TARGET, value: 1n },
                ],
              },
            }).catch((cause: unknown) => cause)
          : await simulateOrThrow(simulationConfig, request).catch(
              (cause: unknown) => cause,
            );
      if (guard) {
        expect(error).toBeInstanceOf(SimulationValidationError);
        expect(error).toMatchObject({
          fieldErrors: [
            expect.stringContaining(
              "limits.operations[0].quote.collateralWithdrawals:",
            ),
          ],
        });
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

  test.each([false, true])(
    "behavior: combined wNative pull cap and self-call allowance (%s)",
    async (selfCall) => {
      const selfValue = selfCall ? 1n : 0n;
      userCallCount = 3;
      const addresses = getChainAddresses(ChainId.BaseMainnet)!;
      const mockClient = createMockClient(base);
      const midnightMarket = {
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
      };
      mockRead(mockClient, {
        address: addresses.midnight!,
        abi: midnightAbi,
        functionName: "toMarket",
        result: midnightMarket,
      });
      let walletDelta = selfCall ? 10n : -1n;
      let nativeLogs: readonly RawLog[] = [];
      mockExecutePlan.mockImplementation(async ({ plan, stateBlock }) => {
        const executed = execution(plan, stateBlock);
        return {
          ...executed,
          calls: executed.calls.map((call, index) => ({
            ...call,
            result: { ...call.result, logs: index === 0 ? nativeLogs : [] },
          })),
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
        };
      });
      const { fetch } = stubFetch(
        [],
        "0x6000",
        ChainId.BaseMainnet,
        mockClient,
      );
      const simulationConfig = simulationClientFor(
        RPC_URL,
        ChainId.BaseMainnet,
      );
      const request = {
        transactions: [
          { ...TRANSACTION, from: OWNER, value: 1n },
          { ...TRANSACTION, from: OWNER, value: 2n },
          {
            ...TRANSACTION,
            from: selfCall ? OWNER : TARGET,
            to: selfCall ? OWNER : TARGET,
            value: selfCall ? selfValue : 10n,
          },
        ],
        limits: {
          operations: [
            {
              type: "midnightSupplyCollateralTakeBorrow" as const,
              marketId: MidnightMarketUtils.toId(midnightMarket),
              quote: {
                collateralSupplies: [{ collateralIndex: 0n, assets: 5n }],
                unitsSold: 10n,
                assetsReceived: 1n,
              },
            },
          ],
        },
      };
      const parsedRequest = parseRequest(
        {
          ...request,
          transactions: request.transactions.map((transaction) => ({
            ...transaction,
            from: OWNER,
          })),
        },
        ChainId.BaseMainnet,
      );
      const run = () =>
        runOrThrow({
          client: simulationConfig,
          options: {},
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
      if (selfCall) {
        nativeLogs = [
          {
            address: ethAddress,
            topics: [TRANSFER_TOPIC, padAddress(OWNER), padAddress(TARGET)],
            data: encodeUint256(4n),
          },
        ];
        const report = await runSimulation({
          client: simulationConfig,
          options: {},
          request: {
            ...parsedRequest,
            transactions: request.transactions,
          },
        });
        expect(report).toMatchObject({
          ok: true,
          warnings: [
            expect.objectContaining({
              code: "UNEXPECTED_TOKEN_TRANSFER",
              token: ethAddress,
              sender: OWNER,
            }),
          ],
        });
      } else {
        walletDelta = -3n;
        await expect(run()).rejects.toBeInstanceOf(ConsumerLimitViolationError);
      }
      expect(fetch).toHaveBeenCalled();
    },
  );

  test("error: limits on an unregistered chain use UnsupportedChainError", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulateOrThrow(config, {
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
      simulateOrThrow(config, {
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
      simulateOrThrow(config, {
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

  test.each([
    "midnightSupplyCollateral",
    "midnightSupplyCollateralMakeBorrow",
  ] as const)(
    "error: %s on a chain without a Midnight address",
    async (type) => {
      const { fetch } = stubFetch([]);
      await expect(
        simulateOrThrow(simulationClientFor(RPC_URL, ChainId.OptimismMainnet), {
          transactions: [TRANSACTION],
          limits: {
            operations: [
              {
                type,
                marketId: `0x${"11".repeat(32)}` as MarketId,
                collateralIndex: 0n,
                quote: { assetsPaid: 1n, collateralSupplied: 1n },
              },
            ],
          },
        }),
      ).rejects.toBeInstanceOf(UnsupportedChainError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("error: midnightRedeem on a chain without a Midnight address", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulateOrThrow(simulationClientFor(RPC_URL, ChainId.OptimismMainnet), {
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
      }),
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
        simulateOrThrow(simulationClientFor(RPC_URL, ChainId.OptimismMainnet), {
          transactions: [TRANSACTION],
          limits: { operations: [operation] },
        }),
      ).rejects.toBeInstanceOf(UnsupportedChainError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("error: preview authorizations on an unregistered chain require Morpho addresses", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulateOrThrow(config, {
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
    const result = await simulateOrThrow(config, {
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

  test("error: approval checks fail closed when an execution call omits logs", async () => {
    const mainnetConfig = simulationClientFor(RPC_URL, 1);
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(
      executeWithMissingLogs("transaction"),
    );

    const error = await simulateOrThrow(mainnetConfig, {
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
    }).catch(firstFailure);
    expect(error).toBeInstanceOf(ApprovalCheckUnavailableError);
    expect(error).toMatchObject({
      message: `Simulation response omitted logs for transaction 0; approval checks cannot run. Retry with an RPC that returns eth_simulateV1 logs.`,
    });
  });

  test("error: omitted logs with assertLogs report the log check and the approval check", async () => {
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(
      executeWithMissingLogs("transaction"),
    );

    const report = await simulate(simulationClientFor(RPC_URL, 1), {
      transactions: [
        { ...TRANSACTION, assertLogs: [{ check: () => "not run" }] },
      ],
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
    expect(!report.ok && report.failures.slice(0, 2)).toEqual([
      expect.any(InvalidSimulationResponseError),
      expect.any(ApprovalCheckUnavailableError),
    ]);
  });

  test("error: approval checks fail closed when a preparation call omits logs", async () => {
    const mainnetConfig = simulationClientFor(RPC_URL, 1);
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(
      executeWithMissingLogs("preparation"),
    );

    const error = await simulateOrThrow(mainnetConfig, {
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
      limits: {
        operations: [
          {
            type: "vaultV2Deposit",
            vault: TARGET,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
        ],
        approvals: [
          { type: "token", token: TARGET, owner: OWNER, spender: TARGET },
        ],
      },
    }).catch(firstFailure);
    expect(error).toBeInstanceOf(ApprovalCheckUnavailableError);
    expect(error).toMatchObject({
      message: expect.stringContaining("authorization 0"),
    });
  });

  test.each([true, false])(
    "missing refund logs skip retention only with reported approval failure (limits: %s)",
    async (withLimits) => {
      const bundles = getChainAddresses(1).bundles!.vaultBundlesV1!;
      stubFetch([], "0x6000", 1);
      userCallCount = 2;
      mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
        const result = execution(plan, stateBlock);
        return {
          ...result,
          calls: result.calls.map((call, index) => ({
            ...call,
            logsMissing: index === 1,
            result: {
              ...call.result,
              logs:
                index === 0
                  ? [
                      {
                        address: TARGET,
                        topics: [
                          TRANSFER_TOPIC,
                          padAddress(OWNER),
                          padAddress(bundles),
                        ],
                        data: encodeUint256(1_000_000n),
                      },
                    ]
                  : [],
            },
          })),
        };
      });
      const error = await simulateOrThrow(simulationClientFor(RPC_URL, 1), {
        transactions: [TRANSACTION, { ...TRANSACTION, to: bundles }],
        limits: withLimits
          ? {
              operations: [
                {
                  type: "vaultV2Deposit",
                  vault: TARGET,
                  quote: { assetsPaid: 1n, sharesMinted: 1n },
                  slippageTolerance: 0n,
                },
              ],
            }
          : "none",
      }).catch((cause: unknown) => cause);
      const failures: unknown[] =
        error instanceof AggregateError ? error.errors : [error];
      expect(failures[0]).toBeInstanceOf(
        withLimits ? ApprovalCheckUnavailableError : BlacklistViolationError,
      );
      expect(
        failures.filter(
          (failure) => failure instanceof BlacklistViolationError,
        ),
      ).toHaveLength(withLimits ? 0 : 1);
    },
  );

  test.each(["signedPermit", "assertLogs"] as const)(
    "behavior: missing refund logs reported by %s skip retention when limits are none",
    async (reporter) => {
      const bundles = getChainAddresses(1).bundles!.vaultBundlesV1!;
      stubFetch([], "0x6000", 1);
      userCallCount = 2;
      mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
        const result = execution(plan, stateBlock);
        return {
          ...result,
          // Mirrors `evaluateCalls`, which reports logs an `assertLogs` check needs.
          failures:
            reporter === "assertLogs"
              ? [new InvalidSimulationResponseError("omitted logs")]
              : [],
          calls: result.calls.map((call, index) => ({
            ...call,
            logsMissing: index === 1,
            result: {
              ...call.result,
              logs:
                index === 0
                  ? [
                      {
                        address: TARGET,
                        topics: [
                          TRANSFER_TOPIC,
                          padAddress(OWNER),
                          padAddress(bundles),
                        ],
                        data: encodeUint256(1_000_000n),
                      },
                    ]
                  : [],
            },
          })),
        };
      });
      const refund = { ...TRANSACTION, to: bundles };
      const report = await simulate(simulationClientFor(RPC_URL, 1), {
        limits: "none",
        ...(reporter === "signedPermit"
          ? { authorizations: [PERMIT], transactions: [TRANSACTION, refund] }
          : {
              transactions: [
                TRANSACTION,
                { ...refund, assertLogs: [{ check: () => "not run" }] },
              ],
            }),
      });
      expect(report.ok).toBe(false);
      if (report.ok) return;
      expect(report).not.toHaveProperty("verification");
      expect(report.failures).toEqual([
        expect.any(
          reporter === "signedPermit"
            ? ApprovalCheckUnavailableError
            : InvalidSimulationResponseError,
        ),
      ]);
    },
  );

  test("behavior: a preparation missing its logs still runs retention", async () => {
    const bundles = getChainAddresses(1).bundles!.vaultBundlesV1!;
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(
      executeWithMissingLogs("preparation", [
        {
          address: TARGET,
          topics: [TRANSFER_TOPIC, padAddress(OWNER), padAddress(bundles)],
          data: encodeUint256(1_000_000n),
        },
      ]),
    );
    const error = await simulateOrThrow(simulationClientFor(RPC_URL, 1), {
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
      limits: {
        operations: [
          {
            type: "vaultV2Deposit",
            vault: TARGET,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
        ],
        approvals: [
          { type: "token", token: TARGET, owner: OWNER, spender: TARGET },
        ],
      },
    }).catch((cause: unknown) => cause);
    const failures: unknown[] =
      error instanceof AggregateError ? error.errors : [error];
    expect(failures[0]).toBeInstanceOf(ApprovalCheckUnavailableError);
    expect(
      failures.filter((failure) => failure instanceof BlacklistViolationError),
    ).toHaveLength(1);
  });

  test("behavior: missing transaction logs skip the slippage checks", async () => {
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
      const result = execution(plan, stateBlock);
      return {
        ...result,
        calls: result.calls.map((call) => ({ ...call, logsMissing: true })),
      };
    });
    const report = await simulate(simulationClientFor(RPC_URL, 1), {
      transactions: [TRANSACTION],
      limits: {
        operations: [
          {
            type: "vaultV2Withdraw",
            vault: TARGET,
            quote: { assetsReceived: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
        ],
      },
    });
    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toBeInstanceOf(ApprovalCheckUnavailableError);
  });

  test("behavior: missing transaction logs are reported once in final mode with a signed permit", async () => {
    stubFetch([], "0x6000", 1);
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
      const result = execution(plan, stateBlock);
      return {
        ...result,
        calls: result.calls.map((call) => ({ ...call, logsMissing: true })),
      };
    });
    const report = await simulate(simulationClientFor(RPC_URL, 1), {
      authorizations: [PERMIT],
      transactions: [TRANSACTION],
      limits: {
        operations: [
          {
            type: "vaultV2Withdraw",
            vault: TARGET,
            quote: { assetsReceived: 1n, sharesBurned: 1n },
            slippageTolerance: 0n,
          },
        ],
        approvals: [
          { type: "token", token: TARGET, owner: OWNER, spender: TARGET },
        ],
      },
    });
    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toBeInstanceOf(ApprovalCheckUnavailableError);
  });

  test.each([undefined, 0, 1])(
    "behavior: retention coverage distinguishes explicit empty logs from omitted user logs (%s)",
    async (missingIndex) => {
      const mainnetConfig = simulationClientFor(RPC_URL, 1);
      stubFetch([], "0x6000", 1);
      mockExecutePlan.mockImplementationOnce(
        executeWithMissingLogs(missingIndex),
      );

      const report = await simulate(mainnetConfig, {
        limits: "none",
        transactions: [TRANSACTION, TRANSACTION],
      });
      expect(report.ok).toBe(true);
      expect(report.warnings).toEqual([]);
      if (missingIndex === undefined)
        expect(report.verification).toEqual({ retention: "checked" });
      else expect(report).not.toHaveProperty("verification");
      if (report.ok) {
        expect(report.result.verification.limits).toBe("none");
        expect(report.result.calls.map((call) => call.logs)).toEqual([[], []]);
      }
    },
  );

  test.each([false, true])(
    "behavior: discarded transfer logs omit retention coverage while preserving remaining findings (%s)",
    async (retained) => {
      stubFetch([], "0x6000", 1);
      const bundles = getChainAddresses(1).bundles!.vaultBundlesV1!;
      mockExecutePlan.mockImplementationOnce(
        executeWithMissingLogs(undefined, [
          {
            address: TARGET,
            topics: [TRANSFER_TOPIC, padAddress(OWNER), padAddress(TARGET)],
          },
          ...(retained
            ? [
                {
                  address: TARGET,
                  topics: [
                    TRANSFER_TOPIC,
                    padAddress(OWNER),
                    padAddress(bundles),
                  ] as const,
                  data: encodeUint256(101n),
                },
              ]
            : []),
        ]),
      );
      const report = await simulate(simulationClientFor(RPC_URL, 1), {
        limits: "none",
        transactions: [TRANSACTION],
      });
      expect(report.ok).toBe(!retained);
      expect(report).not.toHaveProperty("verification");
      expect(report.warnings).toMatchObject([
        {
          code: "MALFORMED_TRANSFER_LOG",
          severity: "warn",
          chainId: 1,
          address: TARGET,
          data: "0x",
          txIdx: 0,
        },
      ]);
      if (report.ok) expect(report.result.transfers).toEqual([]);
      else
        expect(report.failures).toEqual([expect.any(BlacklistViolationError)]);
    },
  );

  test.each([
    { topicCount: 1, emptyData: false },
    { topicCount: 2, emptyData: false },
    { topicCount: 4, emptyData: true },
    { topicCount: 4, emptyData: false, missingData: "omitted" },
    { topicCount: 4, emptyData: false, missingData: "undefined" },
    { topicCount: 4, emptyData: false },
    { topicCount: 5, emptyData: false },
  ])(
    "behavior: Transfer with $topicCount topics, empty data $emptyData and missing data $missingData distinguishes malformed evidence from ERC-721",
    async ({ topicCount, emptyData, missingData }) => {
      stubFetch([], "0x6000", 1);
      let data: Hex | undefined = emptyData ? "0x" : encodeUint256(1n);
      if (missingData !== undefined) data = undefined;
      mockExecutePlan.mockImplementationOnce(
        executeWithMissingLogs(undefined, [
          {
            address: TARGET,
            topics: (
              [
                TRANSFER_TOPIC,
                padAddress(OWNER),
                padAddress(TARGET),
                encodeUint256(1n),
                encodeUint256(2n),
              ] as const
            ).slice(0, topicCount),
            ...(missingData === "omitted" ? {} : { data }),
          },
        ]),
      );
      const report = await simulate(simulationClientFor(RPC_URL, 1), {
        limits: "none",
        transactions: [TRANSACTION],
      });
      expect(report.ok).toBe(true);
      if (topicCount === 4 && emptyData) {
        expect(report.warnings).toEqual([]);
        expect(report.verification).toEqual({ retention: "checked" });
      } else {
        expect(report.warnings).toMatchObject([
          {
            code: "MALFORMED_TRANSFER_LOG",
            severity: "warn",
            chainId: 1,
            address: TARGET,
            reason: "ERC20 Transfer: bad topic/data length",
          },
        ]);
        expect(report).not.toHaveProperty("verification");
      }
      if (report.ok) expect(report.result.transfers).toEqual([]);
    },
  );

  test("behavior: deduplicates a mirror wrapper on a registered chain outside the no-mirror map", async () => {
    const amount = 1_000n;
    const addresses = getChainAddresses(ChainId.ScrollMainnet)!;
    const token = addresses.wNative!;
    const logs: RawLog[] = [
      {
        address: token,
        topics: [WITHDRAWAL_TOPIC, padAddress(OWNER)],
        data: encodeUint256(amount),
      },
      {
        address: token,
        topics: [TRANSFER_TOPIC, padAddress(OWNER), padAddress(zeroAddress)],
        data: encodeUint256(amount),
      },
    ];
    const mockClient = createMockClient(base);
    stubFetch([], "0x6000", ChainId.ScrollMainnet, mockClient);
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
      const result = execution(plan, stateBlock);
      return {
        ...result,
        calls: result.calls.map((call, index) =>
          index === 0 ? { ...call, result: { ...call.result, logs } } : call,
        ),
      };
    });

    const result = await simulateOrThrow(
      simulationClientFor(RPC_URL, ChainId.ScrollMainnet),
      {
        limits: "none",
        transactions: [TRANSACTION],
      },
    );

    expect(result.transfers).toEqual([
      {
        token,
        from: OWNER,
        to: zeroAddress,
        amount,
        txIdx: 0,
      },
    ]);
    expect(result.assetChanges).toContainEqual({
      account: OWNER,
      changes: [{ token, diff: -amount }],
    });
  });

  test("behavior: no-mirror wrapper entries match registered wNative addresses", () => {
    for (const [chainId, wrapperAddress] of NO_WNATIVE_MIRROR_WRAPPERS) {
      const wNative = getChainAddresses(chainId as ChainId)?.wNative;
      expect(wNative).toBeDefined();
      if (wNative === undefined) continue;
      expect(isAddressEqual(wNative, wrapperAddress)).toBe(true);
    }
  });

  test("behavior: keeps a Withdrawal and zero-address Transfer on Base", async () => {
    const amount = 1_000n;
    const token = getChainAddresses(ChainId.BaseMainnet)!.wNative!;
    expect(token).toBe("0x4200000000000000000000000000000000000006");
    const logs: RawLog[] = [
      {
        address: token,
        topics: [WITHDRAWAL_TOPIC, padAddress(OWNER)],
        data: encodeUint256(amount),
      },
      {
        address: token,
        topics: [TRANSFER_TOPIC, padAddress(OWNER), padAddress(zeroAddress)],
        data: encodeUint256(amount),
      },
    ];
    const mockClient = createMockClient(base);
    stubFetch([], "0x6000", ChainId.BaseMainnet, mockClient);
    mockExecutePlan.mockImplementationOnce(async ({ plan, stateBlock }) => {
      const result = execution(plan, stateBlock);
      return {
        ...result,
        calls: result.calls.map((call, index) =>
          index === 0 ? { ...call, result: { ...call.result, logs } } : call,
        ),
      };
    });

    const result = await simulateOrThrow(
      simulationClientFor(RPC_URL, ChainId.BaseMainnet),
      {
        limits: "none",
        transactions: [TRANSACTION],
      },
    );

    expect(result.transfers).toEqual([
      {
        token,
        from: OWNER,
        to: zeroAddress,
        amount,
        txIdx: 0,
      },
      {
        token,
        from: OWNER,
        to: zeroAddress,
        amount,
        txIdx: 0,
      },
    ]);
    expect(result.assetChanges).toContainEqual({
      account: OWNER,
      changes: [{ token, diff: -2n * amount }],
    });
  });

  test("error: Blue parking requires registered protocol addresses", async () => {
    const { fetch } = stubFetch([]);
    await expect(
      simulateOrThrow(config, {
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
        simulateOrThrow(simulationClientFor(RPC_URL, ChainId.BaseMainnet), {
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
        simulateOrThrow(simulationClientFor(RPC_URL, ChainId.BaseMainnet), {
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
    } finally {
      getChainAddressesSpy.mockRestore();
    }
  });

  test("behavior: a configured block gas limit is forwarded to execution", async () => {
    stubFetch([]);
    await simulateOrThrow(
      simulationClientFor(RPC_URL, CHAIN_ID),
      { limits: "none", transactions: [TRANSACTION] },
      { blockOverrides: { gasLimit: 16_777_216n } },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].blockGasLimit).toBe(16_777_216n);
  });

  test("behavior: a configured call gas limit is forwarded to execution", async () => {
    stubFetch([]);
    await simulateOrThrow(
      simulationClientFor(RPC_URL, CHAIN_ID),
      { limits: "none", transactions: [TRANSACTION] },
      { callGasLimit: 30_000_000n },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].callGasLimit).toBe(30_000_000n);
  });

  test("behavior: Stable turns the parentHash check off by default", async () => {
    stubFetch([]);
    await simulateOrThrow(simulationClientFor(RPC_URL, ChainId.StableMainnet), {
      limits: "none",
      transactions: [TRANSACTION],
    });
    expect(mockExecutePlan.mock.calls[0]?.[0].parentHashCheck).toBe(false);
  });

  test("behavior: a configured parentHashCheck overrides the chain default", async () => {
    stubFetch([]);
    await simulateOrThrow(
      simulationClientFor(RPC_URL, ChainId.StableMainnet),
      {
        limits: "none",
        transactions: [TRANSACTION],
      },
      { parentHashCheck: true },
    );
    expect(mockExecutePlan.mock.calls[0]?.[0].parentHashCheck).toBe(true);

    stubFetch([]);
    await simulateOrThrow(
      simulationClientFor(RPC_URL, CHAIN_ID),
      { limits: "none", transactions: [TRANSACTION] },
      { parentHashCheck: false },
    );
    expect(mockExecutePlan.mock.calls[1]?.[0].parentHashCheck).toBe(false);
  });

  test("behavior: Monad pins to the finalized block and sends validation: true", async () => {
    const { fetch } = stubFetch([]);
    await simulateOrThrow(simulationClientFor(RPC_URL, ChainId.MonadMainnet), {
      limits: "none",
      transactions: [TRANSACTION],
    });
    expect(pinnedBlockParam(fetch)).toBe("finalized");
    expect(mockExecutePlan.mock.calls[0]?.[0].validation).toBe(true);
  });

  test("behavior: Monad keeps an explicit blockNumber", async () => {
    const { fetch } = stubFetch([]);
    await simulateOrThrow(simulationClientFor(RPC_URL, ChainId.MonadMainnet), {
      limits: "none",
      transactions: [TRANSACTION],
      blockNumber: STATE_BLOCK,
    });
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
    const result = await simulateOrThrow(config, {
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
        if (method === "eth_getCode") return rpc("0x6000");
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
    const result = await simulateOrThrow(config, {
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
    const error = await simulateOrThrow(config, {
      limits: "none",
      transactions: [TRANSACTION],
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(RpcTransportError);
    expect((error as Error).message).not.toContain(RPC_URL);
  });

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
    const error = await simulateOrThrow(simulationClientFor(RPC_URL, 1), {
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
    }).catch(firstFailure);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(plannedReadId);
  });

  test("error: a user-call count mismatch is an invalid response", async () => {
    const { methods } = stubFetch([]);
    userCallCount = 0;
    const error = await simulateOrThrow(config, {
      limits: "none",
      transactions: [TRANSACTION],
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(InvalidSimulationResponseError);
    expect(methods).toEqual(["eth_getBlockByNumber", "eth_getCode"]);
  });

  test("error: a code-less calldata target fails before eth_simulateV1", async () => {
    const { methods } = stubFetch([], "0x");
    const error = await simulateOrThrow(config, {
      limits: "none",
      transactions: [TRANSACTION],
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(methods).not.toContain("eth_simulateV1");
  });

  test("[INV-08] behavior: a code-less target on a wrong-chain endpoint reports SimulationValidationError without eth_chainId", async () => {
    const { methods } = stubFetch([], "0x", 8453);
    const report = await simulate(config, {
      limits: "none",
      transactions: [TRANSACTION],
    });
    expect(report.ok).toBe(false);
    expect(!report.ok && report.failures).toEqual([
      expect.any(SimulationValidationError),
    ]);
    expect(methods).not.toContain("eth_simulateV1");
    expect(methods).not.toContain("eth_chainId");
    expect(Object.isFrozen(report)).toBe(true);
  });

  test("error: a code-less target on the right chain keeps SimulationValidationError", async () => {
    const { methods } = stubFetch([], "0x", CHAIN_ID);
    await expect(
      simulateOrThrow(config, {
        limits: "none",
        transactions: [TRANSACTION],
      }),
    ).rejects.toBeInstanceOf(SimulationValidationError);
    expect(methods).not.toContain("eth_simulateV1");
  });
});

describe.sequential("client CCIP-Read", () => {
  test("[INV-09] behavior: a default viem client never fetches an OffchainLookup gateway and is not changed", async () => {
    const gateway = "https://gateway.example.com/";
    const revertData = encodeErrorResult({
      abi: [offchainLookupAbiItem],
      errorName: "OffchainLookup",
      args: [
        TRANSACTION.to,
        [`${gateway}{sender}/{data}`],
        "0x1234",
        "0x12345678",
        "0x",
      ],
    });
    const methods: string[] = [];
    const fetchMock = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).startsWith(gateway))
        return Response.json({ data: "0x" });
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      methods.push(method);
      if (method === "eth_getCode") return rpc("0x6000");
      if (method === "eth_getBlockByNumber")
        return rpc({
          number: numberToHex(STATE_BLOCK),
          hash: STATE_BLOCK_HASH,
          timestamp: numberToHex(STATE_BLOCK_TIMESTAMP),
        });
      if (method === "eth_call")
        return Response.json({
          jsonrpc: "2.0",
          id: 0,
          error: { code: 3, message: "execution reverted", data: revertData },
        });
      throw new Error(`Unexpected RPC method ${method}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = simulationClientFor(RPC_URL, 1);

    const report = await simulate(client, {
      transactions: [TRANSACTION],
      limits: {
        operations: [
          {
            type: "vaultV2Deposit",
            vault: TRANSACTION.to,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
          },
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(methods).toContain("eth_call");
    expect(methods).not.toContain("eth_simulateV1");
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith(gateway),
      ),
    ).toEqual([]);
    expect(client.ccipRead).toBeUndefined();
  });
});

describe.sequential("client transport", () => {
  test("behavior: a fallback transport with retries still runs to an ok report", async () => {
    stubFetch([]);
    const client = createPublicClient({
      chain: config.chain,
      transport: fallback([http(RPC_URL, { retryCount: 3 })], {
        retryCount: 3,
      }),
    });

    const report = await simulate(client, {
      transactions: [TRANSACTION],
      limits: "none",
    });

    expect(report.ok).toBe(true);
  });
});

describe.sequential("timeoutMs", () => {
  test("preserves an empty warnings list on an early failure", async () => {
    const report = await simulate(
      simulationClientFor(RPC_URL, 1),
      { transactions: [TRANSACTION], limits: "none" },
      { timeoutMs: 0 },
    );
    expect(report.warnings).toEqual([]);
    expect(Object.isFrozen(report.warnings)).toBe(true);
    expect(report).not.toHaveProperty("verification");
    if (!report.ok)
      expect(report.failures).toEqual([expect.any(SimulationValidationError)]);
    else expect.fail("invalid timeout must fail");
  });
  test("error: RpcTransportError once the deadline passes, with no later read started", async () => {
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        const { method } = JSON.parse(String(init?.body)) as {
          method: string;
        };
        methods.push(method);
        return new Promise<Response>(() => {});
      }),
    );
    const client = simulationClientFor(RPC_URL, CHAIN_ID);

    const report = await simulate(
      client,
      { transactions: [TRANSACTION], limits: "none" },
      { timeoutMs: 20 },
    );

    expect(!report.ok && report.failures).toEqual([
      expect.any(RpcTransportError),
    ]);
    expect(methods).toEqual(["eth_getBlockByNumber"]);
  });

  test("error: a late vault asset response never starts the next metadata read", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(controller.signal);
    const reached = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    const { fetch, methods } = stubFetch([]);
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation((input, init) => {
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      if (method !== "eth_call") return original(input, init);
      methods.push(method);
      reached.resolve();
      return response.promise;
    });
    try {
      const pending = simulate(simulationClientFor(RPC_URL, 1), {
        transactions: [TRANSACTION],
        limits: {
          operations: [TARGET, OWNER].map((vault) => ({
            type: "vaultV2Deposit" as const,
            vault,
            quote: { assetsPaid: 1n, sharesMinted: 1n },
          })),
        },
      });
      await reached.promise;
      controller.abort(new DOMException("Deadline exceeded", "TimeoutError"));
      const report = await pending;
      expect(!report.ok && report.failures).toEqual([
        expect.any(RpcTransportError),
      ]);
      response.resolve(
        rpc(encodeAbiParameters([{ type: "address" }], [TARGET])),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(methods.filter((method) => method === "eth_call")).toHaveLength(1);
      expect(methods).not.toContain("eth_simulateV1");
    } finally {
      response.resolve(rpc("0x"));
      timeout.mockRestore();
    }
  });
});

describe.sequential("simulate options", () => {
  test.each([
    { timeoutMs: -1 },
    { timeoutMs: 1.5 },
    { timeoutMs: Number.NaN },
    { simulateV1Url: RPC_URL },
  ])(
    "error: SimulationValidationError report for %o, with no RPC request",
    async (options) => {
      const fetchFn = vi.fn<typeof globalThis.fetch>();
      vi.stubGlobal("fetch", fetchFn);
      const client = simulationClientFor(RPC_URL, CHAIN_ID);

      const report = await simulate(
        client,
        { transactions: [TRANSACTION], limits: "none" },
        options as SimulationOptions,
      );

      expect(!report.ok && report.failures).toEqual([
        expect.any(SimulationValidationError),
      ]);
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );
});
