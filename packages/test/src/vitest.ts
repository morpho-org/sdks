import {
  type Chain,
  type Client,
  type HDAccount,
  type HttpTransport,
  type PublicActions,
  type TestActions,
  type TestRpcSchema,
  type WalletActions,
  createTestClient,
  publicActions,
  walletActions,
} from "viem";
import { type DealActions, dealActions } from "viem-deal";
import { anvil } from "viem/chains";
import { test } from "vitest";
import type { Config } from "wagmi";
import { type AnvilArgs, startAnvil } from "./anvil.js";
import { testAccount } from "./fixtures.js";

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

export const createAnvilTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
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

  let port = 0;

  return test.extend({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    client: async ({}, use) => {
      const { transport, stop } = await startAnvil(parameters, port++);

      await use(
        createTestClient({
          chain,
          mode: "anvil",
          transport,
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

export const createAnvilWagmiTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
): ReturnType<
  typeof test.extend<{
    config: Config<readonly [chain], Record<chain["id"], HttpTransport>>;
  }>
> => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  let port = 0;

  return test.extend({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    config: async ({}, use) => {
      const { createConfig, mock } = await import("@wagmi/core");

      const { transport, stop } = await startAnvil(parameters, port++);

      await use(
        createConfig({
          chains: [chain],
          connectors: [
            mock({
              accounts: [
                testAccount().address,
                ...new Array(parameters.accounts ?? 9)
                  .fill(null)
                  .map((_, i) => testAccount(i + 1).address),
              ],
            }),
          ],
          pollingInterval: 100,
          storage: null,
          transports: {
            [chain.id]: transport,
          },
        }),
      );

      await stop();
    },
  });
};
