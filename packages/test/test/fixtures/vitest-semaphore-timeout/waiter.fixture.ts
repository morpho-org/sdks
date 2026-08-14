import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { mainnet } from "viem/chains";
import { afterAll, beforeAll, expect } from "vitest";
import { createViemTest } from "../../../src/vitest.js";

const coordinationDirectory =
  process.env.MORPHO_TEST_SEMAPHORE_COORDINATION_DIRECTORY!;
const test = createViemTest(mainnet, {
  forkBlockNumber: 0,
  forkUrl: process.env.MORPHO_TEST_SEMAPHORE_RPC_URL,
  stepsTracing: false,
});

beforeAll(async () => {
  const activePath = join(coordinationDirectory, "holder.active");
  const holderDeadline = Date.now() + 5_000;
  while (true) {
    try {
      await access(activePath);
      return;
    } catch (error) {
      if (Date.now() >= holderDeadline) throw error;
      await setTimeout(25);
    }
  }
});

test.fails("waiter is cancelled by its Vitest timeout", async ({ client }) => {
  await writeFile(
    join(coordinationDirectory, "waiter-acquired"),
    `${process.pid}\n`,
  );
  expect(await client.getChainId()).toBe(mainnet.id);
}, 150);

afterAll(async () => {
  await writeFile(join(coordinationDirectory, "waiter.done"), "cancelled\n");
});
