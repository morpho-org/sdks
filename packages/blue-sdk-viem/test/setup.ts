import {
  type AnvilTestClient,
  createAnvilTestClient,
  spawnAnvil,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { http, type SendTransactionParameters, zeroAddress } from "viem";
import { base, mainnet } from "viem/chains";
import { test as vitest } from "vitest";

/**
 * This test will run on `mainnet` forked at block `19,530,000`.
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});

/**
 * This test will run on `mainnet` forked at block `21,595,000`.
 */
export const test2 = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_595_000,
});

/**
 * This test will run on `mainnet` forked at block `24,671,815`.
 */
export const testTreehouseEth = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 24_671_815,
});

/**
 * This test will run on `mainnet` forked at block `21,950,00`.
 */
export const preLiquidationTest = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_950_000,
});

export const vaultV2Test = createViemTest(base, {
  forkUrl: process.env.BASE_RPC_URL,
  forkBlockNumber: 41_290_768,
});

export interface LocalViemTestContext {
  client: AnvilTestClient<typeof mainnet>;
}

export const localTest = vitest.extend<LocalViemTestContext>({
  // biome-ignore lint/correctness/noEmptyPattern: required by vitest at runtime
  client: async ({}, use) => {
    const { rpcUrl, stop } = await spawnAnvil({
      autoImpersonate: true,
      order: "fifo",
      stepsTracing: true,
      pruneHistory: true,
      gasPrice: 0n,
      blockBaseFeePerGas: 0n,
      chainId: mainnet.id,
    });

    const client = createAnvilTestClient(
      http(rpcUrl, {
        fetchOptions: {
          cache: "force-cache",
        },
        timeout: 30_000,
      }),
      mainnet,
    );

    await client.setBlockTimestampInterval({ interval: 1 });

    // Remove code from contract
    // cf. https://eips.ethereum.org/EIPS/eip-7702
    const code = await client.getCode({ address: client.account.address });

    if (code != null) {
      const auth = await client.signAuthorization({
        account: client.account,
        contractAddress: zeroAddress,
        executor: "self",
      });

      await client
        .sendTransaction({
          authorizationList: [auth],
          to: client.account.address,
          data: "0x",
          account: client.account,
        } as SendTransactionParameters<typeof mainnet>)
        .catch(async (e) => {
          if (
            e.cause.details ===
            "EIP-7702 authorization lists are not supported before the Prague hardfork"
          )
            return;
          throw e;
        });
    }

    await use(client);

    await stop();
  },
});
