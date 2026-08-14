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

import { createViemTest } from "./vitest.js";

let activeProcesses = 0;
let peakActiveProcesses = 0;
let spawnedProcesses = 0;
const fakeClient = {
  account: { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  getCode: vi.fn().mockResolvedValue(undefined),
  setBlockTimestampInterval: vi.fn().mockResolvedValue(undefined),
} as unknown as AnvilTestClient<typeof mainnet>;

createAnvilTestClientMock.mockReturnValue(fakeClient);
spawnAnvilMock.mockImplementation(async () => {
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

describe("createViemTest", () => {
  viemTest(
    "behavior: queues the first case before fixture setup",
    async ({ client }) => {
      expect(client).toBe(fakeClient);
      await setTimeout(50);
    },
  );

  viemTest(
    "behavior: queues the next case before fixture setup",
    async ({ client }) => {
      expect(client).toBe(fakeClient);
      await setTimeout(25);
    },
  );

  extendedViemTest(
    "behavior: keeps an extended API sequential",
    async ({ client, label }) => {
      expect(client).toBe(fakeClient);
      expect(label).toBe("extended");
      await setTimeout(25);
    },
  );

  extendedViemTest(
    "behavior: keeps the next extended case sequential",
    async ({ client, label }) => {
      expect(client).toBe(fakeClient);
      expect(label).toBe("extended");
      await setTimeout(25);
    },
  );

  afterAll(() => {
    expect(spawnAnvilMock).toHaveBeenCalledTimes(4);
    expect(peakActiveProcesses).toBe(1);
    expect(activeProcesses).toBe(0);
  });
});
