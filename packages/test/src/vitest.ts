import { setTimeout } from "node:timers/promises";
import {
  type Chain,
  type Hash,
  type Hex,
  maxUint128,
  numberToHex,
  type SendTransactionParameters,
  zeroAddress,
} from "viem";
import { afterAll, type TestAPI, type TestContext, test } from "vitest";
import { type AnvilArgs, spawnAnvil } from "./anvil.js";
import {
  type AnvilLease,
  createAnvilTransport,
  createLeasedClient,
} from "./anvilLease.js";
import { type AnvilTestClient, createAnvilTestClient } from "./client.js";
import { getErpcForkUrl } from "./erpc.js";
import {
  AnvilCleanupError,
  type AnvilLeaseClosedError,
  AnvilProcessError,
  AnvilStartupError,
  createAnvilFailureCleanupError,
} from "./errors.js";
import { createForkBootstrapBlock } from "./forkProxy.js";

// Vitest needs to serialize BigInts to JSON, so we need to add a toJSON method to BigInt.prototype.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
// @ts-expect-error
BigInt.prototype.toJSON = function () {
  return this.toString();
};

/** Fixtures exposed by a Vitest test created with {@link createViemTest}. */
export interface ViemTestContext<chain extends Chain = Chain> {
  /** An Anvil-backed viem client configured for the selected chain. */
  readonly client: AnvilTestClient<chain>;
}

/** Options for {@link createViemTest}. */
export interface ViemTestOptions {
  /**
   * Reuses one idle Anvil process across this test API's tests instead of starting one per test.
   * After each test the fixture reverts the process to the snapshot taken after setup and checks
   * the latest block is unchanged. A test whose client calls a JSON-RPC method `evm_revert` does
   * not undo, reads the client's RPC URL, leaves a request in flight or fails stops its process
   * instead, and a test that starts while the process is busy gets a fresh one. Calls made through
   * the client after its test finishes reject with {@link AnvilLeaseClosedError}. Applies only to
   * forks pinned with `forkBlockNumber`; interval mining (`blockTime`), random accounts
   * (`mnemonicRandom`), a fixed `port`, `ipc`, `configOut`, a loaded state file (`loadState`) and
   * state persistence (`dumpState`, `state`, `stateInterval`) keep one process per test. A custom
   * `gasLimit`, which a revert drops, is set again after each revert. Defaults to `false`.
   */
  readonly reuseAnvil?: boolean;
}

type StopAnvil = () => Promise<boolean>;
type Fixture<chain extends Chain> = {
  readonly client: AnvilTestClient<chain>;
  readonly rpcUrl: string;
  readonly stopAndWait: StopAnvil;
  readonly checkpoint?: { snapshot: Hex; readonly blockHash: Hash };
};
type AnvilPool<chain extends Chain> = ReturnType<typeof createAnvilPool<chain>>;
type FixtureFailure = {
  readonly attempt: number;
  readonly failure: unknown;
  readonly taskId: string;
};
type FixtureLifecycle = ReturnType<typeof createFixtureLifecycle>;
type FixtureTask = TestContext["task"];

function getAnvilParameters(chain: Chain, parameters: AnvilArgs): AnvilArgs {
  return {
    ...parameters,
    forkChainId: parameters.forkChainId ?? chain.id,
    forkUrl: parameters.forkUrl ?? chain.rpcUrls.default.http[0],
    autoImpersonate: parameters.autoImpersonate ?? true,
    order: parameters.order ?? "fifo",
    stepsTracing: parameters.stepsTracing ?? true,
    pruneHistory: parameters.pruneHistory ?? true,
    retries: parameters.retries ?? (process.env.CI ? 10 : undefined),
    forkRetryBackoff:
      parameters.forkRetryBackoff ?? (process.env.CI ? 500 : undefined),
    gasPrice: parameters.gasPrice ?? 0n,
    blockBaseFeePerGas: parameters.blockBaseFeePerGas ?? 0n,
  };
}

