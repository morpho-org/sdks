import {
  ChainId,
  type InputMarketParams,
  addressesRegistry,
} from "@gfxlabs/blue-sdk";
import { invalidateAllBlueSdkQueries } from "@gfxlabs/blue-sdk-wagmi";
import { QueryClient } from "@tanstack/react-query";

import { blueAbi } from "@gfxlabs/blue-sdk-viem";
import { markets } from "@gfxlabs/morpho-test";
import { getLast } from "@gfxlabs/morpho-ts";
import { type MinimalBlock, simulateOperations } from "@gfxlabs/simulation-sdk";
import { renderHook, waitFor } from "@gfxlabs/test-wagmi";
import { describe, expect } from "vitest";
import { useSimulationState } from "../../../src/index.js";
import { test } from "../../setup.js";

const { morpho } = addressesRegistry[ChainId.EthMainnet];
const { usdc_wstEth } = markets[ChainId.EthMainnet];

describe("Blue_AccrueInterest", () => {
  test("should accrue interest accurately", async ({ config, client }) => {
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
          marketIds: [usdc_wstEth.id],
          users: [],
          tokens: [],
          vaults: [],
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

    const steps = simulateOperations(
      [
        {
          type: "Blue_AccrueInterest",
          sender: client.account.address,
          args: {
            id: usdc_wstEth.id,
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
      address: morpho,
      abi: blueAbi,
      functionName: "accrueInterest",
      args: [usdc_wstEth as InputMarketParams],
    });

    await rerender(await client.getBlock());
    invalidateAllBlueSdkQueries(queryClient);
    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(result.current.data).toStrictEqual(getLast(steps));
  });
});
