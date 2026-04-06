import { ChainId, type InputMarketParams } from "@gfxlabs/blue-sdk";
import { metaMorphoAbi } from "@gfxlabs/blue-sdk-viem";
import { invalidateAllBlueSdkQueries } from "@gfxlabs/blue-sdk-wagmi";
import { markets, vaults } from "@gfxlabs/morpho-test";
import { getLast } from "@gfxlabs/morpho-ts";
import { type MinimalBlock, simulateOperations } from "@gfxlabs/simulation-sdk";
import { renderHook, waitFor } from "@gfxlabs/test-wagmi";
import { QueryClient } from "@tanstack/react-query";
import { maxUint256, parseEther, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { useSimulationState } from "../../../src/index.js";
import { test } from "../../setup.js";

const { usdc_wstEth, usdc_idle, usdc_wbtc, usdc_wbIB01 } =
  markets[ChainId.EthMainnet];
const { steakUsdc } = vaults[ChainId.EthMainnet];

describe("MetaMorpho_Reallocate", () => {
  test("should simulate reallocation accurately", async ({
    config,
    client,
  }) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      },
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
          tokens: [steakUsdc.asset, steakUsdc.address],
          vaults: [steakUsdc.address],
          vaultV2Adapters: [],
          vaultV2s: [],
          block,
          accrueInterest: false,
        }),
      { initialProps: block, queryClient },
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    const dataBefore = result.current.data!;

    dataBefore.block.number += 1n;
    dataBefore.block.timestamp += 1n;

    const owner = await client.readContract({
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "owner",
    });

    await client.setBalance({ address: owner, value: parseEther("10000") });

    const assets =
      dataBefore.getAccrualPosition(steakUsdc.address, usdc_wstEth.id)
        .supplyAssets - parseUnits("1000", 6);

    const steps = simulateOperations(
      [
        {
          type: "MetaMorpho_Reallocate",
          sender: owner,
          address: steakUsdc.address,
          args: [
            {
              id: usdc_wstEth.id,
              assets,
            },
            { id: usdc_idle.id, assets: maxUint256 },
          ],
        },
      ],
      dataBefore,
    );

    expect(steps.length).toBe(2);

    await client.setNextBlockTimestamp({
      timestamp: dataBefore.block.timestamp,
    });
    await client.writeContract({
      account: owner,
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [
        [
          {
            marketParams: usdc_wstEth as InputMarketParams,
            assets,
          },
          { marketParams: usdc_idle, assets: maxUint256 },
        ],
      ],
    });

    await rerender(await client.getBlock());
    invalidateAllBlueSdkQueries(queryClient);
    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(result.current.data).toStrictEqual(getLast(steps));
  });
});
