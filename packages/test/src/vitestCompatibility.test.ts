import {
  type Chain,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  maxUint128,
  numberToHex,
} from "viem";
import { mainnet, tempo } from "viem/chains";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AnvilTestClient } from "./client.js";

const testState = vi.hoisted(() => ({
  afterAllHandlers: [] as (() => unknown | Promise<unknown>)[],
  afterAllMock: vi.fn(),
  clientFixture: undefined as unknown,
  createAnvilTestClientMock: vi.fn(),
  finishedHandlers: [] as (() => unknown | Promise<unknown>)[],
  onTestFinishedMock: vi.fn(),
  spawnAnvilMock: vi.fn(),
  testExtendMock: vi.fn(),
}));

vi.mock("vitest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vitest")>();
  testState.testExtendMock.mockImplementation((fixtures) => {
    const clientFixture = (
      fixtures as {
        client: (
          context: Readonly<Record<string, unknown>>,
          use: (client: unknown) => Promise<void>,
        ) => Promise<void>;
      }
    ).client;
    testState.clientFixture = async (
      context: Readonly<Record<string, unknown>>,
      use: (client: unknown) => Promise<void>,
    ) => {
      const finished = testState.finishedHandlers;
      await clientFixture(
        {
          task: { id: "test-task", result: { state: "run" } },
          ...context,
          onTestFinished: (handler: () => unknown | Promise<unknown>) =>
            finished.push(handler),
        },
        use,
      );
      if (context.skipFinishedHooks === true) return;
      for (const handler of finished.reverse()) await handler();
    };
    return actual.test;
  });

  return {
    ...actual,
    afterAll: testState.afterAllMock.mockImplementation(
      (handler: () => unknown | Promise<unknown>) =>
        testState.afterAllHandlers.push(handler),
    ),
    onTestFinished: testState.onTestFinishedMock.mockImplementation(() => {
      throw new Error("The module-global onTestFinished hook was used.");
    }),
    test: new Proxy(actual.test, {
      // biome-ignore lint/complexity/useMaxParams: required Proxy handler signature
      get(target, property, receiver) {
        if (property === "extend") return testState.testExtendMock;
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});
vi.mock("./anvil.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./anvil.js")>();
  return { ...actual, spawnAnvil: testState.spawnAnvilMock };
});
vi.mock("./client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client.js")>();
  return {
    ...actual,
    createAnvilTestClient: testState.createAnvilTestClientMock,
  };
});

import {
  AnvilCleanupError,
  AnvilFeeTokenFundingError,
  AnvilProcessError,
  AnvilStartupError,
} from "./errors.js";
import { createViemTest } from "./vitest.js";

type VitestClientFixture<chain extends Chain = typeof mainnet> = (
  context: Readonly<Record<string, unknown>> & {
    readonly signal?: AbortSignal | undefined;
  },
  use: (client: AnvilTestClient<chain>) => Promise<void>,
) => Promise<void>;

const originalCi = process.env.CI;
const accountAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const feeToken = "0x20C0000000000000000000000000000000000000";
const stopAndWaitMock = vi.fn(async () => true);
const setBlockTimestampIntervalMock = vi.fn().mockResolvedValue(undefined);
const setStorageAtMock = vi.fn().mockResolvedValue(undefined);
const readContractMock = vi.fn().mockResolvedValue(maxUint128);
const getCodeMock = vi.fn().mockResolvedValue(undefined);
const signAuthorizationMock = vi.fn();
const sendTransactionMock = vi.fn();
const fakeClient = {
  account: { address: accountAddress },
  getCode: getCodeMock,
  readContract: readContractMock,
  sendTransaction: sendTransactionMock,
  setStorageAt: setStorageAtMock,
  setBlockTimestampInterval: setBlockTimestampIntervalMock,
  signAuthorization: signAuthorizationMock,
} as unknown as AnvilTestClient<typeof mainnet>;

