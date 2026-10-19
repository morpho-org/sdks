import { ChainId } from "@morpho-org/blue-sdk";
import { markets, vaults } from "@morpho-org/morpho-test";
import {
  createFaultProxy,
  expectFailClosed,
  fault,
} from "@morpho-org/test/chaos";
import { type BaseError, createClient, HttpRequestError, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { fetchMarket } from "../src/fetch/Market.js";
import { fetchVault } from "../src/fetch/Vault.js";
import { test } from "./setup.js";

const vault = vaults[ChainId.EthMainnet].steakUsdc.address;
const marketId = markets[ChainId.EthMainnet].usdc_wstEth.id;

describe("chaos: fork transport failures", () => {
  test("fails closed on one rate-limited vault read", async ({ client }) => {
    const upstream = client.transport.url;
    if (!upstream) throw new Error("fork client transport has no URL");
    const proxy = await createFaultProxy({ upstream });
    try {
      proxy.setFaults([
        { method: "eth_call", nth: 0, fault: fault.status(429) },
      ]);
      const faultClient = createClient({
        chain: mainnet,
        transport: http(proxy.url, { retryCount: 0 }),
      });
      const error = await expectFailClosed(
        fetchVault(vault, faultClient),
        "infra",
      );

      expect(
        (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
      ).toMatchObject({ status: 429 });
      expect(
        proxy.log.filter(({ method }) => method === "eth_call"),
      ).toHaveLength(1);
    } finally {
      await proxy.kill();
    }
  });

  test("rejects when its RPC proxy refuses an eth_call", async ({ client }) => {
    const upstream = client.transport.url;
    if (!upstream) throw new Error("fork client transport has no URL");
    const proxy = await createFaultProxy({ upstream });
    const faultClient = createClient({
      chain: mainnet,
      transport: http(proxy.url, { retryCount: 0 }),
    });
    try {
      proxy.setFaults([{ method: "eth_call", nth: 0, fault: fault.refuse() }]);
      const error = await expectFailClosed(
        fetchMarket(marketId, faultClient),
        "infra",
      );

      expect(
        (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
      ).toMatchObject({ status: undefined });
      expect(
        proxy.log.filter(({ method }) => method === "eth_call"),
      ).toHaveLength(1);
    } finally {
      await proxy.kill();
    }
  });
});
