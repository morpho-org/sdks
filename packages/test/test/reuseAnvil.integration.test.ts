import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getErpcForkUrl, MAINNET_FORK_BLOCK } from "@morpho-org/test";
import {
  type Address,
  type Hash,
  parseEther,
  TransactionReceiptNotFoundError,
} from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, type TestContext } from "vitest";
import { AnvilLeaseClosedError } from "../src/errors.js";
import { createViemTest } from "../src/vitest.js";

const test = createViemTest(
  mainnet,
  {
    forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
    forkBlockNumber: MAINNET_FORK_BLOCK,
  },
  { reuseAnvil: true },
);

/** Process ids of the Anvil processes this Vitest worker has spawned. */
const anvilPids = () => {
  try {
    return execFileSync("pgrep", ["-P", String(process.pid), "-x", "anvil"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .map(Number);
  } catch {
    return [];
  }
};

/**
 * Each step continues the previous steps' process, and concurrent steps wait for each other,
 * so a step skips when a filter left out one it depends on.
 */
const skipWithoutNeededSteps = ({ task, skip }: TestContext) => {
  const steps = task.suite?.tasks ?? [];
  const leftOut = steps
    .slice(0, task.concurrent ? steps.length : steps.indexOf(task))
    .some(
      (step) =>
        step.type === "test" &&
        (step.mode === "skip" || step.mode === "todo") &&
        // A step that skipped itself while running still ran its part.
        !(
          step.result !== undefined &&
          "pending" in step.result &&
          step.result.pending === true
        ),
    );
  if (leftOut) {
    skip(
      "This step needs other steps of its describe block. Run the whole block.",
    );
  }
};

const recipient: Address = "0x000000000000000000000000000000000000dEaD";
const slot = `0x${"00".repeat(31)}01` as const;

// A retry would run on the process the failed attempt retired, so it could pass on a reused one.
describe.sequential("createViemTest reuseAnvil", { retry: 0 }, () => {
  beforeEach(skipWithoutNeededSteps);
  let pids: number[] = [];
  let baseline:
    | {
        readonly balance: bigint;
        readonly blockNumber: bigint;
        readonly nonce: number;
        readonly storage: `0x${string}` | undefined;
        readonly timestamp: bigint;
      }
    | undefined;
  let minedHash: Hash | undefined;
  let unminedHash: Hash | undefined;
  let overlapPids: number[] | undefined;
  let lateAccesses: Promise<PromiseSettledResult<unknown>[]> | undefined;

  test("records a fresh process before mutating its state", async ({
    client,
  }) => {
    pids = anvilPids();
    expect(pids).toHaveLength(1);

    const block = await client.getBlock();
    baseline = {
      balance: await client.getBalance({ address: recipient }),
      blockNumber: block.number,
      nonce: await client.getTransactionCount({
        address: client.account.address,
      }),
      storage: await client.getStorageAt({ address: recipient, slot }),
      timestamp: block.timestamp,
    };

    minedHash = await client.sendTransaction({
      to: recipient,
      value: parseEther("1"),
    });
    await client.setBalance({ address: recipient, value: 1n });
    await client.setCode({ address: recipient, bytecode: "0x60006000f3" });
    await client.setStorageAt({ address: recipient, index: slot, value: slot });
    await client.mine({ blocks: 5 });
    await client.increaseTime({ seconds: 1_000 });
    await client.setNextBlockTimestamp({
      timestamp: block.timestamp + 10_000n,
    });

    expect(await client.getBlockNumber()).toBeGreaterThan(baseline.blockNumber);

    // A nonce gap keeps this transaction in the pool until the revert. The client's send actions
    // wait for a receipt, so the signed transaction goes straight to the RPC method.
    const nonce = await client.getTransactionCount({
      address: client.account.address,
    });
    const queuedTransaction = await client.signTransaction(
      await client.prepareTransactionRequest({
        to: recipient,
        value: 1n,
        nonce: nonce + 1,
      }),
    );
    await client.request({
      method: "eth_sendRawTransaction",
      params: [queuedTransaction],
    });
    const { pending, queued } = await client.getTxpoolContent();
    expect({ ...pending, ...queued }).not.toEqual({});
  });

  test("reuses the same process from the setup state", async ({ client }) => {
    expect(anvilPids()).toEqual(pids);
    expect(await client.getBlockNumber()).toBe(baseline?.blockNumber);
    expect(await client.getBalance({ address: recipient })).toBe(
      baseline?.balance,
    );
    expect(
      await client.getTransactionCount({ address: client.account.address }),
    ).toBe(baseline?.nonce);
    expect(await client.getCode({ address: recipient })).toBeUndefined();
    expect(await client.getStorageAt({ address: recipient, slot })).toBe(
      baseline?.storage,
    );
    expect(await client.getTxpoolContent()).toEqual({
      pending: {},
      queued: {},
    });
    await expect(
      client.getTransactionReceipt({ hash: minedHash ?? "0x" }),
    ).rejects.toBeInstanceOf(TransactionReceiptNotFoundError);

    await client.mine({ blocks: 1 });
    const { timestamp } = await client.getBlock();
    expect(timestamp).toBe((baseline?.timestamp ?? 0n) + 1n);
  });

  test("leaves a call for after the test ends", async ({ client }) => {
    expect(anvilPids()).toEqual(pids);
    const afterTest = new Promise((resolve) => setTimeout(resolve, 100));
    lateAccesses = Promise.allSettled([
      afterTest.then(() =>
        client.setBalance({ address: recipient, value: 1n }),
      ),
      afterTest.then(() => client.transport.url),
      afterTest.then(() =>
        client.transport.request({ method: "eth_blockNumber" }),
      ),
    ]);
  });

  test("rejects the late call on the next test's process", async ({
    client,
  }) => {
    const rejected = {
      status: "rejected",
      reason: expect.any(AnvilLeaseClosedError),
    };
    expect(await lateAccesses).toEqual([rejected, rejected, rejected]);
    expect(anvilPids()).toEqual(pids);
    expect(await client.getBalance({ address: recipient })).toBe(
      baseline?.balance,
    );
  });

  test("ends while automine may still be mining its transaction", async ({
    client,
  }) => {
    expect(anvilPids()).toEqual(pids);
    // Anvil can return a raw transaction's hash before automine mines its block, so the test ends
    // with the transaction possibly still being mined.
    const transaction = await client.signTransaction(
      await client.prepareTransactionRequest({ to: recipient, value: 1n }),
    );
    unminedHash = await client.request({
      method: "eth_sendRawTransaction",
      params: [transaction],
    });
  });

  test("starts from the setup state after a transaction mined late", async ({
    client,
  }) => {
    const next = anvilPids();
    expect(next).toHaveLength(1);
    if (next[0] === pids[0]) {
      expect(await client.getBlockNumber()).toBe(baseline?.blockNumber);
      expect(
        await client.getTransactionCount({ address: client.account.address }),
      ).toBe(baseline?.nonce);
      expect(await client.getTxpoolContent()).toEqual({
        pending: {},
        queued: {},
      });
      await expect(
        client.getTransactionReceipt({ hash: unminedHash ?? "0x" }),
      ).rejects.toBeInstanceOf(TransactionReceiptNotFoundError);
    }
    pids = next;
  });

  test("changes a setting a revert keeps", async ({ client }) => {
    expect(anvilPids()).toEqual(pids);
    await client.setAutomine(false);
  });

  test("gets a fresh process after a node-wide change", async ({ client }) => {
    const next = anvilPids();
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(pids);
    expect(await client.getAutomine()).toBe(true);
    pids = next;
  });

  test("reads the raw RPC URL", ({ client }) => {
    expect(client.transport.url).toMatch(/^http:\/\//);
  });

  test("gets a fresh process after the URL escaped the lease", ({ client }) => {
    expect(client).toBeDefined();
    const next = anvilPids();
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(pids);
    pids = next;
  });

  test("leaves a request in flight", ({ client }) => {
    void client.mine({ blocks: 10_000 }).catch(() => undefined);
  });

  test("gets a fresh process after an in-flight request", ({ client }) => {
    expect(client).toBeDefined();
    const next = anvilPids();
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(pids);
    pids = next;
  });

  test.fails("fails", ({ client }) => {
    expect(client).toBeDefined();
    throw new Error("Intentional failure.");
  });

  test("gets a fresh process after a failure", ({ client }) => {
    expect(client).toBeDefined();
    const next = anvilPids();
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(pids);
    pids = next;
  });

  test("skips after taking a process", ({ client, skip }) => {
    expect(client).toBeDefined();
    pids = anvilPids();
    expect(pids).toHaveLength(1);
    skip("This step checks a skipped test retires its process.");
  });

  test("gets a fresh process after a skipped test", ({ client }) => {
    expect(client).toBeDefined();
    const next = anvilPids();
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(pids);
    pids = next;
  });

  test("skips from a finished hook after taking a process", ({
    client,
    onTestFinished,
    skip,
  }) => {
    expect(client).toBeDefined();
    pids = anvilPids();
    expect(pids).toHaveLength(1);
    // Finished hooks run after fixture teardown, so this outcome arrives once the process is reset.
    onTestFinished(() =>
      skip("This step checks a finished hook's outcome retires its process."),
    );
  });

  test("gets a fresh process after a finished hook skipped its test", ({
    client,
  }) => {
    expect(client).toBeDefined();
    const next = anvilPids();
    expect(next).toHaveLength(1);
    expect(next).not.toEqual(pids);
    pids = next;
  });

  // CI runs fork tests one at a time, so tests only overlap in local runs.
  describe.skipIf(process.env.CI).concurrent("overlapping tests", () => {
    let arrivals = 0;
    let release: () => void;
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    const overlap = async () => {
      if (++arrivals === 2) release();
      await bothArrived;
      overlapPids = anvilPids();
      return overlapPids;
    };

    test("holds one process", async ({ client }) => {
      expect(await overlap()).toHaveLength(2);
      await client.mine({ blocks: 1 });
    });

    test("holds another process", async ({ client }) => {
      expect(await overlap()).toHaveLength(2);
      await client.mine({ blocks: 1 });
    });
  });

  test("keeps one idle process after overlapping tests", async ({ client }) => {
    const next = anvilPids();
    expect(next).toHaveLength(1);
    // When the overlap ran, this test reuses one of its processes instead of starting a third.
    expect(overlapPids ?? next).toEqual(expect.arrayContaining(next));
    expect(await client.getBlockNumber()).toBe(baseline?.blockNumber);
  });
});

// A retry would run on the process the failed attempt retired, so it could pass on a reused one.
describe.sequential("createViemTest reuseAnvil after its idle process exits", {
  retry: 0,
}, () => {
  beforeEach(skipWithoutNeededSteps);
  const exitTest = createViemTest(
    mainnet,
    {
      forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
      forkBlockNumber: MAINNET_FORK_BLOCK,
    },
    { reuseAnvil: true },
  );
  let others: number[] = [];
  let parked: number | undefined;

  exitTest("records the other suites' processes", () => {
    others = anvilPids();
  });

  exitTest("parks its process", ({ client }) => {
    expect(client).toBeDefined();
    const started = anvilPids().filter((pid) => !others.includes(pid));
    expect(started).toHaveLength(1);
    parked = started[0];
  });

  exitTest("kills the idle process", async () => {
    expect(parked).toBeDefined();
    process.kill(parked ?? 0, "SIGKILL");
    await expect.poll(() => anvilPids().includes(parked ?? 0)).toBe(false);
  });

  exitTest("gets a fresh process", async ({ client }) => {
    expect(await client.getBlockNumber()).toBeGreaterThanOrEqual(
      MAINNET_FORK_BLOCK,
    );
    const started = anvilPids().filter((pid) => !others.includes(pid));
    expect(started).toHaveLength(1);
    expect(started).not.toContain(parked);
  });
});

// Before Pectra the test account has no EIP-7702 code, so setup mines no block and the checkpoint is
// the forked block, whose header gas limit a revert restores instead of the configured one.
const PRE_PECTRA_FORK_BLOCK = 22_000_000n;

/** An empty Anvil state file, which leaves the fork as it is. */
const EMPTY_STATE_FILE = fileURLToPath(
  new URL("./emptyAnvilState.json", import.meta.url),
);

// A retry would run on the process the failed attempt retired, so it could pass on a reused one.
describe.sequential.each([
  { name: "interval mining", config: { blockTime: 1 } },
  // With random accounts, setup cannot pay to clear the test account's EIP-7702 code after Pectra.
  {
    name: "random accounts",
    config: { mnemonicRandom: true, forkBlockNumber: PRE_PECTRA_FORK_BLOCK },
  },
  { name: "a loaded state file", config: { loadState: EMPTY_STATE_FILE } },
])("createViemTest reuseAnvil with $name", { retry: 0 }, ({ config }) => {
  beforeEach(skipWithoutNeededSteps);
  const freshTest = createViemTest(
    mainnet,
    {
      forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
      forkBlockNumber: MAINNET_FORK_BLOCK,
      ...config,
    },
    { reuseAnvil: true },
  );
  let pids: number[] = [];

  freshTest("records its process", ({ client }) => {
    expect(client).toBeDefined();
    pids = anvilPids();
  });

  freshTest("gets a fresh process", ({ client }) => {
    expect(client).toBeDefined();
    const next = anvilPids();
    expect(next).toHaveLength(pids.length);
    expect(next).not.toEqual(pids);
  });
});

describe.sequential("createViemTest reuseAnvil with a custom gas limit", {
  retry: 0,
}, () => {
  beforeEach(skipWithoutNeededSteps);
  const gasLimit = 100_000_000n;
  const gasLimitTest = createViemTest(
    mainnet,
    {
      forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
      forkBlockNumber: PRE_PECTRA_FORK_BLOCK,
      gasLimit,
    },
    { reuseAnvil: true },
  );
  let pids: number[] = [];

  gasLimitTest("mines a block with the custom limit", async ({ client }) => {
    pids = anvilPids();
    const forked = await client.getBlock();
    expect(forked.number).toBe(PRE_PECTRA_FORK_BLOCK);
    expect(forked.gasLimit).not.toBe(gasLimit);
    await client.mine({ blocks: 1 });
    expect((await client.getBlock()).gasLimit).toBe(gasLimit);
  });

  gasLimitTest(
    "keeps the custom limit on the reused process",
    async ({ client }) => {
      expect(anvilPids()).toEqual(pids);
      await client.mine({ blocks: 1 });
      expect((await client.getBlock()).gasLimit).toBe(gasLimit);
    },
  );
});
