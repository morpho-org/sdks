import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { AnvilCleanupError, AnvilStartupError } from "./errors.js";

const ANVIL_PROCESS_SLOT_TIMEOUT_MS = 120_000;
const ANVIL_PROCESS_SLOT_RELEASE_TIMEOUT_MS = 5_000;
const ANVIL_PROCESS_SLOT_RETRY_DELAY_MS = 25;
const ANVIL_ABANDONED_PROCESS_GRACE_PERIOD_MS = 1_000;
const ANVIL_ABANDONED_PROCESS_KILL_TIMEOUT_MS = 5_000;

/** Environment marker used to distinguish an owned Anvil child from a reused PID. @internal */
export const ANVIL_PROCESS_IDENTITY_ENV = "MORPHO_TEST_ANVIL_PROCESS_IDENTITY";

const hasErrorCode = (error: unknown, code: string) =>
  error instanceof Error && "code" in error && error.code === code;

/**
 * Controls an acquired Anvil process slot.
 *
 * @internal
 */
export interface AnvilProcessSlot {
  /** Records the spawned Anvil PID so another worker can clean it up after an owner crash. */
  readonly registerChildProcess: (pid: number, identity: string) => void;
  /** Releases the slot after the registered Anvil process has closed. */
  readonly release: () => Promise<void>;
}

type AbandonedAnvilProcessState = "absent" | "owned" | "reused";

const inspectAbandonedAnvilProcess = (
  pid: number,
  identity: string,
): AbandonedAnvilProcessState => {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) return "absent";
    throw new AnvilCleanupError(
      `Abandoned Anvil process "${pid}" could not be inspected. Check process permissions before retrying.`,
      { cause: error },
    );
  }

  let processDescription: string;
  try {
    // `eww` includes the full child environment on both BSD and GNU ps. The
    // random marker survives exec and distinguishes this child from PID reuse.
    processDescription = execFileSync(
      "ps",
      ["eww", "-p", String(pid), "-o", "command="],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch (processDescriptionError) {
    const message = `Abandoned Anvil process "${pid}" still exists, but its identity could not be verified. Refusing to signal it; inspect the stale lock manually before retrying.`;
    try {
      process.kill(pid, 0);
    } catch (inspectionError) {
      if (hasErrorCode(inspectionError, "ESRCH")) return "absent";
      throw new AnvilCleanupError(message, {
        cause: new AggregateError(
          [processDescriptionError, inspectionError],
          "Anvil process identity and liveness checks both failed.",
        ),
      });
    }
    throw new AnvilCleanupError(message, { cause: processDescriptionError });
  }

  const expectedMarker = `${ANVIL_PROCESS_IDENTITY_ENV}=${identity}`;
  return processDescription.split(/\s+/).includes(expectedMarker)
    ? "owned"
    : "reused";
};

/**
 * Stops an Anvil process whose owning worker exited without cleaning it up.
 *
 * @param pid Process identifier recorded by the dead worker.
 * @param identity Random identity recorded in both the lock and child environment.
 * @returns A promise that resolves only after the process no longer exists.
 * @throws {AnvilCleanupError} When the process cannot be signalled or its exit cannot be confirmed.
 * @internal
 */
export const terminateAbandonedAnvilProcess = async (
  pid: number,
  identity: string,
): Promise<void> => {
  if (inspectAbandonedAnvilProcess(pid, identity) !== "owned") return;

  try {
    process.kill(pid, "SIGINT");
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) return;
    throw new AnvilCleanupError(
      `Abandoned Anvil process "${pid}" could not be stopped gracefully. Check process permissions before retrying.`,
      { cause: error },
    );
  }

  const gracefulDeadline = Date.now() + ANVIL_ABANDONED_PROCESS_GRACE_PERIOD_MS;
  while (Date.now() < gracefulDeadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (hasErrorCode(error, "ESRCH")) return;
      throw new AnvilCleanupError(
        `Abandoned Anvil process "${pid}" could not be inspected during shutdown. Check process permissions before retrying.`,
        { cause: error },
      );
    }
    await setTimeout(ANVIL_PROCESS_SLOT_RETRY_DELAY_MS);
  }

  // The original child may have exited and its PID may have been reused while
  // graceful shutdown was pending. Verify the nonce again before SIGKILL.
  if (inspectAbandonedAnvilProcess(pid, identity) !== "owned") return;

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) return;
    throw new AnvilCleanupError(
      `Abandoned Anvil process "${pid}" could not be force-killed. Check process permissions before retrying.`,
      { cause: error },
    );
  }

  if (inspectAbandonedAnvilProcess(pid, identity) !== "owned") return;

  const forceKillDeadline =
    Date.now() + ANVIL_ABANDONED_PROCESS_KILL_TIMEOUT_MS;
  while (Date.now() < forceKillDeadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (hasErrorCode(error, "ESRCH")) return;
      throw new AnvilCleanupError(
        `Abandoned Anvil process "${pid}" could not be inspected after SIGKILL. Check process permissions before retrying.`,
        { cause: error },
      );
    }
    await setTimeout(ANVIL_PROCESS_SLOT_RETRY_DELAY_MS);
  }

  throw new AnvilCleanupError(
    `Abandoned Anvil process "${pid}" did not exit after SIGKILL. Stop it manually before retrying so the shared RPC budget remains bounded.`,
  );
};

