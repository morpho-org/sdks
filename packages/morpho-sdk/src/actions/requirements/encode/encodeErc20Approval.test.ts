import { addressesRegistry } from "@morpho-org/blue-sdk";
import { decodeFunctionData, erc20Abi, isHex } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { encodeErc20Approval } from "./encodeErc20Approval.js";

describe("encodeErc20Approval", () => {
  const {
    usdc,
    bundler3: { generalAdapter1 },
  } = addressesRegistry[mainnet.id];

  const mockAmount = 1000000n;

  test("should set correct transaction properties", () => {
    const transaction = encodeErc20Approval({
      token: usdc,
      spender: generalAdapter1,
      amount: mockAmount,
      chainId: mainnet.id,
    });

    expect(transaction.to).toEqual(usdc);
    expect(transaction.value).toEqual(0n);
    expect(isHex(transaction.data)).toBe(true);
  });

  test("should encode approve function call correctly", () => {
    const transaction = encodeErc20Approval({
      token: usdc,
      spender: generalAdapter1,
      amount: mockAmount,
      chainId: mainnet.id,
    });

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    });

    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toHaveLength(2);
    expect(decoded.args[0]).toEqual(generalAdapter1);
    expect(decoded.args[1]).toEqual(mockAmount);
  });

  test("should work with zero amount", () => {
    const transaction = encodeErc20Approval({
      token: usdc,
      spender: generalAdapter1,
      amount: 0n,
      chainId: mainnet.id,
    });

    expect(transaction.action.args.amount).toEqual(0n);

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    });
    expect(decoded.args[1]).toEqual(0n);
  });
});