function getBootstrapBlock({
  forkBlockNumber,
  forkChainId,
  forkUrl,
  forkHeader,
  noStorageCaching,
}: AnvilArgs) {
  // Only reuse pinned blocks from the archive endpoint, not mutable/custom forks.
  return forkBlockNumber !== undefined &&
    forkBlockNumber >= 0 &&
    forkUrl !== undefined &&
    forkChainId !== undefined &&
    forkUrl === getErpcForkUrl(forkChainId, process.env.ERPC_SECRET) &&
    forkHeader === undefined &&
    !noStorageCaching
    ? createForkBootstrapBlock(forkBlockNumber)
    : undefined;
}

/**
 * Whether a process started with these parameters can be reverted and lent to another test. Interval
 * mining moves an idle process past its checkpoint, random accounts and loaded state files are only
 * read at startup, and fixed endpoints or state files expose the process outside the client's lease.
 */
function canReuseAnvil(parameters: AnvilArgs): boolean {
  return (
    parameters.forkBlockNumber !== undefined &&
    parameters.blockTime === undefined &&
    !parameters.mnemonicRandom &&
    parameters.loadState === undefined &&
    parameters.port === undefined &&
    parameters.ipc === undefined &&
    parameters.configOut === undefined &&
    parameters.dumpState === undefined &&
    parameters.state === undefined &&
    parameters.stateInterval === undefined
  );
}

function createFixtureLifecycle() {
  const pendingCleanups = new Set<StopAnvil>();
  const pendingFixtureFailures = new Set<FixtureFailure>();

  return {
    trackCleanup(stopAndWait: StopAnvil) {
      pendingCleanups.add(stopAndWait);
      return () => pendingCleanups.delete(stopAndWait);
    },
    recordFailure(failure: FixtureFailure) {
      pendingFixtureFailures.add(failure);
    },
    removeFailure(failure: FixtureFailure) {
      pendingFixtureFailures.delete(failure);
    },
    removeEarlierFailures({ taskId, attempt }: FixtureFailure) {
      for (const pendingFailure of pendingFixtureFailures) {
        if (
          pendingFailure.taskId === taskId &&
          pendingFailure.attempt < attempt
        ) {
          pendingFixtureFailures.delete(pendingFailure);
        }
      }
    },
    async cleanup() {
      const cleanupResults = await Promise.allSettled(
        [...pendingCleanups].map((stopAndWait) => stopAndWait()),
      );
      pendingCleanups.clear();
      const failures = [
        ...Array.from(pendingFixtureFailures, ({ failure }) => failure),
        ...cleanupResults.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        ),
      ];
      pendingFixtureFailures.clear();

      if (failures.length > 0) {
        throw new AnvilCleanupError(
          "Anvil cleanup failed after Vitest finished. Inspect each failure and stop any remaining process manually before retrying.",
          {
            cause: new AggregateError(
              failures,
              "One or more Vitest Anvil cleanups failed.",
            ),
          },
        );
      }
    },
  };
}

