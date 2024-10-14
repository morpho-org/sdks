import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketConfig,
  MathLib,
  NATIVE_ADDRESS,
  addresses,
} from "@morpho-org/blue-sdk";

import { blueAbi, fetchMarket, fetchPosition } from "@morpho-org/blue-sdk-viem";
import { markets, vaults } from "@morpho-org/morpho-test";
import { format } from "@morpho-org/morpho-ts";
import { Erc20Errors } from "@morpho-org/simulation-sdk";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { maxUint256, parseEther, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { setupBundle } from "./helpers.js";
import { test } from "./setup.js";

describe("populateBundle", () => {
  describe("with signatures", () => {
    describe("ethereum", () => {
      const { morpho, permit2, bundler, wNative, wstEth, stEth, usdc } =
        addresses[ChainId.EthMainnet];
      const { eth_wstEth, usdc_wstEth, usdc_idle, usdc_wbtc, usdc_wbIB01 } =
        markets[ChainId.EthMainnet];
      const { steakUsdc } = vaults[ChainId.EthMainnet];

      test[ChainId.EthMainnet](
        "should fail if balance exceeded",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const wBalance = parseEther("5000");
          const balance = await client.getBalance(client.account);
          await client.deal({
            erc20: wNative,
            amount: wBalance,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, bundler],
              tokens: [wNative],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const assets = balance + wBalance + 1n;

          await expect(
            setupBundle(client, result.current.data!, [
              {
                type: "Blue_Supply",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets,
                  onBehalf: client.account.address,
                },
              },
            ]),
          ).rejects.toEqual(
            new Erc20Errors.InsufficientBalance(
              wNative,
              client.account.address,
            ),
          );
        },
      );

      test[ChainId.EthMainnet](
        "should wrap + skim stETH if required with less wstETH than expected slippage",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const wBalance = parseEther("0.0005");
          // Dealing stETH does not work.
          await client.sendTransaction({
            to: stEth,
            value: (await client.getBalance(client.account)) / 2n,
          });
          await client.deal({
            erc20: wstEth,
            amount: wBalance,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, bundler],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { balance } = data.getHolding(client.account.address, stEth);
          const { balance: bundlerBalance } = data.getHolding(bundler, stEth);

          const wstEthToken = data.getWrappedToken(wstEth);
          const assets =
            wstEthToken.toWrappedExactAmountIn(
              balance,
              DEFAULT_SLIPPAGE_TOLERANCE,
            ) + wBalance;

          const { operations, bundle } = await setupBundle(client, data, [
            {
              type: "Erc20_Wrap",
              sender: client.account.address,
              address: wstEth,
              args: {
                amount: balance,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: client.account.address,
              address: morpho,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
              },
            },
          ]);

          expect(bundle.requirements.signatures.length).toBe(2);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: {
                to: stEth,
                data: expect.any(String),
              },
              args: [stEth, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: stEth,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: wstEth,
              args: {
                amount: wBalance,
                spender: bundler,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: wstEth,
              args: {
                amount: wBalance,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Erc20_Wrap",
              sender: bundler,
              address: wstEth,
              args: {
                amount: balance,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: wstEth,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          const position = await fetchPosition(
            client.account.address,
            id,
            client,
          );

          expect(
            format.number.of(
              await client.balanceOf({ erc20: stEth }),
              data.getToken(stEth).decimals,
            ),
          ).toBeCloseTo(0, 8);
          expect(position.collateral).toBe(assets);
          expect(position.supplyShares).toBe(0n);
          expect(position.borrowShares).toBe(0n);

          expect(
            await client.allowance({ erc20: stEth, spender: permit2 }),
          ).toBe(MathLib.MAX_UINT_160 - (balance - bundlerBalance));
          expect(
            await client.allowance({ erc20: stEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({
              erc20: stEth,
              spender: steakUsdc.address,
            }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should borrow with already enough collateral",
        async ({ client, config }) => {
          const id = usdc_wstEth.id;

          const collateral = parseEther("50");
          const assets = parseUnits("13000", 6);
          await client.deal({
            erc20: wstEth,
            amount: collateral,
          });
          await client.approve({ address: wstEth, args: [morpho, maxUint256] });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [usdc_wstEth, collateral, client.account.address, "0x"],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, bundler],
              tokens: [usdc, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupBundle(client, data, [
            {
              type: "Blue_Borrow",
              sender: client.account.address,
              address: morpho,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(bundle.requirements.signatures.length).toBe(1);

          expect(bundle.requirements.txs).toStrictEqual([]);

          expect(operations).toStrictEqual([
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
                assets,
                onBehalf: client.account.address,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          const market = await fetchMarket(id, client);
          const position = await fetchPosition(
            client.account.address,
            id,
            client,
          );

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(position.collateral).toBe(collateral);
          expect(position.supplyShares).toBe(0n);
          expect(market.toBorrowAssets(position.borrowShares)).toBe(
            assets + 1n,
          );

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({
              erc20: wstEth,
              spender: steakUsdc.address,
            }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should deposit steakUSDC via permit",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          await client.deal({
            erc20: usdc,
            amount,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                usdc_wstEth.id,
                usdc_idle.id,
                usdc_wbtc.id,
                usdc_wbIB01.id,
              ],
              users: [client.account.address, bundler, steakUsdc.address],
              tokens: [usdc, stEth, wstEth, steakUsdc.address],
              vaults: [steakUsdc.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupBundle(client, data, [
            {
              type: "MetaMorpho_Deposit",
              sender: client.account.address,
              address: steakUsdc.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(bundle.requirements.signatures.length).toBe(1);

          expect(bundle.requirements.txs).toStrictEqual([]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: usdc,
              args: {
                amount,
                spender: bundler,
                nonce: 1n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: usdc,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: steakUsdc.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdc })).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: steakUsdc.address })).toBe(
            amount - 1n,
          );

          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: steakUsdc.address }),
          ).toBe(0n);
        },
      );
    });
  });

  describe("without signatures", () => {
    describe("ethereum", () => {
      const { morpho, permit2, bundler, wNative, wstEth, stEth, usdc } =
        addresses[ChainId.EthMainnet];
      const { eth_wstEth, usdc_wstEth, usdc_idle, usdc_wbtc, usdc_wbIB01 } =
        markets[ChainId.EthMainnet];
      const { steakUsdc } = vaults[ChainId.EthMainnet];

      test[ChainId.EthMainnet](
        "should fail if balance exceeded",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const wBalance = parseEther("5000");
          const balance = await client.getBalance(client.account);
          await client.deal({
            erc20: wNative,
            amount: wBalance,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, bundler],
              tokens: [wNative],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const assets = balance + wBalance + 1n;

          await expect(
            setupBundle(
              client,
              result.current.data!,
              [
                {
                  type: "Blue_Supply",
                  sender: client.account.address,
                  address: morpho,
                  args: {
                    id,
                    assets,
                    onBehalf: client.account.address,
                  },
                },
              ],
              { supportsSignature: false },
            ),
          ).rejects.toEqual(
            new Erc20Errors.InsufficientBalance(
              wNative,
              client.account.address,
            ),
          );
        },
      );

      test[ChainId.EthMainnet](
        "should wrap + skim stETH if required with less wstETH than expected slippage",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const wBalance = parseEther("0.0005");
          // Dealing stETH does not work.
          await client.sendTransaction({
            to: stEth,
            value: (await client.getBalance(client.account)) / 2n,
          });
          await client.deal({
            erc20: wstEth,
            amount: wBalance,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, bundler],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { balance } = data.getHolding(client.account.address, stEth);
          const { balance: bundlerBalance } = data.getHolding(bundler, stEth);

          const wstEthToken = data.getWrappedToken(wstEth);
          const assets =
            wstEthToken.toWrappedExactAmountIn(
              balance,
              DEFAULT_SLIPPAGE_TOLERANCE,
            ) + wBalance;

          const { operations, bundle } = await setupBundle(
            client,
            data,
            [
              {
                type: "Erc20_Wrap",
                sender: client.account.address,
                address: wstEth,
                args: {
                  amount: balance,
                  owner: bundler,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_SupplyCollateral",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets,
                  onBehalf: client.account.address,
                },
              },
            ],
            { supportsSignature: false },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: {
                to: wstEth,
                data: expect.any(String),
              },
              args: [wstEth, bundler, wBalance],
            },
            {
              type: "erc20Approve",
              tx: {
                to: stEth,
                data: expect.any(String),
              },
              args: [stEth, bundler, balance - bundlerBalance],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: stEth,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: wstEth,
              args: {
                amount: wBalance,
                spender: bundler,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: wstEth,
              args: {
                amount: wBalance,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Erc20_Wrap",
              sender: bundler,
              address: wstEth,
              args: {
                amount: balance,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: wstEth,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          const position = await fetchPosition(
            client.account.address,
            id,
            client,
          );

          expect(
            format.number.of(
              await client.balanceOf({ erc20: stEth }),
              data.getToken(stEth).decimals,
            ),
          ).toBeCloseTo(0, 8);
          expect(position.collateral).toBe(assets);
          expect(position.supplyShares).toBe(0n);
          expect(position.borrowShares).toBe(0n);

          expect(
            await client.allowance({ erc20: stEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: stEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({
              erc20: stEth,
              spender: steakUsdc.address,
            }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should borrow with already enough collateral",
        async ({ client, config }) => {
          const id = usdc_wstEth.id;

          const collateral = parseEther("50");
          const assets = parseUnits("13000", 6);
          await client.deal({
            erc20: wstEth,
            amount: collateral,
          });
          await client.approve({ address: wstEth, args: [morpho, maxUint256] });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [usdc_wstEth, collateral, client.account.address, "0x"],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, bundler],
              tokens: [usdc, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupBundle(
            client,
            data,
            [
              {
                type: "Blue_Borrow",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            { supportsSignature: false },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              args: [bundler, true],
              tx: {
                to: morpho,
                data: expect.any(String),
              },
              type: "morphoSetAuthorization",
            },
          ]);

          expect(operations).toStrictEqual([
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
                assets,
                onBehalf: client.account.address,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          const market = await fetchMarket(id, client);
          const position = await fetchPosition(
            client.account.address,
            id,
            client,
          );

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(position.collateral).toBe(collateral);
          expect(position.supplyShares).toBe(0n);
          expect(market.toBorrowAssets(position.borrowShares)).toBe(
            assets + 1n,
          );

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({
              erc20: wstEth,
              spender: steakUsdc.address,
            }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should deposit steakUSDC via permit",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          await client.deal({
            erc20: usdc,
            amount,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                usdc_wstEth.id,
                usdc_idle.id,
                usdc_wbtc.id,
                usdc_wbIB01.id,
              ],
              users: [client.account.address, bundler, steakUsdc.address],
              tokens: [usdc, stEth, wstEth, steakUsdc.address],
              vaults: [steakUsdc.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupBundle(
            client,
            data,
            [
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: steakUsdc.address,
                args: {
                  assets: amount,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            { supportsSignature: false },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              args: [usdc, bundler, amount],
              tx: {
                to: usdc,
                data: expect.any(String),
              },
              type: "erc20Approve",
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: usdc,
              args: {
                amount,
                spender: bundler,
                nonce: 1n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: usdc,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: steakUsdc.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdc })).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: steakUsdc.address })).toBe(
            amount - 1n,
          );

          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: steakUsdc.address }),
          ).toBe(0n);
        },
      );
    });

    describe("base", () => {
      const { morpho, bundler, adaptiveCurveIrm, wNative, usdc, verUsdc } =
        addresses[ChainId.BaseMainnet];

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
            account: whitelisted,
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
            {
              account: whitelisted,
              supportsSignature: false,
            },
          );

          expect(operations).toStrictEqual([
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

          expect(position.collateral).toBe(0n);
          expect(position.supplyShares).toBe(assets * 1_000000n);
          expect(position.borrowShares).toBe(0n);
        },
      );
    });
  });
});