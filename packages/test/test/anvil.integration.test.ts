import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { http } from "viem";
import { mainnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { spawnAnvil } from "../src/anvil.js";
import { createAnvilTestClient } from "../src/client.js";

describe.sequential("spawnAnvil", () => {
  // spawnAnvil forks directly, without the anvil_nodeInfo proxy, when one is set.
  beforeEach(() => {
    for (const name of [
      "HTTP_PROXY",
      "http_proxy",
      "HTTPS_PROXY",
      "https_proxy",
      "ALL_PROXY",
      "all_proxy",
    ])
      vi.stubEnv(name, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
      const cleanupResults = await Promise.allSettled(
        nodes.map((node) => node.stopAndWait()),
      );
      expect(cleanupResults).toEqual(
        nodes.map(() => expect.objectContaining({ status: "fulfilled" })),
      );
    }
  });

  test("behavior: forks an RPC that never answers anvil_nodeInfo", async () => {
    const upstream = await spawnAnvil({ chainId: mainnet.id });
    const methods: string[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const requests: { method: string }[] = [JSON.parse(body)].flat();
      methods.push(...requests.map(({ method }) => method));
      if (requests.some(({ method }) => method === "anvil_nodeInfo")) return;
      const response = await fetch(upstream.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      res
        .writeHead(response.status, { "content-type": "application/json" })
        .end(await response.text());
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );

    try {
      // Not a dev account: Anvil funds those on forks.
      const address = "0x000000000000000000000000000000000000dEaD";
      await createAnvilTestClient(http(upstream.rpcUrl), mainnet).setBalance({
        address,
        value: 7n,
      });
      // No storage caching: keep this local chain out of the mainnet fork cache.
      const fork = await spawnAnvil({
        chainId: mainnet.id,
        forkUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        noStorageCaching: true,
      });
      try {
        await expect(
          createAnvilTestClient(http(fork.rpcUrl), mainnet).getBalance({
            address,
          }),
        ).resolves.toBe(7n);
      } finally {
        await fork.stopAndWait();
      }
      expect(methods).not.toContain("anvil_nodeInfo");
      expect(methods).toContain("eth_getBalance");
    } finally {
      server.closeAllConnections();
      server.close();
      await upstream.stopAndWait();
    }
  });
});
