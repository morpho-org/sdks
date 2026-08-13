import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import _kebabCase from "lodash.kebabcase";

/**
 * Error thrown when Anvil exits or fails before its RPC server starts listening.
 *
 * @example
 * ```ts
 * import { AnvilStartupError, spawnAnvil } from "@morpho-org/test";
 *
 * try {
 *   await spawnAnvil({ forkUrl: process.env.MAINNET_RPC_URL });
 * } catch (error) {
 *   if (error instanceof AnvilStartupError) console.error(error.message);
 * }
 * ```
 */
export class AnvilStartupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnvilStartupError";
  }
}

const getMaxConcurrentAnvilProcessesPerRpc = () => {
  const configuredValue =
    process.env.MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC ??
    (process.env.CI ? "2" : undefined);
  if (configuredValue === undefined) return undefined;

  const value = Number.parseInt(configuredValue, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

const acquireAnvilProcessSlot = async (
  maxProcessesPerRpc: number | undefined,
  forkUrl: string | undefined,
) => {
  if (maxProcessesPerRpc === undefined || forkUrl === undefined)
    return () => {};

  const configuredRunId = process.env.MORPHO_TEST_ANVIL_RUN_ID;
  const githubRun = process.env.GITHUB_RUN_ID;
  const githubAttempt = process.env.GITHUB_RUN_ATTEMPT;
  const runId = (
    configuredRunId ??
    (githubRun ? `${githubRun}-${githubAttempt ?? "1"}` : String(process.ppid))
  ).replaceAll(/[^a-zA-Z0-9_-]/g, "_");
  const rpcId = createHash("sha256").update(forkUrl).digest("hex").slice(0, 16);
  const lockDirectory = join(tmpdir(), "morpho-test-anvil", runId, rpcId);
  mkdirSync(lockDirectory, { recursive: true });

  while (true) {
    for (let slot = 0; slot < maxProcessesPerRpc; slot++) {
      const lockPath = join(lockDirectory, `${slot}.lock`);
      let descriptor: number | undefined;

      try {
        descriptor = openSync(lockPath, "wx");
        writeFileSync(descriptor, `${process.pid}\n`);
        closeSync(descriptor);
        descriptor = undefined;

        let released = false;
        return () => {
          if (released) return;
          released = true;

          try {
            unlinkSync(lockPath);
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !("code" in error) ||
              error.code !== "ENOENT"
            )
              console.warn(`Failed to release Anvil slot "${slot}".`, error);
          }
        };
      } catch (error) {
        if (descriptor !== undefined) closeSync(descriptor);
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST"
        )
          continue;
        throw error;
      }
    }

    await setTimeout(25);
  }
};

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

/**
 * Starts an isolated Anvil process and resolves when its RPC server is listening.
 * CI processes sharing a fork URL also share its bounded RPC budget; set
 * `MORPHO_TEST_MAX_ANVIL_PROCESSES_PER_RPC` to override the default limit of two
 * concurrent processes per upstream RPC. Processes using other fork URLs remain concurrent.
 *
 * @param args Anvil command-line arguments and optional binary path.
 * @returns The local RPC URL and an idempotent process cleanup function.
 * @throws {AnvilStartupError} When Anvil cannot start or exits before listening.
 * @example
 * ```ts
 * import { spawnAnvil } from "@morpho-org/test";
 *
 * const anvil = await spawnAnvil({ chainId: 1 });
 * try {
 *   console.log(anvil.rpcUrl);
 * } finally {
 *   anvil.stop();
 * }
 * ```
 */
export const spawnAnvil = async (
  args: AnvilArgs,
): Promise<{
  rpcUrl: `http://localhost:${number}`;
  stop: () => boolean;
}> => {
  const maxProcessesPerRpc = getMaxConcurrentAnvilProcessesPerRpc();
  const releaseProcessSlot = await acquireAnvilProcessSlot(
    maxProcessesPerRpc,
    args.forkUrl,
  );
  const { binary = "anvil", ...anvilArgs } = args;
  let port = args.port ?? 0;

  try {
    const subprocess = spawn(binary, toArgs({ ...anvilArgs, port }));
    let stopped = false;

    const stopProcess = () => {
      if (stopped) return false;
      stopped = true;

      try {
        return subprocess.exitCode === null ? subprocess.kill("SIGINT") : false;
      } finally {
        subprocess.stdout.destroy();
        subprocess.stderr.destroy();
        subprocess.unref();
        releaseProcessSlot();
      }
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let stderr = "";
      let stdout = "";
      const startupTimeoutMs =
        Math.max(args.timeout ?? 45_000, 45_000) + 15_000;
      const startupTimeout = globalThis.setTimeout(() => {
        fail(
          new AnvilStartupError(
            `Anvil did not start listening within "${startupTimeoutMs}" ms. Check the fork URL and Anvil arguments.`,
          ),
        );
      }, startupTimeoutMs);

      const fail = (error: AnvilStartupError) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(startupTimeout);
        stopProcess();
        reject(error);
      };

      subprocess.stdout.on("data", (data) => {
        stdout = `${stdout}${data.toString()}`.slice(-1_024);
        const listenMatch = stdout.match(/Listening on 127.0.0.1:(\d+)/);
        if (!listenMatch || settled) return;
        const listenedPort = listenMatch[1];
        if (listenedPort === undefined) return;

        port = Number.parseInt(listenedPort, 10);
        settled = true;
        globalThis.clearTimeout(startupTimeout);
        resolve();
      });

      subprocess.stderr.on("data", (data) => {
        const dataString = data.toString();
        stderr = `${stderr}${dataString}`.slice(-4_096);
        if (settled && !stopped)
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
        if (settled) return;
        const rawDetails = stderr.trim();
        const details = args.forkUrl
          ? rawDetails.replaceAll(args.forkUrl, "<fork-url>")
          : rawDetails;
        fail(
          new AnvilStartupError(
            `Anvil exited before listening on port "${port || "auto"}" (code "${code}", signal "${signal}").${details ? ` ${details}` : ""}`,
          ),
        );
      });
    });

    return {
      rpcUrl: `http://localhost:${port}`,
      stop: stopProcess,
    };
  } catch (error) {
    releaseProcessSlot();
    throw error;
  }
};
