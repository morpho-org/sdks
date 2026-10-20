import { getErpcForkUrl } from "@morpho-org/test";
import {
  classifyError,
  createFaultProxy,
  expectFailClosed,
  type FaultProxy,
  fault,
} from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Chain, createClient, http, maxUint256, parseUnits } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { ChainIdMismatchError, morphoViemExtension } from "../../src/index.js";
import { CbbtcUsdcBlue } from "../fixtures/blue.js";
import { KeyrockUsdcVaultV2 } from "../fixtures/vaultV2.js";
import { test as mainnetTest } from "../setup.js";

const baseTest = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 41_290_768n,
  stepsTracing: false,
});

const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/** A client that declares `chain` while its honest transport serves another fork. */
const mismatchedClient = async (
  { chain, forkUrl }: { chain: Chain; forkUrl: string },
  onTestFinished: (cleanup: () => Promise<void>) => void,
) => {
  const proxy = await createFaultProxy({ upstream: forkUrl });
  onTestFinished(() => proxy.kill());
  const client = createClient({
    chain,
    transport: http(proxy.url, { retryCount: 0 }),
  }).extend(morphoViemExtension());
  return { client, proxy };
};

const downstreamCalls = (proxy: FaultProxy) =>
  proxy.log.filter(({ method }) => method !== "eth_chainId");

const expectChainMismatch = async (
  promise: Promise<unknown>,
  { observed, expected }: { observed: number; expected: number },
) => {
  const error = await expectFailClosed(promise, "chain");
  expect(error).toBeInstanceOf(ChainIdMismatchError);
  expect(error.message).toBe(
    `Chain ID mismatch between client: ${observed} and args: ${expected}`,
  );
};

describe("chaos: S5 wrong chain", () => {
  baseTest(
    "blue supply on a mainnet-declared client over Base rejects before any Requirement",
    async ({ client: baseFork, onTestFinished }) => {
      const { client, proxy } = await mismatchedClient(
        { chain: mainnet, forkUrl: baseFork.transport.url! },
        onTestFinished,
      );
      const action = client.morpho.blue(CbbtcUsdcBlue, mainnet.id).supply({
        userAddress: USER,
        assets: parseUnits("10", 6),
        deadline: maxUint256,
      });

      await expectChainMismatch(action.getRequirements(), {
        observed: base.id,
        expected: mainnet.id,
      });
      expect(proxy.log).toEqual([
        { method: "eth_getCode", outcome: "forwarded" },
        { method: "eth_chainId", outcome: "forwarded" },
      ]);
    },
  );

  baseTest(
    "blue borrow on a mainnet-declared client over Base rejects the reads it is built from",
    async ({ client: baseFork, onTestFinished }) => {
      const { client, proxy } = await mismatchedClient(
        { chain: mainnet, forkUrl: baseFork.transport.url! },
        onTestFinished,
      );
      const blue = client.morpho.blue(CbbtcUsdcBlue, mainnet.id);

      await expectChainMismatch(blue.getPositionData(USER), {
        observed: base.id,
        expected: mainnet.id,
      });
      // Without positionData the borrow action cannot be built, so no Transaction exists.
      await expectChainMismatch(blue.getMarketData(), {
        observed: base.id,
        expected: mainnet.id,
      });
      expect(downstreamCalls(proxy)).toEqual([]);
    },
  );

  baseTest(
    "blue reallocation data on a mainnet-declared client over Base rejects before any read",
    async ({ client: baseFork, onTestFinished }) => {
      const { client, proxy } = await mismatchedClient(
        { chain: mainnet, forkUrl: baseFork.transport.url! },
        onTestFinished,
      );
      const blue = client.morpho.blue(CbbtcUsdcBlue, mainnet.id);

      await expectChainMismatch(
        blue.getVaultV2BlueReallocationData({
          vaultAddresses: [KeyrockUsdcVaultV2.address],
          block: { number: 1n, timestamp: 1n },
        }),
        { observed: base.id, expected: mainnet.id },
      );
      expect(proxy.log).toEqual([
        { method: "eth_chainId", outcome: "forwarded" },
      ]);
    },
  );

  baseTest(
    "vault V2 deposit on a mainnet-declared client over Base rejects its vault read",
    async ({ client: baseFork, onTestFinished }) => {
      const { client, proxy } = await mismatchedClient(
        { chain: mainnet, forkUrl: baseFork.transport.url! },
        onTestFinished,
      );
      const vault = client.morpho.vaultV2(
        KeyrockUsdcVaultV2.address,
        mainnet.id,
      );

      await expectChainMismatch(vault.getData(), {
        observed: base.id,
        expected: mainnet.id,
      });
      expect(downstreamCalls(proxy)).toEqual([]);
    },
  );

  mainnetTest(
    "a Base-declared client over a mainnet transport rejects before any read",
    async ({ client: mainnetFork, onTestFinished }) => {
      const { client, proxy } = await mismatchedClient(
        { chain: base, forkUrl: mainnetFork.transport.url! },
        onTestFinished,
      );
      const vault = client.morpho.vaultV2(KeyrockUsdcVaultV2.address, base.id);

      await expectChainMismatch(vault.getData(), {
        observed: mainnet.id,
        expected: base.id,
      });
      expect(downstreamCalls(proxy)).toEqual([]);
    },
  );

  mainnetTest(
    "observes eth_chainId once per flow instead of caching it",
    async ({ client: mainnetFork, onTestFinished }) => {
      const { client, proxy } = await mismatchedClient(
        { chain: mainnet, forkUrl: mainnetFork.transport.url! },
        onTestFinished,
      );
      const blue = client.morpho.blue(CbbtcUsdcBlue, mainnet.id);

      await blue.getMarketData();
      const firstFlowCalls = proxy.log.length;
      proxy.setFaults([
        {
          method: "eth_chainId",
          fault: fault.rawBody('{"jsonrpc":"2.0","id":0,"result":"0x2105"}'),
        },
      ]);
      await expectChainMismatch(blue.getMarketData(), {
        observed: base.id,
        expected: mainnet.id,
      });
      expect(proxy.log.slice(firstFlowCalls)).toEqual([
        { method: "eth_chainId", outcome: "rawBody" },
      ]);
    },
  );

  baseTest(
    "accepted residual: provider lying about eth_chainId",
    async ({ client: baseFork, onTestFinished }) => {
      const { client, proxy } = await mismatchedClient(
        { chain: mainnet, forkUrl: baseFork.transport.url! },
        onTestFinished,
      );
      proxy.setFaults([
        {
          method: "eth_chainId",
          fault: fault.rawBody('{"jsonrpc":"2.0","id":0,"result":"0x1"}'),
        },
      ]);

      // THREAT_MODEL.md › RPC: only the provider can answer eth_chainId, so a lie is not detected
      // and the flow reads Base state as if it were mainnet.
      const outcome = await client.morpho
        .blue(CbbtcUsdcBlue, mainnet.id)
        .getMarketData()
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(outcome).not.toBeInstanceOf(ChainIdMismatchError);
      expect(classifyError(outcome)).not.toBe("chain");
      expect(proxy.log[0]).toEqual({
        method: "eth_chainId",
        outcome: "rawBody",
      });
      expect(downstreamCalls(proxy).length).toBeGreaterThan(0);
    },
  );
});
