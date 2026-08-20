import { spawn } from "node:child_process";
import _kebabCase from "lodash.kebabcase";
import {
  AnvilCleanupError,
  AnvilProcessError,
  AnvilStartupError,
  createAnvilFailureCleanupError,
} from "./errors.js";

const ANVIL_FORCE_KILL_TIMEOUT_MS = 5_000;
const ANVIL_PROCESS_CLOSE_TIMEOUT_MS = 10_000;

export interface AnvilArgs {
  /**
   * Number of dev accounts to generate and configure.
   *
   * @defaultValue 10
   */
  accounts?: number | undefined;
  /**
   * Set the Access-Control-Allow-Origin response header (CORS).
   *
   * @defaultValue *
   */
  allowOrigin?: string | undefined;
  /**
   * Enable autoImpersonate on startup
   */
  autoImpersonate?: boolean | undefined;
  /**
   * The balance of every dev account in Ether.
   *
   * @defaultValue 10000
   */
  balance?: number | bigint | undefined;
  /**
   * The base fee in a block.
   */
  blockBaseFeePerGas?: number | bigint | undefined;
  /**
   * Block time in seconds for interval mining.
   */
  blockTime?: number | undefined;
  /**
   * Path or alias to the Anvil binary.
   */
  binary?: string | undefined;
  /**
   * The chain id.
   */
  chainId?: number | undefined;
  /**
   * EIP-170: Contract code size limit in bytes. Useful to increase this because of tests.
   *
   * @defaultValue 0x6000 (~25kb)
   */
  codeSizeLimit?: number | undefined;
  /**
   * Sets the number of assumed available compute units per second for this fork provider.
   *
   * @defaultValue 350
   * @see https://github.com/alchemyplatform/alchemy-docs/blob/master/documentation/compute-units.md#rate-limits-cups
   */
  computeUnitsPerSecond?: number | undefined;
  /**
   * Writes output of `anvil` as json to user-specified file.
   */
  configOut?: string | undefined;
  /**
   * Sets the derivation path of the child key to be derived.
   *
   * @defaultValue m/44'/60'/0'/0/
   */
  derivationPath?: string | undefined;
  /**
   * Disable the `call.gas_limit <= block.gas_limit` constraint.
   */
  disableBlockGasLimit?: boolean | undefined;
  /**
   * Dump the state of chain on exit to the given file. If the value is a directory, the state will be
   * written to `<VALUE>/state.json`.
   */
  dumpState?: string | undefined;
  /**
   * Fetch state over a remote endpoint instead of starting from an empty state.
   *
   * If you want to fetch state from a specific block number, add a block number like `http://localhost:8545@1400000`
   * or use the `forkBlockNumber` option.
   */
  forkUrl?: string | undefined;
  /**
   * Fetch state from a specific block number over a remote endpoint.
   *
   * Requires `forkUrl` to be set.
   */
  forkBlockNumber?: number | bigint | undefined;
  /**
   * Specify chain id to skip fetching it from remote endpoint. This enables offline-start mode.
   *
   * You still must pass both `forkUrl` and `forkBlockNumber`, and already have your required state cached
   * on disk, anything missing locally would be fetched from the remote.
   */
  forkChainId?: number | undefined;
  /**
   * Specify headers to send along with any request to the remote JSON-RPC server in forking mode.
   *
   * e.g. "User-Agent: test-agent"
   *
   * Requires `forkUrl` to be set.
   */
  forkHeader?: Record<string, string> | undefined;
  /**
   * Initial retry backoff on encountering errors.
   */
  forkRetryBackoff?: number | undefined;
  /**
   * The block gas limit.
   */
  gasLimit?: number | bigint | undefined;
  /**
   * The gas price.
   */
  gasPrice?: number | bigint | undefined;
  /**
   * Disable minimum priority fee to set the gas price to zero.
   */
  disableMinPriorityFee?: boolean | undefined;
  /**
   * The EVM hardfork to use.
   */
  hardfork?:
    | "Frontier"
    | "Homestead"
    | "Dao"
    | "Tangerine"
    | "SpuriousDragon"
    | "Byzantium"
    | "Constantinople"
    | "Petersburg"
    | "Istanbul"
    | "Muirglacier"
    | "Berlin"
    | "London"
    | "ArrowGlacier"
    | "GrayGlacier"
    | "Paris"
    | "Shanghai"
    | "Cancun"
    | "Prague"
    | "Osaka"
    | "Latest"
    | undefined;
  /**
   * The host the server will listen on.
   */
  host?: string | undefined;
  /**
   * Initialize the genesis block with the given `genesis.json` file.
   */
  init?: string | undefined;
  /**
   * Launch an ipc server at the given path or default path = `/tmp/anvil.ipc`.
   */
  ipc?: string | undefined;
  /**
   * Initialize the chain from a previously saved state snapshot.
   */
  loadState?: string | undefined;
  /**
   * BIP39 mnemonic phrase used for generating accounts.
   */
  mnemonic?: string | undefined;
  /**
   * Automatically generates a BIP39 mnemonic phrase, and derives accounts from it.
   */
  mnemonicRandom?: boolean | undefined;
  /**
   * Disable CORS.
   */
  noCors?: boolean | undefined;
  /**
   * Disable auto and interval mining, and mine on demand instead.
   */
  noMining?: boolean | undefined;
  /**
   * Disables rate limiting for this node's provider.
   *
   * @defaultValue false
   * @see https://github.com/alchemyplatform/alchemy-docs/blob/master/documentation/compute-units.md#rate-limits-cups
   */
  noRateLimit?: boolean | undefined;
  /**
   * Explicitly disables the use of RPC caching.
   *
   * All storage slots are read entirely from the endpoint.
   */
  noStorageCaching?: boolean | undefined;
  /**
   * How transactions are sorted in the mempool.
   *
   * @defaultValue fees
   */
  order?: string | undefined;
  /**
   * Run an Optimism chain.
   */
  optimism?: boolean | undefined;
  /**
   * Port number to listen on.
   *
   * @defaultValue 8545
   */
  port?: number | undefined;
  /**
   * Don't keep full chain history. If a number argument is specified, at most this number of states is kept in memory.
   */
  pruneHistory?: number | undefined | boolean;
  /**
   * Number of retry requests for spurious networks (timed out requests).
   *
   * @defaultValue 5
   */
  retries?: number | undefined;
  /**
   * Don't print anything on startup and don't print logs.
   */
  silent?: boolean | undefined;
  /**
   * Slots in an epoch.
   */
  slotsInAnEpoch?: number | undefined;
  /**
   * Enable steps tracing used for debug calls returning geth-style traces.
   */
  stepsTracing?: boolean | undefined;
  /**
   * Interval in seconds at which the status is to be dumped to disk.
   */
  stateInterval?: number | undefined;
  /**
   * This is an alias for both `loadState` and `dumpState`. It initializes the chain with the state stored at the
   * file, if it exists, and dumps the chain's state on exit
   */
  state?: string | undefined;
  /**
   * Timeout in ms for requests sent to remote JSON-RPC server in forking mode.
   *
   * @defaultValue 45000
   */
  timeout?: number | undefined;
  /**
   * The timestamp of the genesis block.
   */
  timestamp?: number | bigint | undefined;
  /**
   * Number of blocks with transactions to keep in memory.
   */
  transactionBlockKeeper?: number | undefined;
}