function createAnvilPool<chain extends Chain>(
  lifecycle: FixtureLifecycle,
  gasLimit: bigint | undefined,
) {
  let idle:
    | {
        readonly fixture: Fixture<chain>;
        readonly owner: FixtureTask;
        readonly untrackCleanup: () => void;
      }
    | undefined;

  return {
    /** Lends the idle process if its test passed and it still serves its checkpoint; otherwise stops it. */
    async take() {
      const parked = idle;
      idle = undefined;
      if (parked === undefined) {
        return undefined;
      }
      const { fixture, owner, untrackCleanup } = parked;
      // Vitest runs finished hooks after fixture teardown, so wait until the owner's run ended in a pass.
      if (finishedPassing(owner)) {
        // A parked process can exit while idle; the test then gets a fresh one.
        const hash = await fixture.client.getBlock().then(
          (block) => block.hash,
          () => undefined,
        );
        if (hash !== undefined && hash === fixture.checkpoint?.blockHash) {
          return fixture;
        }
      }
      untrackCleanup();
      await fixture.stopAndWait().catch((error: unknown) => {
        // Only an observed exit is safe to replace; an unconfirmed stop may leave Anvil running.
        if (!(error instanceof AnvilProcessError)) {
          throw error;
        }
        console.warn(
          "An idle Anvil process stopped serving its checkpoint, so the next test starts a fresh one.",
          error,
        );
      });
      return undefined;
    },
    clear() {
      idle = undefined;
    },
    /** Reverts a finished test's process and keeps it for the next test, if that is safe. */
    async park(
      fixture: Fixture<chain>,
      {
        lease,
        owner,
      }: { readonly lease: AnvilLease; readonly owner: FixtureTask },
    ) {
      const { checkpoint, client } = fixture;
      if (
        checkpoint === undefined ||
        !lease.reusable ||
        lease.inFlight > 0 ||
        idle !== undefined
      ) {
        return false;
      }
      // A process that cannot be reset is stopped instead, so its state never reaches another test.
      try {
        const reverted: unknown = await client.request({
          method: "evm_revert",
          params: [checkpoint.snapshot],
        });
        if (reverted !== true) {
          return false;
        }
        const { hash } = await client.getBlock();
        if (hash !== checkpoint.blockHash) {
          return false;
        }
        // A revert replaces a custom gas limit with the forked block's.
        if (
          gasLimit !== undefined &&
          !(await restoreGasLimit(client, gasLimit))
        ) {
          return false;
        }
        checkpoint.snapshot = await client.snapshot();
      } catch {
        return false;
      }
      // Another test may have parked its process while this one was reverting.
      if (idle !== undefined) {
        return false;
      }
      idle = {
        fixture,
        owner,
        untrackCleanup: lifecycle.trackCleanup(fixture.stopAndWait),
      };
      return true;
    },
  };
}

async function restoreGasLimit<chain extends Chain>(
  client: AnvilTestClient<chain>,
  gasLimit: bigint,
) {
  const restored: unknown = await client.request({
    method: "evm_setBlockGasLimit",
    params: [numberToHex(gasLimit)],
  });
  if (restored !== true) {
    return false;
  }
  const pending = await client.getBlock({ blockTag: "pending" });
  return pending.gasLimit === gasLimit;
}

async function configureFixtureClient<chain extends Chain>(
  client: AnvilTestClient<chain>,
) {
  // Make block timestamp 100% predictable.
  await client.setBlockTimestampInterval({ interval: 1 });

  await client.setFeeTokenBalance({
    account: client.account.address,
    amount: maxUint128,
  });

  // Remove code from contract
  // cf. https://eips.ethereum.org/EIPS/eip-7702
  const code = await client.getCode({
    address: client.account.address,
  });

  if (code != null) {
    const auth = await client.signAuthorization({
      account: client.account,
      contractAddress: zeroAddress,
      executor: "self",
    });

    await client
      .sendTransaction({
        authorizationList: [auth],
        to: client.account.address,
        data: "0x",
        account: client.account,
      } as SendTransactionParameters<chain>)
      .catch(async (e) => {
        if (
          e.cause.details ===
          "EIP-7702 authorization lists are not supported before the Prague hardfork"
        ) {
          return;
        }
        throw e;
      });
  }
}

async function resolveSetupFailure(
  failure: unknown,
  stopAndWait: StopAnvil,
): Promise<unknown> {
  try {
    await stopAndWait();
  } catch (cleanupError) {
    if (cleanupError instanceof AnvilProcessError) {
      return new AnvilProcessError(
        "Anvil exited while the Vitest fixture was being initialized. Retry the test.",
        {
          cause: new AggregateError(
            [failure, cleanupError],
            "Vitest fixture setup failed because Anvil exited.",
          ),
        },
      );
    }
    throw createAnvilFailureCleanupError({
      cleanupError,
      failure,
      message:
        "The Vitest fixture failed during setup and Anvil cleanup also failed. Inspect both failures and stop the process manually before retrying.",
      summary: "Vitest fixture setup and Anvil cleanup both failed.",
    });
  }
  return failure;
}

