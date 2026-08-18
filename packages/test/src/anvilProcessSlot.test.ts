import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const { execFileSyncMock, rmSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  rmSyncMock: vi.fn<typeof import("node:fs").rmSync>(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: execFileSyncMock };
});
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  rmSyncMock.mockImplementation(actual.rmSync);
  return { ...actual, rmSync: rmSyncMock };
});

import {
  ANVIL_PROCESS_IDENTITY_PREFIX,
  acquireAnvilProcessSlot,
  anvilSlotLockDirectory,
  terminateAbandonedAnvilProcess,
} from "./anvilProcessSlot.js";
import { AnvilCleanupError, AnvilStartupError } from "./errors.js";

const originalMaxProcessesPerRpc =
  process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC;
const lockDirectories: string[] = [];

const acquireTestProcessSlot = async (runId: string) => {
  const forkUrl = "https://rpc.example/register-child";
  process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
  const lockDirectory = anvilSlotLockDirectory({ forkUrl, runId });
  lockDirectories.push(lockDirectory);
  return {
    lockDirectory,
    processSlot: await acquireAnvilProcessSlot({ forkUrl, runId }),
  };
};

afterEach(() => {
  if (originalMaxProcessesPerRpc === undefined)
    delete process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC;
  else
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC =
      originalMaxProcessesPerRpc;
  for (const lockDirectory of lockDirectories.splice(0))
    rmSync(lockDirectory, { recursive: true, force: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
  execFileSyncMock.mockReset();
});

describe("anvilSlotLockDirectory", () => {
  test("default", () => {
    const directory = anvilSlotLockDirectory({
      forkUrl: "https://rpc.example/private-key",
      runId: "ci/run:123",
    });

    expect(directory).toBe(
      join(tmpdir(), "morpho-test-anvil", "ci_run_123", "dcfeeb1a1f01e810"),
    );
    expect(directory).not.toContain("private-key");
  });

  test("behavior: uses the default scope for an empty run identifier", () => {
    expect(
      anvilSlotLockDirectory({
        forkUrl: "https://rpc.example",
        runId: "",
      }),
    ).toBe(join(tmpdir(), "morpho-test-anvil", "default", "b6bbda0d3a898dbb"));
  });
});

describe.sequential("acquireAnvilProcessSlot", () => {
  test("error: AnvilCleanupError rejects a malformed owner token", async () => {
    const forkUrl = "https://rpc.example/malformed-owner";
    const runId = "malformed-owner";
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    const lockDirectory = anvilSlotLockDirectory({ forkUrl, runId });
    const lockPath = join(lockDirectory, "0.lock");
    lockDirectories.push(lockDirectory);
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(join(lockPath, "owner"), "corrupt\n");

    await expect(
      acquireAnvilProcessSlot({
        forkUrl,
        runId,
        signal: AbortSignal.timeout(100),
      }),
    ).rejects.toBeInstanceOf(AnvilCleanupError);
  });

  test("error: preserves reservation and candidate cleanup failures together", async () => {
    const forkUrl = "https://rpc.example/candidate-cleanup";
    const runId = "candidate-cleanup";
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC = "1";
    const lockDirectory = anvilSlotLockDirectory({ forkUrl, runId });
    const lockPath = join(lockDirectory, "0.lock");
    lockDirectories.push(lockDirectory);
    mkdirSync(lockPath, { recursive: true });
    writeFileSync(join(lockPath, "owner"), "corrupt\n");
    const cleanupError = new Error("candidate removal failed");
    rmSyncMock.mockImplementationOnce(() => {
      throw cleanupError;
    });

    const error = await acquireAnvilProcessSlot({ forkUrl, runId }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors[0]).toBeInstanceOf(AnvilCleanupError);
    expect(error.cause.errors[1]).toBe(cleanupError);
  });
});

describe.sequential("registerChildProcess", () => {
  test("error: AnvilStartupError rejects an invalid process identifier", async () => {
    const { processSlot } = await acquireTestProcessSlot("invalid-pid");

    expect(() => processSlot.registerChildProcess(0, "child")).toThrow(
      AnvilStartupError,
    );
    await processSlot.release();
  });

  test("error: AnvilStartupError rejects an empty process identity", async () => {
    const { processSlot } = await acquireTestProcessSlot("empty-identity");

    expect(() => processSlot.registerChildProcess(41_005, "")).toThrow(
      AnvilStartupError,
    );
    await processSlot.release();
  });

  test("error: AnvilStartupError rejects a lost slot reservation", async () => {
    const { lockDirectory, processSlot } =
      await acquireTestProcessSlot("lost-owner");
    writeFileSync(join(lockDirectory, "0.lock", "owner"), "another-worker\n");

    expect(() => processSlot.registerChildProcess(41_006, "child")).toThrow(
      AnvilStartupError,
    );
    await processSlot.release();
  });
});

describe.sequential("terminateAbandonedAnvilProcess", () => {
  test("behavior: never signals a process whose PID was reused", async () => {
    const pid = 41_001;
    const identity = "expected-child";
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
    execFileSyncMock.mockReturnValue(
      `${ANVIL_PROCESS_IDENTITY_PREFIX}different-child`,
    );

    await terminateAbandonedAnvilProcess(pid, identity);

    expect(killSpy).toHaveBeenCalledOnce();
    expect(killSpy).toHaveBeenCalledWith(pid, 0);
    expect(killSpy).not.toHaveBeenCalledWith(pid, "SIGINT");
    expect(killSpy).not.toHaveBeenCalledWith(pid, "SIGKILL");
    expect(String(execFileSyncMock.mock.calls)).not.toContain("eww");
    expect(String(execFileSyncMock.mock.calls)).not.toContain("command=");
  });

  test("error: discards process command output from identity failures", async () => {
    const pid = 41_004;
    const secret = "https://rpc.example/private-key";
    const processIdentityError = Object.assign(new Error("ps failed"), {
      output: [null, secret, secret],
      stderr: secret,
      stdout: secret,
    });
    const inspectionError = new Error("permission denied");
    vi.spyOn(process, "kill")
      .mockReturnValueOnce(true)
      .mockImplementationOnce(() => {
        throw inspectionError;
      });
    execFileSyncMock.mockImplementation(() => {
      throw processIdentityError;
    });

    const error = await terminateAbandonedAnvilProcess(
      pid,
      "expected-child",
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    const [identityFailure, livenessFailure] = error.cause.errors;
    expect(identityFailure).toBeInstanceOf(AnvilCleanupError);
    expect(identityFailure).not.toHaveProperty("output");
    expect(identityFailure).not.toHaveProperty("stderr");
    expect(identityFailure).not.toHaveProperty("stdout");
    expect(String(identityFailure)).not.toContain(secret);
    expect(livenessFailure).toBe(inspectionError);
  });

  test("behavior: force-kills an identified child after graceful timeout", async () => {
    const pid = 41_002;
    const identity = "force-kill-child";
    let forceKilled = false;
    const killSpy = vi
      .spyOn(process, "kill")
      .mockImplementation((target, signal) => {
        expect(target).toBe(pid);
        if (signal === 0 && forceKilled) {
          const error = new Error("process exited") as NodeJS.ErrnoException;
          error.code = "ESRCH";
          throw error;
        }
        if (signal === "SIGKILL") forceKilled = true;
        return true;
      });
    execFileSyncMock.mockReturnValue(
      `${ANVIL_PROCESS_IDENTITY_PREFIX}${identity}`,
    );

    const termination = terminateAbandonedAnvilProcess(pid, identity);
    await termination;

    expect(killSpy).toHaveBeenCalledWith(pid, "SIGINT");
    expect(killSpy).toHaveBeenCalledWith(pid, "SIGKILL");
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
  });

  test("error: AnvilCleanupError bounds a child that survives SIGKILL", async () => {
    const pid = 41_003;
    const identity = "unkillable-child";
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
    execFileSyncMock.mockReturnValue(
      `${ANVIL_PROCESS_IDENTITY_PREFIX}${identity}`,
    );

    const termination = terminateAbandonedAnvilProcess(pid, identity);
    const rejection =
      expect(termination).rejects.toBeInstanceOf(AnvilCleanupError);
    await rejection;

    expect(killSpy).toHaveBeenCalledWith(pid, "SIGINT");
    expect(killSpy).toHaveBeenCalledWith(pid, "SIGKILL");
  });
});
