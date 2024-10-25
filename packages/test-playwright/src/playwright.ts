import {
  type AnvilArgs,
  type AnvilTestClient,
  createAnvilTestClient,
  spawnAnvil,
} from "@morpho-org/test";
import { test } from "@playwright/test";
import { http, type Chain } from "viem";

export interface PlaywrightTestContext<chain extends Chain = Chain> {
  client: AnvilTestClient<chain>;
}

export const createPlaywrightTest = <chain extends Chain>(
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

  return test.extend<PlaywrightTestContext<chain>>({
    // biome-ignore lint/correctness/noEmptyPattern: required by playwright at runtime
    client: async ({}, use) => {
      const { rpcUrl, stop } = await spawnAnvil(parameters);

      const client = createAnvilTestClient(http(rpcUrl), chain);

      // Make block timestamp 100% predictable.
      await client.setBlockTimestampInterval({ interval: 1 });

      await use(client);

      await stop();
    },
  });
};