async function waitToRetrySetup(
  attempt: number,
  {
    signal,
    failure,
  }: { readonly signal: AbortSignal | undefined; readonly failure: unknown },
) {
  try {
    if (signal === undefined) {
      await setTimeout(attempt * 1_000);
    } else {
      await setTimeout(attempt * 1_000, undefined, { signal });
    }
  } catch (waitError) {
    throw new AnvilStartupError(
      "Anvil setup retry was cancelled. Retry when setup can continue.",
      {
        cause: new AggregateError(
          [failure, waitError],
          "Vitest fixture setup and retry cancellation both failed.",
        ),
      },
    );
  }
}

async function initializeFixture<chain extends Chain>(
  chain: chain,
  {
    anvilParameters,
    signal,
    bootstrapBlock,
    checkpoint,
  }: {
    readonly anvilParameters: AnvilArgs;
    readonly signal: AbortSignal | undefined;
    readonly bootstrapBlock: ReturnType<typeof getBootstrapBlock>;
    readonly checkpoint: boolean;
  },
): Promise<Fixture<chain>> {
  const maxAttempts = process.env.CI ? 3 : 1;
  let setupFailure: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let stopAndWait: StopAnvil | undefined;
    try {
      const anvil = await spawnAnvil(anvilParameters, {
        signal,
        bootstrapBlock,
      });
      stopAndWait = anvil.stopAndWait;
      const client = createAnvilTestClient(
        createAnvilTransport(anvil.rpcUrl),
        chain,
      );
      await configureFixtureClient(client);
      if (!checkpoint) {
        return { client, rpcUrl: anvil.rpcUrl, stopAndWait };
      }
      return {
        client,
        rpcUrl: anvil.rpcUrl,
        stopAndWait,
        checkpoint: {
          snapshot: await client.snapshot(),
          blockHash: (await client.getBlock()).hash,
        },
      };
    } catch (error) {
      setupFailure =
        stopAndWait === undefined
          ? error
          : await resolveSetupFailure(error, stopAndWait);
      if (
        error instanceof AnvilCleanupError ||
        signal?.aborted ||
        attempt === maxAttempts
      ) {
        break;
      }
      await waitToRetrySetup(attempt, { signal, failure: setupFailure });
    }
  }
  throw setupFailure;
}

function registerFixtureResult(
  { task, onTestFinished }: Pick<TestContext, "task" | "onTestFinished">,
  lifecycle: FixtureLifecycle,
) {
  const cleanupState = {
    attempt: task.result?.retryCount ?? 0,
    deferred: false,
    failed: false,
    failure: undefined as unknown,
    taskId: task.id,
  };
  // Report teardown after Vitest removes its fixture cleanup callback so a
  // retry cannot replay the first attempt's rejected cleanup promise.
  onTestFinished(() => {
    if (cleanupState.failed && !cleanupState.deferred) {
      lifecycle.removeFailure(cleanupState);
      throw cleanupState.failure;
    }
    if (!cleanupState.failed && task.result?.state === "pass") {
      // A passing retry supersedes failures that only belonged to earlier attempts.
      lifecycle.removeEarlierFailures(cleanupState);
    }
  });
  return cleanupState;
}

/** Whether the task's whole run, finished hooks included, has ended in a pass. */
function finishedPassing(task: FixtureTask) {
  const { result } = task;
  return (
    result?.duration !== undefined &&
    result.state === "pass" &&
    !result.errors?.length
  );
}

function deferFixtureFailure(task: FixtureTask) {
  return (
    ("pending" in task && task.pending === true) ||
    (task.result !== undefined &&
      "pending" in task.result &&
      task.result.pending === true) ||
    task.result?.state === "skip"
  );
}

