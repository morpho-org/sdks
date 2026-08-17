import { setTimeout } from "node:timers/promises";
import {
  type Chain,
  http,
  type SendTransactionParameters,
  zeroAddress,
} from "viem";
import { type TestAPI, test } from "vitest";
import { type AnvilArgs, spawnAnvil } from "./anvil.js";
import { type AnvilTestClient, createAnvilTestClient } from "./client.js";
import { AnvilCleanupError, AnvilStartupError } from "./errors.js";

// Vitest needs to serialize BigInts to JSON, so we need to add a toJSON method to BigInt.prototype.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
// @ts-expect-error
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export interface ViemTestContext<chain extends Chain = Chain> {
  readonly client: AnvilTestClient<chain>;
}

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

  return test.extend<ViemTestContext<chain>>({
    client: async ({ signal }, use) => {
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
              throw new AnvilCleanupError(
                "The Vitest fixture failed during setup and Anvil cleanup also failed. Inspect both failures and stop the process manually before retrying.",
                {
                  cause: new AggregateError(
                    [setupFailure, cleanupError],
                    "Vitest fixture setup and Anvil cleanup both failed.",
                  ),
                },
              );
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
              "Anvil setup retry was cancelled. Retry the test after the competing fork finishes.",
              { cause: waitError },
            );
          }
        }
      }

      if (initialized === undefined) throw setupFailure;

      const { client, stopAndWait } = initialized;
      let fixtureFailed = false;
      let fixtureFailure: unknown;
      let cleanupFailed = false;
      let cleanupFailure: unknown;

      try {
        await use(client);
      } catch (error) {
        fixtureFailed = true;
        fixtureFailure = error;
      }

      try {
        await stopAndWait();
      } catch (error) {
        cleanupFailed = true;
        cleanupFailure = error;
      }

      if (fixtureFailed && cleanupFailed)
        throw new AnvilCleanupError(
          "The Vitest fixture failed and Anvil cleanup also failed. Inspect both failures and stop the process manually before retrying.",
          {
            cause: new AggregateError(
              [fixtureFailure, cleanupFailure],
              "Vitest fixture and Anvil cleanup both failed.",
            ),
          },
        );
      if (fixtureFailed) throw fixtureFailure;
      if (cleanupFailed) throw cleanupFailure;
    },
  });
};
