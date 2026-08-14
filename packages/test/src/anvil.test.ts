import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, test, vi } from "vitest";

const { renameSyncMock, spawnMock } = vi.hoisted(() => ({
  renameSyncMock: vi.fn<typeof import("node:fs").renameSync>(),
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: spawnMock };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  renameSyncMock.mockImplementation(actual.renameSync);

  return { ...actual, renameSync: renameSyncMock };
});

import { spawnAnvil } from "./anvil.js";
import { AnvilCleanupError, AnvilStartupError } from "./errors.js";

type FakeAnvilProcess = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
};

const originalMaxProcessesPerRpc =
  process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC;
const originalRunId = process.env.MORPHO_TEST_ANVIL_RUN_ID;
const originalTmpDirectory = process.env.TMPDIR;

const restoreEnvironment = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

const createFakeAnvilProcess = (options: { closeOnSignal?: boolean } = {}) => {
  const { closeOnSignal = true } = options;
  const subprocess = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    kill: vi.fn(),
    unref: vi.fn(),
  }) as FakeAnvilProcess;

  subprocess.kill.mockImplementation((signal) => {
    if (closeOnSignal) {
      queueMicrotask(() => {
        subprocess.exitCode = 0;
        subprocess.emit("close", 0, signal);
      });
    }
    return true;
  });
  subprocess.unref.mockReturnValue(subprocess);

  return subprocess;
};

afterEach(async () => {
  restoreEnvironment(
    "MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC",
    originalMaxProcessesPerRpc,
  );
  restoreEnvironment("MORPHO_TEST_ANVIL_RUN_ID", originalRunId);
  restoreEnvironment("TMPDIR", originalTmpDirectory);
  vi.useRealTimers();
  vi.clearAllMocks();
  const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
  renameSyncMock.mockImplementation(actualFs.renameSync);
});

