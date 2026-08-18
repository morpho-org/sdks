import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { anvilSlotLockDirectory } from "../../../src/index.js";
import { createViemTest } from "../../../src/vitest.js";

const coordinationDirectory =
  process.env.MORPHO_TEST_SEMAPHORE_COORDINATION_DIRECTORY!;
const forkUrl = process.env.MORPHO_TEST_SEMAPHORE_RPC_URL!;
const runId = process.env.MORPHO_TEST_ANVIL_RUN_ID!;
const lockDirectory = anvilSlotLockDirectory({ forkUrl, runId });
const test = createViemTest(mainnet, {
  forkBlockNumber: 0,
  forkUrl,
  stepsTracing: false,
});

test("holds Anvil until its worker is killed", async ({ client }) => {
  const childRecord = JSON.parse(
    await readFile(join(lockDirectory, "0.lock", "child"), "utf8"),
  ) as { readonly pid: number };
  await writeFile(
    join(coordinationDirectory, "holder.ready"),
    JSON.stringify({ childPid: childRecord.pid, workerPid: process.pid }),
  );
  expect(await client.getChainId()).toBe(mainnet.id);

  await new Promise<void>(() => {});
});
