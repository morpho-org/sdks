import { http, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { spawnAnvil } from "../src/anvil.js";
import { createAnvilTestClient } from "../src/client.js";

describe("transaction automine transitions", () => {
  test.each([false, true])(
    "observes mode changes from another client: initially %s",
    async (initialAutomine) => {
      const node = await spawnAnvil({
        chainId: mainnet.id,
        gasPrice: 0n,
        blockBaseFeePerGas: 0n,
      });
      const client = createAnvilTestClient(http(node.rpcUrl), mainnet);
      const controller = createAnvilTestClient(http(node.rpcUrl), mainnet);
      let submitted: Promise<`0x${string}`> | undefined;
      try {
        await controller.setAutomine(initialAutomine);
        const first = await client.signTransaction({
          to: zeroAddress,
          value: 0n,
          gas: 21_000n,
          gasPrice: 0n,
          nonce: 0,
        });
        await client.sendRawTransaction({ serializedTransaction: first });
        if (!initialAutomine) await controller.mine({ blocks: 1 });

        await controller.setAutomine(!initialAutomine);
        const second = await client.signTransaction({
          to: zeroAddress,
          value: 0n,
          gas: 21_000n,
          gasPrice: 0n,
          nonce: 1,
        });
        let returned = false;
        submitted = client
          .sendRawTransaction({ serializedTransaction: second })
          .then((transactionHash) => {
            returned = true;
            return transactionHash;
          });
        await expect.poll(() => returned, { timeout: 1_500 }).toBe(true);
        const hash = await submitted;
        if (initialAutomine) {
          const pool = await controller.getTxpoolContent();
          expect(
            Object.values(pool.pending)
              .flatMap((txs) => Object.values(txs))
              .map((tx) => tx.hash),
          ).toContain(hash);
        } else {
          await expect(
            controller.getTransactionReceipt({ hash }),
          ).resolves.toMatchObject({ transactionHash: hash });
        }
      } finally {
        try {
          await controller.mine({ blocks: 1 });
          await submitted;
        } finally {
          await node.stopAndWait();
        }
      }
    },
  );
});
