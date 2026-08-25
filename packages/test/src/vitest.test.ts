import { setTimeout } from "node:timers/promises";
import { mainnet } from "viem/chains";
import { afterAll, describe, expect, vi } from "vitest";
import type { AnvilTestClient } from "./client.js";

const { createAnvilTestClientMock, spawnAnvilMock } = vi.hoisted(() => ({
  createAnvilTestClientMock: vi.fn(),
  spawnAnvilMock: vi.fn(),
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

import { AnvilProcessError } from "./errors.js";
import { createViemTest } from "./vitest.js";

let activeProcesses = 0;
let peakActiveProcesses = 0;
let spawnedProcesses = 0;
let retryBodies = 0;
let retryProcesses = 0;
const retryForkBlockNumber = 1n;
const fakeClient = {
  account: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  getCode: vi.fn().mockResolvedValue(undefined),
  setBlockTimestampInterval: vi.fn().mockResolvedValue(undefined),
} as unknown as AnvilTestClient<typeof mainnet>;

createAnvilTestClientMock.mockReturnValue(fakeClient);
spawnAnvilMock.mockImplementation(async (parameters) => {
  if (parameters.forkBlockNumber === retryForkBlockNumber) {
    const attempt = ++retryProcesses;
    return {
      rpcUrl: `http://localhost:${32_000 + attempt}` as const,
      stop: () => true,
      stopAndWait: async () => {
        if (attempt === 1)
          throw new AnvilProcessError("Anvil exited unexpectedly");
        return true;
      },
    };
  }

  activeProcesses += 1;
  peakActiveProcesses = Math.max(peakActiveProcesses, activeProcesses);
  spawnedProcesses += 1;
  let stopped = false;

  const stop = () => {
    if (stopped) return false;
    stopped = true;
    activeProcesses -= 1;
    return true;
  };

  return {
    rpcUrl: `http://localhost:${31_000 + spawnedProcesses}` as const,
    stop,
    stopAndWait: async () => stop(),
  };
});

const viemTest = createViemTest(mainnet, {
  forkUrl: "https://rpc.example",
});
const extendedViemTest = viemTest.extend<{ readonly label: string }>({
  label: "extended",
});
const retryViemTest = createViemTest(mainnet, {
  forkBlockNumber: retryForkBlockNumber,
  forkUrl: "https://rpc.example",
});

describe("createViemTest", () => {
  viemTest(
    "behavior: provisions the first concurrent case independently",
    { concurrent: true },
    async ({ client }) => {
      expect(client).toBe(fakeClient);
      await setTimeout(50);
    },
  );

  viemTest(
    "behavior: provisions the next concurrent case independently",
    { concurrent: true },
    async ({ client }) => {
      expect(client).toBe(fakeClient);
      await setTimeout(25);
    },
  );

  extendedViemTest(
    "behavior: provisions an extended API case independently",
    { concurrent: true },
    async ({ client, label }) => {
      expect(client).toBe(fakeClient);
      expect(label).toBe("extended");
      await setTimeout(25);
    },
  );

  extendedViemTest(
    "behavior: provisions the next extended case independently",
    { concurrent: true },
    async ({ client, label }) => {
      expect(client).toBe(fakeClient);
      expect(label).toBe("extended");
      await setTimeout(25);
    },
  );

  retryViemTest(
    "behavior: retries with a fresh Anvil after an unexpected exit",
    { retry: 1 },
    async ({ client }) => {
      retryBodies += 1;
      expect(client).toBe(fakeClient);
    },
  );

  afterAll(() => {
    expect(spawnedProcesses).toBe(4);
    expect(retryProcesses).toBe(2);
    expect(retryBodies).toBe(2);
    expect(peakActiveProcesses).toBe(4);
    expect(activeProcesses).toBe(0);
  });
});
