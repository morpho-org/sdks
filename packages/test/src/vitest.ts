import { http, type Chain, zeroAddress, zeroHash } from "viem";
import { test } from "vitest";
import { type AnvilArgs, spawnAnvil } from "./anvil";
import { type AnvilTestClient, createAnvilTestClient } from "./client";

// Vitest needs to serialize BigInts to JSON, so we need to add a toJSON method to BigInt.prototype.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

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
  parameters.pruneHistory ??= true;

  parameters.gasPrice ??= 0n;
  parameters.blockBaseFeePerGas ??= 0n;

  return test.extend<ViemTestContext<chain>>({
    // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
    client: async ({}, use) => {
      const { rpcUrl, stop } = await spawnAnvil(parameters);

      const client = createAnvilTestClient(
        http(rpcUrl, {
          fetchOptions: {
            cache: "force-cache",
          },
          timeout: 30_000,
        }),
        chain,
      );

      // Make block timestamp 100% predictable.
      await client.setBlockTimestampInterval({ interval: 1 });

      // Remove code form contract
      // cf. https://eips.ethereum.org/EIPS/eip-7702
      const code = await client.getCode({ address: client.account.address });

      if (code !== zeroHash) {
        const auth = await client.signAuthorization({
          account: client.account,
          contractAddress: zeroAddress,
          executor: "self",
        });

        await client.sendTransaction({
          authorizationList: [auth],
          to: client.account.address,
          data: "0x",
        });
      }

      await use(client);

      await stop();
    },
  });
};