/**
 * Reserves a cross-process Anvil slot for one fork URL using atomic lock directories.
 *
 * @param parameters Fork URL, run identifier, and optional cancellation signal.
 * @returns Controls that register the spawned child and release the reserved slot.
 * @throws {AnvilStartupError} When reservation is cancelled or exceeds its deadline.
 * @throws {AnvilCleanupError} When an abandoned child or acquired slot cannot be cleaned safely.
 * @internal
 */
export const acquireAnvilProcessSlot = async (parameters: {
  readonly forkUrl: string | undefined;
  readonly runId: string;
  readonly signal?: AbortSignal | undefined;
}): Promise<AnvilProcessSlot> => {
  const configuredValue = process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC;
  if (configuredValue === undefined || parameters.forkUrl === undefined)
    return {
      registerChildProcess: () => {},
      release: () => Promise.resolve(),
    };

  if (configuredValue === "0")
    return {
      registerChildProcess: () => {},
      release: () => Promise.resolve(),
    };

  const maxProcessesPerRpc = Number(configuredValue);
  if (
    !/^[1-9]\d*$/.test(configuredValue) ||
    !Number.isSafeInteger(maxProcessesPerRpc)
  )
    throw new AnvilStartupError(
      `MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC must be "0" to disable limiting or a positive safe integer, got "${configuredValue}". Update the environment variable and retry.`,
    );

  const { forkUrl, runId, signal } = parameters;
  const reservationDeadline = Date.now() + ANVIL_PROCESS_SLOT_TIMEOUT_MS;
  const assertReservationActive = () => {
    if (signal?.aborted) {
      throw new AnvilStartupError(
        "Anvil process-slot reservation was cancelled. Retry the test after the competing fork finishes.",
        { cause: signal.reason },
      );
    }
    if (Date.now() >= reservationDeadline) {
      throw new AnvilStartupError(
        `Anvil could not reserve a process slot within "${ANVIL_PROCESS_SLOT_TIMEOUT_MS}" ms. Increase the shared RPC budget or reduce fork concurrency.`,
      );
    }
  };

  assertReservationActive();
  // Vitest workers can be separate processes, so atomic directories form the shared semaphore.
  const safeRunId = runId.replaceAll(/[^a-zA-Z0-9_-]/g, "_") || "default";
  // Hash the URL so credentials never appear in the temporary directory name.
  const rpcId = createHash("sha256").update(forkUrl).digest("hex").slice(0, 16);
  const lockDirectory = join(tmpdir(), "morpho-test-anvil", safeRunId, rpcId);
  mkdirSync(lockDirectory, { recursive: true });

  const ownerId = `${process.pid}-${randomUUID()}`;
  const candidatePath = join(lockDirectory, `.${ownerId}.candidate`);
  mkdirSync(candidatePath);

  try {
    writeFileSync(join(candidatePath, "owner"), `${ownerId}\n`);
    while (true) {
      assertReservationActive();
      for (let slot = 0; slot < maxProcessesPerRpc; slot++) {
        assertReservationActive();
        const lockPath = join(lockDirectory, `${slot}.lock`);

        try {
          // Publishing a populated directory by rename prevents contenders from observing a
          // partially written owner token. Existing non-empty slot directories are not replaced.
          renameSync(candidatePath, lockPath);

          let releasePromise: Promise<void> | undefined;
          return {
            registerChildProcess: (pid, identity) => {
              if (!Number.isSafeInteger(pid) || pid <= 0) {
                throw new AnvilStartupError(
                  `Anvil returned invalid process identifier "${pid}". Stop the process and retry.`,
                );
              }
              if (identity === "") {
                throw new AnvilStartupError(
                  "Anvil returned an empty process identity. Stop the process and retry.",
                );
              }

              const currentOwner = readFileSync(
                join(lockPath, "owner"),
                "utf8",
              ).trim();
              if (currentOwner !== ownerId) {
                throw new AnvilStartupError(
                  "Anvil lost its reserved process slot before startup completed. Stop the process and retry.",
                );
              }
              writeFileSync(
                join(lockPath, "child"),
                `${JSON.stringify({ identity, pid })}\n`,
              );
            },
            release: () => {
              releasePromise ??= (async () => {
                const releaseDeadline =
                  Date.now() + ANVIL_PROCESS_SLOT_RELEASE_TIMEOUT_MS;
                let warned = false;

                while (true) {
                  try {
                    const currentOwner = readFileSync(
                      join(lockPath, "owner"),
                      "utf8",
                    ).trim();
                    if (currentOwner !== ownerId) return;

                    const releasedPath = join(
                      lockDirectory,
                      `.${ownerId}.released`,
                    );
                    renameSync(lockPath, releasedPath);
                    // The slot is reusable once its lock path has been transferred.
                    try {
                      rmSync(releasedPath, { recursive: true, force: true });
                    } catch (error) {
                      if (!hasErrorCode(error, "ENOENT"))
                        console.warn(
                          `Failed to remove released Anvil slot "${slot}".`,
                          error,
                        );
                    }
                    return;
                  } catch (error) {
                    if (hasErrorCode(error, "ENOENT")) return;
                    if (
                      !hasErrorCode(error, "EBUSY") ||
                      Date.now() >= releaseDeadline
                    ) {
                      throw new AnvilCleanupError(
                        `Anvil process slot "${slot}" could not be released. Check temporary-directory permissions and remove stale locks before retrying.`,
                        { cause: error },
                      );
                    }

                    if (!warned) {
                      warned = true;
                      console.warn(
                        `Failed to release Anvil slot "${slot}"; retrying.`,
                        error,
                      );
                    }
                    await setTimeout(ANVIL_PROCESS_SLOT_RETRY_DELAY_MS);
                  }
                }
              })();

              return releasePromise;
            },
          };
        } catch (error) {
          if (error instanceof AnvilStartupError) throw error;
          if (
            !hasErrorCode(error, "EEXIST") &&
            !hasErrorCode(error, "ENOTEMPTY")
          )
            throw error;

          let lockedOwner: string;
          try {
            lockedOwner = readFileSync(join(lockPath, "owner"), "utf8").trim();
          } catch (readError) {
            if (hasErrorCode(readError, "ENOENT")) continue;
            throw readError;
          }

          const separatorIndex = lockedOwner.indexOf("-");
          const ownerPid = Number(lockedOwner.slice(0, separatorIndex));
          if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) continue;

          try {
            process.kill(ownerPid, 0);
            continue;
          } catch (ownerError) {
            // Only ESRCH proves the owner exited; permission errors may still mean it is alive.
            if (!hasErrorCode(ownerError, "ESRCH")) continue;
          }

          let currentOwner: string;
          try {
            currentOwner = readFileSync(join(lockPath, "owner"), "utf8").trim();
          } catch (readError) {
            if (hasErrorCode(readError, "ENOENT")) continue;
            throw readError;
          }
          if (currentOwner !== lockedOwner) continue;

          let childProcess:
            | { readonly identity: string; readonly pid: number }
            | undefined;
          try {
            const childRecordText = readFileSync(
              join(lockPath, "child"),
              "utf8",
            ).trim();
            const childRecord = JSON.parse(childRecordText) as unknown;
            if (
              typeof childRecord !== "object" ||
              childRecord === null ||
              !("pid" in childRecord) ||
              typeof childRecord.pid !== "number" ||
              !Number.isSafeInteger(childRecord.pid) ||
              childRecord.pid <= 0 ||
              !("identity" in childRecord) ||
              typeof childRecord.identity !== "string" ||
              childRecord.identity === ""
            ) {
              throw new AnvilCleanupError(
                `Abandoned Anvil slot "${slot}" contains an invalid child process record. Remove the stale lock manually before retrying.`,
              );
            }
            childProcess = {
              identity: childRecord.identity,
              pid: childRecord.pid,
            };
          } catch (childRecordError) {
            if (hasErrorCode(childRecordError, "ENOENT")) {
              childProcess = undefined;
            } else if (childRecordError instanceof AnvilCleanupError) {
              throw childRecordError;
            } else {
              throw new AnvilCleanupError(
                `Abandoned Anvil slot "${slot}" contains an unreadable child process record. Remove the stale lock manually before retrying.`,
                { cause: childRecordError },
              );
            }
          }

          if (childProcess !== undefined)
            await terminateAbandonedAnvilProcess(
              childProcess.pid,
              childProcess.identity,
            );

          try {
            currentOwner = readFileSync(join(lockPath, "owner"), "utf8").trim();
          } catch (readError) {
            if (hasErrorCode(readError, "ENOENT")) continue;
            throw readError;
          }
          if (currentOwner !== lockedOwner) continue;

          // Keep the non-empty tombstone for this owner. If another reclaimer observed the same
          // dead owner before this rename, it cannot rename a replacement over this directory.
          const abandonedId = createHash("sha256")
            .update(lockedOwner)
            .digest("hex")
            .slice(0, 16);
          const abandonedPath = join(
            lockDirectory,
            `.${slot}.${abandonedId}.abandoned`,
          );
          try {
            renameSync(lockPath, abandonedPath);
          } catch (renameError) {
            if (
              !hasErrorCode(renameError, "ENOENT") &&
              !hasErrorCode(renameError, "EEXIST") &&
              !hasErrorCode(renameError, "ENOTEMPTY")
            )
              throw renameError;
          }
        }
      }

      // Every slot is occupied; yield so other workers can finish and release one.
      try {
        await setTimeout(ANVIL_PROCESS_SLOT_RETRY_DELAY_MS, undefined, {
          signal,
        });
      } catch (error) {
        throw new AnvilStartupError(
          "Anvil process-slot reservation was cancelled. Retry the test after the competing fork finishes.",
          { cause: error },
        );
      }
    }
  } finally {
    rmSync(candidatePath, { recursive: true, force: true });
  }
};