// These tests intentionally share the spawn mock and process environment.
describe.sequential("spawnAnvil", () => {
  test("behavior: tolerates stderr output while Anvil is starting", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "2";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-${process.pid}`;
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({
      binary: "custom-anvil",
      chainId: 1,
      forkUrl: "https://rpc.example",
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock).toHaveBeenCalledWith(
      "custom-anvil",
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          MORPHO_TEST_ANVIL_PROCESS_IDENTITY: expect.any(String),
        }),
      }),
    );
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain(
      "--compute-units-per-second",
    );
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain("--binary");

    subprocess.stderr.write("temporary upstream warning");
    await Promise.resolve();
    expect(subprocess.kill).not.toHaveBeenCalled();

    subprocess.stdout.write("Listening on 127.0.0.1:31001\n");
    const spawned = await spawnedPromise;
    expect(spawned.rpcUrl).toBe("http://localhost:31001");

    expect(await spawned.stopAndWait()).toBe(true);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    expect(subprocess.unref).toHaveBeenCalledOnce();
  });

  test("behavior: redacts fork URLs from running subprocess warnings", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "0";
    const forkUrl = "https://user:secret@rpc.example/v1/private-key";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31012\n");
      const spawned = await spawnedPromise;

      const forkUrlSplit = Math.floor(forkUrl.length / 2);
      subprocess.stderr.write(
        `provider request failed for ${forkUrl.slice(0, forkUrlSplit)}`,
      );
      subprocess.stderr.write(forkUrl.slice(forkUrlSplit));
      expect(warning).toHaveBeenCalledWith(
        "[port 31012] Anvil emitted stderr output. Details were redacted because a fork URL is configured.",
      );
      expect(warning).toHaveBeenCalledOnce();
      expect(String(warning.mock.calls)).not.toContain(forkUrl);
      await spawned.stopAndWait();
    } finally {
      warning.mockRestore();
    }
  });

  test("error: AnvilStartupError cleans up a failed startup", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "0";
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.emit("error", new Error("spawn failed"));

    await expect(spawnedPromise).rejects.toBeInstanceOf(AnvilStartupError);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    expect(subprocess.unref).toHaveBeenCalledOnce();
  });

  test("error: AnvilStartupError redacts fork URLs from subprocess errors", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "0";
    const forkUrl = "https://user:secret@rpc.example/v1/private-key";
    const subprocess = createFakeAnvilProcess();
    const subprocessError = Object.assign(
      new Error(`failed to spawn --fork-url ${forkUrl}`),
      {
        code: "ENOENT",
        spawnargs: ["--fork-url", forkUrl],
      },
    );
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.emit("error", subprocessError);

    const error = await spawnedPromise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilStartupError);
    if (!(error instanceof AnvilStartupError)) throw error;
    expect(String(error.cause)).toContain("redacted");
    expect(String(error.cause)).not.toContain(forkUrl);
    expect(error.cause).not.toHaveProperty("spawnargs");
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
  });

  test("error: AnvilStartupError redacts fork URLs from stderr", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "0";
    const forkUrl = "https://user:secret@rpc.example/v1/private-key";
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    const forkUrlSplit = Math.floor(forkUrl.length / 2);
    subprocess.stderr.write(
      `provider request failed for ${forkUrl.slice(0, forkUrlSplit)}`,
    );
    subprocess.stderr.write(forkUrl.slice(forkUrlSplit));
    subprocess.exitCode = 1;
    subprocess.emit("close", 1, null);

    const error = await spawnedPromise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilStartupError);
    expect(String(error)).toContain("redacted");
    expect(String(error)).not.toContain(forkUrl);
  });

  test("error: AnvilStartupError wraps slot-acquisition failures", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-slot-error-${process.pid}`;
    process.env.TMPDIR = "/dev/null";

    await expect(
      spawnAnvil({ chainId: 1, forkUrl: "https://rpc.example" }),
    ).rejects.toMatchObject({
      name: "AnvilStartupError",
      cause: expect.objectContaining({ code: "ENOTDIR" }),
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("error: AnvilStartupError bounds startup and frees its slot", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-startup-timeout-${process.pid}`;
    const forkUrl = "https://startup-timeout-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const stalledProcess = createFakeAnvilProcess({ closeOnSignal: false });
    const replacementProcess = createFakeAnvilProcess();
    spawnMock
      .mockReturnValueOnce(
        stalledProcess as unknown as ChildProcessWithoutNullStreams,
      )
      .mockReturnValueOnce(
        replacementProcess as unknown as ChildProcessWithoutNullStreams,
      );
    vi.useFakeTimers();

    try {
      const stalledPromise = spawnAnvil({ chainId: 1, forkUrl, timeout: 1 });
      const stalledRejection =
        expect(stalledPromise).rejects.toBeInstanceOf(AnvilStartupError);
      await vi.advanceTimersByTimeAsync(0);
      expect(spawnMock).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(stalledProcess.kill).toHaveBeenCalledWith("SIGINT");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(stalledProcess.kill).toHaveBeenLastCalledWith("SIGKILL");

      stalledProcess.exitCode = 0;
      stalledProcess.emit("close", 0, "SIGKILL");
      await stalledRejection;

      const replacementPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.advanceTimersByTimeAsync(0);
      expect(spawnMock).toHaveBeenCalledTimes(2);
      replacementProcess.stdout.write("Listening on 127.0.0.1:31006\n");
      const replacement = await replacementPromise;

      expect(replacement.rpcUrl).toBe("http://localhost:31006");
      await replacement.stopAndWait();
    } finally {
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("error: AnvilStartupError cancels process-slot acquisition", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-slot-cancel-${process.pid}`;
    const forkUrl = "https://slot-cancel-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const firstProcess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      firstProcess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const firstPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      firstProcess.stdout.write("Listening on 127.0.0.1:31007\n");
      const first = await firstPromise;

      const controller = new AbortController();
      const cancelledPromise = spawnAnvil(
        { chainId: 1, forkUrl },
        { signal: controller.signal },
      );
      await setTimeout(75);
      expect(spawnMock).toHaveBeenCalledOnce();

      controller.abort(new Error("test timed out"));
      await expect(cancelledPromise).rejects.toBeInstanceOf(AnvilStartupError);
      expect(spawnMock).toHaveBeenCalledOnce();
      expect(
        readdirSync(lockDirectory).filter((path) =>
          path.endsWith(".candidate"),
        ),
      ).toEqual([]);

      const cleanup = first.stopAndWait();
      firstProcess.exitCode = 0;
      firstProcess.emit("close", 0, "SIGINT");
      await cleanup;
    } finally {
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("error: AnvilStartupError aborts after launch but before listening", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "0";
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    const controller = new AbortController();
    const abortReason = new Error("test timed out");

    const spawnedPromise = spawnAnvil(
      { chainId: 1 },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    controller.abort(abortReason);

    const error = await spawnedPromise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilStartupError);
    expect(error).toMatchObject({ cause: abortReason });
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    expect(subprocess.unref).toHaveBeenCalledOnce();
  });

  test("behavior: caps each RPC without serializing other forks", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-${process.pid}`;
    const firstProcess = createFakeAnvilProcess({ closeOnSignal: false });
    // Model Node's `exit` → `close` ordering: the exit code may be set while
    // stdio is still draining, but the shared slot must remain occupied.
    firstProcess.kill.mockImplementation(() => {
      firstProcess.exitCode = 0;
      return true;
    });
    const otherRpcProcess = createFakeAnvilProcess();
    const secondSameRpcProcess = createFakeAnvilProcess();
    spawnMock
      .mockReturnValueOnce(
        firstProcess as unknown as ChildProcessWithoutNullStreams,
      )
      .mockReturnValueOnce(
        otherRpcProcess as unknown as ChildProcessWithoutNullStreams,
      )
      .mockReturnValueOnce(
        secondSameRpcProcess as unknown as ChildProcessWithoutNullStreams,
      );

    const firstPromise = spawnAnvil({
      chainId: 1,
      forkUrl: "https://first-rpc.example",
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    firstProcess.stdout.write("Listening on 127.0.0.1:31001\n");
    const first = await firstPromise;

    const secondSameRpcPromise = spawnAnvil({
      chainId: 1,
      forkUrl: "https://first-rpc.example",
    });
    await setTimeout(75);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const otherRpcPromise = spawnAnvil({
      chainId: 1,
      forkUrl: "https://other-rpc.example",
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    otherRpcProcess.stdout.write("Listening on 127.0.0.1:31002\n");
    const otherRpc = await otherRpcPromise;

    first.stop();
    await setTimeout(75);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    const firstCleanup = first.stopAndWait();
    firstProcess.exitCode = 0;
    firstProcess.emit("close", 0, "SIGINT");
    await firstCleanup;
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(3));
    secondSameRpcProcess.stdout.write("Listening on 127.0.0.1:31003\n");
    const secondSameRpc = await secondSameRpcPromise;

    expect(otherRpc.rpcUrl).toBe("http://localhost:31002");
    expect(secondSameRpc.rpcUrl).toBe("http://localhost:31003");
    await Promise.all([otherRpc.stopAndWait(), secondSameRpc.stopAndWait()]);
    expect(otherRpcProcess.unref).toHaveBeenCalledOnce();
    expect(secondSameRpcProcess.unref).toHaveBeenCalledOnce();
  });

  test("behavior: retries slot cleanup after a transient failure", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-release-retry-${process.pid}`;
    const forkUrl = "https://release-retry-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const lockPath = join(lockDirectory, "0.lock");
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    let releaseAttempts = 0;
    renameSyncMock.mockImplementation((oldPath, newPath) => {
      if (oldPath === lockPath && releaseAttempts++ === 0) {
        const error = new Error("slot busy") as NodeJS.ErrnoException;
        error.code = "EBUSY";
        throw error;
      }

      actualFs.renameSync(oldPath, newPath);
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31004\n");
      const spawned = await spawnedPromise;

      const cleanup = spawned.stopAndWait();
      subprocess.exitCode = 0;
      subprocess.emit("close", 0, "SIGINT");
      await cleanup;

      await vi.waitFor(() => expect(existsSync(lockPath)).toBe(false));
      expect(releaseAttempts).toBe(2);
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("error: AnvilCleanupError surfaces a permanent release failure", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-release-error-${process.pid}`;
    const forkUrl = "https://release-error-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const lockPath = join(lockDirectory, "0.lock");
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    let releaseAttempts = 0;
    renameSyncMock.mockImplementation((oldPath, newPath) => {
      if (oldPath === lockPath) {
        releaseAttempts += 1;
        const error = new Error("permission denied") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }

      actualFs.renameSync(oldPath, newPath);
    });
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31008\n");
      const spawned = await spawnedPromise;

      await expect(spawned.stopAndWait()).rejects.toBeInstanceOf(
        AnvilCleanupError,
      );
      expect(releaseAttempts).toBe(1);
    } finally {
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("error: preserves startup and cleanup failures together", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-startup-cleanup-error-${process.pid}`;
    const forkUrl = "https://startup-cleanup-error-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const lockPath = join(lockDirectory, "0.lock");
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    renameSyncMock.mockImplementation((oldPath, newPath) => {
      if (oldPath === lockPath) {
        const cleanupCause = new Error(
          "permission denied",
        ) as NodeJS.ErrnoException;
        cleanupCause.code = "EACCES";
        throw cleanupCause;
      }
      actualFs.renameSync(oldPath, newPath);
    });
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.emit("error", new Error("spawn failed"));

      const error = await spawnedPromise.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AnvilCleanupError);
      if (!(error instanceof AnvilCleanupError)) throw error;
      expect(error.cause).toBeInstanceOf(AggregateError);
      if (!(error.cause instanceof AggregateError)) throw error.cause;
      expect(error.cause.errors[0]).toBeInstanceOf(AnvilStartupError);
      expect(error.cause.errors[1]).toBeInstanceOf(AnvilCleanupError);
    } finally {
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("behavior: stop reports a permanent release failure", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-stop-release-error-${process.pid}`;
    const forkUrl = "https://stop-release-error-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const lockPath = join(lockDirectory, "0.lock");
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    renameSyncMock.mockImplementation((oldPath, newPath) => {
      if (oldPath === lockPath) {
        const error = new Error("permission denied") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }

      actualFs.renameSync(oldPath, newPath);
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31010\n");
      const spawned = await spawnedPromise;

      expect(spawned.stop()).toBe(true);
      await vi.waitFor(() =>
        expect(warning).toHaveBeenCalledWith(
          "Anvil cleanup failed after stop(). Use stopAndWait() to handle cleanup failures.",
          expect.any(AnvilCleanupError),
        ),
      );
    } finally {
      warning.mockRestore();
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("error: AnvilCleanupError bounds transient release retries", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-release-timeout-${process.pid}`;
    const forkUrl = "https://release-timeout-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const lockPath = join(lockDirectory, "0.lock");
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    renameSyncMock.mockImplementation((oldPath, newPath) => {
      if (oldPath === lockPath) {
        const error = new Error("slot busy") as NodeJS.ErrnoException;
        error.code = "EBUSY";
        throw error;
      }

      actualFs.renameSync(oldPath, newPath);
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31009\n");
      const spawned = await spawnedPromise;

      vi.useFakeTimers();
      const cleanupRejection = expect(
        spawned.stopAndWait(),
      ).rejects.toBeInstanceOf(AnvilCleanupError);
      await vi.advanceTimersByTimeAsync(5_000);
      await cleanupRejection;
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("behavior: force-kills Anvil when graceful shutdown times out", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "0";
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31005\n");
    const spawned = await spawnedPromise;

    vi.useFakeTimers();
    const cleanup = spawned.stopAndWait();
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subprocess.kill).toHaveBeenLastCalledWith("SIGKILL");

    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGKILL");
    expect(await cleanup).toBe(true);
    expect(subprocess.unref).toHaveBeenCalledOnce();
  });

  test("error: AnvilCleanupError bounds a missing close event", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "0";
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31011\n");
    const spawned = await spawnedPromise;

    vi.useFakeTimers();
    const cleanupRejection = expect(
      spawned.stopAndWait(),
    ).rejects.toBeInstanceOf(AnvilCleanupError);
    await vi.advanceTimersByTimeAsync(10_000);
    await cleanupRejection;
    expect(subprocess.kill).toHaveBeenNthCalledWith(1, "SIGINT");
    expect(subprocess.kill).toHaveBeenNthCalledWith(2, "SIGKILL");

    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGKILL");
    await Promise.resolve();
  });

  test("behavior: reclaims a slot owned by a dead worker", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-stale-${process.pid}`;
    const forkUrl = "https://stale-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const lockPath = join(lockDirectory, "0.lock");
    mkdirSync(lockPath, { recursive: true });
    // This PID is above the supported range on CI and local test platforms.
    writeFileSync(join(lockPath, "owner"), "2147483647-stale\n");

    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31004\n");
      const spawned = await spawnedPromise;

      expect(spawned.rpcUrl).toBe("http://localhost:31004");
      await spawned.stopAndWait();
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });

  test("behavior: preserves a slot that changes owners during reclamation", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-owner-race-${process.pid}`;
    const forkUrl = "https://owner-race-rpc.example";
    const rpcId = createHash("sha256")
      .update(forkUrl)
      .digest("hex")
      .slice(0, 16);
    const lockDirectory = join(
      tmpdir(),
      "morpho-test-anvil",
      process.env.MORPHO_TEST_ANVIL_RUN_ID,
      rpcId,
    );
    const lockPath = join(lockDirectory, "0.lock");
    const ownerPath = join(lockPath, "owner");
    const stalePid = 2_147_483_646;
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(ownerPath, `${stalePid}-stale\n`);

    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    const processKill = process.kill.bind(process);
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((pid, signal) => {
        if (pid !== stalePid) return processKill(pid, signal);

        rmSync(lockPath, { recursive: true, force: true });
        mkdirSync(lockPath);
        writeFileSync(ownerPath, `${process.pid}-replacement\n`);
        const error = new Error("stale owner exited") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      });

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await setTimeout(75);
      expect(spawnMock).not.toHaveBeenCalled();
      expect(readFileSync(ownerPath, "utf8")).toBe(
        `${process.pid}-replacement\n`,
      );

      rmSync(lockPath, { recursive: true, force: true });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31005\n");
      const spawned = await spawnedPromise;

      expect(spawned.rpcUrl).toBe("http://localhost:31005");
      await spawned.stopAndWait();
    } finally {
      killSpy.mockRestore();
      rmSync(lockDirectory, { recursive: true, force: true });
    }
  });
});
