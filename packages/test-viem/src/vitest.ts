import { type AnvilArgs, spawnAnvil } from "@morpho-org/test";
import { http, type Chain } from "viem";
import { anvil } from "viem/chains";
import { test } from "vitest";
import { createAnvilTestClient } from "./anvil.js";

export const createViemTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
): ReturnType<
  typeof test.extend<{
    client: ReturnType<typeof createAnvilTestClient<chain>>;
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
      const { rpcUrl, stop } = await spawnAnvil(parameters, port++);

      await use(createAnvilTestClient(chain, http(rpcUrl)));

      await stop();
    },
  });
};