// These tests intentionally share captured fixture and module mocks.
describe.sequential("createViemTest compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCodeMock.mockReset();
    readContractMock.mockReset();
    process.env.CI = "true";
    testState.afterAllHandlers.length = 0;
    testState.finishedHandlers.length = 0;
    testState.clientFixture = undefined;
    testState.createAnvilTestClientMock.mockReturnValue(fakeClient);
    setBlockTimestampIntervalMock.mockResolvedValue(undefined);
    setStorageAtMock.mockResolvedValue(undefined);
    readContractMock.mockResolvedValue(maxUint128);
    getCodeMock.mockResolvedValue(undefined);
    stopAndWaitMock.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalCi === undefined) delete process.env.CI;
    else process.env.CI = originalCi;
  });

  test("default", async () => {
    const parameters = {
      forkUrl: "https://rpc.example",
      stepsTracing: false,
    } as const;
    const originalParameters = { ...parameters };
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });

    createViemTest(mainnet, parameters);
    const clientFixture = testState.clientFixture as VitestClientFixture;
    await clientFixture({}, async (client) => {
      expect(client).toBe(fakeClient);
    });

    expect(parameters).toEqual(originalParameters);
    expect(testState.afterAllMock).toHaveBeenCalledWith(
      expect.any(Function),
      Number.POSITIVE_INFINITY,
    );
    expect(testState.spawnAnvilMock).toHaveBeenCalledWith(
      {
        ...originalParameters,
        autoImpersonate: true,
        blockBaseFeePerGas: 0n,
        forkChainId: mainnet.id,
        forkRetryBackoff: 500,
        gasPrice: 0n,
        order: "fifo",
        pruneHistory: true,
        retries: 10,
      },
      { signal: undefined },
    );
  });

  test("behavior: funds Tempo's pathUSD fee token before fixture use", async () => {
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(tempo, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture<
      typeof tempo
    >;
    await clientFixture({}, async (client) => {
      expect(client).toBe(fakeClient);
    });

    const index = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [accountAddress, 9n],
      ),
    );
    expect(setStorageAtMock).toHaveBeenCalledOnce();
    expect(setStorageAtMock).toHaveBeenCalledWith({
      address: feeToken,
      index,
      value: numberToHex(maxUint128, { size: 32 }),
    });
    expect(readContractMock).toHaveBeenCalledOnce();
    expect(readContractMock).toHaveBeenCalledWith({
      address: feeToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });
  });

  test("error: rejects when Tempo fee-token funding does not take", async () => {
    process.env.CI = "";
    readContractMock.mockResolvedValueOnce(6n);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(tempo, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture<
      typeof tempo
    >;
    const fixture = clientFixture({}, async () => {});
    const failure = fixture.catch((caught: unknown) => caught);

    await expect(fixture).rejects.toBeInstanceOf(AnvilFeeTokenFundingError);
    const error = await failure;
    if (!(error instanceof AnvilFeeTokenFundingError)) throw error;
    expect(error.message).toContain('"6"');
    expect(error.message).toContain(`"${maxUint128}"`);
    expect(setStorageAtMock).toHaveBeenCalledOnce();
    expect(readContractMock).toHaveBeenCalledOnce();
    expect(stopAndWaitMock).toHaveBeenCalledOnce();
    expect(getCodeMock).not.toHaveBeenCalled();
    expect(signAuthorizationMock).not.toHaveBeenCalled();
    expect(sendTransactionMock).not.toHaveBeenCalled();
  });

  test("behavior: skips Tempo fee-token funding on mainnet", async () => {
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    await clientFixture({}, async (client) => {
      expect(client).toBe(fakeClient);
    });

    expect(setStorageAtMock).not.toHaveBeenCalled();
    expect(readContractMock).not.toHaveBeenCalled();
  });

  test("behavior: retries without a Vitest context signal", async () => {
    testState.spawnAnvilMock
      .mockRejectedValueOnce(new AnvilStartupError("temporary failure"))
      .mockResolvedValueOnce({
        rpcUrl: "http://localhost:31001",
        stop: vi.fn(),
        stopAndWait: stopAndWaitMock,
      });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    await clientFixture({}, async (client) => {
      expect(client).toBe(fakeClient);
    });

    expect(testState.spawnAnvilMock).toHaveBeenCalledTimes(2);
    expect(stopAndWaitMock).toHaveBeenCalledOnce();
  });

  test("behavior: retries setup after Anvil exits during initialization", async () => {
    const setupError = new Error("temporary setup failure");
    const processError = new AnvilProcessError("Anvil exited");
    setBlockTimestampIntervalMock
      .mockRejectedValueOnce(setupError)
      .mockResolvedValueOnce(undefined);
    stopAndWaitMock
      .mockRejectedValueOnce(processError)
      .mockResolvedValueOnce(true);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    const useMock = vi.fn(async (client) => {
      expect(client).toBe(fakeClient);
    });
    await clientFixture({}, useMock);

    expect(testState.spawnAnvilMock).toHaveBeenCalledTimes(2);
    expect(setBlockTimestampIntervalMock).toHaveBeenCalledTimes(2);
    expect(stopAndWaitMock).toHaveBeenCalledTimes(2);
    expect(useMock).toHaveBeenCalledOnce();
  });

  test("error: AnvilCleanupError is not retried", async () => {
    const cleanupError = new AnvilCleanupError("cleanup failed");
    testState.spawnAnvilMock.mockRejectedValue(cleanupError);
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    await expect(clientFixture({}, async () => {})).rejects.toBe(cleanupError);
    expect(testState.spawnAnvilMock).toHaveBeenCalledOnce();
  });

  test("error: preserves setup failure when retry is cancelled", async () => {
    const setupError = new AnvilStartupError("temporary failure");
    const abortReason = new Error("test timed out");
    const controller = new AbortController();
    testState.spawnAnvilMock.mockRejectedValueOnce(setupError);
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    const fixture = clientFixture(
      { signal: controller.signal },
      async () => {},
    );
    await vi.waitFor(() =>
      expect(testState.spawnAnvilMock).toHaveBeenCalledOnce(),
    );
    controller.abort(abortReason);
    const error = await fixture.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnvilStartupError);
    if (!(error instanceof AnvilStartupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors[0]).toBe(setupError);
    expect(error.cause.errors[1]).toMatchObject({ cause: abortReason });
  });

  test("error: preserves a lone use failure", async () => {
    const useError = new Error("use failed");
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    await expect(
      clientFixture({}, async () => {
        throw useError;
      }),
    ).rejects.toBe(useError);
    expect(stopAndWaitMock).toHaveBeenCalledOnce();
  });

  test("error: preserves a lone cleanup failure", async () => {
    const cleanupError = new AnvilProcessError("Anvil exited");
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    await expect(clientFixture({}, async () => {})).rejects.toBe(cleanupError);
    expect(stopAndWaitMock).toHaveBeenCalledOnce();

    const fileCleanup = testState.afterAllHandlers[0];
    if (fileCleanup === undefined) throw new Error("Missing afterAll handler");
    await expect(Promise.resolve().then(fileCleanup)).resolves.toBeUndefined();
  });

  test("error: file teardown preserves cleanup hidden by a finished hook", async () => {
    const cleanupError = new AnvilProcessError("Anvil exited");
    const finishedError = new Error("user finished hook failed");
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    const error = await clientFixture({}, async () => {
      testState.finishedHandlers.push(() => {
        throw finishedError;
      });
    }).catch((caught: unknown) => caught);
    expect(error).toBe(finishedError);

    const fileCleanup = testState.afterAllHandlers[0];
    if (fileCleanup === undefined) throw new Error("Missing afterAll handler");
    const teardownError = await Promise.resolve()
      .then(fileCleanup)
      .catch((caught: unknown) => caught);
    expect(teardownError).toBeInstanceOf(AnvilCleanupError);
    if (!(teardownError instanceof AnvilCleanupError)) throw teardownError;
    expect(teardownError.cause).toBeInstanceOf(AggregateError);
    if (!(teardownError.cause instanceof AggregateError))
      throw teardownError.cause;
    expect(teardownError.cause.errors).toEqual([cleanupError]);
  });

  test("behavior: successful retry discards cleanup hidden by a finished hook", async () => {
    const cleanupError = new AnvilProcessError("Anvil exited");
    const finishedError = new Error("user finished hook failed");
    const task = {
      id: "retrying-test",
      result: { retryCount: 0, state: "pass" },
    };
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    const firstAttemptError = await clientFixture({ task }, async () => {
      testState.finishedHandlers.push(() => {
        throw finishedError;
      });
    }).catch((caught: unknown) => caught);
    expect(firstAttemptError).toBe(finishedError);

    testState.finishedHandlers.length = 0;
    task.result.retryCount = 1;
    await expect(
      clientFixture({ task }, async () => {}),
    ).resolves.toBeUndefined();

    const fileCleanup = testState.afterAllHandlers[0];
    if (fileCleanup === undefined) throw new Error("Missing afterAll handler");
    await expect(fileCleanup()).resolves.toBeUndefined();
  });

  test("error: reports dynamic-skip cleanup failure from file teardown", async () => {
    const cleanupError = new AnvilCleanupError("cleanup failed");
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    await clientFixture(
      {
        skipFinishedHooks: true,
        task: { result: { pending: true, state: "run" } },
      },
      async () => {},
    );

    const fileCleanup = testState.afterAllHandlers[0];
    if (fileCleanup === undefined) throw new Error("Missing afterAll handler");
    const error = await Promise.resolve()
      .then(fileCleanup)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors).toEqual([cleanupError]);
  });

  test("behavior: file teardown cleans a fixture whose teardown was skipped", async () => {
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    const fixture = clientFixture({}, () => new Promise<void>(() => {}));
    await vi.waitFor(() =>
      expect(setBlockTimestampIntervalMock).toHaveBeenCalledOnce(),
    );

    const fileCleanup = testState.afterAllHandlers[0];
    if (fileCleanup === undefined) throw new Error("Missing afterAll handler");
    await expect(fileCleanup()).resolves.toBeUndefined();
    expect(stopAndWaitMock).toHaveBeenCalledOnce();
    void fixture;
  });

  test("error: preserves use and cleanup failures together", async () => {
    const useError = new Error("use failed");
    const cleanupError = new AnvilCleanupError("cleanup failed");
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    const error = await clientFixture({}, async () => {
      throw useError;
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors).toEqual([useError, cleanupError]);
  });

  test("error: preserves setup and cleanup failures together", async () => {
    const setupError = new Error("setup failed");
    const cleanupError = new AnvilCleanupError("cleanup failed");
    setBlockTimestampIntervalMock.mockRejectedValueOnce(setupError);
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    testState.spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
    createViemTest(mainnet, { forkUrl: "https://rpc.example" });

    const clientFixture = testState.clientFixture as VitestClientFixture;
    const error = await clientFixture({}, async () => {}).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors).toEqual([setupError, cleanupError]);
  });
});
