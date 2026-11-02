import { ChainId } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import { type Address, type Chain, parseEther } from "viem";
import { describe, expect, test, vi } from "vitest";
import { E2E_ASSET_BYTECODE, E2E_ASSET_STORAGE } from "./asset.js";
import { installE2eAsset, installE2eOracle, wrapE2eNative } from "./setup.js";

const defaultAccount: Address = "0x0000000000000000000000000000000000000001";
const explicitAccount: Address = "0x0000000000000000000000000000000000000002";
const token: Address = "0x0000000000000000000000000000000000000003";

const createClient = (chainId: number = ChainId.EthMainnet) => {
  const mock = {
    account: { address: defaultAccount },
    chain: { id: chainId },
    setCode: vi.fn().mockResolvedValue(undefined),
    setStorageAt: vi.fn().mockResolvedValue(undefined),
    balanceOf: vi.fn().mockResolvedValue(17n),
    deal: vi.fn().mockResolvedValue(undefined),
    getBalance: vi.fn().mockResolvedValue(23n),
    setBalance: vi.fn().mockResolvedValue(undefined),
    writeContract: vi.fn().mockResolvedValue("0x"),
  };
  return { client: mock as unknown as AnvilTestClient<Chain>, mock };
};

describe("installE2eAsset", () => {
  test("installs the asset bytecode and every constructor storage slot", async () => {
    const { client, mock } = createClient();
    await installE2eAsset(client, token);

    expect(mock.setCode.mock.calls).toEqual([
      [{ address: token, bytecode: E2E_ASSET_BYTECODE }],
    ]);
    expect(mock.setStorageAt.mock.calls).toEqual(
      E2E_ASSET_STORAGE.map(({ slot, value }) => [
        { address: token, index: slot, value },
      ]),
    );
    expect(mock.setCode).toHaveBeenCalledBefore(mock.setStorageAt);
  });

  test("propagates a code installation failure without writing storage", async () => {
    const { client, mock } = createClient();
    const error = new Error("code installation failed");
    mock.setCode.mockRejectedValueOnce(error);

    await expect(installE2eAsset(client, token)).rejects.toBe(error);
    expect(mock.setStorageAt).not.toHaveBeenCalled();
  });

  test("stops writing storage after a failed slot write", async () => {
    const { client, mock } = createClient();
    const error = new Error("storage write failed");
    mock.setStorageAt.mockRejectedValueOnce(error);

    await expect(installE2eAsset(client, token)).rejects.toBe(error);
    expect(mock.setStorageAt).toHaveBeenCalledTimes(1);
  });
});

describe("installE2eOracle", () => {
  test("returns the fixed oracle address and installs bytecode returning 1e36", async () => {
    const { client, mock } = createClient();
    const address = await installE2eOracle(client);

    expect(address).toBe("0xE2E0000000000000000000000000000000000001");
    expect(mock.setCode.mock.calls).toEqual([
      [
        {
          address,
          bytecode: "0x6ec097ce7bc90715b34b9f100000000060005260206000f3",
        },
      ],
    ]);
    expect(mock.setStorageAt).not.toHaveBeenCalled();
  });

  test("propagates a code installation failure", async () => {
    const { client, mock } = createClient();
    const error = new Error("oracle installation failed");
    mock.setCode.mockRejectedValueOnce(error);

    await expect(installE2eOracle(client)).rejects.toBe(error);
  });
});

describe("wrapE2eNative", () => {
  test.each([undefined, explicitAccount])(
    "preserves the installed asset balance when funding account %s",
    async (account) => {
      const { client, mock } = createClient(ChainId.ArcMainnet);
      await wrapE2eNative(client, { wNative: token, amount: 5n, account });

      expect(mock.balanceOf).toHaveBeenCalledExactlyOnceWith({
        erc20: token,
        owner: account ?? defaultAccount,
      });
      expect(mock.deal).toHaveBeenCalledExactlyOnceWith({
        erc20: token,
        account: account ?? defaultAccount,
        amount: 22n,
      });
      expect(mock.getBalance).not.toHaveBeenCalled();
      expect(mock.setBalance).not.toHaveBeenCalled();
      expect(mock.writeContract).not.toHaveBeenCalled();
    },
  );

  test.each([0n, 5n])(
    "funds the default account and deposits %s native units",
    async (amount) => {
      const { client, mock } = createClient();
      await wrapE2eNative(client, { wNative: token, amount });

      expect(mock.deal).toHaveBeenCalledExactlyOnceWith({
        amount: amount + parseEther("1"),
      });
      expect(mock.writeContract).toHaveBeenCalledExactlyOnceWith({
        account: defaultAccount,
        address: token,
        abi: [
          {
            type: "function",
            name: "deposit",
            stateMutability: "payable",
            inputs: [],
            outputs: [],
          },
        ],
        functionName: "deposit",
        value: amount,
      });
      expect(mock.deal).toHaveBeenCalledBefore(mock.writeContract);
      expect(mock.balanceOf).not.toHaveBeenCalled();
      expect(mock.getBalance).not.toHaveBeenCalled();
      expect(mock.setBalance).not.toHaveBeenCalled();
    },
  );

  test("preserves an explicit account's native balance before depositing", async () => {
    const { client, mock } = createClient();
    await wrapE2eNative(client, {
      wNative: token,
      amount: 5n,
      account: explicitAccount,
    });

    expect(mock.getBalance).toHaveBeenCalledExactlyOnceWith({
      address: explicitAccount,
    });
    expect(mock.setBalance).toHaveBeenCalledExactlyOnceWith({
      address: explicitAccount,
      value: 28n + parseEther("1"),
    });
    expect(mock.writeContract).toHaveBeenCalledExactlyOnceWith({
      account: explicitAccount,
      address: token,
      abi: [
        {
          type: "function",
          name: "deposit",
          stateMutability: "payable",
          inputs: [],
          outputs: [],
        },
      ],
      functionName: "deposit",
      value: 5n,
    });
    expect(mock.setBalance).toHaveBeenCalledBefore(mock.writeContract);
    expect(mock.deal).not.toHaveBeenCalled();
    expect(mock.balanceOf).not.toHaveBeenCalled();
  });

  test("propagates funding failures without depositing", async () => {
    const { client, mock } = createClient();
    const error = new Error("funding failed");
    mock.deal.mockRejectedValueOnce(error);

    await expect(
      wrapE2eNative(client, { wNative: token, amount: 5n }),
    ).rejects.toBe(error);
    expect(mock.writeContract).not.toHaveBeenCalled();
  });

  test("propagates deposit failures", async () => {
    const { client, mock } = createClient();
    const error = new Error("deposit failed");
    mock.writeContract.mockRejectedValueOnce(error);

    await expect(
      wrapE2eNative(client, { wNative: token, amount: 5n }),
    ).rejects.toBe(error);
  });
});
