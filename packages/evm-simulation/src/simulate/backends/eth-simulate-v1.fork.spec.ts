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
  test("ERC20 transfer: sender's USDC diff equals the amount sent out", async ({
    client,
  }) => {
    // Sender holds 1000 USDC, transfers 100 → net diff must be -100 USDC.
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

    expect(result.assetChanges).toEqual([
      { token: USDC, diff: -parseUnits("100", 6) },
    ]);
  });

  test("native ETH transfer: sender's ETH diff equals the value sent out", async ({
    client,
  }) => {
    // Native ETH emits no transfer log; the fallback derives it from the
    // top-level `value` the sender sends out, reported under viem's `ethAddress`.
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
      { token: ethAddress, diff: -parseEther("1") },
    ]);
  });
});
