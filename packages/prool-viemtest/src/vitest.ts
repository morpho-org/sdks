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

export const testAccount = (accountIndex?: number): HDAccount =>
  mnemonicToAccount(
    "test test test test test test test test test test test junk",
    { accountIndex },
  );

let port = 8545;

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
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    client: async ({}, use) => {
      const { anvil } = await import("prool/instances");

      const instance = await anvil(parameters).create({
        port: port++,
      });

      // instance.on("message", console.debug);
      instance.on("stderr", console.warn);

      // const stop = await instance.start();

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

      // await stop();
    },
  });
};
