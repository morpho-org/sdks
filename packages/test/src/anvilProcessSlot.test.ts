import { afterEach, describe, expect, test, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: execFileSyncMock };
});

import {
  ANVIL_PROCESS_IDENTITY_ENV,
  terminateAbandonedAnvilProcess,
} from "./anvilProcessSlot.js";
import { AnvilCleanupError } from "./errors.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  execFileSyncMock.mockReset();
});

describe.sequential("terminateAbandonedAnvilProcess", () => {
  test("behavior: never signals a process whose PID was reused", async () => {
    const pid = 41_001;
    const identity = "expected-child";
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
    execFileSyncMock.mockReturnValue(
      `anvil ${ANVIL_PROCESS_IDENTITY_ENV}=different-child`,
    );

    await terminateAbandonedAnvilProcess(pid, identity);

    expect(killSpy).toHaveBeenCalledOnce();
    expect(killSpy).toHaveBeenCalledWith(pid, 0);
    expect(killSpy).not.toHaveBeenCalledWith(pid, "SIGINT");
    expect(killSpy).not.toHaveBeenCalledWith(pid, "SIGKILL");
  });

  test("error: preserves process identity and liveness failures", async () => {
    const pid = 41_004;
    const processDescriptionError = new Error("ps failed");
    const inspectionError = new Error("permission denied");
    vi.spyOn(process, "kill")
      .mockReturnValueOnce(true)
      .mockImplementationOnce(() => {
        throw inspectionError;
      });
    execFileSyncMock.mockImplementation(() => {
      throw processDescriptionError;
    });

    const error = await terminateAbandonedAnvilProcess(
      pid,
      "expected-child",
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnvilCleanupError);
    if (!(error instanceof AnvilCleanupError)) throw error;
    expect(error.cause).toBeInstanceOf(AggregateError);
    if (!(error.cause instanceof AggregateError)) throw error.cause;
    expect(error.cause.errors).toEqual([
      processDescriptionError,
      inspectionError,
    ]);
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
      `anvil ${ANVIL_PROCESS_IDENTITY_ENV}=${identity}`,
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
      `anvil ${ANVIL_PROCESS_IDENTITY_ENV}=${identity}`,
    );

    const termination = terminateAbandonedAnvilProcess(pid, identity);
    const rejection =
      expect(termination).rejects.toBeInstanceOf(AnvilCleanupError);
    await rejection;

    expect(killSpy).toHaveBeenCalledWith(pid, "SIGINT");
    expect(killSpy).toHaveBeenCalledWith(pid, "SIGKILL");
  });
});
