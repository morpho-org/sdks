import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  NATIVE_ADDRESS,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { metaMorphoAbi, publicAllocatorAbi } from "@morpho-org/blue-sdk-viem";
import { markets, vaults } from "@morpho-org/morpho-test";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { configure } from "@testing-library/dom";
import { parseEther, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { donator, setupTestBundle } from "./helpers.js";
import { test } from "./setup.js";

configure({ asyncUtilTimeout: 10_000 });

describe("sharedLiquidity", () => {
  const {
    bundler3: { bundler3, generalAdapter1 },
    publicAllocator,
    wNative,
    wstEth,
    stEth,
    usdc,
  } = addressesRegistry[ChainId.EthMainnet];
  const { usdc_wstEth, usdc_wbtc, usdc_idle } = markets[ChainId.EthMainnet];

  const { steakUsdc, bbUsdc, bbEth } = vaults[ChainId.EthMainnet];

  test[ChainId.EthMainnet](
    "should borrow USDC without shared liquidity",
    async ({ client, config }) => {
      const steakUsdcOwner = await client.readContract({
        address: steakUsdc.address,
        abi: metaMorphoAbi,
        functionName: "owner",
      });

      await client.setBalance({
        address: steakUsdcOwner,
        value: parseEther("1000"),
      });
      await client.writeContract({
        account: steakUsdcOwner,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "setFlowCaps",
        args: [
          steakUsdc.address,
          [
            {
              id: usdc_wstEth.id,
              caps: {
                maxIn: parseUnits("10000", 6),
                maxOut: 0n,
              },
            },
            {
              id: usdc_wbtc.id,
              caps: {
                maxIn: 0n,
                maxOut: parseUnits("20000", 6), // Less than bbUsdc but more than maxIn.
              },
            },
          ],
        ],
      });

      const bbUsdcOwner = await client.readContract({
        address: bbUsdc.address,
        abi: metaMorphoAbi,
        functionName: "owner",
      });

      await client.setBalance({
        address: bbUsdcOwner,
        value: parseEther("1000"),
      });
      await client.writeContract({
        account: bbUsdcOwner,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "setFlowCaps",
        args: [
          bbUsdc.address,
          [
            {
              id: usdc_wstEth.id,
              caps: {
                maxIn: parseUnits("1000000", 6),
                maxOut: 0n,
              },
            },
            {
              id: usdc_wbtc.id,
              caps: {
                maxIn: 0n,
                maxOut: parseUnits("1000000", 6),
              },
            },
          ],
        ],
      });

      const collateralAssets = parseEther("50000");
      await client.deal({ erc20: wstEth, amount: collateralAssets });

      const { id } = usdc_wstEth;

      const block = await client.getBlock();

      const { result } = await renderHook(config, () =>
        useSimulationState({
          marketIds: [id],
          users: [
            client.account.address,
            donator.address,
            generalAdapter1,
            steakUsdc.address,
            bbEth.address,
            bbUsdc.address,
          ],
          tokens: [
            NATIVE_ADDRESS,
            wNative,
            usdc,
            stEth,
            wstEth,
            steakUsdc.address,
            bbEth.address,
            bbUsdc.address,
          ],
          vaults: [steakUsdc.address, bbEth.address, bbUsdc.address],
          block,
        }),
      );

      await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy(), {
        timeout: 30_000,
      });

      const data = result.current.data!;

      const target = parseEther("0.92");

      const borrowed = MathLib.wMulDown(
        data.getMarket(id).totalSupplyAssets,
        target - data.getMarket(id).utilization,
      );

      const { operations } = await setupTestBundle(
        client,
        data,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: client.account.address,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: client.account.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: client.account.address,
            args: {
              id,
              assets: borrowed,
              onBehalf: client.account.address,
              receiver: client.account.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          publicAllocatorOptions: {
            enabled: true,
            reallocatableVaults: [bbUsdc.address],
            maxWithdrawalUtilization: {
              [usdc_wbtc.id]: parseEther("0.95"),
            },
            supplyTargetUtilization: {
              [id]: target,
            },
          },
        },
      );

      expect(operations).toStrictEqual([
        {
          type: "Erc20_Permit",
          sender: client.account.address,
          address: wstEth,
          args: {
            amount: collateralAssets,
            spender: generalAdapter1,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: generalAdapter1,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: client.account.address,
            to: generalAdapter1,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: generalAdapter1,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: client.account.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler3,
          args: {
            owner: client.account.address,
            isAuthorized: true,
            authorized: generalAdapter1,
          },
        },
        {
          type: "Blue_Borrow",
          sender: generalAdapter1,
          args: {
            id,
            assets: borrowed,
            onBehalf: client.account.address,
            receiver: client.account.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);
    },
  );

  // It's a burden to maintain this test.
  test[ChainId.EthMainnet]
    .skip("should borrow USDC with shared liquidity and friendly reallocation", async ({
      client,
      config,
    }) => {
      const bbUsdcOwner = await client.readContract({
        address: bbUsdc.address,
        abi: metaMorphoAbi,
        functionName: "owner",
      });

      await client.setBalance({
        address: bbUsdcOwner,
        value: parseEther("1"),
      });
      await client.writeContract({
        account: bbUsdcOwner,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "setFlowCaps",
        args: [
          bbUsdc.address,
          [
            {
              id: usdc_wstEth.id,
              caps: {
                maxIn: parseUnits("10000000", 6),
                maxOut: 0n,
              },
            },
            {
              id: usdc_wbtc.id,
              caps: {
                maxIn: 0n,
                maxOut: parseUnits("10000000", 6),
              },
            },
            {
              id: usdc_idle.id,
              caps: {
                maxIn: 0n,
                maxOut: parseUnits("10000000", 6),
              },
            },
          ],
        ],
      });

      const collateralAssets = parseEther("50000");
      await client.deal({ erc20: wstEth, amount: collateralAssets });

      const { id } = usdc_wstEth;

      const block = await client.getBlock();

      const { result } = await renderHook(config, () =>
        useSimulationState({
          marketIds: [id],
          users: [
            client.account.address,
            donator.address,
            generalAdapter1,
            bbUsdc.address,
          ],
          tokens: [
            NATIVE_ADDRESS,
            wNative,
            usdc,
            stEth,
            wstEth,
            bbUsdc.address,
          ],
          vaults: [bbUsdc.address],
          block,
        }),
      );

      await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy(), {
        timeout: 30_000,
      });

      const data = result.current.data!;

      const target = parseEther("0.92");

      const amountForWbtcUsdcToReachTarget =
        data.getMarket(usdc_wbtc.id).totalSupplyAssets -
        MathLib.wDivDown(
          data.getMarket(usdc_wbtc.id).totalBorrowAssets,
          target,
        );

      const maxFriendlyReallocationAmount =
        amountForWbtcUsdcToReachTarget + data.getMarket(id).liquidity;

      const { operations } = await setupTestBundle(
        client,
        data,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: client.account.address,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: client.account.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: client.account.address,
            args: {
              id,
              assets: maxFriendlyReallocationAmount,
              onBehalf: client.account.address,
              receiver: client.account.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          publicAllocatorOptions: {
            enabled: true,
            reallocatableVaults: [bbUsdc.address],
            maxWithdrawalUtilization: {
              [usdc_wbtc.id]: target,
            },
            supplyTargetUtilization: {
              [id]: target,
            },
          },
        },
      );

      expect(operations).toStrictEqual([
        {
          type: "Erc20_Permit",
          sender: client.account.address,
          address: wstEth,
          args: {
            amount: collateralAssets,
            spender: generalAdapter1,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: generalAdapter1,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: client.account.address,
            to: generalAdapter1,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: generalAdapter1,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: client.account.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: generalAdapter1,
          args: {
            owner: client.account.address,
            isAuthorized: true,
            authorized: generalAdapter1,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: generalAdapter1,
          address: bbUsdc.address,
          args: {
            withdrawals: [
              {
                id: usdc_wbtc.id,
                assets: amountForWbtcUsdcToReachTarget,
              },
            ],
            supplyMarketId: id,
          },
        },
        {
          type: "Blue_Borrow",
          sender: generalAdapter1,
          args: {
            id,
            assets: maxFriendlyReallocationAmount,
            onBehalf: client.account.address,
            receiver: client.account.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);
    });

  // It's a burden to maintain this test.
  test[ChainId.EthMainnet]
    .skip("should borrow USDC with shared liquidity and full reallocation", async ({
      client,
      config,
    }) => {
      const bbUsdcOwner = await client.readContract({
        address: bbUsdc.address,
        abi: metaMorphoAbi,
        functionName: "owner",
      });

      await client.setBalance({
        address: bbUsdcOwner,
        value: parseEther("1"),
      });
      await client.writeContract({
        account: bbUsdcOwner,
        address: publicAllocator,
        abi: publicAllocatorAbi,
        functionName: "setFlowCaps",
        args: [
          bbUsdc.address,
          [
            {
              id: usdc_wstEth.id,
              caps: {
                maxIn: parseUnits("10000000", 6),
                maxOut: 0n,
              },
            },
            {
              id: usdc_wbtc.id,
              caps: {
                maxIn: 0n,
                maxOut: parseUnits("10000000", 6),
              },
            },
            {
              id: usdc_idle.id,
              caps: {
                maxIn: 0n,
                maxOut: parseUnits("10000000", 6),
              },
            },
          ],
        ],
      });

      const collateralAssets = parseEther("50000");
      await client.deal({ erc20: wstEth, amount: collateralAssets });

      const { id } = usdc_wstEth;

      const block = await client.getBlock();

      const { result } = await renderHook(config, () =>
        useSimulationState({
          marketIds: [id],
          users: [client.account.address, generalAdapter1, bbUsdc.address],
          tokens: [
            NATIVE_ADDRESS,
            wNative,
            usdc,
            stEth,
            wstEth,
            bbUsdc.address,
          ],
          vaults: [bbUsdc.address],
          block,
        }),
      );

      await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy(), {
        timeout: 30_000,
      });

      const data = result.current.data!;

      const target = parseEther("0.92");

      const amountForWbtcUsdcToReachTarget =
        data.getMarket(usdc_wbtc.id).totalSupplyAssets -
        MathLib.wDivDown(
          data.getMarket(usdc_wbtc.id).totalBorrowAssets,
          target,
        );

      const additionnalReallocationAmount = parseUnits("10000", 6);

      const borrowed =
        amountForWbtcUsdcToReachTarget +
        data.getMarket(id).liquidity +
        additionnalReallocationAmount;

      const withdrawnAssets =
        amountForWbtcUsdcToReachTarget + additionnalReallocationAmount;

      const { operations } = await setupTestBundle(
        client,
        data,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: client.account.address,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: client.account.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: client.account.address,
            args: {
              id,
              assets: borrowed,
              onBehalf: client.account.address,
              receiver: client.account.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          },
        ],
        {
          publicAllocatorOptions: {
            enabled: true,
            reallocatableVaults: [bbUsdc.address],
            maxWithdrawalUtilization: {
              [usdc_wbtc.id]: target,
            },
            supplyTargetUtilization: {
              [id]: target,
            },
          },
        },
      );

      expect(operations).toStrictEqual([
        {
          type: "Erc20_Permit",
          sender: client.account.address,
          address: wstEth,
          args: {
            amount: collateralAssets,
            spender: generalAdapter1,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: generalAdapter1,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: client.account.address,
            to: generalAdapter1,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: generalAdapter1,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: client.account.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: generalAdapter1,
          args: {
            owner: client.account.address,
            isAuthorized: true,
            authorized: generalAdapter1,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: generalAdapter1,
          address: bbUsdc.address,
          args: {
            withdrawals: [
              {
                id: usdc_wbtc.id,
                assets: withdrawnAssets,
              },
            ],
            supplyMarketId: id,
          },
        },
        {
          type: "Blue_Borrow",
          sender: generalAdapter1,
          args: {
            id,
            assets: borrowed,
            onBehalf: client.account.address,
            receiver: client.account.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);
    });
});
