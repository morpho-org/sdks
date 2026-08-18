import { execFile, spawn as spawnProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { spawnAnvil } from "../src/anvil.js";

const settleForkTestCleanup = async (
  operations: readonly (Promise<unknown> | undefined)[],
) => {
  const failures: unknown[] = [];
  for (const result of await Promise.allSettled(operations)) {
    if (result.status === "rejected") failures.push(result.reason);
  }
  if (failures.length > 0)
    throw new AggregateError(failures, "Fork test cleanup failed.");
};

describe.sequential("createViemTest cross-worker semaphore", () => {
  test("error: cleanup surfaces every failure", async () => {
    const failures = [
      new Error("first cleanup failed"),
      new Error("second cleanup failed"),
    ];

    const error = await settleForkTestCleanup([
      Promise.reject(failures[0]),
      Promise.reject(failures[1]),
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw error;
    expect(error.errors).toEqual(failures);
  });

  test("behavior: a second worker starts after the shared slot is released", async () => {
    const upstream = await spawnAnvil({ chainId: 1 });
    const coordinationDirectory = await mkdtemp(
      join(tmpdir(), "morpho-test-vite-workers-"),
    );
    const configPath = fileURLToPath(
      new URL("./fixtures/vitest-semaphore/vitest.config.ts", import.meta.url),
    );
    const vitestPath = fileURLToPath(
      new URL("../../../node_modules/vitest/vitest.mjs", import.meta.url),
    );

    try {
      await promisify(execFile)(
        process.execPath,
        [vitestPath, "run", "--config", configPath],
        {
          cwd: dirname(configPath),
          env: {
            ...process.env,
            MORPHO_TEST_ANVIL_RUN_ID: `cross-worker-${process.pid}-${Date.now()}`,
            MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC: "1",
            MORPHO_TEST_SEMAPHORE_COORDINATION_DIRECTORY: coordinationDirectory,
            MORPHO_TEST_SEMAPHORE_RPC_URL: upstream.rpcUrl,
            NO_COLOR: "1",
          },
          timeout: 60_000,
        },
      );

      const workerPids = await Promise.all([
        readFile(join(coordinationDirectory, "worker-a.ready"), "utf8"),
        readFile(join(coordinationDirectory, "worker-b.ready"), "utf8"),
      ]);
      expect(new Set(workerPids).size).toBe(2);
      await expect(
        Promise.all([
          readFile(join(coordinationDirectory, "worker-a.done"), "utf8"),
          readFile(join(coordinationDirectory, "worker-b.done"), "utf8"),
        ]),
      ).resolves.toEqual(["acquired\n", "acquired\n"]);
    } finally {
      await settleForkTestCleanup([
        upstream.stopAndWait(),
        rm(coordinationDirectory, { recursive: true, force: true }),
      ]);
    }
  });

  test("behavior: a timed-out worker cancels its slot waiter", async () => {
    const upstream = await spawnAnvil({ chainId: 1 });
    const coordinationDirectory = await mkdtemp(
      join(tmpdir(), "morpho-test-vite-timeout-"),
    );
    const configPath = fileURLToPath(
      new URL(
        "./fixtures/vitest-semaphore-timeout/vitest.config.ts",
        import.meta.url,
      ),
    );
    const vitestPath = fileURLToPath(
      new URL("../../../node_modules/vitest/vitest.mjs", import.meta.url),
    );

    try {
      await promisify(execFile)(
        process.execPath,
        [vitestPath, "run", "--config", configPath],
        {
          cwd: dirname(configPath),
          env: {
            ...process.env,
            MORPHO_TEST_ANVIL_RUN_ID: `timeout-worker-${process.pid}-${Date.now()}`,
            MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC: "1",
            MORPHO_TEST_SEMAPHORE_COORDINATION_DIRECTORY: coordinationDirectory,
            MORPHO_TEST_SEMAPHORE_RPC_URL: upstream.rpcUrl,
            NO_COLOR: "1",
          },
          timeout: 60_000,
        },
      );

      await expect(
        Promise.all([
          readFile(join(coordinationDirectory, "holder.done"), "utf8"),
          readFile(join(coordinationDirectory, "waiter.done"), "utf8"),
        ]),
      ).resolves.toEqual(["released\n", "cancelled\n"]);
      await expect(
        readFile(join(coordinationDirectory, "waiter-acquired"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await settleForkTestCleanup([
        upstream.stopAndWait(),
        rm(coordinationDirectory, { recursive: true, force: true }),
      ]);
    }
  });

  test("behavior: reclaims an orphan before starting a replacement", async () => {
    const upstream = await spawnAnvil({ chainId: 1 });
    const coordinationDirectory = await mkdtemp(
      join(tmpdir(), "morpho-test-vite-crash-"),
    );
    const configPath = fileURLToPath(
      new URL(
        "./fixtures/vitest-semaphore-crash/vitest.config.ts",
        import.meta.url,
      ),
    );
    const vitestPath = fileURLToPath(
      new URL("../../../node_modules/vitest/vitest.mjs", import.meta.url),
    );
    const runId = `crashed-worker-${process.pid}-${Date.now()}`;
    const originalMaxProcesses =
      process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC;
    const originalRunId = process.env.MORPHO_TEST_ANVIL_RUN_ID;
    let workerPid: number | undefined;
    let orphanPid: number | undefined;
    let replacement: Awaited<ReturnType<typeof spawnAnvil>> | undefined;
    let childOutput = "";
    const vitestProcess = spawnProcess(
      process.execPath,
      [vitestPath, "run", "--config", configPath],
      {
        cwd: dirname(configPath),
        env: {
          ...process.env,
          MORPHO_TEST_ANVIL_RUN_ID: runId,
          MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC: "1",
          MORPHO_TEST_SEMAPHORE_COORDINATION_DIRECTORY: coordinationDirectory,
          MORPHO_TEST_SEMAPHORE_RPC_URL: upstream.rpcUrl,
          NO_COLOR: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    vitestProcess.stdout.on("data", (data) => {
      childOutput = `${childOutput}${data.toString()}`.slice(-8_192);
    });
    vitestProcess.stderr.on("data", (data) => {
      childOutput = `${childOutput}${data.toString()}`.slice(-8_192);
    });

    try {
      const readyPath = join(coordinationDirectory, "holder.ready");
      const readyDeadline = Date.now() + 15_000;
      while (workerPid === undefined || orphanPid === undefined) {
        try {
          const ready = JSON.parse(await readFile(readyPath, "utf8")) as {
            readonly childPid: number;
            readonly workerPid: number;
          };
          workerPid = ready.workerPid;
          orphanPid = ready.childPid;
        } catch (error) {
          if (Date.now() >= readyDeadline) {
            throw new Error(
              `The crash fixture did not acquire Anvil in time. ${childOutput}`,
              { cause: error },
            );
          }
          await setTimeout(25);
        }
      }

      expect(workerPid).not.toBe(vitestProcess.pid);
      expect(() => process.kill(orphanPid!, 0)).not.toThrow();
      vitestProcess.kill("SIGKILL");
      try {
        process.kill(workerPid, "SIGKILL");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ESRCH"
        )
          throw error;
      }

      process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
      process.env.MORPHO_TEST_ANVIL_RUN_ID = runId;
      replacement = await spawnAnvil({
        chainId: 1,
        forkBlockNumber: 0,
        forkUrl: upstream.rpcUrl,
        stepsTracing: false,
      });

      let orphanExitError: unknown;
      try {
        process.kill(orphanPid, 0);
      } catch (error) {
        orphanExitError = error;
      }
      expect(orphanExitError).toMatchObject({ code: "ESRCH" });
    } finally {
      if (vitestProcess.exitCode === null) vitestProcess.kill("SIGKILL");
      if (workerPid !== undefined) {
        try {
          process.kill(workerPid, "SIGKILL");
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            error.code !== "ESRCH"
          )
            console.warn("Failed to stop the crashed Vitest worker.", error);
        }
      }
      if (orphanPid !== undefined) {
        try {
          process.kill(orphanPid, "SIGKILL");
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            error.code !== "ESRCH"
          )
            console.warn("Failed to stop the orphaned Anvil process.", error);
        }
      }
      if (originalMaxProcesses === undefined)
        delete process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC;
      else
        process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC =
          originalMaxProcesses;
      if (originalRunId === undefined)
        delete process.env.MORPHO_TEST_ANVIL_RUN_ID;
      else process.env.MORPHO_TEST_ANVIL_RUN_ID = originalRunId;
      await settleForkTestCleanup([
        replacement?.stopAndWait(),
        upstream.stopAndWait(),
        rm(coordinationDirectory, { recursive: true, force: true }),
      ]);
    }
  });
});
