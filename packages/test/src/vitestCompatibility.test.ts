import { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AnvilTestClient } from "./client.js";

const testState = vi.hoisted(() => ({
  clientFixture: undefined as unknown,
  createAnvilTestClientMock: vi.fn(),
  spawnAnvilMock: vi.fn(),
  testExtendMock: vi.fn(),
}));

vi.mock("vitest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vitest")>();
  testState.testExtendMock.mockImplementation((fixtures) => {
    testState.clientFixture = (fixtures as { client: unknown }).client;
    return actual.test;
  });

  return {
    ...actual,
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
  AnvilProcessError,
  AnvilStartupError,
} from "./errors.js";
import { createViemTest } from "./vitest.js";

type VitestClientFixture = (
  context: { readonly signal?: AbortSignal | undefined },
  use: (client: AnvilTestClient<typeof mainnet>) => Promise<void>,
) => Promise<void>;

const originalCi = process.env.CI;
const stopAndWaitMock = vi.fn(async () => true);
const setBlockTimestampIntervalMock = vi.fn().mockResolvedValue(undefined);
const fakeClient = {
  account: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  getCode: vi.fn().mockResolvedValue(undefined),
  setBlockTimestampInterval: setBlockTimestampIntervalMock,
} as unknown as AnvilTestClient<typeof mainnet>;

// These tests intentionally share captured fixture and module mocks.
describe.sequential("createViemTest compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CI = "true";
    testState.clientFixture = undefined;
    testState.createAnvilTestClientMock.mockReturnValue(fakeClient);
    setBlockTimestampIntervalMock.mockResolvedValue(undefined);
    stopAndWaitMock.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalCi === undefined) delete process.env.CI;
    else process.env.CI = originalCi;
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
