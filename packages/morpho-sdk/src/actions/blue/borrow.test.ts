import { getChainAddresses } from "@morpho-org/blue-sdk";
import { decodeFunctionData, maxUint128, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  WbtcUsdcSourceMarket,
  WethUsdsBlue,
} from "../../../test/fixtures/blue.js";
import { SteakhouseUsdcVaultV1 } from "../../../test/fixtures/vaultV1.js";

import { test } from "../../../test/setup.js";
import {
  bluePublicAllocatorV2Abi,
  bundler3Abi,
  generalAdapter1Abi,
} from "../../abis.js";
import {
  type BlueReallocation,
  InputExceedsMaxError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationWithdrawalOnTargetMarketError,
  type VaultReallocation,
} from "../../types/index.js";
import { blueBorrow } from "./borrow.js";

describe("blueBorrow unit tests", () => {
  const {
    bundler3: { bundler3 },
  } = getChainAddresses(mainnet.id);
  test("should create direct borrow transaction", async ({ client }) => {
    const amount = parseUnits("1000", 6);

    const tx = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        minSharePrice: 0n,
        receiver: client.account.address,
      },
    });

    expect(tx).toBeDefined();
    expect(tx.action.type).toBe("blueBorrow");
    expect(tx.action.args.market).toBe(WethUsdsBlue.id);
    expect(tx.action.args.amount).toBe(amount);
    expect(tx.action.args.receiver).toBe(client.account.address);
    expect(tx.to).toBe(bundler3);
    expect(tx.data).toBeDefined();
    expect(tx.value).toBe(0n);
  });

  test("should include reallocation fees in transaction value", async ({
    client,
  }) => {
    const amount = parseUnits("1000", 6);
    const reallocationFee = parseUnits("0.01", 18);
    const reallocations: readonly VaultReallocation[] = [
      {
        vault: SteakhouseUsdcVaultV1.address,
        fee: reallocationFee,
        withdrawals: [
          {
            marketParams: WbtcUsdcSourceMarket,
            amount: parseUnits("2000", 6),
          },
        ],
      },
    ];

    const tx = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        minSharePrice: 0n,
        receiver: client.account.address,
        reallocations,
      },
    });

    expect(tx.value).toBe(reallocationFee);
    expect(tx.action.args.reallocationFee).toBe(reallocationFee);
  });

  test("orders mixed V1 and V2 reallocations before borrow and sums all native costs", async ({
    client,
  }) => {
    const allocator = "0x0000000000000000000000000000000000000011";
    const sourceAdapter = "0x0000000000000000000000000000000000000012";
    const targetAdapter = "0x0000000000000000000000000000000000000013";
    const reallocations: readonly BlueReallocation[] = [
      {
        vault: SteakhouseUsdcVaultV1.address,
        fee: 2n,
        withdrawals: [{ marketParams: WbtcUsdcSourceMarket, amount: 1n }],
      },
      {
        type: "publicAllocatorV2",
        allocator,
        vault: SteakhouseUsdcVaultV1.address,
        from: {
          type: "market",
          adapter: sourceAdapter,
          marketParams: WbtcUsdcSourceMarket,
        },
        to: { adapter: targetAdapter },
        assets: 3n,
        nativePenalty: 5n,
      },
      {
        type: "publicAllocatorV2",
        allocator,
        vault: SteakhouseUsdcVaultV1.address,
        from: { type: "idle" },
        to: { adapter: targetAdapter },
        assets: 7n,
        nativePenalty: 11n,
      },
    ];

    const tx = blueBorrow({
      market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
      args: {
        amount: 1n,
        minSharePrice: 0n,
        receiver: client.account.address,
        reallocations,
      },
    });

    expect(tx.value).toBe(18n);
    expect(tx.action.args.reallocationFee).toBe(18n);
    const bundle = decodeFunctionData({ abi: bundler3Abi, data: tx.data });
    const calls = bundle.args[0] ?? [];
    expect(calls).toHaveLength(4);
    expect(calls.slice(0, 3).map((call) => call.value)).toEqual([2n, 5n, 11n]);
    expect(calls.slice(0, 3).map((call) => call.skipRevert)).toEqual([
      false,
      false,
      false,
    ]);
    expect(
      decodeFunctionData({
        abi: bluePublicAllocatorV2Abi,
        data: calls[1]!.data,
      }).functionName,
    ).toBe("reallocate");
    const idleCall = decodeFunctionData({
      abi: bluePublicAllocatorV2Abi,
      data: calls[2]!.data,
    });
    expect(idleCall.functionName).toBe("allocateFromIdle");
    expect(idleCall.args[0]).toBe(SteakhouseUsdcVaultV1.address);
    expect(idleCall.args[1]).toBe(targetAdapter);
    expect(idleCall.args[2]).toMatchObject({
      loanToken: WethUsdsBlue.loanToken,
      collateralToken: WethUsdsBlue.collateralToken,
      oracle: WethUsdsBlue.oracle,
      irm: WethUsdsBlue.irm,
      lltv: WethUsdsBlue.lltv,
    });
    expect(idleCall.args[3]).toBe(7n);
    expect(
      decodeFunctionData({ abi: generalAdapter1Abi, data: calls[3]!.data })
        .functionName,
    ).toBe("morphoBorrow");
  });

  test.each([
    {
      name: "negative penalty",
      values: { assets: 1n, nativePenalty: -1n },
      ErrorClass: NegativeInputError,
    },
    {
      name: "zero assets",
      values: { assets: 0n, nativePenalty: 0n },
      ErrorClass: NonPositiveInputError,
    },
    {
      name: "uint128 overflow",
      values: { assets: maxUint128 + 1n, nativePenalty: 0n },
      ErrorClass: InputExceedsMaxError,
    },
  ])("rejects Public Allocator V2 $name", ({ values, ErrorClass }) => {
    expect(() =>
      blueBorrow({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: 1n,
          minSharePrice: 0n,
          receiver: "0x0000000000000000000000000000000000000001",
          reallocations: [
            {
              type: "publicAllocatorV2",
              allocator: "0x0000000000000000000000000000000000000011",
              vault: SteakhouseUsdcVaultV1.address,
              from: { type: "idle" },
              to: {
                adapter: "0x0000000000000000000000000000000000000012",
              },
              ...values,
            },
          ],
        },
      }),
    ).toThrow(ErrorClass);
  });

  test("rejects a Public Allocator V2 source equal to the target market", () => {
    expect(() =>
      blueBorrow({
        market: { chainId: mainnet.id, marketParams: WethUsdsBlue },
        args: {
          amount: 1n,
          minSharePrice: 0n,
          receiver: "0x0000000000000000000000000000000000000001",
          reallocations: [
            {
              type: "publicAllocatorV2",
              allocator: "0x0000000000000000000000000000000000000011",
              vault: SteakhouseUsdcVaultV1.address,
              from: {
                type: "market",
                adapter: "0x0000000000000000000000000000000000000012",
                marketParams: WethUsdsBlue,
              },
              to: {
                adapter: "0x0000000000000000000000000000000000000013",
              },
              assets: 1n,
              nativePenalty: 0n,
            },
          ],
        },
      }),
    ).toThrow(ReallocationWithdrawalOnTargetMarketError);
  });

  test("should throw NonPositiveInputError when amount is zero", async ({
    client,
  }) => {
    expect(() =>
      blueBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: 0n,
          minSharePrice: 0n,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("should throw NonPositiveInputError when amount is negative", async ({
    client,
  }) => {
    expect(() =>
      blueBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: -1n,
          minSharePrice: 0n,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("should throw NegativeInputError when minSharePrice is negative", async ({
    client,
  }) => {
    expect(() =>
      blueBorrow({
        market: {
          chainId: mainnet.id,
          marketParams: WethUsdsBlue,
        },
        args: {
          amount: parseUnits("100", 6),
          minSharePrice: -1n,
          receiver: client.account.address,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("should return a deep-frozen transaction object", async ({ client }) => {
    const tx = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount: parseUnits("100", 6),
        minSharePrice: 0n,
        receiver: client.account.address,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });

  test("should append metadata to transaction data when provided", async ({
    client,
  }) => {
    const amount = parseUnits("100", 6);

    const txWith = blueBorrow({
      market: {
        chainId: mainnet.id,
        marketParams: WethUsdsBlue,
      },
      args: {
        amount,
        receiver: client.account.address,
        minSharePrice: 0n,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(txWith.data.includes("a1b2c3d4")).toBe(true);
    expect(txWith.action.type).toBe("blueBorrow");
  });
});
