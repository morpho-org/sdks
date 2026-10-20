import { getChainAddress } from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  createFaultProxy,
  expectFailClosed,
  type FaultProxy,
  fault,
} from "@morpho-org/test/chaos";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import {
  type Hash,
  HttpRequestError,
  keccak256,
  LimitExceededRpcError,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, vi } from "vitest";
import { UnconfirmedBroadcastError } from "../src/errors.js";
import MorphoProtocolEvm from "../src/morpho-protocol-evm.js";
import { test as viemTest } from "./setup.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const VAULT = "0xBb50A5341368751024ddf33385BA8cf61fE65FF9";
const NATIVE_SUPPLY = 10n ** 15n;

describe("chaos: S10 submission failure", () => {
  const submissionTest = viemTest.extend<{ proxy: FaultProxy }>({
    proxy: async ({ client }, use) => {
      const proxy = await createFaultProxy({
        upstream: client.transport.url,
      });
      try {
        await use(proxy);
      } finally {
        await proxy.kill();
      }
    },
  });

  const prepareSupply = async (
    client: AnvilTestClient<typeof mainnet>,
    proxy: FaultProxy,
  ) => {
    const account = new WalletAccountEvm(SEED, "0'/0/0", {
      provider: proxy.url,
    });
    const owner = await account.getAddress();
    await client.setCode({ address: owner, bytecode: "0x" });
    await client.setBalance({ address: owner, value: 10n ** 19n });

    const protocol = new MorphoProtocolEvm(account, {
      chainId: mainnet.id,
      earnVaultAddress: VAULT,
    });
    const prepared = await protocol.prepareSupply({
      token: getChainAddress(mainnet.id, "wNative"),
      nativeAmount: NATIVE_SUPPLY,
    });
    await prepared.getRequirements();
    return { account, client, owner, prepared, proxy };
  };

  const pendingNonce = async (
    client: AnvilTestClient<typeof mainnet>,
    owner: `0x${string}`,
  ) =>
    client.getTransactionCount({
      address: owner,
      blockTag: "pending",
    });

  submissionTest(
    "revalidation refusal fails before raw submission",
    async ({ client, proxy }) => {
      const { account, owner, prepared } = await prepareSupply(client, proxy);
      const signTransaction = vi.spyOn(account, "signTransaction");
      const nonce = await pendingNonce(client, owner);
      const logStart = proxy.log.length;
      proxy.setFaults([
        {
          method: "eth_chainId",
          nth: [2, 3, 4, 5],
          fault: fault.refuse(),
        },
      ]);

      const error = await expectFailClosed(prepared.submit(), "infra");
      const submissionLog = proxy.log.slice(logStart);
      const fillIndex = submissionLog.findIndex(
        (entry) =>
          entry.method === "eth_fillTransaction" &&
          entry.outcome === "forwarded",
      );
      const refusedChainIdIndex = submissionLog.findIndex(
        (entry) => entry.method === "eth_chainId" && entry.outcome === "refuse",
      );

      expect(fillIndex).toBeGreaterThanOrEqual(0);
      expect(refusedChainIdIndex).toBeGreaterThan(fillIndex);
      expect(
        submissionLog.filter(
          (entry) =>
            entry.method === "eth_chainId" && entry.outcome === "refuse",
        ),
      ).toHaveLength(4);
      expect(signTransaction).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(HttpRequestError);
      expect(
        submissionLog.filter(
          (entry) => entry.method === "eth_sendRawTransaction",
        ),
      ).toHaveLength(0);
      expect(await pendingNonce(client, owner)).toBe(nonce);
    },
  );

  submissionTest(
    "fill and nonce lookup refusals fail before raw submission",
    async ({ client, proxy }) => {
      const { owner, prepared } = await prepareSupply(client, proxy);
      const nonce = await pendingNonce(client, owner);
      proxy.setFaults([
        { method: "eth_fillTransaction", fault: fault.refuse() },
        { method: "eth_getTransactionCount", fault: fault.refuse() },
      ]);

      const error = await expectFailClosed(prepared.submit(), "infra");

      expect(error).toBeInstanceOf(HttpRequestError);
      expect(
        proxy.log.filter((entry) => entry.method === "eth_sendRawTransaction"),
      ).toHaveLength(0);
      expect(await pendingNonce(client, owner)).toBe(nonce);
    },
  );

  submissionTest(
    "a refused raw submission reports the locally computed hash",
    async ({ client, proxy }) => {
      const { owner, prepared } = await prepareSupply(client, proxy);
      const nonce = await pendingNonce(client, owner);
      proxy.setFaults([
        {
          method: "eth_sendRawTransaction",
          fault: fault.refuse(),
        },
      ]);

      const error = await expectFailClosed(prepared.submit(), "infra");
      const broadcastError = error as UnconfirmedBroadcastError;

      expect(error).toBeInstanceOf(UnconfirmedBroadcastError);
      expect(
        proxy.log.filter((entry) => entry.method === "eth_sendRawTransaction"),
      ).toHaveLength(1);
      expect(broadcastError.hash).toBe(
        keccak256(broadcastError.serializedTransaction) as Hash,
      );
      expect(await pendingNonce(client, owner)).toBe(nonce);
    },
  );

  submissionTest(
    "a dropped response surfaces the mined hash and signed bytes, and rebroadcasting them cannot double-send",
    async ({ client, proxy }) => {
      const { owner, prepared } = await prepareSupply(client, proxy);
      const nonce = await pendingNonce(client, owner);
      proxy.setFaults([
        {
          method: "eth_sendRawTransaction",
          fault: fault.forwardThenDrop(),
        },
      ]);

      const error = await expectFailClosed(prepared.submit(), "infra");
      expect(error).toBeInstanceOf(UnconfirmedBroadcastError);
      expect(
        proxy.log.filter((entry) => entry.method === "eth_sendRawTransaction"),
      ).toHaveLength(1);
      const receipt = await client.waitForTransactionReceipt({
        hash: (error as UnconfirmedBroadcastError).hash,
      });
      expect(receipt.status).toBe("success");
      expect(await pendingNonce(client, owner)).toBe(nonce + 1);

      await expect(
        client.sendRawTransaction({
          serializedTransaction: (error as UnconfirmedBroadcastError)
            .serializedTransaction,
        }),
      ).rejects.toThrow(/nonce/i);
      expect(await pendingNonce(client, owner)).toBe(nonce + 1);
    },
  );

  submissionTest(
    "a killed proxy fails closed without a raw send",
    async ({ client, proxy }) => {
      const { prepared } = await prepareSupply(client, proxy);
      await proxy.kill();

      const error = await expectFailClosed(prepared.submit(), "infra");

      expect(error).toBeInstanceOf(HttpRequestError);
      expect(
        proxy.log.filter((entry) => entry.method === "eth_sendRawTransaction"),
      ).toHaveLength(0);
    },
  );

  submissionTest(
    "a definitive RPC rejection is not an uncertain broadcast",
    async ({ client, proxy }) => {
      const { prepared } = await prepareSupply(client, proxy);
      proxy.setFaults([
        {
          method: "eth_sendRawTransaction",
          fault: fault.rpcError(-32005, "limit"),
        },
      ]);

      const error = await expectFailClosed(prepared.submit(), "infra");

      expect(error).toBeInstanceOf(LimitExceededRpcError);
      expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
      expect(
        proxy.log.filter((entry) => entry.method === "eth_sendRawTransaction"),
      ).toHaveLength(1);
      expect(
        proxy.log.filter(
          (entry) => entry.method === "eth_getTransactionByHash",
        ),
      ).toHaveLength(1);
    },
  );

  submissionTest(
    "quotes do not submit a raw transaction",
    async ({ client, proxy }) => {
      const { prepared } = await prepareSupply(client, proxy);
      await prepared.quote();

      expect(
        proxy.log.filter((entry) => entry.method === "eth_sendRawTransaction"),
      ).toHaveLength(0);
    },
  );
});
