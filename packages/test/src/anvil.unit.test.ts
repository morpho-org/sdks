import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, test, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { AnvilStartupError, spawnAnvil } from "./anvil.js";

type FakeAnvilProcess = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
};

const originalMaxProcesses = process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES;
const originalRunId = process.env.MORPHO_TEST_ANVIL_RUN_ID;

const restoreEnvironment = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

const createFakeAnvilProcess = () => {
  const subprocess = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    kill: vi.fn(),
    unref: vi.fn(),
  }) as FakeAnvilProcess;

  subprocess.kill.mockImplementation((signal) => {
    subprocess.exitCode = 0;
    queueMicrotask(() => subprocess.emit("close", 0, signal));
    return true;
  });
  subprocess.unref.mockReturnValue(subprocess);

  return subprocess;
};

afterEach(() => {
  restoreEnvironment("MORPHO_TEST_MAX_ANVIL_PROCESSES", originalMaxProcesses);
  restoreEnvironment("MORPHO_TEST_ANVIL_RUN_ID", originalRunId);
  vi.clearAllMocks();
});

describe.sequential("spawnAnvil", () => {
  test("behavior: tolerates stderr output while Anvil is starting", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES = "4";
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
      expect.arrayContaining(["--compute-units-per-second", "82"]),
    );
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain("--binary");

    subprocess.stderr.write("temporary upstream warning");
    await Promise.resolve();
    expect(subprocess.kill).not.toHaveBeenCalled();

    subprocess.stdout.write("Listening on 127.0.0.1:31001\n");
    const spawned = await spawnedPromise;
    expect(spawned.rpcUrl).toBe("http://localhost:31001");

    expect(spawned.stop()).toBe(true);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    expect(subprocess.unref).toHaveBeenCalledOnce();
  });

  test("error: AnvilStartupError cleans up a failed startup", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES = "0";
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

  test("behavior: caps Anvil processes without serializing Vitest", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-${process.pid}`;
    const firstProcess = createFakeAnvilProcess();
    const secondProcess = createFakeAnvilProcess();
    spawnMock
      .mockReturnValueOnce(
        firstProcess as unknown as ChildProcessWithoutNullStreams,
      )
      .mockReturnValueOnce(
        secondProcess as unknown as ChildProcessWithoutNullStreams,
      );

    const firstPromise = spawnAnvil({ chainId: 1 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    firstProcess.stdout.write("Listening on 127.0.0.1:31001\n");
    const first = await firstPromise;

    const secondPromise = spawnAnvil({ chainId: 1 });
    await setTimeout(75);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    first.stop();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    secondProcess.stdout.write("Listening on 127.0.0.1:31002\n");
    const second = await secondPromise;

    expect(second.rpcUrl).toBe("http://localhost:31002");
    second.stop();
  });
});