/**
 * Converts an object of options to an array of command line arguments.
 *
 * @param options The options object.
 * @returns The command line arguments.
 */
function toArgs(obj: AnvilArgs) {
  return Object.entries(obj).flatMap<string>(([key, value]) => {
    if (value === undefined) return [];

    if (Array.isArray(value)) return [`--${_kebabCase(key)}`, value.join(",")];

    if (typeof value === "object" && value !== null) {
      return Object.entries(value).flatMap(([subKey, subValue]) => {
        if (subValue === undefined) return [];

        const flag = `--${_kebabCase(`${key}.${subKey}`)}`;
        return [flag, Array.isArray(subValue) ? subValue.join(",") : subValue];
      });
    }

    const flag = `--${_kebabCase(key)}`;

    if (value === false) return [];
    if (value === true) return [flag];

    const stringified = value.toString();
    if (stringified === "") return [flag];

    return [flag, stringified];
  });
}

/** Options controlling the local Anvil process lifecycle. */
export interface SpawnAnvilOptions {
  /** Cancels startup when aborted. */
  readonly signal?: AbortSignal | undefined;
}

/** An isolated local Anvil process and its cleanup controls. */
export interface SpawnedAnvil {
  /** URL of the listening local JSON-RPC server. */
  readonly rpcUrl: `http://localhost:${number}`;
  /** Sends the first shutdown signal synchronously. */
  readonly stop: () => boolean;
  /**
   * Sends the shutdown signal and waits for process cleanup.
   *
   * @returns Whether the initial shutdown signal was sent.
   * @throws {AnvilProcessError} When Anvil exited before shutdown was requested.
   * @throws {AnvilCleanupError} When process cleanup cannot be confirmed.
   */
  readonly stopAndWait: () => Promise<boolean>;
}