async function useFixture<chain extends Chain>(
  fixture: Fixture<chain>,
  {
    use,
    task,
    onTestFinished,
    lifecycle,
    pool,
  }: Pick<TestContext, "task" | "onTestFinished"> & {
    readonly use: (client: AnvilTestClient<chain>) => Promise<void>;
    readonly lifecycle: FixtureLifecycle;
    readonly pool: AnvilPool<chain> | undefined;
  },
) {
  const { stopAndWait } = fixture;
  const untrackCleanup = lifecycle.trackCleanup(stopAndWait);
  const cleanupState = registerFixtureResult(
    { task, onTestFinished },
    lifecycle,
  );
  const lease: AnvilLease = { open: true, inFlight: 0, reusable: true };
  try {
    await use(
      pool === undefined
        ? fixture.client
        : createLeasedClient(fixture.client.chain, {
            rpcUrl: fixture.rpcUrl,
            lease,
          }),
    );
  } catch (error) {
    cleanupState.failed = true;
    cleanupState.failure = error;
  } finally {
    untrackCleanup();
    // Close the lease first, so no call from this test can reach the process once it is reset.
    lease.open = false;
    const parked =
      pool !== undefined &&
      !cleanupState.failed &&
      !task.result?.errors?.length &&
      !deferFixtureFailure(task) &&
      (await pool.park(fixture, { lease, owner: task }));
    try {
      if (!parked) {
        await stopAndWait();
      }
    } catch (error) {
      cleanupState.failure = cleanupState.failed
        ? createAnvilFailureCleanupError({
            cleanupError: error,
            failure: cleanupState.failure,
            message:
              "The Vitest fixture failed and Anvil cleanup also failed. Inspect both failures and stop the process manually before retrying.",
            summary: "Vitest fixture and Anvil cleanup both failed.",
          })
        : error;
      cleanupState.failed = true;
      cleanupState.deferred = deferFixtureFailure(task);
    }
  }
  // Vitest 2 stops finished hooks after the first rejection, so file teardown
  // owns any failure this reporter cannot reach.
  if (cleanupState.failed) {
    lifecycle.recordFailure(cleanupState);
  }
}

/**
 * Creates a Vitest test API backed by an isolated Anvil process.
 *
 * @param chain - Chain used to configure the viem client and default fork.
 * @param parameters - Optional Anvil startup and fork parameters.
 * @param options - Optional fixture behavior, such as {@link ViemTestOptions.reuseAnvil}.
 * @returns A Vitest test API with an Anvil-backed `client` fixture.
 * @throws {AnvilStartupError} When the fixture cannot start Anvil.
 * @throws {AnvilProcessError} When Anvil exits unexpectedly.
 * @throws {AnvilCleanupError} When fixture or process cleanup fails.
 * @throws {AnvilFeeTokenFundingError} When the Tempo pathUSD fee-token balance write does not produce
 * the expected balance for the test account.
 * @example
 * ```ts
 * import { createViemTest } from "@morpho-org/test/vitest";
 * import { mainnet } from "viem/chains";
 *
 * export const test = createViemTest(mainnet, {
 *   forkUrl: "https://<your-mainnet-rpc>",
 *   forkBlockNumber: 19_530_000,
 * });
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: Keep fixture options separate from Anvil startup arguments.
export const createViemTest = <chain extends Chain>(
  chain: chain,
  parameters: AnvilArgs = {},
  { reuseAnvil = false }: ViemTestOptions = {},
): TestAPI<ViemTestContext<chain>> => {
  const anvilParameters = getAnvilParameters(chain, parameters);
  const bootstrapBlock = getBootstrapBlock(anvilParameters);
  const lifecycle = createFixtureLifecycle();
  const pool =
    reuseAnvil && canReuseAnvil(anvilParameters)
      ? createAnvilPool<chain>(
          lifecycle,
          anvilParameters.gasLimit === undefined
            ? undefined
            : BigInt(anvilParameters.gasLimit),
        )
      : undefined;

  afterAll(() => {
    pool?.clear();
    return lifecycle.cleanup();
  }, Number.POSITIVE_INFINITY);

  return test.extend<ViemTestContext<chain>>({
    client: async ({ signal, onTestFinished, task }, use) => {
      const fixture =
        (await pool?.take()) ??
        (await initializeFixture(chain, {
          anvilParameters,
          signal,
          bootstrapBlock,
          checkpoint: pool !== undefined,
        }));
      await useFixture(fixture, {
        use,
        task,
        onTestFinished,
        lifecycle,
        pool,
      });
    },
  });
};
