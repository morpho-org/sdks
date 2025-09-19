import { erc20Abi, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { getFunctionCallCount, testAccount } from "../src";
import { test } from "./setup";

describe("getFunctionCallCount", () => {
  test("should return call count", async ({ client }) => {
    const erc20 = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
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
      await getFunctionCallCount(client, {
        txHash,
        abi: erc20Abi,
        functionName: "transfer",
        contract: erc20,
      }),
    ).toStrictEqual(1);
    expect(
      await getFunctionCallCount(client, {
        txHash,
        abi: erc20Abi,
        functionName: "approve",
        contract: erc20,
      }),
    ).toStrictEqual(0);
  });
});
