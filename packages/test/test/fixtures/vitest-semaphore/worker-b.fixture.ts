import { open, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { createViemTest } from "../../../src/vitest.js";

const coordinationDirectory =
  process.env.MORPHO_TEST_SEMAPHORE_COORDINATION_DIRECTORY!;
await writeFile(
  join(coordinationDirectory, "worker-b.ready"),
  `${process.pid}\n`,
);

const test = createViemTest(mainnet, {
  forkBlockNumber: 0,
  forkUrl: process.env.MORPHO_TEST_SEMAPHORE_RPC_URL,
  stepsTracing: false,
});

test("worker B acquires the released shared slot", async ({ client }) => {
  const activePath = join(coordinationDirectory, "active.lock");
  const activeHandle = await open(activePath, "wx");
  try {
    const readyDeadline = Date.now() + 5_000;
    while (
      (await readdir(coordinationDirectory)).filter((path) =>
        path.endsWith(".ready"),
      ).length < 2
    ) {
      if (Date.now() >= readyDeadline)
        throw new Error("The second Vitest worker did not start in time.");
      await setTimeout(25);
    }

    expect(await client.getChainId()).toBe(mainnet.id);
    await setTimeout(300);
  } finally {
    await activeHandle.close();
    await rm(activePath);
  }

  await writeFile(join(coordinationDirectory, "worker-b.done"), "acquired\n");
});
