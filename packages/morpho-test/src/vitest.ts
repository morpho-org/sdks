import type { AnvilParameters } from "prool/instances";
import type {
  Chain,
  Client,
  HttpTransport,
  PublicActions,
  TestActions,
  TestRpcSchema,
  WalletActions,
} from "viem";
import { type DealActions, dealActions } from "viem-deal";
import { test } from "vitest";

export interface TestAccount {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  type: "json-rpc";
}

let port = 8545;

export const createAnvilTest = <
  chain extends Chain | undefined = Chain | undefined,
>(
  parameters: AnvilParameters = {},
  chain?: chain,
) => {
  parameters.forkUrl ??= process.env.RPC_URL;
  parameters.autoImpersonate ??= true;
  parameters.blockBaseFeePerGas ??= 0n;
  parameters.order ??= "fifo";

  return test.extend<{
    client: Client<
      HttpTransport,
      chain,
      TestAccount,
      TestRpcSchema<"anvil">,
      TestActions &
        DealActions &
        PublicActions<HttpTransport, chain, TestAccount> &
        WalletActions<chain, TestAccount> & {
          timestamp(): Promise<bigint>;
        }
    >;
  }>({
    // biome-ignore lint/correctness/noEmptyPattern: <explanation>
    client: async ({}, use) => {
      const { anvil } = await import("prool/instances");

      const instance = await anvil(parameters).create({
        port: port++,
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
          account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
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
