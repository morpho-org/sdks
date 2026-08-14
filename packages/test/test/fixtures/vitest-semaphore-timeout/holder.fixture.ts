import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { createViemTest } from "../../../src/vitest.js";

const coordinationDirectory =
  process.env.MORPHO_TEST_SEMAPHORE_COORDINATION_DIRECTORY!;
const test = createViemTest(mainnet, {
  forkBlockNumber: 0,
  forkUrl: process.env.MORPHO_TEST_SEMAPHORE_RPC_URL,
  stepsTracing: false,
});

test("holder keeps the shared slot past the waiter timeout", async ({
  client,
}) => {
  const activePath = join(coordinationDirectory, "holder.active");
  await writeFile(activePath, `${process.pid}\n`);
  try {
    expect(await client.getChainId()).toBe(mainnet.id);
    await setTimeout(750);
  } finally {
    await rm(activePath, { force: true });
  }
  await writeFile(join(coordinationDirectory, "holder.done"), "released\n");
});
