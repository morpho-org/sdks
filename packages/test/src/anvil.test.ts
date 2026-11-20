import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { spawnMock, isolateCacheMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  isolateCacheMock: vi.fn(),
}));

vi.mock("./forkCache.js", () => ({ isolateForkCache: isolateCacheMock }));

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
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
};

const createFakeAnvilProcess = (options: { closeOnSignal?: boolean } = {}) => {
  const { closeOnSignal = true } = options;
  const subprocess = Object.assign(new EventEmitter(), {
    pid: 2_147_483_645,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    signalCode: null,
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

const EGRESS_PROXY_VARIABLES = [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
];

// spawnAnvil forks directly behind an egress proxy, so a proxied host must not
// change which branch these tests take.
beforeEach(() => {
  isolateCacheMock.mockResolvedValue(undefined);
  for (const name of EGRESS_PROXY_VARIABLES) vi.stubEnv(name, "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// These tests intentionally share the spawn mock.
describe.sequential("spawnAnvil", () => {
  test.each(["default", "xdg", "explicit"])(
    "behavior: preserves %s tool-manager paths with an isolated HOME",
    async (mode) => {
      for (const name of [
        "XDG_DATA_HOME",
        "XDG_CONFIG_HOME",
        "ASDF_DATA_DIR",
        "MISE_DATA_DIR",
        "MISE_CONFIG_DIR",
      ])
        vi.stubEnv(name, undefined);
      vi.stubEnv(
        "XDG_CACHE_HOME",
        mode === "default" ? undefined : "/original/cache",
      );
      if (mode !== "default") {
        vi.stubEnv("XDG_DATA_HOME", "/custom/data");
        vi.stubEnv("XDG_CONFIG_HOME", "/custom/config");
      }
      if (mode === "explicit") {
        vi.stubEnv("ASDF_DATA_DIR", "/custom/asdf");
        vi.stubEnv("MISE_DATA_DIR", "/custom/mise-data");
        vi.stubEnv("MISE_CONFIG_DIR", "/custom/mise-config");
      }
      const subprocess = createFakeAnvilProcess();
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );
      isolateCacheMock.mockResolvedValue({
        home: "/private/anvil-home",
        close: vi.fn().mockResolvedValue(undefined),
      });
      const started = spawnAnvil({
        chainId: 1,
        forkUrl: "https://rpc.example",
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      const env = spawnMock.mock.calls[0]?.[2].env;
      const dataHome =
        mode !== "default"
          ? "/custom/data"
          : process.platform === "win32"
            ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData/Local"))
            : join(homedir(), ".local/share");
      const configHome =
        mode === "default" ? join(homedir(), ".config") : "/custom/config";
      expect(env.HOME).toBe("/private/anvil-home");
      expect(env.XDG_DATA_HOME).toBe(dataHome);
      expect(env.XDG_CONFIG_HOME).toBe(configHome);
      expect(env.XDG_CACHE_HOME).toBe(
        mode === "default" ? undefined : "/original/cache",
      );
      expect(env.ASDF_DATA_DIR).toBe(
        mode === "explicit" ? "/custom/asdf" : join(homedir(), ".asdf"),
      );
      expect(env.MISE_DATA_DIR).toBe(
        mode === "explicit" ? "/custom/mise-data" : join(dataHome, "mise"),
      );
      expect(env.MISE_CONFIG_DIR).toBe(
        mode === "explicit" ? "/custom/mise-config" : join(configHome, "mise"),
      );
      subprocess.stdout.write("Listening on 127.0.0.1:31030\n");
      await (await started).stopAndWait();
    },
  );

  test("behavior: isolates fork cache writes and waits for their merge on shutdown", async () => {
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    const close = vi.fn().mockResolvedValue(undefined);
    isolateCacheMock.mockResolvedValue({ home: "/private/anvil-home", close });
    const started = spawnAnvil({
      chainId: 1,
      forkUrl: "https://rpc.example",
      forkBlockNumber: 123n,
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock.mock.calls[0]?.[2].env.HOME).toBe("/private/anvil-home");
    expect(process.env.HOME).not.toBe("/private/anvil-home");
    expect(isolateCacheMock).toHaveBeenCalledWith(undefined, 123n);
    subprocess.stdout.write("Listening on 127.0.0.1:31030\n");
    const node = await started;
    expect(close).not.toHaveBeenCalled();
    await node.stopAndWait();
    expect(close).toHaveBeenCalledOnce();
  });

  test.each([
    { chainId: 1 },
    { chainId: 1, forkUrl: "global_rpc_alias" },
    { chainId: 1, forkUrl: "https://rpc.example", noStorageCaching: true },
    { chainId: 1, forkUrl: "wss://rpc.example", noStorageCaching: true },
  ])(
    "behavior: does not isolate caches for $forkUrl with noStorageCaching=$noStorageCaching",
    async (args) => {
      const subprocess = createFakeAnvilProcess();
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );
      const started = spawnAnvil(args);
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31030\n");
      const node = await started;
      await node.stopAndWait();
      expect(isolateCacheMock).not.toHaveBeenCalled();
    },
  );

  test.each([
    { forkUrl: "https://rpc.example", noBal: undefined, expected: true },
    { forkUrl: "https://rpc.example", noBal: false, expected: false },
    { forkUrl: "https://rpc.example", noBal: true, expected: true },
    { forkUrl: undefined, noBal: undefined, expected: false },
    { forkUrl: undefined, noBal: true, expected: true },
  ])(
    "maps noBal=$noBal with fork=$forkUrl to flag=$expected",
    async ({ forkUrl, noBal, expected }) => {
      const subprocess = createFakeAnvilProcess();
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );
      const started = spawnAnvil({ chainId: 1, forkUrl, noBal });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      const flags = spawnMock.mock.calls[0]?.[1] as string[];
      subprocess.stdout.write("Listening on 127.0.0.1:31030\n");
      const node = await started;
      try {
        expect(flags.includes("--no-bal")).toBe(expected);
      } finally {
        await node.stopAndWait();
      }
    },
  );

  test("behavior: serializes fork headers without suppressing the readiness banner", async () => {
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    const started = spawnAnvil({
      chainId: 1,
      silent: true,
      forkHeader: {
        Authorization: "Bearer test:token",
        "X-Test": "second value",
      },
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    const flags = spawnMock.mock.calls[0]?.[1];
    subprocess.stdout.write("Listening on 127.0.0.1:31030\n");
    const node = await started;
    try {
      expect(flags).toEqual(
        expect.arrayContaining([
          "--fork-header",
          "Authorization: Bearer test:token",
          "--fork-header",
          "X-Test: second value",
        ]),
      );
      expect(flags).not.toContain("--silent");
    } finally {
      await node.stopAndWait();
    }
  });

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
    expect(spawnMock.mock.calls[0]?.[0]).toBe("custom-anvil");
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

  test("error: stop reports an undelivered state-dump signal", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    subprocess.kill.mockReturnValue(false);
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({
        chainId: 1,
        dumpState: "/tmp/anvil-state.json",
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31018\n");
      const spawned = await spawnedPromise;

      vi.useFakeTimers();
      expect(spawned.stop()).toBe(false);
      await vi.advanceTimersByTimeAsync(5_000);

      expect(warning).toHaveBeenCalledWith(
        "Anvil process lifecycle failed. Use stopAndWait() to handle process and cleanup failures.",
        expect.any(AnvilCleanupError),
      );
      await expect(spawned.stopAndWait()).rejects.toBeInstanceOf(
        AnvilCleanupError,
      );
      expect(subprocess.kill).toHaveBeenCalledOnce();
      expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
      expect(subprocess.stdin.destroyed).toBe(true);
      expect(subprocess.stdout.destroyed).toBe(true);
      expect(subprocess.stderr.destroyed).toBe(true);
      expect(subprocess.unref).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  test("behavior: forwards fork stderr after startup", async () => {
    vi.stubEnv("CI", "true");
    const forkUrl = "https://rpc.example/v1/project-id";
    const forkHeader = "test-header-value";
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
        redactForkUrl: false,
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      expect(spawnMock.mock.calls[0]?.[1]).not.toContain("--redact-fork-url");
      subprocess.stdout.write("Listening on 127.0.0.1:31012\n");
      const spawned = await spawnedPromise;

      const diagnostic = `provider request failed for ${forkUrl} with ${forkHeader}\n`;
      subprocess.stderr.write(diagnostic);
      expect(warning).toHaveBeenCalledWith(`[port 31012] ${diagnostic}`);
      expect(warning).toHaveBeenCalledOnce();
      await spawned.stopAndWait();
    } finally {
      warning.mockRestore();
    }
  });

  test("behavior: redacts exact fork URL and header values from CI diagnostics", async () => {
    vi.stubEnv("CI", "true");
    const forkUrl = "https://rpc.example/v1/project-id";
    const forkHeader = "test-header-value";
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
      const spawnedArgs = spawnMock.mock.calls[0]?.[1];
      expect(spawnedArgs).not.toContain(forkUrl);
      subprocess.stdout.write("Listening on 127.0.0.1:31015\n");
      const spawned = await spawnedPromise;

      const forkUrlSplit = Math.floor(forkUrl.length / 2);
      const forkHeaderSplit = Math.floor(forkHeader.length / 2);
      subprocess.stderr.write(
        `provider request failed for ${forkUrl.slice(0, forkUrlSplit)}`,
      );
      expect(warning).not.toHaveBeenCalled();
      subprocess.stderr.write(
        `${forkUrl.slice(forkUrlSplit)} with ${forkHeader.slice(0, forkHeaderSplit)}`,
      );
      expect(warning).not.toHaveBeenCalled();
      subprocess.stderr.write(`${forkHeader.slice(forkHeaderSplit)}\n`);
      expect(warning).toHaveBeenCalledWith(
        "[port 31015] provider request failed for <redacted-fork-url> with <redacted-fork-header>\n",
      );
      expect(warning).toHaveBeenCalledOnce();
      expect(String(warning.mock.calls[0]?.[0])).not.toContain(forkUrl);
      expect(String(warning.mock.calls[0]?.[0])).not.toContain(forkHeader);
      await spawned.stopAndWait();
    } finally {
      warning.mockRestore();
    }
  });

  test("behavior: forks through a local proxy that closes with Anvil", async () => {
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({
      chainId: 1,
      forkUrl: "https://rpc.example/v1/project-id@123",
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    const [, spawnedArgs, { env }] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(spawnedArgs[spawnedArgs.indexOf("--fork-url") + 1]).toMatch(
      /^http:\/\/fork-[0-9a-f]{16}\.invalid@123$/,
    );
    const proxyUrl = env.HTTP_PROXY ?? "";
    expect(proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // Field by field: a failing object match would print the whole environment.
    expect(env.http_proxy).toBe(proxyUrl);
    expect(env.NO_PROXY).toBe("");
    expect(env.no_proxy).toBe("");
    subprocess.stdout.write("Listening on 127.0.0.1:31020\n");
    const spawned = await spawnedPromise;

    const nodeInfo = () =>
      fetch(proxyUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "anvil_nodeInfo",
        }),
      });
    await expect((await nodeInfo()).json()).resolves.toMatchObject({
      error: { code: -32601 },
    });
    await spawned.stopAndWait();
    await expect(nodeInfo()).rejects.toThrow();
  });

  test("behavior: gives each upstream its own stable fork URL", async () => {
    const forkUrlFor = async (forkUrl: string) => {
      spawnMock.mockClear();
      const subprocess = createFakeAnvilProcess();
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      const spawnedArgs: string[] = spawnMock.mock.calls[0]?.[1];
      subprocess.stdout.write("Listening on 127.0.0.1:31020\n");
      await (await spawnedPromise).stopAndWait();
      return spawnedArgs[spawnedArgs.indexOf("--fork-url") + 1];
    };

    const first = await forkUrlFor("https://rpc.example/v1/a");
    expect(await forkUrlFor("https://rpc.example/v1/a")).toBe(first);
    expect(await forkUrlFor("https://rpc.example/v1/b")).not.toBe(first);
  });

  test.each(["ws", "wss"])(
    "behavior: isolates %s fork caches without an HTTP proxy",
    async (scheme) => {
      const subprocess = createFakeAnvilProcess();
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );

      const close = vi.fn().mockResolvedValue(undefined);
      isolateCacheMock.mockResolvedValue({
        home: "/private/anvil-home",
        close,
      });
      const forkUrl = `${scheme}://rpc.example/v1/key@123`;
      const spawnedPromise = spawnAnvil({
        chainId: 1,
        forkUrl,
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      const spawnedArgs: string[] = spawnMock.mock.calls[0]?.[1];
      expect(spawnedArgs[spawnedArgs.indexOf("--fork-url") + 1]).toBe(forkUrl);
      expect(isolateCacheMock).toHaveBeenCalledWith(undefined, 123n);
      expect(spawnMock.mock.calls[0]?.[2].env.HOME).toBe("/private/anvil-home");
      expect(spawnedArgs.join(" ")).not.toContain("127.0.0.1");
      subprocess.stdout.write("Listening on 127.0.0.1:31020\n");
      await (await spawnedPromise).stopAndWait();
      expect(close).toHaveBeenCalledOnce();
    },
  );

  test.each(EGRESS_PROXY_VARIABLES)(
    "behavior: forks directly when %s is set",
    async (name) => {
      vi.stubEnv(name, "http://egress.example:3128");
      const subprocess = createFakeAnvilProcess();
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );

      try {
        const spawnedPromise = spawnAnvil({
          chainId: 1,
          forkUrl: "https://rpc.example/v1/key@123",
        });
        await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
        const [, spawnedArgs, { env }] = spawnMock.mock.calls[0] as [
          string,
          string[],
          { env: NodeJS.ProcessEnv },
        ];
        expect(spawnedArgs[spawnedArgs.indexOf("--fork-url") + 1]).toBe(
          "https://rpc.example/v1/key@123",
        );
        // Not an object match: a failure would print the whole environment.
        expect(env.HTTP_PROXY === process.env.HTTP_PROXY).toBe(true);
        subprocess.stdout.write("Listening on 127.0.0.1:31020\n");
        await (await spawnedPromise).stopAndWait();
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  test("behavior: bounds redacted stderr without a newline", async () => {
    vi.stubEnv("CI", "true");
    const forkUrl = "https://rpc.example/v1/project-id";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    try {
      const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31019\n");
      const spawned = await spawnedPromise;

      subprocess.stderr.write(`${"x".repeat(4_097)}${forkUrl}`);
      expect(warning).toHaveBeenCalledOnce();
      const diagnostics = String(warning.mock.calls[0]?.[0]);
      expect(diagnostics).toContain("<redacted-fork-url>");
      expect(diagnostics).not.toContain(forkUrl);
      await spawned.stopAndWait();
    } finally {
      warning.mockRestore();
    }
  });

  test("error: AnvilProcessError surfaces an unexpected post-startup exit", async () => {
    const forkUrl = "https://rpc.example/v1/project-id";
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({
      chainId: 1,
      forkUrl,
      redactForkUrl: false,
    });
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
    expect(String(error)).toContain(`provider request failed for ${forkUrl}`);
  });

  test("error: AnvilProcessError preserves post-startup process errors", async () => {
    vi.stubEnv("CI", "true");
    const forkUrl = "https://rpc.example/v1/project-id";
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1, forkUrl });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31020\n");
    const spawned = await spawnedPromise;

    const cleanup = spawned.stopAndWait();
    subprocess.emit("error", new Error(`failed to kill ${forkUrl}`));
    expect(() =>
      subprocess.emit("error", new Error("second process error")),
    ).not.toThrow();
    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGINT");

    const error = await cleanup.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilProcessError);
    if (!(error instanceof AnvilProcessError)) throw error;
    expect(error.cause).toBeInstanceOf(Error);
    expect(String(error.cause)).toContain("<redacted-fork-url>");
    expect(String(error.cause)).not.toContain(forkUrl);
  });

  test.each([
    { code: 1, signal: null },
    { code: null, signal: "SIGINT" as const },
  ])(
    "error: AnvilProcessError surfaces an exit observed before close",
    async ({ code, signal }) => {
      const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );

      const spawnedPromise = spawnAnvil({ chainId: 1 });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31014\n");
      const spawned = await spawnedPromise;

      subprocess.exitCode = code;
      subprocess.signalCode = signal;
      const failure = expect(spawned.stopAndWait()).rejects.toBeInstanceOf(
        AnvilProcessError,
      );
      expect(subprocess.kill).not.toHaveBeenCalled();
      subprocess.emit("close", code, signal);

      await failure;
    },
  );

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

  test("error: AnvilStartupError closes the fork proxy when spawn throws", async () => {
    spawnMock.mockImplementation(() => {
      throw new Error("spawn failed");
    });

    await expect(
      spawnAnvil({ chainId: 1, forkUrl: "https://rpc.example/v1/project-id" }),
    ).rejects.toBeInstanceOf(AnvilStartupError);
    const proxyUrl: string = spawnMock.mock.calls[0]?.[2].env.HTTP_PROXY;
    expect(proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await expect(fetch(proxyUrl, { method: "POST" })).rejects.toThrow();
  });

  test("error: AnvilStartupError survives a nonzero close after a subprocess error", async () => {
    const forkUrl = "https://rpc.example/v1/project-id";
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
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

    const spawnedPromise = spawnAnvil({
      chainId: 1,
      forkUrl,
      redactForkUrl: false,
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.emit("error", subprocessError);
    subprocess.exitCode = -2;
    subprocess.emit("close", -2, null);

    const error = await spawnedPromise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilStartupError);
    if (!(error instanceof AnvilStartupError)) throw error;
    expect(error.cause).toBe(subprocessError);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
  });

  test("error: AnvilStartupError redacts fork credentials from subprocess causes in CI", async () => {
    vi.stubEnv("CI", "true");
    const forkUrl = "https://rpc.example/v1/project-id";
    const forkHeader = "test-header-value";
    const subprocess = createFakeAnvilProcess();
    const subprocessError = Object.assign(
      new Error(
        `failed to spawn --fork-url ${forkUrl} --fork-header ${forkHeader}`,
      ),
      {
        code: "ENOENT",
        spawnargs: ["--fork-url", forkUrl, "--fork-header", forkHeader],
      },
    );
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({
      chainId: 1,
      forkHeader: { Authorization: forkHeader },
      forkUrl,
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.emit("error", subprocessError);

    const error = await spawnedPromise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilStartupError);
    if (!(error instanceof AnvilStartupError)) throw error;
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause).not.toBe(subprocessError);
    if (!(error.cause instanceof Error)) throw error.cause;
    expect(error.cause.message).toBe(
      "failed to spawn --fork-url <redacted-fork-url> --fork-header <redacted-fork-header>",
    );
    expect(Reflect.get(error.cause, "code")).toBe("ENOENT");
    expect(Reflect.get(error.cause, "spawnargs")).toEqual([
      "--fork-url",
      "<redacted-fork-url>",
      "--fork-header",
      "<redacted-fork-header>",
    ]);
    expect(JSON.stringify(error.cause)).not.toContain(forkUrl);
    expect(JSON.stringify(error.cause)).not.toContain(forkHeader);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
  });

  test("error: AnvilStartupError redacts the fork URL in stderr diagnostics", async () => {
    const forkUrl = "https://rpc.example/v1/project-id";
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({
      chainId: 1,
      forkUrl,
      redactForkUrl: true,
    });
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
      "provider request failed for <redacted-fork-url>",
    );
    expect(String(error)).not.toContain(forkUrl);
  });

  test("error: redacts repeated fork URLs across the diagnostic-tail boundary", async () => {
    const forkUrl = "https://rpc.example/v1/super-secret-project-id";
    const subprocess = createFakeAnvilProcess();
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({
      chainId: 1,
      forkUrl,
      redactForkUrl: true,
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stderr.write(
      `${forkUrl}${"x".repeat(4_096 - forkUrl.length * 2)}${forkUrl}${forkUrl}`,
    );
    subprocess.exitCode = 1;
    subprocess.emit("close", 1, null);

    const error = await spawnedPromise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilStartupError);
    expect(String(error)).toContain("<redacted-fork-url>");
    expect(String(error)).not.toContain(forkUrl.slice(1));
    expect(String(error)).not.toContain("super-secret-project-id");
  });

  test("error: AnvilStartupError uses the configured startup deadline", async () => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    vi.useFakeTimers();

    const spawnedPromise = spawnAnvil(
      { chainId: 1 },
      { startupTimeoutMs: 1_000 },
    );
    const rejection =
      expect(spawnedPromise).rejects.toBeInstanceOf(AnvilStartupError);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(subprocess.kill).toHaveBeenLastCalledWith("SIGKILL");

    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGKILL");
    await rejection;
  });

  test("behavior: startup deadline includes the full fork retry budget", async () => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );
    vi.useFakeTimers();

    const spawnedPromise = spawnAnvil({
      chainId: 1,
      forkRetryBackoff: 500,
      forkUrl: "https://rpc.example",
      retries: 2,
      timeout: 1_000,
    });
    const rejection =
      expect(spawnedPromise).rejects.toBeInstanceOf(AnvilStartupError);
    await vi.advanceTimersByTimeAsync(18_999);
    expect(subprocess.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
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

    subprocess.emit("close", null, "SIGKILL");
    expect(await cleanup).toBe(true);
    expect(subprocess.unref).toHaveBeenCalledOnce();
  });

  test.each([
    { code: 1, signal: null },
    { code: null, signal: "SIGTERM" },
  ])("error: AnvilProcessError surfaces a failed shutdown", async (exit) => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31017\n");
    const spawned = await spawnedPromise;

    const cleanup = spawned.stopAndWait();
    subprocess.stderr.write("shutdown failed");
    subprocess.exitCode = exit.code;
    subprocess.emit("close", exit.code, exit.signal);

    const error = await cleanup.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnvilProcessError);
    expect(String(error)).toContain("shutdown failed");
  });

  test.each([
    { dumpState: "/tmp/anvil-state.json" },
    { state: "/tmp/anvil-state.json" },
  ])("behavior: does not force-kill state dumps", async (args) => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil({ chainId: 1, ...args });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31015\n");
    const spawned = await spawnedPromise;

    vi.useFakeTimers();
    const cleanup = spawned.stopAndWait();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(subprocess.kill).toHaveBeenCalledOnce();
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");

    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGINT");
    expect(await cleanup).toBe(true);
  });

  test("behavior: configures the force-kill delay", async () => {
    const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
    spawnMock.mockReturnValue(
      subprocess as unknown as ChildProcessWithoutNullStreams,
    );

    const spawnedPromise = spawnAnvil(
      { chainId: 1, dumpState: "/tmp/anvil-state.json" },
      { forceKillAfterMs: 30_000 },
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    subprocess.stdout.write("Listening on 127.0.0.1:31016\n");
    const spawned = await spawnedPromise;

    vi.useFakeTimers();
    const cleanup = spawned.stopAndWait();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(subprocess.kill).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(subprocess.kill).toHaveBeenLastCalledWith("SIGKILL");

    subprocess.exitCode = 0;
    subprocess.emit("close", 0, "SIGKILL");
    expect(await cleanup).toBe(true);
  });

  test.each(["true", "false"])(
    "error: AnvilCleanupError bounds a missing close event with CI=%s",
    async (ci) => {
      vi.stubEnv("CI", ci);
      const subprocess = createFakeAnvilProcess({ closeOnSignal: false });
      spawnMock.mockReturnValue(
        subprocess as unknown as ChildProcessWithoutNullStreams,
      );

      const closeCache = vi.fn().mockResolvedValue(undefined);
      isolateCacheMock.mockResolvedValue({
        home: "/private/anvil-home",
        close: closeCache,
      });
      const spawnedPromise = spawnAnvil({
        chainId: 1,
        forkUrl: "https://rpc.example",
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
      subprocess.stdout.write("Listening on 127.0.0.1:31011\n");
      const spawned = await spawnedPromise;

      vi.useFakeTimers();
      const processError = new Error("failed to kill Anvil");
      const cleanup = spawned.stopAndWait();
      const cleanupError = cleanup.catch((caught: unknown) => caught);
      subprocess.emit("error", processError);
      await vi.advanceTimersByTimeAsync(10_000);
      const error = await cleanupError;
      expect(error).toBeInstanceOf(AnvilCleanupError);
      if (!(error instanceof AnvilCleanupError)) throw error;
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause).toMatchObject({
        name: processError.name,
        message: processError.message,
      });
      expect(error.cause === processError).toBe(ci !== "true");
      expect(subprocess.kill).toHaveBeenNthCalledWith(1, "SIGINT");
      expect(subprocess.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
      expect(subprocess.stdin.destroyed).toBe(true);
      expect(subprocess.stdout.destroyed).toBe(true);
      expect(subprocess.stderr.destroyed).toBe(true);
      expect(subprocess.unref).toHaveBeenCalledOnce();
      expect(closeCache).not.toHaveBeenCalled();

      subprocess.exitCode = 0;
      subprocess.emit("close", 0, "SIGKILL");
      await Promise.resolve();
      expect(closeCache).toHaveBeenCalledOnce();
    },
  );
});
