import { type AnvilArgs, spawnAnvil } from "@morpho-org/test";
import { http, type Chain } from "viem";
import { test } from "vitest";
import { type AnvilTestClient, createAnvilTestClient } from "./anvil.js";

export interface ViemTestContext<chain extends Chain = Chain> {
  client: AnvilTestClient<chain>;
}

export const createViemTest = <chain extends Chain>(
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

  return test.extend<ViemTestContext<chain>>({
    // biome-ignore lint/correctness/noEmptyPattern: require by vitest at runtime
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
