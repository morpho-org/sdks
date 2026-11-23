import { setTimeout } from "node:timers/promises";
import {
  type Chain,
  http,
  maxUint128,
  type SendTransactionParameters,
  zeroAddress,
} from "viem";
import { afterAll, type TestAPI, type TestContext, test } from "vitest";
import { type AnvilArgs, spawnAnvil } from "./anvil.js";
import { type AnvilTestClient, createAnvilTestClient } from "./client.js";
import {
  AnvilCleanupError,
  AnvilProcessError,
  AnvilStartupError,
  createAnvilFailureCleanupError,
} from "./errors.js";

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

type StopAnvil = () => Promise<boolean>;
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
  }: {
    readonly anvilParameters: AnvilArgs;
    readonly signal: AbortSignal | undefined;
  },
) {
  const maxAttempts = process.env.CI ? 3 : 1;
  let setupFailure: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let stopAndWait: StopAnvil | undefined;
    try {
      const anvil = await spawnAnvil(anvilParameters, { signal });
      stopAndWait = anvil.stopAndWait;
      const client = createAnvilTestClient(
        http(anvil.rpcUrl, { retryCount: 0, timeout: 30_000 }),
        chain,
      );
      await configureFixtureClient(client);
      return { client, stopAndWait };
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
  { client, stopAndWait }: Awaited<ReturnType<typeof initializeFixture<chain>>>,
  {
    use,
    task,
    onTestFinished,
    lifecycle,
  }: Pick<TestContext, "task" | "onTestFinished"> & {
    readonly use: (client: AnvilTestClient<chain>) => Promise<void>;
    readonly lifecycle: FixtureLifecycle;
  },
) {
  const untrackCleanup = lifecycle.trackCleanup(stopAndWait);
  const cleanupState = registerFixtureResult(
    { task, onTestFinished },
    lifecycle,
  );
  try {
    await use(client);
  } catch (error) {
    cleanupState.failed = true;
    cleanupState.failure = error;
  } finally {
    untrackCleanup();
    try {
      await stopAndWait();
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
export const createViemTest = <chain extends Chain>(
  chain: chain,
  parameters: AnvilArgs = {},
): TestAPI<ViemTestContext<chain>> => {
  const anvilParameters = getAnvilParameters(chain, parameters);
  const lifecycle = createFixtureLifecycle();

  afterAll(lifecycle.cleanup, Number.POSITIVE_INFINITY);

  return test.extend<ViemTestContext<chain>>({
    client: async ({ signal, onTestFinished, task }, use) => {
      const fixture = await initializeFixture(chain, {
        anvilParameters,
        signal,
      });
      await useFixture(fixture, { use, task, onTestFinished, lifecycle });
    },
  });
};
