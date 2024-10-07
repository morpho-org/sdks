import type { AnvilParameters } from "prool/instances";
import type {
  Chain,
  Client,
  HDAccount,
  HttpTransport,
  PublicActions,
  TestActions,
  TestRpcSchema,
  WalletActions,
} from "viem";
import { type DealActions, dealActions } from "viem-deal";
import { mnemonicToAccount } from "viem/accounts";
import { test } from "vitest";

export const testAccount = (addressIndex?: number): HDAccount =>
  mnemonicToAccount(
    "test test test test test test test test test test test junk",
    { addressIndex },
  );

declare global {
  namespace NodeJS {
    interface Process {
      __tinypool_state__: {
        isChildProcess: boolean;
        isTinypoolWorker: boolean;
        workerData: null;
        workerId: number;
      };
    }
  }
}

export const createAnvilTest = <
  chain extends Chain | undefined = Chain | undefined,
>(
  parameters: AnvilParameters = {},
  chain?: chain,
): ReturnType<
  typeof test.extend<{
    client: Client<
      HttpTransport,
      chain,
      HDAccount,
      TestRpcSchema<"anvil">,
      TestActions &
        DealActions &
        PublicActions<HttpTransport, chain, HDAccount> &
        WalletActions<chain, HDAccount> & {
          timestamp(): Promise<bigint>;
        }
    >;
  }>
> => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  return test.extend({
    client: async ({ task }, use) => {
      // Build an available port for anvil to run.
      // For record: process.env.VITEST_POOL_ID & process.env.VITEST_WORKER_ID exist too.
      const taskPort =
        10000 +
        process.__tinypool_state__.workerId * 400 +
        (task.suite?.tasks.indexOf(task) ?? 0);

      const { anvil } = await import("prool/instances");

      const instance = await anvil(parameters).create({
        port: taskPort,
      });

      // instance.on("message", console.debug);
      instance.on("stderr", console.warn);

      const stop = await instance.start();

      const { createTestClient, http, publicActions, walletActions } =
        await import("viem");

      await use(
        createTestClient({
          chain,
          mode: "anvil",
          transport: http(`http://${instance.host}:${instance.port}`),
          account: testAccount(),
        })
          .extend(dealActions)
          .extend(publicActions)
          .extend(walletActions)
          .extend((client) => ({
            async timestamp() {
              const latestBlock = await client.getBlock({
                blockTag: "latest",
                includeTransactions: false,
              });

              return latestBlock.timestamp;
            },
          })),
      );

      await stop();
    },
  });
};
