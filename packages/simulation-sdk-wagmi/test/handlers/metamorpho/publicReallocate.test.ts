import { ChainId, NATIVE_ADDRESS, addresses } from "@morpho-org/blue-sdk";
import { metaMorphoAbi, publicAllocatorAbi } from "@morpho-org/blue-sdk-viem";
import { markets, vaults } from "@morpho-org/morpho-test";
import { getLast } from "@morpho-org/morpho-ts";
import {
  type MinimalBlock,
  simulateOperations,
} from "@morpho-org/simulation-sdk";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { parseEther, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { useSimulationState } from "../../../src/index.js";
import { test } from "../../setup.js";

const { publicAllocator } = addresses[ChainId.EthMainnet];
const { usdc_wstEth, usdc_idle, usdc_wbtc, usdc_wbIB01 } =
  markets[ChainId.EthMainnet];
const { steakUsdc } = vaults[ChainId.EthMainnet];

describe("MetaMorpho_PublicReallocate", () => {
  test("should simulate public reallocation accurately", async ({
    config,
    client,
  }) => {
    const owner = await client.readContract({
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "owner",
    });

    await client.setBalance({ address: owner, value: parseEther("10000") });

    const fee = parseEther("0.005");
    const assets = parseUnits("1000", 6);

    await client.writeContract({
      account: owner,
      address: publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "setFee",
      args: [steakUsdc.address, fee],
    });
    await client.writeContract({
      account: owner,
      address: publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "setFlowCaps",
      args: [
        steakUsdc.address,
        [
          {
            id: usdc_wstEth.id,
            caps: {
              maxIn: 0n,
              maxOut: assets,
            },
          },
          {
            id: usdc_idle.id,
            caps: {
              maxIn: assets,
              maxOut: 0n,
            },
          },
        ],
      ],
    });

    const block = await client.getBlock();

    const { result, rerender } = await renderHook(
      config,
      (block: MinimalBlock) =>
        useSimulationState({
          marketIds: [
            usdc_wstEth.id,
            usdc_idle.id,
            usdc_wbtc.id,
            usdc_wbIB01.id,
          ],
          users: [client.account.address, steakUsdc.address],
          tokens: [NATIVE_ADDRESS, steakUsdc.asset, steakUsdc.address],
          vaults: [steakUsdc.address],
          block,
          accrueInterest: false,
        }),
      { initialProps: block },
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    const dataBefore = result.current.data!;

    dataBefore.block.number += 1n;
    dataBefore.block.timestamp += 1n;

    const steps = simulateOperations(
      [
        {
          type: "MetaMorpho_PublicReallocate",
          sender: client.account.address,
          address: steakUsdc.address,
          args: {
            withdrawals: [{ id: usdc_wstEth.id, assets }],
            supplyMarketId: usdc_idle.id,
          },
        },
      ],
      dataBefore,
    );

    expect(steps.length).toBe(2);

    await client.setNextBlockTimestamp({
      timestamp: dataBefore.block.timestamp,
    });
    await client.writeContract({
      address: publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "reallocateTo",
      args: [
        steakUsdc.address,
        [
          {
            marketParams: usdc_wstEth as Pick<
              typeof usdc_wstEth,
              "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
            >,
            amount: assets,
          },
        ],
        usdc_idle as Pick<
          typeof usdc_idle,
          "collateralToken" | "loanToken" | "oracle" | "irm" | "lltv"
        >,
      ],
      value: fee,
    });

    await rerender(await client.getBlock());
    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    // Hotfix: anvil's effective gas price is not zero for some reason.
    result.current.data!.holdings[client.account.address]![
      NATIVE_ADDRESS
    ]!.balance = expect.any(BigInt);

    expect(result.current.data).toStrictEqual(getLast(steps));
  });
});
