import { getChainAddresses } from "@morpho-org/blue-sdk";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  padHex,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  BlacklistViolationError,
  SimulationRevertedError,
  simulate,
} from "../../src/index.js";
import { WITHDRAWAL_TOPIC } from "../../src/simulate/parsing/transfers.js";
import { test } from "../setup.js";

const LOOKALIKE_TOKEN: Address = "0x1000000000000000000000000000000000000001";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";
const wethAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
});

describe.sequential("simulate — registered wrapped-native events", () => {
  test("behavior: parses WETH9 events only from the registered contract", async ({
    client,
  }) => {
    const amount = parseEther("1");
    const bundles = getChainAddresses(mainnet.id).bundles!.vaultExitBundlesV1;
    await client.deal({ erc20: WETH, amount });

    // Runtime bytecode that emits Withdrawal(bundles, amount) without moving
    // value. The log is produced by a real EVM execution through eth_simulateV1.
    await client.setCode({
      address: LOOKALIKE_TOKEN,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(amount), { size: 32 }),
        "0x5f52",
        "0x73",
        bundles,
        "0x7f",
        WITHDRAWAL_TOPIC,
        "0x60205fa200",
      ]),
    });

    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: WETH,
          data: encodeFunctionData({
            abi: wethAbi,
            functionName: "withdraw",
            args: [amount],
          }),
        },
        { from: client.account.address, to: LOOKALIKE_TOKEN, data: "0x" },
      ],
    });

    expect(result.calls[1]?.logs[0]?.address).toBe(LOOKALIKE_TOKEN);
    expect(result.calls[1]?.logs[0]?.topics[0]).toBe(WITHDRAWAL_TOPIC);
    expect(result.transfers).toContainEqual({
      token: WETH,
      from: client.account.address,
      to: zeroAddress,
      amount,
      txIdx: 0,
    });
    expect(
      result.transfers.every(({ token }) => token !== LOOKALIKE_TOKEN),
    ).toBe(true);
    expect(
      result.assetChanges.every(({ changes }) =>
        changes.every(({ token }) => token !== LOOKALIKE_TOKEN),
      ),
    ).toBe(true);
  });
});

describe.sequential("simulate — standalone-bundle retention", () => {
  const bundles = getChainAddresses(mainnet.id).bundles!;

  test.for([
    bundles.blueBundlesV1!,
    bundles.vaultBundlesV1!,
    bundles.vaultExitBundlesV1!,
  ])(
    "error: BlacklistViolationError for ERC-20 retention at %s",
    async (recipient, { client }) => {
      await client.deal({ erc20: WETH, amount: 101n });
      await expect(
        simulate(configFor(client), {
          chainId: mainnet.id,
          transactions: [
            {
              from: client.account.address,
              to: WETH,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [recipient, 101n],
              }),
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BlacklistViolationError);
    },
  );

  test("behavior: permits exactly the ERC-20 dust threshold", async ({
    client,
  }) => {
    await client.deal({ erc20: WETH, amount: 100n });
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: WETH,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [bundles.vaultBundlesV1!, 100n],
          }),
        },
      ],
    });
    expect(result.transfers).toContainEqual({
      token: WETH,
      from: client.account.address,
      to: bundles.vaultBundlesV1!,
      amount: 100n,
      txIdx: 0,
    });
  });

  test.for([100n, 101n])(
    "behavior: internal native retention threshold at %s raw units",
    async (amount, { client }) => {
      // A real CALL forwards the received value to the restricted address.
      // The fixture returns CALL's success flag, preserving evidence of execution.
      await client.setCode({
        address: LOOKALIKE_TOKEN,
        bytecode: concatHex([
          "0x5f5f5f5f3473",
          bundles.vaultBundlesV1!,
          "0x5af15f5260205ff3",
        ]),
      });
      const execution = simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: LOOKALIKE_TOKEN,
            data: "0x",
            value: amount,
          },
        ],
      });
      if (amount > 100n) {
        await expect(execution).rejects.toBeInstanceOf(BlacklistViolationError);
        return;
      }
      const result = await execution;
      expect(result.calls[0]?.returnData).toBe(padHex("0x1", { size: 32 }));
      expect(result.transfers).toContainEqual({
        token: ethAddress,
        from: LOOKALIKE_TOKEN,
        to: bundles.vaultBundlesV1!,
        amount,
        txIdx: 0,
      });
      expect(result.assetChanges).toContainEqual({
        account: bundles.vaultBundlesV1!,
        changes: [{ token: ethAddress, diff: amount }],
      });
      expect(
        result.assetChanges.find(({ account }) => account === LOOKALIKE_TOKEN),
      ).toBeUndefined();
    },
  );

  test("error: SimulationRevertedError for insufficient ERC-20 balance", async ({
    client,
  }) => {
    await client.deal({ erc20: WETH, amount: 0n });
    await expect(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: WETH,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "transfer",
              args: [LOOKALIKE_TOKEN, 1n],
            }),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(SimulationRevertedError);
  });
});

describe.sequential("simulate — real native funding", () => {
  test("error: SimulationRevertedError when the sender cannot fund value", async ({
    client,
  }) => {
    // No balance inflation: a `value` transfer must be funded by the real
    // balance. Before the cutover this case succeeded through an inflated
    // balance override.
    await client.setBalance({ address: client.account.address, value: 0n });
    await expect(
      simulate(configFor(client), {
        chainId: mainnet.id,
        transactions: [
          {
            from: client.account.address,
            to: RECIPIENT,
            data: "0x",
            value: parseEther("1"),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(SimulationRevertedError);
  });

  test("behavior: succeeds when the real balance funds the value", async ({
    client,
  }) => {
    const value = parseEther("1");
    await client.setBalance({
      address: client.account.address,
      value,
    });
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: RECIPIENT,
          data: "0x",
          value,
        },
      ],
    });
    expect(result.assetChanges).toContainEqual({
      account: client.account.address,
      changes: [{ token: ethAddress, diff: -value }],
    });
    expect(result.assetChanges).toContainEqual({
      account: RECIPIENT,
      changes: [{ token: ethAddress, diff: value }],
    });
  });
});

describe.sequential("simulate — sequential state and stable indices", () => {
  test("behavior: three transactions keep user indices 0..2 with no probe offset", async ({
    client,
  }) => {
    const amount = parseEther("0.1");
    const result = await simulate(configFor(client), {
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: WETH,
          data: encodeFunctionData({ abi: wethAbi, functionName: "deposit" }),
          value: amount,
        },
        {
          from: client.account.address,
          to: WETH,
          data: encodeFunctionData({
            abi: wethAbi,
            functionName: "withdraw",
            args: [amount],
          }),
        },
        {
          from: client.account.address,
          to: RECIPIENT,
          data: "0x",
          value: 1n,
        },
      ],
    });

    expect(result.calls).toHaveLength(3);
    expect(result.simulationTxs).toHaveLength(3);
    for (const transfer of result.transfers) {
      expect([0, 1, 2]).toContain(transfer.txIdx);
    }
    const deposit = result.transfers.find(
      (t) => t.token === WETH && t.to === client.account.address,
    );
    const withdraw = result.transfers.find(
      (t) => t.token === ethAddress && t.to === client.account.address,
    );
    const send = result.transfers.find(
      (t) => t.token === ethAddress && t.to === RECIPIENT,
    );
    expect(deposit?.txIdx).toBe(0);
    expect(withdraw?.txIdx).toBe(1);
    expect(send?.txIdx).toBe(2);
  });
});
