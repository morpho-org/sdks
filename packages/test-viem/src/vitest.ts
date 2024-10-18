import { type AnvilArgs, spawnAnvil } from "@morpho-org/test";
import { http, type Chain } from "viem";
import { test } from "vitest";
import { type AnvilTestClient, createAnvilTestClient } from "./anvil.js";
import { trace } from "./trace.js";

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

      let client: AnvilTestClient<chain>;

      await use(
        (client = createAnvilTestClient(
          http(rpcUrl, {
            async onFetchRequest(request) {
              const { method, params } = await request.json();

              if (
                method === "eth_call" &&
                (client.tracing.calls || client.tracing.nextCall)
              ) {
                client.tracing.nextCall = false;

                try {
                  console.log(await trace(client, params[0], params[1]));
                } catch (error) {
                  console.warn("Failed to trace call:", error);
                }
              }
            },
          }),
          chain,
        )),
      );

      await stop();
    },
  });
};