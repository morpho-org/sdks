import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AnvilArgs } from "./anvil.js";
import type { AnvilTestClient } from "./client.js";

const {
  createAnvilTestClientMock,
  expectExtendMock,
  spawnAnvilMock,
  testExtendMock,
} = vi.hoisted(() => ({
  createAnvilTestClientMock: vi.fn(),
  expectExtendMock: vi.fn(() => vi.fn()),
  spawnAnvilMock: vi.fn(),
  testExtendMock: vi.fn(),
}));

vi.mock("@playwright/test", () => ({
  test: {
    expect: { extend: expectExtendMock },
    extend: testExtendMock,
  },
}));
vi.mock("./anvil.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./anvil.js")>();
  return { ...actual, spawnAnvil: spawnAnvilMock };
});
vi.mock("./client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client.js")>();
  return {
    ...actual,
    createAnvilTestClient: createAnvilTestClientMock,
  };
});

import { AnvilCleanupError } from "./errors.js";
import { createViemTest } from "./playwright.js";

type PlaywrightClientFixture = (
  context: Record<string, never>,
  use: (client: AnvilTestClient<typeof mainnet>) => Promise<void>,
) => Promise<void>;

let clientFixture: PlaywrightClientFixture | undefined;
const stopAndWaitMock = vi.fn<() => Promise<boolean>>();
const setBlockTimestampIntervalMock = vi.fn().mockResolvedValue(undefined);
const fakeClient = {
  setBlockTimestampInterval: setBlockTimestampIntervalMock,
} as unknown as AnvilTestClient<typeof mainnet>;

// These tests intentionally share captured fixture and module mocks.
describe.sequential("createViemTest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientFixture = undefined;
    testExtendMock.mockImplementation((fixtures) => {
      clientFixture = (fixtures as { client: PlaywrightClientFixture }).client;
      return {};
    });
    createAnvilTestClientMock.mockReturnValue(fakeClient);
    stopAndWaitMock.mockResolvedValue(true);
    spawnAnvilMock.mockResolvedValue({
      rpcUrl: "http://localhost:31001",
      stop: vi.fn(),
      stopAndWait: stopAndWaitMock,
    });
  });

  test("default", async () => {
    const parameters: AnvilArgs = {
      forkUrl: "https://rpc.example",
      stepsTracing: false,
    };
    const originalParameters = { ...parameters };
    let releaseCleanup = () => {};
    stopAndWaitMock.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        releaseCleanup = () => resolve(true);
      }),
    );

    createViemTest(mainnet, parameters);
    expect(parameters).toEqual(originalParameters);
    expect(clientFixture).toBeDefined();

    let fixtureSettled = false;
    const fixturePromise = clientFixture?.({}, async (client) => {
      expect(client).toBe(fakeClient);
    });
    void fixturePromise?.then(() => {
      fixtureSettled = true;
    });

    await vi.waitFor(() => expect(stopAndWaitMock).toHaveBeenCalledOnce());
    expect(fixtureSettled).toBe(false);
    releaseCleanup();
    await fixturePromise;

    expect(spawnAnvilMock).toHaveBeenCalledWith({
      ...originalParameters,
      autoImpersonate: true,
      blockBaseFeePerGas: 0n,
      forkChainId: mainnet.id,
      gasPrice: 0n,
      order: "fifo",
    });
    expect(setBlockTimestampIntervalMock).toHaveBeenCalledWith({
      interval: 1,
    });
  });

  test("behavior: cleans up after use failure", async () => {
    createViemTest(mainnet);
    const useError = new Error("use failed");

    await expect(
      clientFixture?.({}, async () => {
        throw useError;
      }),
    ).rejects.toBe(useError);
    expect(stopAndWaitMock).toHaveBeenCalledOnce();
  });

  test("behavior: cleans up after setup failure", async () => {
    createViemTest(mainnet);
    const setupError = new Error("setup failed");
    setBlockTimestampIntervalMock.mockRejectedValueOnce(setupError);

    await expect(clientFixture?.({}, async () => {})).rejects.toBe(setupError);
    expect(stopAndWaitMock).toHaveBeenCalledOnce();
  });

  test("error: preserves a lone cleanup failure", async () => {
    const cleanupError = new AnvilCleanupError("cleanup failed");
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    createViemTest(mainnet);

    await expect(clientFixture?.({}, async () => {})).rejects.toBe(
      cleanupError,
    );
    expect(stopAndWaitMock).toHaveBeenCalledOnce();
  });

  test("error: preserves use and cleanup failures together", async () => {
    const useError = new Error("use failed");
    const cleanupError = new AnvilCleanupError("cleanup failed");
    stopAndWaitMock.mockRejectedValueOnce(cleanupError);
    createViemTest(mainnet);

    const error = await clientFixture?.({}, async () => {
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
    createViemTest(mainnet);

    const error = await clientFixture?.({}, async () => {}).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors).toEqual([setupError, cleanupError]);
  });
});
