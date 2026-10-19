import { getErpcForkUrl } from "@morpho-org/test";
import {
  createFaultProxy,
  expectFailClosed,
  type FaultProxy,
} from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Address, zeroHash } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  InvalidChainIdError,
  RpcTransportError,
  type SimulateParams,
  SlippageCheckUnavailableError,
  simulate,
} from "../../src/index.js";

const baseTest = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 41_290_768n,
  stepsTracing: false,
});

const mainnetTest = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 25_832_676n,
  stepsTracing: false,
});

/** Above both pinned fork heads. */
const ABOVE_HEAD = 60_000_000n;

const mainnetRequest = (
  from: Address,
  state: Pick<SimulateParams, "block" | "blockNumber"> = {},
): SimulateParams => ({
  chainId: mainnet.id,
  transactions: [{ from, to: from, data: "0x", value: 0n }],
  ...state,
});

/** Simulation config whose mainnet entry points at `forkUrl` through a logging proxy. */
const proxiedConfig = async (
  forkUrl: string,
  onTestFinished: (cleanup: () => Promise<void>) => void,
) => {
  const proxy = await createFaultProxy({ upstream: forkUrl });
  onTestFinished(() => proxy.kill());
  const config = {
    chains: new Map([[mainnet.id, { simulateV1Url: proxy.url }]]),
  };
  return { config, proxy };
};

/** No contract on either fork: resolving its quoted asset finds no evidence. */
const NO_CODE_VAULT: Address = "0x00000000000000000000000000000000DeaDBeef";

const quotedVaultDeposit = (
  from: Address,
  block?: SimulateParams["block"],
) => ({
  ...mainnetRequest(from, block ? { block } : {}),
  limits: {
    operations: [
      {
        type: "vaultV2Deposit" as const,
        vault: NO_CODE_VAULT,
        quote: { assetsPaid: 1n },
        slippageTolerance: 0n,
      },
    ],
  },
});

const methods = (proxy: FaultProxy) => proxy.log.map(({ method }) => method);

const expectInvalidChainId = async (promise: Promise<unknown>) => {
  const error = await expectFailClosed(promise, "chain");
  expect(error).toBeInstanceOf(InvalidChainIdError);
  expect(error).not.toBeInstanceOf(RpcTransportError);
  return error;
};

describe("chaos: S5 wrong chain", () => {
  baseTest(
    "a mainnet request on a Base endpoint rejects through the per-call chainId",
    async ({ client, onTestFinished }) => {
      const { config, proxy } = await proxiedConfig(
        client.transport.url!,
        onTestFinished,
      );

      await expectInvalidChainId(
        simulate(config, mainnetRequest(client.account.address)),
      );
      expect(methods(proxy)).toContain("eth_simulateV1");
    },
  );

  baseTest(
    "a mainnet blockNumber above the Base head rejects before eth_simulateV1",
    async ({ client, onTestFinished }) => {
      const { config, proxy } = await proxiedConfig(
        client.transport.url!,
        onTestFinished,
      );

      await expectInvalidChainId(
        simulate(
          config,
          mainnetRequest(client.account.address, { blockNumber: ABOVE_HEAD }),
        ),
      );
      expect(methods(proxy)).not.toContain("eth_simulateV1");
    },
  );

  baseTest(
    "a caller-supplied mainnet block above the Base head rejects",
    async ({ client, onTestFinished }) => {
      const { config } = await proxiedConfig(
        client.transport.url!,
        onTestFinished,
      );

      await expectInvalidChainId(
        simulate(
          config,
          mainnetRequest(client.account.address, {
            block: { number: ABOVE_HEAD, hash: zeroHash, timestamp: 0n },
          }),
        ),
      );
    },
  );

  baseTest(
    "a quoted vault missing on the Base endpoint rejects as InvalidChainIdError",
    async ({ client, onTestFinished }) => {
      const { config, proxy } = await proxiedConfig(
        client.transport.url!,
        onTestFinished,
      );

      await expectInvalidChainId(
        simulate(config, quotedVaultDeposit(client.account.address)),
      );
      expect(methods(proxy)).toContain("eth_chainId");
      expect(methods(proxy)).not.toContain("eth_simulateV1");
    },
  );

  baseTest(
    "a quoted-asset read at a block above the Base head rejects as InvalidChainIdError",
    async ({ client, onTestFinished }) => {
      const { config, proxy } = await proxiedConfig(
        client.transport.url!,
        onTestFinished,
      );

      await expectInvalidChainId(
        simulate(
          config,
          quotedVaultDeposit(client.account.address, {
            number: ABOVE_HEAD,
            hash: zeroHash,
            timestamp: 0n,
          }),
        ),
      );
      expect(methods(proxy)).toContain("eth_call");
      expect(methods(proxy)).not.toContain("eth_simulateV1");
    },
  );

  mainnetTest(
    "a quoted vault missing on the right chain stays SlippageCheckUnavailableError",
    async ({ client, onTestFinished }) => {
      const { config, proxy } = await proxiedConfig(
        client.transport.url!,
        onTestFinished,
      );

      const error = await simulate(
        config,
        quotedVaultDeposit(client.account.address),
      ).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
      expect(error).not.toBeInstanceOf(InvalidChainIdError);
      expect(methods(proxy)).toContain("eth_chainId");
    },
  );

  mainnetTest(
    "a block above the head of the right chain stays an RpcTransportError",
    async ({ client, onTestFinished }) => {
      const { config, proxy } = await proxiedConfig(
        client.transport.url!,
        onTestFinished,
      );

      const error = await expectFailClosed(
        simulate(
          config,
          mainnetRequest(client.account.address, { blockNumber: ABOVE_HEAD }),
        ),
        "infra",
      );
      expect(error).toBeInstanceOf(RpcTransportError);
      expect(error).not.toBeInstanceOf(InvalidChainIdError);
      expect(methods(proxy)).not.toContain("eth_simulateV1");
    },
  );
});
