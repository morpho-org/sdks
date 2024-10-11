import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketConfig,
  addresses,
} from "@morpho-org/blue-sdk";

import { blueAbi, fetchPosition } from "@morpho-org/blue-sdk-viem";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { parseEther, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { setupBundle } from "./helpers.js";
import { test } from "./setup.js";

const { morpho, bundler, adaptiveCurveIrm, wNative, usdc, verUsdc } =
  addresses[ChainId.BaseMainnet];

describe("populateBundle", () => {
  describe("without signatures", () => {
    test[ChainId.BaseMainnet](
      "should wrap then supply aUSDC",
      async ({ client, config }) => {
        const marketConfig = new MarketConfig({
          collateralToken: wNative,
          loanToken: verUsdc,
          oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
          irm: adaptiveCurveIrm,
          lltv: parseEther("0.86"),
        });

        await client.writeContract({
          address: morpho,
          abi: blueAbi,
          functionName: "createMarket",
          args: [marketConfig],
        });

        const whitelisted = "0x53753098E2660AbD4834A3eD713D11AC1123421A";

        const assets = parseUnits("500", 6);
        await client.deal({
          erc20: usdc,
          recipient: whitelisted,
          amount: assets,
        });

        const block = await client.getBlock();

        const { result } = await renderHook(config, () =>
          useSimulationState({
            marketIds: [marketConfig.id],
            users: [whitelisted, bundler],
            tokens: [usdc, verUsdc, wNative],
            vaults: [],
            block,
          }),
        );

        await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

        const { operations } = await setupBundle(
          client,
          result.current.data!,
          [
            {
              type: "Erc20_Wrap",
              sender: whitelisted,
              address: verUsdc,
              args: {
                amount: assets,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_Supply",
              sender: whitelisted,
              address: morpho,
              args: {
                id: marketConfig.id,
                assets,
                onBehalf: whitelisted,
              },
            },
          ],
          { account: whitelisted, supportsSignature: false },
        );

        expect(operations).to.eql([
          {
            type: "Erc20_Permit",
            sender: whitelisted,
            address: usdc,
            args: {
              amount: assets,
              spender: bundler,
              nonce: 0n,
            },
          },
          {
            type: "Erc20_Permit",
            sender: whitelisted,
            address: verUsdc,
            args: {
              amount: assets,
              spender: bundler,
              nonce: 0n,
            },
          },
          {
            type: "Erc20_Transfer",
            sender: bundler,
            address: usdc,
            args: {
              amount: assets,
              from: whitelisted,
              to: bundler,
            },
          },
          {
            type: "Erc20_Wrap",
            sender: bundler,
            address: verUsdc,
            args: {
              amount: assets,
              owner: whitelisted,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
          {
            type: "Erc20_Transfer",
            sender: bundler,
            address: verUsdc,
            args: {
              amount: assets,
              from: whitelisted,
              to: bundler,
            },
          },
          {
            type: "Blue_Supply",
            sender: bundler,
            address: morpho,
            args: {
              id: marketConfig.id,
              assets,
              onBehalf: whitelisted,
            },
          },
        ]);

        const position = await fetchPosition(
          whitelisted,
          marketConfig.id,
          client,
        );

        expect(position.collateral).to.equal(0n);
        expect(position.supplyShares).to.equal(assets * 1_000000n);
        expect(position.borrowShares).to.equal(0n);
      },
    );
  });
});
