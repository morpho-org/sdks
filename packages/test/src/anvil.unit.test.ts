import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, test, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { spawnAnvil } from "./anvil.js";
import { AnvilStartupError } from "./errors.js";

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
  restoreEnvironment(
    "MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC",
    originalMaxProcessesPerRpc,
  );
  restoreEnvironment("MORPHO_TEST_ANVIL_RUN_ID", originalRunId);
  vi.clearAllMocks();
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
    expect(spawnMock).toHaveBeenCalledWith("custom-anvil", expect.any(Array));
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

    expect(spawned.stop()).toBe(true);
    expect(subprocess.kill).toHaveBeenCalledWith("SIGINT");
    expect(subprocess.unref).toHaveBeenCalledOnce();
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

  test("behavior: caps each RPC without serializing other forks", async () => {
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    process.env.MORPHO_TEST_ANVIL_RUN_ID = `unit-${process.pid}`;
    const firstProcess = createFakeAnvilProcess();
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
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(3));
    secondSameRpcProcess.stdout.write("Listening on 127.0.0.1:31003\n");
    const secondSameRpc = await secondSameRpcPromise;

    expect(otherRpc.rpcUrl).toBe("http://localhost:31002");
    expect(secondSameRpc.rpcUrl).toBe("http://localhost:31003");
    otherRpc.stop();
    secondSameRpc.stop();
  });
});
