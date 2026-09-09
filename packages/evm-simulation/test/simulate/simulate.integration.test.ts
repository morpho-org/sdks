import { getChainAddresses } from "@morpho-org/blue-sdk";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  padHex,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { simulate } from "../../src/index.js";
import { WITHDRAWAL_TOPIC } from "../../src/simulate/parsing/transfers.js";
import { test } from "../setup.js";

const LOOKALIKE_TOKEN: Address = "0x1000000000000000000000000000000000000001";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const wethAbi = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

describe.sequential("simulate — registered wrapped-native events", () => {
  test("behavior: parses WETH9 events only from the registered contract", async ({
    client,
  }) => {
    const amount = parseEther("1");
    const bundler = getChainAddresses(mainnet.id).bundler3.bundler3;
    await client.deal({ erc20: WETH, amount });

    // Runtime bytecode that emits Withdrawal(bundler, amount) without moving
    // value. The log is produced by a real EVM execution through eth_simulateV1.
    await client.setCode({
      address: LOOKALIKE_TOKEN,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(amount), { size: 32 }),
        "0x5f52",
        "0x73",
        bundler,
        "0x7f",
        WITHDRAWAL_TOPIC,
        "0x60205fa200",
      ]),
    });

    const result = await simulate(
      {
        chains: new Map([
          [mainnet.id, { simulateV1Url: client.transport.url! }],
        ]),
      },
      {
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
      },
    );

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
