import { setTimeout } from "node:timers/promises";
import {
  type Chain,
  http,
  type SendTransactionParameters,
  zeroAddress,
} from "viem";
import { afterAll, type TestAPI, test } from "vitest";
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

/**
 * Creates a Vitest test API backed by an isolated Anvil process.
 *
 * @param chain - Chain used to configure the viem client and default fork.
 * @param parameters - Optional Anvil startup and fork parameters.
 * @returns A Vitest test API with an Anvil-backed `client` fixture.
 * @throws {AnvilStartupError} When the fixture cannot start Anvil.
 * @throws {AnvilProcessError} When Anvil exits unexpectedly.
 * @throws {AnvilCleanupError} When fixture or process cleanup fails.
 * @example
 * ```ts
 * import { createViemTest } from "@morpho-org/test/vitest";
 * import { mainnet } from "viem/chains";
 *
 * export const test = createViemTest(mainnet, {
 *   forkUrl: process.env.MAINNET_RPC_URL,
 *   forkBlockNumber: 19_530_000,
 * });
 * ```
 */
export const createViemTest = <chain extends Chain>(
  chain: chain,
  parameters: AnvilArgs = {},
): TestAPI<ViemTestContext<chain>> => {
  const anvilParameters: AnvilArgs = {
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
  const pendingCleanups = new Set<() => Promise<boolean>>();
  const pendingFixtureFailures = new Set<{
    readonly attempt: number;
    readonly failure: unknown;
    readonly taskId: string;
  }>();

  afterAll(async () => {
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

    if (failures.length > 0)
      throw new AnvilCleanupError(
        "Anvil cleanup failed after Vitest finished. Inspect each failure and stop any remaining process manually before retrying.",
        {
          cause: new AggregateError(
            failures,
            "One or more Vitest Anvil cleanups failed.",
          ),
        },
      );
  }, Number.POSITIVE_INFINITY);

  return test.extend<ViemTestContext<chain>>({
    client: async ({ signal, onTestFinished, task }, use) => {
      const maxAttempts = process.env.CI ? 3 : 1;
      let initialized:
        | {
            readonly client: AnvilTestClient<chain>;
            readonly stopAndWait: () => Promise<boolean>;
          }
        | undefined;
      let setupFailure: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let stopAndWait: (() => Promise<boolean>) | undefined;

        try {
          const anvil = await spawnAnvil(anvilParameters, { signal });
          stopAndWait = anvil.stopAndWait;
          const client = createAnvilTestClient(
            http(anvil.rpcUrl, {
              fetchOptions: {
                cache: "force-cache",
              },
              timeout: 30_000,
            }),
            chain,
          );

          // Make block timestamp 100% predictable.
          await client.setBlockTimestampInterval({ interval: 1 });

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
                )
                  return;
                throw e;
              });
          }

          initialized = { client, stopAndWait };
          break;
        } catch (error) {
          setupFailure = error;

          if (stopAndWait !== undefined) {
            try {
              await stopAndWait();
            } catch (cleanupError) {
              if (cleanupError instanceof AnvilProcessError)
                setupFailure = new AnvilProcessError(
                  "Anvil exited while the Vitest fixture was being initialized. Retry the test.",
                  {
                    cause: new AggregateError(
                      [error, cleanupError],
                      "Vitest fixture setup failed because Anvil exited.",
                    ),
                  },
                );
              else
                throw createAnvilFailureCleanupError({
                  cleanupError,
                  failure: setupFailure,
                  message:
                    "The Vitest fixture failed during setup and Anvil cleanup also failed. Inspect both failures and stop the process manually before retrying.",
                  summary:
                    "Vitest fixture setup and Anvil cleanup both failed.",
                });
            }
          }

          if (
            error instanceof AnvilCleanupError ||
            signal?.aborted ||
            attempt === maxAttempts
          )
            break;

          try {
            if (signal === undefined) await setTimeout(attempt * 1_000);
            else await setTimeout(attempt * 1_000, undefined, { signal });
          } catch (waitError) {
            throw new AnvilStartupError(
              "Anvil setup retry was cancelled. Retry when setup can continue.",
              {
                cause: new AggregateError(
                  [setupFailure, waitError],
                  "Vitest fixture setup and retry cancellation both failed.",
                ),
              },
            );
          }
        }
      }

      if (initialized === undefined) throw setupFailure;

      const { client, stopAndWait } = initialized;
      pendingCleanups.add(stopAndWait);
      const cleanupState: {
        attempt: number;
        deferred: boolean;
        failed: boolean;
        failure: unknown;
        taskId: string;
      } = {
        attempt: task.result?.retryCount ?? 0,
        deferred: false,
        failed: false,
        failure: undefined,
        taskId: task.id,
      };

      // Report teardown after Vitest removes its fixture cleanup callback so a
      // retry cannot replay the first attempt's rejected cleanup promise.
      onTestFinished(() => {
        if (cleanupState.failed && !cleanupState.deferred) {
          pendingFixtureFailures.delete(cleanupState);
          throw cleanupState.failure;
        }
        // A passing retry supersedes failures that only belonged to earlier attempts.
        if (!cleanupState.failed && task.result?.state === "pass")
          for (const pendingFailure of pendingFixtureFailures)
            if (
              pendingFailure.taskId === cleanupState.taskId &&
              pendingFailure.attempt < cleanupState.attempt
            )
              pendingFixtureFailures.delete(pendingFailure);
      });

      try {
        await use(client);
      } catch (error) {
        cleanupState.failed = true;
        cleanupState.failure = error;
      } finally {
        pendingCleanups.delete(stopAndWait);
        try {
          await stopAndWait();
        } catch (error) {
          if (cleanupState.failed)
            cleanupState.failure = createAnvilFailureCleanupError({
              cleanupError: error,
              failure: cleanupState.failure,
              message:
                "The Vitest fixture failed and Anvil cleanup also failed. Inspect both failures and stop the process manually before retrying.",
              summary: "Vitest fixture and Anvil cleanup both failed.",
            });
          else cleanupState.failure = error;
          cleanupState.failed = true;
          if (
            ("pending" in task && task.pending === true) ||
            (task.result !== undefined &&
              "pending" in task.result &&
              task.result.pending === true) ||
            task.result?.state === "skip"
          ) {
            cleanupState.deferred = true;
          }
        }
      }
      // Vitest 2 stops finished hooks after the first rejection, so file teardown
      // owns any failure this reporter cannot reach.
      if (cleanupState.failed) pendingFixtureFailures.add(cleanupState);
    },
  });
};
