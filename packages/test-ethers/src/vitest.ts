import { type AnvilArgs, spawnAnvil } from "@morpho-org/test";
import {
  type AnvilTestClient,
  createAnvilTestClient,
} from "@morpho-org/test-viem";
import { type HDNodeWallet, JsonRpcProvider } from "ethers";
import { http, type Chain } from "viem";
import { anvil } from "viem/chains";
import { test } from "vitest";
import { testWallet } from "./fixtures.js";

export const createEthersTest = <chain extends Chain = typeof anvil>(
  parameters: AnvilArgs = {},
  chain: chain = anvil as unknown as chain,
): ReturnType<
  typeof test.extend<{
    ethers: {
      client: AnvilTestClient<chain>;
      wallet: HDNodeWallet & { provider: JsonRpcProvider };
    };
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
    ethers: async ({}, use) => {
      const { rpcUrl, stop } = await spawnAnvil(parameters, port++);

      await use({
        client: createAnvilTestClient(chain, http(rpcUrl)),
        wallet: testWallet(
          new JsonRpcProvider(rpcUrl, undefined, {
            staticNetwork: true,
          }),
        ),
      });

      await stop();
    },
  });
};