/**
 * Starts an isolated Anvil process and resolves when its RPC server is listening.
 *
 * @param args Anvil command-line arguments and optional binary path.
 * @param options Cancellation options for startup.
 * @returns The local RPC URL and idempotent process cleanup controls.
 * @throws {AnvilStartupError} When Anvil cannot start or begin listening.
 * @throws {AnvilCleanupError} When a process or failed startup cannot be cleaned safely.
 * @example
 * ```ts
 * import { spawnAnvil } from "@morpho-org/test";
 *
 * const anvil = await spawnAnvil({ chainId: 1 });
 * try {
 *   console.log(anvil.rpcUrl);
 * } finally {
 *   await anvil.stopAndWait();
 * }
 * ```
 */
export const spawnAnvil = async (
  args: AnvilArgs,
  options: SpawnAnvilOptions = {},
): Promise<SpawnedAnvil> => {
  if (options.signal?.aborted) {
    throw new AnvilStartupError(
      "Anvil startup was cancelled before the process launched. Retry when startup can continue.",
      { cause: options.signal.reason },
    );
  }

  const { binary = "anvil", ...anvilArgs } = args;
  let port = args.port ?? 0;

  try {
    const subprocess = spawn(binary, toArgs({ ...anvilArgs, port }));
    let stopInitiated = false;
    let stopRequested = false;
    let forceKillTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let processCloseTimeout:
      | ReturnType<typeof globalThis.setTimeout>
      | undefined;
    let processCloseObserved = false;
    let cleanupAwaited = false;
    const {
      promise: processClosed,
      resolve: resolveProcessClosed,
      reject: rejectProcessClosed,
    } = Promise.withResolvers<void>();
    // Keep `stop()` backward-compatible without hiding a cleanup failure from stop-only callers.
    void processClosed.catch((error) => {
      if (!cleanupAwaited)
        console.warn(
          "Anvil process lifecycle failed. Use stopAndWait() to handle process and cleanup failures.",
          error,
        );
    });

    // Signal synchronously for API compatibility; close owns cleanup.
    const stopProcess = () => {
      if (stopInitiated) return false;
      stopInitiated = true;
      if (processCloseObserved) return false;

      // An exit code can be visible before stdio closes. Wait for `close`.
      let signalSent = false;
      if (subprocess.exitCode === null) {
        stopRequested = true;
        try {
          signalSent = subprocess.kill("SIGINT");
        } catch (error) {
          console.warn("Failed to send SIGINT to Anvil.", error);
        }

        forceKillTimeout = globalThis.setTimeout(() => {
          if (processCloseObserved || subprocess.exitCode !== null) return;

          try {
            if (!subprocess.kill("SIGKILL"))
              console.warn("Failed to send SIGKILL to Anvil after timeout.");
          } catch (error) {
            console.warn(
              "Failed to send SIGKILL to Anvil after timeout.",
              error,
            );
          }
        }, ANVIL_FORCE_KILL_TIMEOUT_MS);
        if (
          typeof forceKillTimeout === "object" &&
          "unref" in forceKillTimeout
        ) {
          forceKillTimeout.unref();
        }
      }

      processCloseTimeout = globalThis.setTimeout(() => {
        if (processCloseObserved) return;
        rejectProcessClosed(
          new AnvilCleanupError(
            `Anvil did not close within "${ANVIL_PROCESS_CLOSE_TIMEOUT_MS}" ms after shutdown began. Stop it manually before retrying.`,
          ),
        );
      }, ANVIL_PROCESS_CLOSE_TIMEOUT_MS);
      if (
        typeof processCloseTimeout === "object" &&
        "unref" in processCloseTimeout
      ) {
        processCloseTimeout.unref();
      }

      return signalSent;
    };

    const stopAndWait = async () => {
      cleanupAwaited = true;
      const signalSent = stopProcess();
      await processClosed;
      return signalSent;
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let stderr = "";
      let stdout = "";
      const startupTimeoutMs =
        Math.max(args.timeout ?? 45_000, 45_000) + 15_000;
      const startupTimeout = globalThis.setTimeout(() => {
        const details = stderr.trim();
        fail(
          new AnvilStartupError(
            `Anvil did not start listening within "${startupTimeoutMs}" ms. Check the fork URL and Anvil arguments.${details ? ` ${details}` : ""}`,
          ),
        );
      }, startupTimeoutMs);

      const fail = (error: AnvilStartupError) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(startupTimeout);
        options.signal?.removeEventListener("abort", abortStartup);
        cleanupAwaited = true;
        stopProcess();
        void processClosed.then(
          () => reject(error),
          (cleanupError) =>
            reject(
              createAnvilFailureCleanupError({
                cleanupError,
                failure: error,
                message:
                  "Anvil failed during startup and cleanup also failed. Inspect both failures and stop the process manually before retrying.",
              }),
            ),
        );
      };

      function abortStartup() {
        fail(
          new AnvilStartupError(
            "Anvil startup was cancelled before its RPC server began listening. Retry when startup can continue.",
            { cause: options.signal?.reason },
          ),
        );
      }
      subprocess.stdout.on("data", (data) => {
        // Anvil can split its listening message across stdout chunks.
        stdout = `${stdout}${data.toString()}`.slice(-1_024);
        const listenMatch = stdout.match(
          /Listening on 127\.0\.0\.1:(\d+)\r?\n/,
        );
        if (!listenMatch || settled) return;
        const listenedPort = listenMatch[1];
        if (listenedPort === undefined) return;

        port = Number.parseInt(listenedPort, 10);
        settled = true;
        globalThis.clearTimeout(startupTimeout);
        options.signal?.removeEventListener("abort", abortStartup);
        resolve();
      });

      subprocess.stderr.on("data", (data) => {
        // Startup warnings are diagnostic; only timeout, error, or early close is fatal.
        const dataString = data.toString();
        stderr = `${stderr}${dataString}`.slice(-4_096);
        if (settled && !stopRequested)
          console.warn(`[port ${port || "??"}] ${dataString}`);
      });

      subprocess.once("error", (error) => {
        fail(
          new AnvilStartupError(
            `Anvil failed to start on port "${port || "auto"}". Check that the binary and arguments are valid.`,
            { cause: error },
          ),
        );
      });

      subprocess.once("close", (code, signal) => {
        processCloseObserved = true;
        const details = stderr.trim();
        const unexpectedExit =
          settled && !stopRequested
            ? new AnvilProcessError(
                `Anvil exited unexpectedly after startup (code "${code}", signal "${signal}"). Retry the test and inspect the process logs.${
                  details ? ` ${details}` : ""
                }`,
              )
            : undefined;
        if (forceKillTimeout !== undefined)
          globalThis.clearTimeout(forceKillTimeout);
        if (processCloseTimeout !== undefined)
          globalThis.clearTimeout(processCloseTimeout);
        subprocess.stdout.destroy();
        subprocess.stderr.destroy();
        subprocess.unref();
        if (unexpectedExit === undefined) resolveProcessClosed();
        else rejectProcessClosed(unexpectedExit);
        if (settled) return;
        fail(
          new AnvilStartupError(
            `Anvil exited before listening on port "${port || "auto"}" (code "${code}", signal "${signal}").${details ? ` ${details}` : ""}`,
          ),
        );
      });

      if (!settled) {
        options.signal?.addEventListener("abort", abortStartup, { once: true });
        if (options.signal?.aborted) abortStartup();
      }
    });

    return {
      rpcUrl: `http://localhost:${port}`,
      stop: stopProcess,
      stopAndWait,
    };
  } catch (error) {
    const failure =
      error instanceof AnvilStartupError || error instanceof AnvilCleanupError
        ? error
        : new AnvilStartupError(
            "Anvil failed before startup completed. Check the binary, arguments, and temporary directory.",
            { cause: error },
          );

    throw failure;
  }
};
