import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: spawnMock };
});

import { spawnAnvil } from "./anvil.js";
import {
  AnvilCleanupError,
  AnvilProcessError,
  AnvilStartupError,
} from "./errors.js";

type FakeAnvilProcess = EventEmitter & {
  pid: number;
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
};

const createFakeAnvilProcess = (options: { closeOnSignal?: boolean } = {}) => {
  const { closeOnSignal = true } = options;
  const subprocess = Object.assign(new EventEmitter(), {
    pid: 2_147_483_645,
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

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// These tests intentionally share the spawn mock.
describe.sequential("spawnAnvil", () => {
  test("behavior: tolerates stderr output while Anvil is starting", async () => {
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
    expect(spawnMock).toHaveBeenCalledWith("custom-anvil", expect.any(Array));
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain(
      "--compute-units-per-second",
    );
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain("--binary");

    subprocess.stderr.write("temporary upstream warning");
    await Promise.resolve();
    expect(subprocess.kill).not.toHaveBeenCalled();

    subprocess.stdout.write("Listening on 127.0.0.1:310");
    subprocess.stdout.write("01\n");
    const spawned = await spawnedPromise;
    expect(spawned.rpcUrl).toBe("http://localhost:31001");

    expect(await spawned.stopAndWait()).toBe(true);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    expect(subprocess.unref).toHaveBeenCalledOnce();
  });

  test("behavior: stop is idempotent", async () => {
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31002\n");
    const spawned = await spawnedPromise;

    expect(spawned.stop()).toBe(true);
    expect(spawned.stop()).toBe(false);
    expect(subprocess.kill).toHaveBeenCalledOnce();
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    await vi.waitFor(() => expect(subprocess.unref).toHaveBeenCalledOnce());
  });

  test("behavior: redacts fork credentials from running subprocess warnings", async () => {
    const forkUrl = "https://user:secret@rpc.example/v1/private-key";
    const forkHeader = "Bearer private-provider-token";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({
        chainId: 1,
        forkHeader: { Authorization: forkHeader },
        forkUrl,
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31012\n");
      const spawned = await spawnedPromise;

      subprocess.stderr.write(
        `provider request failed for private-key\u001b[31m with ${forkHeader}\u001b[0m\n`,
      );
      expect(warning).toHaveBeenCalledWith(
        "[port 31012] provider request failed for <redacted-rpc-url> with <redacted-rpc-url>",
      );
      expect(warning).toHaveBeenCalledOnce();
      expect(String(warning.mock.calls)).not.toContain(forkUrl);
      expect(String(warning.mock.calls)).not.toContain(forkHeader);
      await spawned.stopAndWait();
    } finally {
      warning.mockRestore();
    }
  });

  test("behavior: redacts pre-listen fork stderr flushed on close", async () => {
    const forkUrl = "https://eth-mainnet.example/v2/SUPERSECRETAPIKEY";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      const forkUrlSplit = forkUrl.indexOf("CRETAPIKEY");
      subprocess.stderr.write(
        `retrying fork request to ${forkUrl.slice(0, forkUrlSplit)}`,
      );
      subprocess.stdout.write("Listening on 127.0.0.1:31015\n");
      const spawned = await spawnedPromise;
      subprocess.stderr.write(`${forkUrl.slice(forkUrlSplit)} failed`);
      subprocess.exitCode = 1;
      subprocess.emit("close", 1, null);

      const error = await spawned
        .stopAndWait()
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AnvilProcessError);
      expect(warning).toHaveBeenCalledWith(
        "[port 31015] retrying fork request to <redacted-rpc-url> failed",
      );
      expect(String(warning.mock.calls)).not.toContain("SUPERSECRETAPIKEY");
    } finally {
      warning.mockRestore();
    }
  });

  test("error: AnvilProcessError surfaces an unexpected post-startup exit", async () => {
    const forkUrl = "https://user:secret@rpc.example/v1/private-key";
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31013\n");
    const spawned = await spawnedPromise;

    subprocess.stderr.write(`provider request failed for ${forkUrl}`);
    subprocess.exitCode = 1;
    subprocess.emit("close", 1, null);

    const error = await spawned
      .stopAndWait()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilProcessError);
    expect(String(error)).toContain(
      "provider request failed for <redacted-rpc-url>",
    );
    expect(String(error)).not.toContain(forkUrl);
  });

  test("error: AnvilProcessError surfaces an exit observed before close", async () => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31014\n");
    const spawned = await spawnedPromise;

    subprocess.exitCode = 1;
    const failure = expect(spawned.stopAndWait()).rejects.toBeInstanceOf(
      AnvilProcessError,
    );
    expect(subprocess.kill).not.toHaveBeenCalled();
    subprocess.emit("close", 1, null);

    await failure;
  });

  test("error: AnvilStartupError cleans up a failed startup", async () => {
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
    expect(String(error.cause)).toContain(
      "failed to spawn --fork-url <redacted-rpc-url>",
    );
    expect(String(error.cause)).not.toContain(forkUrl);
    expect(error.cause).not.toHaveProperty("spawnargs");
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
  });

  test("error: AnvilStartupError redacts fork URLs from stderr", async () => {
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
    expect(String(error)).toContain(
      "provider request failed for <redacted-rpc-url>",
    );
    expect(String(error)).not.toContain(forkUrl);
  });

  test("error: AnvilStartupError bounds startup and cleans up its process", async () => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    vi.useFakeTimers();

    const spawnedPromise = spawnAnvil({ chainId: 1, timeout: 1 });
    const rejection =
      expect(spawnedPromise).rejects.toBeInstanceOf(AnvilStartupError);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subprocess.kill).toHaveBeenLastCalledWith("SIGKILL");

    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGKILL");
    await rejection;
  });

  test("error: AnvilStartupError rejects a pre-aborted launch", async () => {
    const controller = new AbortController();
    const abortReason = new Error("test timed out");
    controller.abort(abortReason);

    const error = await spawnAnvil(
      { chainId: 1 },
      { signal: controller.signal },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnvilStartupError);
    expect(error).toMatchObject({ cause: abortReason });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("error: AnvilStartupError aborts after launch but before listening", async () => {
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

  test("error: preserves startup and cleanup failures together", async () => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    vi.useFakeTimers();

    const spawnedPromise = spawnAnvil({ chainId: 1 });
    subprocess.emit("error", new Error("spawn failed"));
    const errorPromise = spawnedPromise.catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await errorPromise;

    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors[0]).toBeInstanceOf(AnvilStartupError);
    expect(error.cause.errors[1]).toBeInstanceOf(AnvilCleanupError);

    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGKILL");
  });

  test("behavior: force-kills Anvil when graceful shutdown times out", async () => {
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
});
