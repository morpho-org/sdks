import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { describe, expect } from "vitest";

import { ChainId } from "@morpho-org/blue-sdk";
import { metaMorphoAbi } from "@morpho-org/blue-sdk-viem";
import { markets, vaults } from "@morpho-org/morpho-test";
import { getLast } from "@morpho-org/morpho-ts";
import {
  type MinimalBlock,
  simulateOperations,
} from "@morpho-org/simulation-sdk";
import { parseUnits } from "viem";
import { useSimulationState } from "../../../src/index.js";
import { test } from "../../setup.js";

const { usdc_wstEth, usdc_idle, usdc_wbtc, usdc_wbIB01 } =
  markets[ChainId.EthMainnet];
const { steakUsdc } = vaults[ChainId.EthMainnet];

describe("MetaMorpho_AccrueInterest", () => {
  test("should accrue interest accurately upon deposit", async ({
    config,
    client,
  }) => {
    const assets = parseUnits("100", 6);

    await client.deal({
      erc20: steakUsdc.asset,
      amount: assets,
    });

    await client.approve({
      address: steakUsdc.asset,
      args: [steakUsdc.address, assets],
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
      { initialProps: block },
    );

    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    const dataBefore = result.current.data!;

    dataBefore.block.number += 1n;
    dataBefore.block.timestamp += 1n;

    const steps = simulateOperations(
      [
        {
          type: "MetaMorpho_Deposit",
          sender: client.account.address,
          address: steakUsdc.address,
          args: {
            assets,
            owner: client.account.address,
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
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "deposit",
      args: [assets, client.account.address],
    });

    await rerender(await client.getBlock());
    await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

    expect(result.current.data).toStrictEqual(getLast(steps));
  });
});
