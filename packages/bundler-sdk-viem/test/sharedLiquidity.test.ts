import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MathLib,
  NATIVE_ADDRESS,
  addresses,
} from "@morpho-org/blue-sdk";
import { metaMorphoAbi, publicAllocatorAbi } from "@morpho-org/blue-sdk-viem";
import { markets, vaults } from "@morpho-org/morpho-test";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { configure } from "@testing-library/dom";
import { parseEther, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { donator, setupBundle } from "./helpers.js";
import { test } from "./setup.js";

configure({ asyncUtilTimeout: 10_000 });

describe("sharedLiquidity", () => {
  const { morpho, bundler, publicAllocator, wNative, wstEth, stEth, usdc } =
    addresses[ChainId.EthMainnet];
  const {
    eth_idle,
    eth_wstEth_2,
    eth_rEth,
    eth_sDai,
    eth_wbtc,
    usdc_wstEth,
    usdc_idle,
    usdc_wbtc,
    usdc_wbIB01,
  } = markets[ChainId.EthMainnet];
  const { eth_wstEth } = markets[ChainId.EthMainnet];

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
      const depositAssets = parseEther("50");
      await client.deal({ erc20: wstEth, amount: collateralAssets });
      await client.deal({ erc20: wNative, amount: depositAssets });

      const { id } = usdc_wstEth;

      const block = await client.getBlock();

      const { result } = await renderHook(config, () =>
        useSimulationState({
          marketIds: [
            eth_idle.id,
            eth_rEth.id,
            eth_sDai.id,
            eth_wbtc.id,
            eth_wstEth.id,
            eth_wstEth_2.id,
            id,
            usdc_idle.id,
            usdc_wbtc.id,
            usdc_wbIB01.id,
          ],
          users: [
            client.account.address,
            donator.address,
            bundler,
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

      const { operations } = await setupBundle(
        client,
        data,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: client.account.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: client.account.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: client.account.address,
            address: morpho,
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
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: client.account.address,
            to: bundler,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: client.account.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler,
          address: morpho,
          args: {
            owner: client.account.address,
            isBundlerAuthorized: true,
          },
        },
        {
          type: "Blue_Borrow",
          sender: bundler,
          address: morpho,
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

  test[ChainId.EthMainnet](
    "should borrow USDC with shared liquidity and friendly reallocation",
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
      const depositAssets = parseEther("50");
      await client.deal({ erc20: wstEth, amount: collateralAssets });
      await client.deal({ erc20: wNative, amount: depositAssets });

      const { id } = usdc_wstEth;

      const block = await client.getBlock();

      const { result } = await renderHook(config, () =>
        useSimulationState({
          marketIds: [
            eth_idle.id,
            eth_rEth.id,
            eth_sDai.id,
            eth_wbtc.id,
            eth_wstEth.id,
            eth_wstEth_2.id,
            id,
            usdc_idle.id,
            usdc_wbtc.id,
            usdc_wbIB01.id,
          ],
          users: [
            client.account.address,
            donator.address,
            bundler,
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

      const amountForWbtcUsdctToReachTarget =
        MathLib.wDivDown(
          data.getMarket(usdc_wbtc.id).totalBorrowAssets,
          data.getMarket(usdc_wbtc.id).utilization,
        ) -
        MathLib.wDivDown(
          data.getMarket(usdc_wbtc.id).totalBorrowAssets,
          target,
        ) -
        1n; // -1n because of the rounding on withdrawals

      const amountForWstEthUsdcToReach100Utilization = MathLib.wMulDown(
        data.getMarket(id).totalSupplyAssets,
        MathLib.WAD - data.getMarket(id).utilization,
      );

      const maxFriendlyReallocationAmount =
        amountForWbtcUsdctToReachTarget +
        amountForWstEthUsdcToReach100Utilization;

      const { operations } = await setupBundle(
        client,
        data,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: client.account.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: client.account.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: client.account.address,
            address: morpho,
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
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: client.account.address,
            to: bundler,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: client.account.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler,
          address: morpho,
          args: {
            owner: client.account.address,
            isBundlerAuthorized: true,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: bundler,
          address: bbUsdc.address,
          args: {
            withdrawals: [
              {
                id: usdc_wbtc.id,
                assets: amountForWbtcUsdctToReachTarget,
              },
            ],
            supplyMarketId: id,
          },
        },
        {
          type: "Blue_Borrow",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: maxFriendlyReallocationAmount,
            onBehalf: client.account.address,
            receiver: client.account.address,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        },
      ]);
    },
  );

  test[ChainId.EthMainnet](
    "should borrow USDC with shared liquidity and full reallocation",
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
      const depositAssets = parseEther("50");
      await client.deal({ erc20: wstEth, amount: collateralAssets });
      await client.deal({ erc20: wNative, amount: depositAssets });

      const { id } = usdc_wstEth;

      const block = await client.getBlock();

      const { result } = await renderHook(config, () =>
        useSimulationState({
          marketIds: [
            eth_idle.id,
            eth_rEth.id,
            eth_sDai.id,
            eth_wbtc.id,
            eth_wstEth.id,
            eth_wstEth_2.id,
            id,
            usdc_idle.id,
            usdc_wbtc.id,
            usdc_wbIB01.id,
          ],
          users: [
            client.account.address,
            donator.address,
            bundler,
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

      const amountForWbtcUsdctToReachTarget =
        MathLib.wDivDown(
          data.getMarket(usdc_wbtc.id).totalBorrowAssets,
          data.getMarket(usdc_wbtc.id).utilization,
        ) -
        MathLib.wDivDown(
          data.getMarket(usdc_wbtc.id).totalBorrowAssets,
          target,
        );

      const additionnalReallocationAmount = parseUnits("10000", 6);

      const amountForWstEthUsdcToReach100Utilization = MathLib.wMulDown(
        data.getMarket(id).totalSupplyAssets,
        MathLib.WAD - data.getMarket(id).utilization,
      );

      const borrowed =
        amountForWbtcUsdctToReachTarget +
        amountForWstEthUsdcToReach100Utilization +
        additionnalReallocationAmount;

      const withdrawnAssets =
        amountForWbtcUsdctToReachTarget + additionnalReallocationAmount;

      const { operations } = await setupBundle(
        client,
        data,
        [
          {
            type: "Blue_SupplyCollateral",
            sender: client.account.address,
            address: morpho,
            args: {
              id,
              assets: collateralAssets,
              onBehalf: client.account.address,
            },
          },
          {
            type: "Blue_Borrow",
            sender: client.account.address,
            address: morpho,
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
            spender: bundler,
            nonce: 0n,
          },
        },
        {
          type: "Erc20_Transfer",
          sender: bundler,
          address: wstEth,
          args: {
            amount: collateralAssets,
            from: client.account.address,
            to: bundler,
          },
        },
        {
          type: "Blue_SupplyCollateral",
          sender: bundler,
          address: morpho,
          args: {
            id,
            assets: collateralAssets,
            onBehalf: client.account.address,
          },
        },
        {
          type: "Blue_SetAuthorization",
          sender: bundler,
          address: morpho,
          args: {
            owner: client.account.address,
            isBundlerAuthorized: true,
          },
        },
        {
          type: "MetaMorpho_PublicReallocate",
          sender: bundler,
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
          sender: bundler,
          address: morpho,
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
});
