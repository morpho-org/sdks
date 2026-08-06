import { ChainId, MarketParams } from "@morpho-org/blue-sdk";
import { bluePublicAllocatorV2Abi as canonicalBluePublicAllocatorV2Abi } from "@morpho-org/blue-sdk-viem";
import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import {
  bluePublicAllocatorV2Abi,
  bundler3Abi,
  generalAdapter1Abi,
} from "../../abis.js";
import type { BlueReallocation } from "../../types/index.js";
import { blueBorrow } from "./borrow.js";

const allocator = "0x0000000000000000000000000000000000000011";
const vault = "0x0000000000000000000000000000000000000012";
const sourceAdapter = "0x0000000000000000000000000000000000000013";
const targetAdapter = "0x0000000000000000000000000000000000000014";
const receiver = "0x0000000000000000000000000000000000000015";

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

describe("blueBorrow Public Allocator V2", () => {
  test("default", () => {
    const reallocations: readonly BlueReallocation[] = [
      {
        type: "publicAllocatorV1",
        vault,
        fee: 2n,
        withdrawals: [{ marketParams: sourceMarket, amount: 1n }],
      },
      {
        type: "publicAllocatorV2",
        allocator,
        vault,
        from: {
          type: "market",
          adapter: sourceAdapter,
          marketParams: sourceMarket,
        },
        to: { adapter: targetAdapter },
        assets: 3n,
        nativePenalty: 5n,
      },
      {
        type: "publicAllocatorV2",
        allocator,
        vault,
        from: { type: "idle" },
        to: { adapter: targetAdapter },
        assets: 7n,
        nativePenalty: 11n,
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
    expect(idleCall.args[0]).toBe(vault);
    expect(idleCall.args[1]).toBe(targetAdapter);
    expect(idleCall.args[2]).toMatchObject({
      loanToken: targetMarket.loanToken,
      collateralToken: targetMarket.collateralToken,
      oracle: targetMarket.oracle,
      irm: targetMarket.irm,
      lltv: targetMarket.lltv,
    });
    expect(idleCall.args[3]).toBe(7n);
    expect(
      decodeFunctionData({ abi: generalAdapter1Abi, data: calls[3]!.data })
        .functionName,
    ).toBe("morphoBorrow");
  });

  test("re-exports the canonical ABI", () => {
    expect(bluePublicAllocatorV2Abi).toBe(canonicalBluePublicAllocatorV2Abi);
  });
});
