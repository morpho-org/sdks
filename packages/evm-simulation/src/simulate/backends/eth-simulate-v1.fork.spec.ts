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
const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";

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
    // Native ETH emits no log; the fallback derives both sides from the
    // top-level `value`, reported under viem's `ethAddress` sentinel.
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
});
