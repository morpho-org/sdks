import {
  type Address,
  createTestClient,
  custom,
  type Hex,
  publicActions,
  walletActions,
} from "viem";
import { base } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  MidnightAdapterFactoryCodeError,
  MidnightAdapterFactoryDeploymentError,
} from "./errors.js";
import { testAccount } from "./fixtures.js";
import { createMockClient } from "./mock.js";
import { installMidnightAdapterFactory } from "./vaultV2MidnightFixture.js";

type InstallClient = Parameters<
  typeof installMidnightAdapterFactory
>[0]["client"];

const target: Address = "0x00000000000000000000000000000000000000AA";
const deployed: Address = "0x00000000000000000000000000000000000000bb";
const hash: Hex = `0x${"11".repeat(32)}`;

const createInstallClient = (params: {
  readonly contractAddress: Address | null;
  readonly code: Hex;
}) => {
  const { request } = createMockClient(base);
  request.mockImplementation(async ({ method }) => {
    switch (method) {
      case "eth_chainId":
        return `0x${base.id.toString(16)}`;
      case "eth_blockNumber":
        return "0x1";
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_estimateGas":
        return "0x5208";
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas":
        return "0x1";
      case "eth_getBlockByNumber":
        return {
          number: "0x1",
          hash: `0x${"22".repeat(32)}`,
          baseFeePerGas: "0x1",
          timestamp: "0x1",
          transactions: [],
        };
      case "eth_sendRawTransaction":
        return hash;
      case "eth_getTransactionReceipt":
        return {
          blockHash: `0x${"22".repeat(32)}`,
          blockNumber: "0x1",
          contractAddress: params.contractAddress,
          cumulativeGasUsed: "0x5208",
          effectiveGasPrice: "0x1",
          from: testAccount().address,
          gasUsed: "0x5208",
          logs: [],
          logsBloom: `0x${"00".repeat(256)}`,
          status: "0x1",
          to: null,
          transactionHash: hash,
          transactionIndex: "0x0",
          type: "0x2",
        };
      case "eth_getCode":
        return params.code;
      case "anvil_setCode":
        return null;
    }
    throw new Error(`unhandled RPC ${method}`);
  });
  const client = createTestClient({
    chain: base,
    mode: "anvil",
    account: testAccount(),
    pollingInterval: 10,
    transport: custom({ request }, { retryCount: 0 }),
  })
    .extend(publicActions)
    .extend(walletActions) as unknown as InstallClient;
  const setCodeCalls = () =>
    request.mock.calls
      .map(([call]) => call)
      .filter(({ method }) => method === "anvil_setCode");
  return { client, setCodeCalls };
};

describe("installMidnightAdapterFactory", () => {
  test("default", async () => {
    const { client, setCodeCalls } = createInstallClient({
      contractAddress: deployed,
      code: "0x6001",
    });

    await installMidnightAdapterFactory({ client, address: target });

    expect(setCodeCalls()).toEqual([
      { method: "anvil_setCode", params: [target, "0x6001"] },
    ]);
  });

  test("error: MidnightAdapterFactoryDeploymentError", async () => {
    const { client, setCodeCalls } = createInstallClient({
      contractAddress: null,
      code: "0x6001",
    });

    await expect(
      installMidnightAdapterFactory({ client, address: target }),
    ).rejects.toBeInstanceOf(MidnightAdapterFactoryDeploymentError);
    expect(setCodeCalls()).toEqual([]);
  });

  test("error: MidnightAdapterFactoryCodeError", async () => {
    const { client, setCodeCalls } = createInstallClient({
      contractAddress: deployed,
      code: "0x",
    });

    await expect(
      installMidnightAdapterFactory({ client, address: target }),
    ).rejects.toBeInstanceOf(MidnightAdapterFactoryCodeError);
    expect(setCodeCalls()).toEqual([]);
  });
});
