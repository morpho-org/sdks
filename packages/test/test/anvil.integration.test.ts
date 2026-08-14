import { http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { spawnAnvil } from "../src/anvil.js";
import { createAnvilTestClient } from "../src/client.js";

describe("spawnAnvil", () => {
  test("behavior: isolates state on unique local nodes", async () => {
    const [firstResult, secondResult] = await Promise.allSettled([
      spawnAnvil({ chainId: mainnet.id }),
      spawnAnvil({ chainId: mainnet.id }),
    ]);
    const nodes = [firstResult, secondResult].flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    try {
      if (firstResult.status === "rejected") throw firstResult.reason;
      if (secondResult.status === "rejected") throw secondResult.reason;

      const firstNode = firstResult.value;
      const secondNode = secondResult.value;
      expect(firstNode.rpcUrl).not.toBe(secondNode.rpcUrl);

      const firstClient = createAnvilTestClient(
        http(firstNode.rpcUrl),
        mainnet,
      );
      const secondClient = createAnvilTestClient(
        http(secondNode.rpcUrl),
        mainnet,
      );
      await Promise.all([
        firstClient.setBalance({
          address: firstClient.account.address,
          value: 1n,
        }),
        secondClient.setBalance({
          address: secondClient.account.address,
          value: 2n,
        }),
      ]);

      await expect(
        Promise.all([
          firstClient.getBalance({ address: firstClient.account.address }),
          secondClient.getBalance({ address: secondClient.account.address }),
        ]),
      ).resolves.toEqual([1n, 2n]);
    } finally {
      await Promise.all(nodes.map((node) => node.stopAndWait()));
    }
  });
});
