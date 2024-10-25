import { http, type Chain } from "viem";
import { type AnvilArgs, spawnAnvil } from "./anvil.js";
import { type AnvilTestClient, createAnvilTestClient } from "./client.js";

export interface PlaywrightTestContext<chain extends Chain = Chain> {
  client: AnvilTestClient<chain>;
}

export const createPlaywrightTest = async <chain extends Chain>(
  chain: chain,
  parameters: AnvilArgs = {},
) => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";
  parameters.stepsTracing ??= true;

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  const { test } = await import("@playwright/test");

  return test.extend<PlaywrightTestContext<chain>>({
    // biome-ignore lint/correctness/noEmptyPattern: required by playwright at runtime
    client: async ({}, use) => {
      const { rpcUrl, stop } = await spawnAnvil(
        parameters,
        test.info().workerIndex,
      );

      const client = createAnvilTestClient(http(rpcUrl), chain);

      // Make block timestamp 100% predictable.
      await client.setBlockTimestampInterval({ interval: 1 });

      await use(client);

      await stop();
    },
  });
};
