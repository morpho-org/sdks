import { erc20Abi, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { testAccount } from "../src/index.js";
import { test } from "./setup.js";

describe("getFunctionCalls", () => {
  test("should return call count", async ({ client }) => {
    const erc20 = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const amount = parseUnits("100", 6);
    const to = testAccount(1);

    await client.deal({ erc20, amount });

    const txHash = await client.writeContract({
      address: erc20,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to.address, amount],
    });

    expect(
      await client.getFunctionCalls({
        txHash,
        abi: erc20Abi,
        functionName: "transfer",
        contract: erc20,
      }),
    ).toEqual([
      {
        functionName: "transfer",
        args: [to.address, amount],
      },
    ]);
    expect(
      await client.getFunctionCalls({
        txHash,
        abi: erc20Abi,
        functionName: "approve",
        contract: erc20,
      }),
    ).toEqual([]);
  });
});
