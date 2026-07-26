import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  parseEther,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import { test } from "../../../test/setup.js";
import { simulateV1 } from "./eth-simulate-v1.js";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

// Minimal WETH9 fragment — just the `withdraw` entrypoint we exercise.
const wethAbi = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

describe.sequential("simulateV1 — assetChanges on a mainnet fork", () => {
  test("ERC20 transfer: sender debited and recipient credited the amount", async ({
    client,
  }) => {
    // Sender holds 1000 USDC, transfers 100 → sender -100, recipient +100.
    await client.deal({ erc20: USDC, amount: parseUnits("1000", 6) });

    const result = await simulateV1({
      rpcUrl: client.transport.url!,
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [RECIPIENT, parseUnits("100", 6)],
          }),
        },
      ],
    });

    // Sorted by account: RECIPIENT (0x000…dead) before the sender (0xf39f…).
    expect(result.assetChanges).toEqual([
      {
        account: RECIPIENT,
        changes: [{ token: USDC, diff: parseUnits("100", 6) }],
      },
      {
        account: client.account.address,
        changes: [{ token: USDC, diff: -parseUnits("100", 6) }],
      },
    ]);
  });

  test("native ETH transfer: sender debited and recipient credited the value", async ({
    client,
  }) => {
    // With traceTransfers, the top-level value transfer is synthesized as a
    // Transfer log from the eth sentinel and reported under viem's `ethAddress`.
    const result = await simulateV1({
      rpcUrl: client.transport.url!,
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: RECIPIENT,
          data: "0x",
          value: parseEther("1"),
        },
      ],
    });

    expect(result.assetChanges).toEqual([
      {
        account: RECIPIENT,
        changes: [{ token: ethAddress, diff: parseEther("1") }],
      },
      {
        account: client.account.address,
        changes: [{ token: ethAddress, diff: -parseEther("1") }],
      },
    ]);
  });

  test("WETH unwrap: internal native-ETH refund is captured via traceTransfers", async ({
    client,
  }) => {
    // WETH.withdraw burns WETH and refunds native ETH through an internal call,
    // which emits no top-level `value`. Before traceTransfers this refund was
    // invisible to the eth_simulateV1 path; now it nets out: sender -WETH, +ETH.
    await client.deal({ erc20: WETH, amount: parseEther("1") });

    const result = await simulateV1({
      rpcUrl: client.transport.url!,
      chainId: mainnet.id,
      transactions: [
        {
          from: client.account.address,
          to: WETH,
          data: encodeFunctionData({
            abi: wethAbi,
            functionName: "withdraw",
            args: [parseEther("1")],
          }),
        },
      ],
    });

    // The sender nets -1 WETH and +1 ETH. (The burn sink and the WETH contract
    // also appear in the bookkeeping; the sender's entry is the claim here.)
    const senderChanges = result.assetChanges.find(
      (c) => c.account === client.account.address,
    );
    expect(senderChanges).toBeDefined();
    expect(senderChanges!.changes).toContainEqual({
      token: ethAddress,
      diff: parseEther("1"),
    });
    expect(senderChanges!.changes).toContainEqual({
      token: WETH,
      diff: -parseEther("1"),
    });
  });
});
