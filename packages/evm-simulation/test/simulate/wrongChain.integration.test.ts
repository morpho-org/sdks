import { getErpcForkUrl } from "@morpho-org/test";
import { createFaultProxy, type FaultProxy } from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import type { Address } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { RpcTransportError, simulate } from "../../src/index.js";
import { simulationClientFor } from "../../src/test-helpers/index.js";

const baseTest = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 41_290_768n,
  stepsTracing: false,
});

const request = (from: Address) => ({
  limits: "none" as const,
  transactions: [{ from, to: from, data: "0x" as const, value: 0n }],
});

/** A mainnet client whose transport reaches `forkUrl` through a logging proxy. */
const proxiedMainnetClient = async (
  forkUrl: string,
  onTestFinished: (cleanup: () => Promise<void>) => void,
) => {
  const proxy = await createFaultProxy({ upstream: forkUrl });
  onTestFinished(() => proxy.kill());
  return { client: simulationClientFor(proxy.url, mainnet), proxy };
};

const methods = (proxy: FaultProxy) => proxy.log.map(({ method }) => method);

describe("chaos: S5 wrong chain", () => {
  baseTest(
    "a mainnet client on a Base endpoint reports the node's chainId rejection as RpcTransportError",
    async ({ client, onTestFinished }) => {
      const { client: mainnetClient, proxy } = await proxiedMainnetClient(
        client.transport.url!,
        onTestFinished,
      );

      const report = await simulate(
        mainnetClient,
        request(client.account.address),
      );
      expect(report.ok).toBe(false);
      if (report.ok) return;
      expect(report.failures).toHaveLength(1);
      expect(report.failures[0]).toBeInstanceOf(RpcTransportError);
      expect(methods(proxy)).toContain("eth_simulateV1");
      expect(methods(proxy)).not.toContain("eth_chainId");
    },
  );
});
