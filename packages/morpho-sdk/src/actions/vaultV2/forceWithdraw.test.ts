import { MarketParams } from "@morpho-org/blue-sdk";
import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { type Address, decodeFunctionData, isHex, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { test } from "../../../test/setup.js";
import {
  EmptyDeallocationsError,
  NonPositiveAssetAmountError,
} from "../../types/index.js";
import { vaultV2ForceWithdraw } from "./forceWithdraw.js";

describe("forceWithdrawVaultV2 unit tests", () => {
  const mockVaultAddress: Address =
    "0x0000000000000000000000000000000000000001";
  const mockAdapterAddress: Address =
    "0x0000000000000000000000000000000000000002";
  const mockAdapterAddress2: Address =
    "0x0000000000000000000000000000000000000003";

  const mockMarketParams = new MarketParams({
    loanToken: "0x000000000000000000000000000000000000000A",
    collateralToken: "0x000000000000000000000000000000000000000b",
    oracle: "0x000000000000000000000000000000000000000C",
    irm: "0x000000000000000000000000000000000000000d",
    lltv: parseUnits("0.8", 18),
  });

  test("should create force withdraw tx with a single deallocation (with marketParams)", ({
    client,
  }) => {
    const assets = parseUnits("100", 18);

    const tx = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [
          {
            adapter: mockAdapterAddress,
            marketParams: mockMarketParams,
            amount: assets,
          },
        ],
        withdraw: { amount: assets, recipient: client.account.address },
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV2ForceWithdraw");
    expect(tx.action.args.vault).toBe(mockVaultAddress);
    expect(tx.action.args.deallocations).toHaveLength(1);
    expect(tx.action.args.deallocations[0]?.adapter).toBe(mockAdapterAddress);
    expect(tx.action.args.deallocations[0]?.amount).toBe(assets);
    expect(tx.action.args.withdraw.amount).toBe(assets);
    expect(tx.action.args.withdraw.recipient).toBe(client.account.address);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
    expect(tx.to).toBe(mockVaultAddress);
    expect(isHex(tx.data)).toBe(true);
    expect(tx.value).toBe(0n);
  });

  test("should create force withdraw tx with a single deallocation (without marketParams)", ({
    client,
  }) => {
    const assets = parseUnits("50", 6);

    const tx = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [{ adapter: mockAdapterAddress, amount: assets }],
        withdraw: { amount: assets, recipient: client.account.address },
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV2ForceWithdraw");
    expect(tx.action.args.deallocations).toHaveLength(1);
    expect(tx.action.args.deallocations[0]?.marketParams).toBeUndefined();
    expect(tx.action.args.withdraw.amount).toBe(assets);
    expect(tx.to).toBe(mockVaultAddress);
    expect(isHex(tx.data)).toBe(true);
    expect(tx.value).toBe(0n);
  });

  test("should create force withdraw tx with multiple deallocations", ({
    client,
  }) => {
    const assets1 = parseUnits("60", 18);
    const assets2 = parseUnits("40", 18);
    const withdrawAssets = parseUnits("100", 18);

    const tx = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [
          {
            adapter: mockAdapterAddress,
            marketParams: mockMarketParams,
            amount: assets1,
          },
          { adapter: mockAdapterAddress2, amount: assets2 },
        ],
        withdraw: { amount: withdrawAssets, recipient: client.account.address },
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("vaultV2ForceWithdraw");
    expect(tx.action.args.deallocations).toHaveLength(2);
    expect(tx.action.args.deallocations[0]?.adapter).toBe(mockAdapterAddress);
    expect(tx.action.args.deallocations[0]?.amount).toBe(assets1);
    expect(tx.action.args.deallocations[1]?.adapter).toBe(mockAdapterAddress2);
    expect(tx.action.args.deallocations[1]?.amount).toBe(assets2);
    expect(tx.action.args.withdraw.amount).toBe(withdrawAssets);
    expect(tx.to).toBe(mockVaultAddress);
    expect(isHex(tx.data)).toBe(true);
    expect(tx.value).toBe(0n);
  });

  test("should allow deallocated assets less than total withdraw assets", ({
    client,
  }) => {
    const deallocatedAssets = parseUnits("50", 18);
    const withdrawAssets = parseUnits("100", 18);

    const tx = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [
          {
            adapter: mockAdapterAddress,
            marketParams: mockMarketParams,
            amount: deallocatedAssets,
          },
        ],
        withdraw: { amount: withdrawAssets, recipient: client.account.address },
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.args.withdraw.amount).toBe(withdrawAssets);
  });

  test("should append metadata when provided", ({ client }) => {
    const assets = parseUnits("100", 18);

    const txWithout = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [
          {
            adapter: mockAdapterAddress,
            marketParams: mockMarketParams,
            amount: assets,
          },
        ],
        withdraw: { amount: assets, recipient: client.account.address },
        onBehalf: client.account.address,
      },
    });

    const txWith = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [
          {
            adapter: mockAdapterAddress,
            marketParams: mockMarketParams,
            amount: assets,
          },
        ],
        withdraw: { amount: assets, recipient: client.account.address },
        onBehalf: client.account.address,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.length).toBeGreaterThan(txWithout.data.length);
    expect(txWith.data).toContain("a1b2c3d4");
  });

  test("should throw EmptyDeallocationsError when deallocations is empty", ({
    client,
  }) => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { address: mockVaultAddress },
        args: {
          deallocations: [],
          withdraw: {
            amount: parseUnits("100", 18),
            recipient: client.account.address,
          },
          onBehalf: client.account.address,
        },
      }),
    ).toThrow(EmptyDeallocationsError);
  });

  test("should throw NonPositiveAssetAmountError when withdraw assets is zero", ({
    client,
  }) => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { address: mockVaultAddress },
        args: {
          deallocations: [
            { adapter: mockAdapterAddress, amount: parseUnits("100", 18) },
          ],
          withdraw: { amount: 0n, recipient: client.account.address },
          onBehalf: client.account.address,
        },
      }),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("should throw NonPositiveAssetAmountError when withdraw assets is negative", ({
    client,
  }) => {
    expect(() =>
      vaultV2ForceWithdraw({
        vault: { address: mockVaultAddress },
        args: {
          deallocations: [
            { adapter: mockAdapterAddress, amount: parseUnits("100", 18) },
          ],
          withdraw: { amount: -1n, recipient: client.account.address },
          onBehalf: client.account.address,
        },
      }),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("behavior: snapshots withdraw.amount and recipient against getter mutation", ({
    client,
  }) => {
    const validatedAmount = parseUnits("100", 18);
    const validatedRecipient: Address =
      "0x000000000000000000000000000000000000dEaD";
    const hijackedAmount = parseUnits("1000", 18);
    const hijackedRecipient: Address =
      "0x000000000000000000000000000000000000bEEF";

    let amountReads = 0;
    let recipientReads = 0;
    const mutableWithdraw = {
      get amount() {
        amountReads += 1;
        return amountReads === 1 ? validatedAmount : hijackedAmount;
      },
      get recipient(): Address {
        recipientReads += 1;
        return recipientReads === 1 ? validatedRecipient : hijackedRecipient;
      },
    };

    const tx = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [
          { adapter: mockAdapterAddress, amount: validatedAmount },
        ],
        withdraw: mutableWithdraw,
        onBehalf: client.account.address,
      },
    });

    const { args: multicallArgs } = decodeFunctionData({
      abi: vaultV2Abi,
      data: tx.data,
    });
    const innerCalls = multicallArgs?.[0] as readonly `0x${string}`[];
    const withdrawCall = innerCalls[innerCalls.length - 1]!;
    const decodedWithdraw = decodeFunctionData({
      abi: vaultV2Abi,
      data: withdrawCall,
    });

    expect(decodedWithdraw.functionName).toBe("withdraw");
    expect(decodedWithdraw.args?.[0]).toBe(validatedAmount);
    expect(decodedWithdraw.args?.[1]).toBe(validatedRecipient);
    expect(tx.action.args.withdraw.amount).toBe(validatedAmount);
    expect(tx.action.args.withdraw.recipient).toBe(validatedRecipient);
  });

  test("should allow deallocated assets greater than withdraw assets", ({
    client,
  }) => {
    const deallocatedAssets = parseUnits("100", 18);
    const withdrawAssets = parseUnits("50", 18);

    const tx = vaultV2ForceWithdraw({
      vault: { address: mockVaultAddress },
      args: {
        deallocations: [
          { adapter: mockAdapterAddress, amount: deallocatedAssets },
        ],
        withdraw: {
          amount: withdrawAssets,
          recipient: client.account.address,
        },
        onBehalf: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.args.withdraw.amount).toBe(withdrawAssets);
    expect(tx.action.args.deallocations[0]?.amount).toBe(deallocatedAssets);
  });
});
