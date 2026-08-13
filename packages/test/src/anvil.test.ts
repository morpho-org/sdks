import { http } from "viem";
import { mainnet } from "viem/chains";
import { expect, test } from "vitest";
import { spawnAnvil } from "./anvil.js";
import { createAnvilTestClient } from "./client.js";

test("spawnAnvil isolates state on unique local nodes", async () => {
  const [firstNode, secondNode] = await Promise.all([
    spawnAnvil({ chainId: mainnet.id }),
    spawnAnvil({ chainId: mainnet.id }),
  ]);

  try {
    expect(firstNode.rpcUrl).not.toBe(secondNode.rpcUrl);

    const firstClient = createAnvilTestClient(http(firstNode.rpcUrl), mainnet);
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
    firstNode.stop();
    secondNode.stop();
  }
});
