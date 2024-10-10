import { type AnvilArgs, spawnAnvil } from "@morpho-org/test";
import { http, type Chain } from "viem";
import { anvil } from "viem/chains";
import { test } from "vitest";
import { type AnvilTestClient, createAnvilTestClient } from "./anvil.js";

export interface ViemTestContext<chain extends Chain = Chain> {
  client: AnvilTestClient<chain>;
}

export const createViemTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
) => {
  parameters.forkChainId ??= chain?.id;
  parameters.forkUrl ??= chain?.rpcUrls.default.http[0];
  parameters.autoImpersonate ??= true;
  parameters.order ??= "fifo";

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  let port = 0;

  return test.extend<ViemTestContext<chain>>({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    client: async ({}, use) => {
      const { rpcUrl, stop } = await spawnAnvil(parameters, port++);

      await use(createAnvilTestClient(chain, http(rpcUrl)));

      await stop();
    },
  });
};
