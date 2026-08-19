import { getChainAddresses } from "@morpho-org/blue-sdk";
import { type Address, decodeFunctionData, erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  CbbtcUsdcBlue,
  WbtcUsdcSourceMarket,
} from "../../../test/fixtures/blue.js";
import {
  bundler3Abi,
  generalAdapter1Abi,
  vaultV2BluePublicAllocatorAbi,
} from "../../abis.js";
import type { VaultV2BlueReallocation } from "../../types/index.js";
import { blueWithdraw } from "./withdraw.js";

const allocator = getChainAddresses(mainnet.id).vaultV2BluePublicAllocator!;
const vault: Address = "0x0000000000000000000000000000000000000012";
const sourceAdapter: Address = "0x0000000000000000000000000000000000000013";
const targetAdapter: Address = "0x0000000000000000000000000000000000000014";
const receiver: Address = "0x0000000000000000000000000000000000000015";

describe("blueWithdraw Blue Public Allocator", () => {
  test("market and idle reallocations fund penalties before morphoWithdraw", () => {
    const {
      bundler3: { bundler3 },
    } = getChainAddresses(mainnet.id);
    const reallocations: readonly VaultV2BlueReallocation[] = [
      {
        vault,
        from: {
          type: "market",
          adapter: sourceAdapter,
          marketParams: WbtcUsdcSourceMarket,
        },
        to: { adapter: targetAdapter },
        assets: 10n,
        penalty: 500_000_000_000_000_000n,
      },
      {
        vault,
        from: { type: "idle" },
        to: { adapter: targetAdapter },
        assets: 6n,
        penalty: 500_000_000_000_000_000n,
      },
    ];

    const tx = blueWithdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcBlue },
      args: {
        assets: 100n,
        shares: 0n,
        receiver,
        minSharePrice: 0n,
        reallocations,
      },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.value).toBe(0n);
    expect(tx.action.args.reallocationFee).toBe(0n);
    expect(tx.action.args.reallocationPenaltyAssets).toBe(8n);
    expect(tx.data).toContain("a1b2c3d4");

    const bundle = decodeFunctionData({ abi: bundler3Abi, data: tx.data });
    const calls = bundle.args[0] ?? [];
    expect(calls).toHaveLength(6);
    expect(
      decodeFunctionData({ abi: generalAdapter1Abi, data: calls[0]!.data }),
    ).toMatchObject({
      functionName: "erc20TransferFrom",
      args: [CbbtcUsdcBlue.loanToken, bundler3, 8n],
    });
    expect(
      decodeFunctionData({ abi: erc20Abi, data: calls[1]!.data }),
    ).toMatchObject({
      functionName: "approve",
      args: [allocator, 5n],
    });
    expect(
      decodeFunctionData({
        abi: vaultV2BluePublicAllocatorAbi,
        data: calls[2]!.data,
      }).functionName,
    ).toBe("reallocate");
    expect(
      decodeFunctionData({ abi: erc20Abi, data: calls[3]!.data }),
    ).toMatchObject({
      functionName: "approve",
      args: [allocator, 3n],
    });
    expect(
      decodeFunctionData({
        abi: vaultV2BluePublicAllocatorAbi,
        data: calls[4]!.data,
      }).functionName,
    ).toBe("allocateFromIdle");
    expect(
      decodeFunctionData({
        abi: generalAdapter1Abi,
        data: calls[5]!.data,
      }).functionName,
    ).toBe("morphoWithdraw");
  });
});
