import { ChainId, getChainAddresses, MarketParams } from "@morpho-org/blue-sdk";
import { vaultV2BluePublicAllocatorAbi as canonicalVaultV2BluePublicAllocatorAbi } from "@morpho-org/blue-sdk-viem";
import { decodeFunctionData, erc20Abi } from "viem";
import { describe, expect, test } from "vitest";
import {
  bundler3Abi,
  generalAdapter1Abi,
  publicAllocatorAbi,
  vaultV2BluePublicAllocatorAbi,
} from "../../abis.js";
import {
  type BlueReallocation,
  InconsistentReallocationPenaltyError,
} from "../../types/index.js";
import { blueBorrow } from "./borrow.js";

const allocator = "0x0000000000000000000000000000000000000011";
const vaultV1 = "0x0000000000000000000000000000000000000012";
const sourceAdapter = "0x0000000000000000000000000000000000000013";
const targetAdapter = "0x0000000000000000000000000000000000000014";
const receiver = "0x0000000000000000000000000000000000000015";
const vaultV2 = "0x0000000000000000000000000000000000000016";

const targetMarket = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000021",
  collateralToken: "0x0000000000000000000000000000000000000022",
  oracle: "0x0000000000000000000000000000000000000023",
  irm: "0x0000000000000000000000000000000000000024",
  lltv: 860_000000000000000000n,
});

const sourceMarket = new MarketParams({
  loanToken: targetMarket.loanToken,
  collateralToken: "0x0000000000000000000000000000000000000032",
  oracle: "0x0000000000000000000000000000000000000033",
  irm: targetMarket.irm,
  lltv: targetMarket.lltv,
});

describe("blueBorrow Blue Public Allocator", () => {
  test("default", () => {
    const {
      bundler3: { bundler3 },
    } = getChainAddresses(ChainId.EthMainnet);
    const reallocations: readonly BlueReallocation[] = [
      {
        type: "publicAllocatorV1",
        vault: vaultV1,
        fee: 2n,
        withdrawals: [{ marketParams: sourceMarket, amount: 1n }],
      },
      {
        type: "bluePublicAllocator",
        allocator,
        vault: vaultV2,
        from: {
          type: "market",
          adapter: sourceAdapter,
          marketParams: sourceMarket,
        },
        to: { adapter: targetAdapter },
        assets: 3n,
        penalty: 5n,
      },
      {
        type: "bluePublicAllocator",
        allocator,
        vault: vaultV2,
        from: { type: "idle" },
        to: { adapter: targetAdapter },
        assets: 7n,
        penalty: 5n,
      },
    ];

    const tx = blueBorrow({
      market: { chainId: ChainId.EthMainnet, marketParams: targetMarket },
      args: {
        amount: 1n,
        minSharePrice: 0n,
        receiver,
        reallocations,
      },
    });

    expect(tx.value).toBe(2n);
    expect(tx.action.args.reallocationFee).toBe(2n);
    expect(tx.action.args.reallocationPenaltyAssets).toBe(2n);

    const bundle = decodeFunctionData({ abi: bundler3Abi, data: tx.data });
    const calls = bundle.args[0] ?? [];
    expect(calls).toHaveLength(7);
    expect(calls.map((call) => call.value)).toEqual([
      0n,
      2n,
      0n,
      0n,
      0n,
      0n,
      0n,
    ]);
    expect(calls.every((call) => call.skipRevert === false)).toBe(true);

    expect(
      decodeFunctionData({ abi: generalAdapter1Abi, data: calls[0]!.data }),
    ).toMatchObject({
      functionName: "erc20TransferFrom",
      args: [targetMarket.loanToken, bundler3, 2n],
    });

    const publicAllocatorCall = decodeFunctionData({
      abi: publicAllocatorAbi,
      data: calls[1]!.data,
    });
    expect(publicAllocatorCall.functionName).toBe("reallocateTo");
    expect(publicAllocatorCall.args[0]).toBe(vaultV1);
    expect(
      decodeFunctionData({
        abi: vaultV2BluePublicAllocatorAbi,
        data: calls[3]!.data,
      }).functionName,
    ).toBe("reallocate");
    expect(
      decodeFunctionData({ abi: erc20Abi, data: calls[2]!.data }),
    ).toMatchObject({ functionName: "approve", args: [allocator, 1n] });

    const idleCall = decodeFunctionData({
      abi: vaultV2BluePublicAllocatorAbi,
      data: calls[5]!.data,
    });
    expect(idleCall.functionName).toBe("allocateFromIdle");
    expect(idleCall.args[0]).toBe(vaultV2);
    expect(idleCall.args[1]).toBe(targetAdapter);
    expect(idleCall.args[2]).toMatchObject({
      loanToken: targetMarket.loanToken,
      collateralToken: targetMarket.collateralToken,
      oracle: targetMarket.oracle,
      irm: targetMarket.irm,
      lltv: targetMarket.lltv,
    });
    expect(idleCall.args[3]).toBe(7n);
    expect(idleCall.args[4]).toBe(5n);
    expect(
      decodeFunctionData({ abi: erc20Abi, data: calls[4]!.data }),
    ).toMatchObject({ functionName: "approve", args: [allocator, 1n] });
    expect(
      decodeFunctionData({ abi: generalAdapter1Abi, data: calls[6]!.data })
        .functionName,
    ).toBe("morphoBorrow");
  });

  test("error: InconsistentReallocationPenaltyError", () => {
    expect(() =>
      blueBorrow({
        market: { chainId: ChainId.EthMainnet, marketParams: targetMarket },
        args: {
          amount: 1n,
          minSharePrice: 0n,
          receiver,
          reallocations: [
            {
              type: "bluePublicAllocator",
              allocator,
              vault: vaultV2,
              from: {
                type: "market",
                adapter: sourceAdapter,
                marketParams: sourceMarket,
              },
              to: { adapter: targetAdapter },
              assets: 3n,
              penalty: 5n,
            },
            {
              type: "bluePublicAllocator",
              allocator,
              vault: vaultV2,
              from: { type: "idle" },
              to: { adapter: targetAdapter },
              assets: 7n,
              penalty: 11n,
            },
          ],
        },
      }),
    ).toThrow(InconsistentReallocationPenaltyError);
  });

  test("re-exports the canonical ABI", () => {
    expect(vaultV2BluePublicAllocatorAbi).toBe(
      canonicalVaultV2BluePublicAllocatorAbi,
    );
  });
});
