import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketConfig,
  MathLib,
  NATIVE_ADDRESS,
  addresses,
} from "@morpho-org/blue-sdk";

import {
  blueAbi,
  fetchMarket,
  fetchPosition,
  metaMorphoAbi,
  publicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { markets, vaults } from "@morpho-org/morpho-test";
import { format } from "@morpho-org/morpho-ts";
import { Erc20Errors } from "@morpho-org/simulation-sdk";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { configure } from "@testing-library/dom";
import { maxUint256, parseEther, parseUnits, zeroAddress } from "viem";
import { describe, expect } from "vitest";
import { donate, donator, setupBundle } from "./helpers.js";
import { test } from "./setup.js";

configure({ asyncUtilTimeout: 5_000 });

describe("populateBundle", () => {
  describe("with signatures", () => {
    describe("ethereum", () => {
      const {
        morpho,
        permit2,
        bundler,
        publicAllocator,
        wNative,
        wstEth,
        stEth,
        usdc,
        usdt,
      } = addresses[ChainId.EthMainnet];
      const {
        eth_idle,
        eth_wstEth,
        eth_wstEth_2,
        eth_rEth,
        eth_sDai,
        eth_wbtc,
        eth_ezEth,
        eth_apxEth,
        eth_osEth,
        eth_weEth,
        usdc_wstEth,
        usdc_idle,
        usdc_wbtc,
        usdc_wbIB01,
        usdt_idle,
        usdt_weth_86,
        usdt_weth_91_5,
        usdt_wbtc,
        usdt_wstEth,
        usdt_sDai,
      } = markets[ChainId.EthMainnet];
      const { steakUsdc, bbUsdt, bbUsdc, bbEth, re7Weth } =
        vaults[ChainId.EthMainnet];

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
              tx: { to: stEth, data: expect.any(String) },
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
            format.number.of(await client.balanceOf({ erc20: stEth }), 18),
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
              tokens: [usdc, steakUsdc.address],
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

      test[ChainId.EthMainnet](
        "should deposit bbUsdt via permit2",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          await client.deal({ erc20: usdt, amount });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                usdt_wstEth.id,
                usdt_idle.id,
                usdt_wbtc.id,
                usdt_weth_86.id,
                usdt_weth_91_5.id,
                usdt_sDai.id,
              ],
              users: [client.account.address, bundler, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupBundle(client, data, [
            {
              type: "MetaMorpho_Deposit",
              sender: client.account.address,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);
          expect(bundle.requirements.signatures.length).toBe(1);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: usdt, data: expect.any(String) },
              args: [usdt, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: usdt,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: usdt,
              args: {
                amount,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: bbUsdt.address })).toBe(
            amount - 1n,
          );

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(MathLib.MAX_UINT_160 - amount);
          expect(
            await client.allowance({ erc20: usdt, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should simulate bbUSDT deposit into supply max collateral without skim",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          const expectedShares = await client.convertToShares({
            erc4626: bbUsdt.address,
            assets: amount,
          });
          await client.deal({ erc20: usdt, amount });

          const marketConfig = new MarketConfig({
            loanToken: zeroAddress,
            collateralToken: bbUsdt.address,
            lltv: 0n,
            oracle: zeroAddress,
            irm: zeroAddress,
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "createMarket",
            args: [marketConfig],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                marketConfig.id,
                usdt_wstEth.id,
                usdt_idle.id,
                usdt_wbtc.id,
                usdt_weth_86.id,
                usdt_weth_91_5.id,
                usdt_sDai.id,
              ],
              users: [client.account.address, bundler, bbUsdt.address],
              tokens: [usdt, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupBundle(client, data, [
            {
              type: "MetaMorpho_Deposit",
              sender: client.account.address,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: client.account.address,
              address: morpho,
              args: {
                id: marketConfig.id,
                assets: maxUint256,
                onBehalf: client.account.address,
              },
            },
          ]);

          expect(bundle.requirements.signatures.length).toBe(1);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: usdt, data: expect.any(String) },
              args: [usdt, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: usdt,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: usdt,
              args: {
                amount,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id: marketConfig.id,
                assets: maxUint256,
                onBehalf: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(await client.balanceOf({ erc20: bbUsdt.address })).toBe(0n);

          const { collateral } = await fetchPosition(
            client.account.address,
            marketConfig.id,
            client,
          );
          expect(format.number.of(collateral, 18)).toBeCloseTo(
            Number(format.number.of(expectedShares, 18)),
            1,
          );

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(MathLib.MAX_UINT_160 - amount);
          expect(
            await client.allowance({ erc20: usdt, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should simulate bbUSDT deposit into supply collateral with skim",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          const shares = parseEther("500000");
          const expectedShares = await client.convertToShares({
            erc4626: bbUsdt.address,
            assets: amount,
          });
          await client.deal({ erc20: usdt, amount });

          const marketConfig = new MarketConfig({
            loanToken: zeroAddress,
            collateralToken: bbUsdt.address,
            lltv: 0n,
            oracle: zeroAddress,
            irm: zeroAddress,
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "createMarket",
            args: [marketConfig],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                marketConfig.id,
                usdt_wstEth.id,
                usdt_idle.id,
                usdt_wbtc.id,
                usdt_weth_86.id,
                usdt_weth_91_5.id,
                usdt_sDai.id,
              ],
              users: [client.account.address, bundler, bbUsdt.address],
              tokens: [usdt, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupBundle(client, data, [
            {
              type: "MetaMorpho_Deposit",
              sender: client.account.address,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: client.account.address,
              address: morpho,
              args: {
                id: marketConfig.id,
                assets: shares,
                onBehalf: client.account.address,
              },
            },
          ]);

          expect(bundle.requirements.signatures.length).toBe(1);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: usdt, data: expect.any(String) },
              args: [usdt, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: usdt,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: usdt,
              args: {
                amount,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id: marketConfig.id,
                assets: shares,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(
            format.number.of(
              await client.balanceOf({ erc20: bbUsdt.address }),
              18,
            ),
          ).toBeCloseTo(
            Number(format.number.of(expectedShares - shares, 18)),
            1,
          );

          const { collateral } = await fetchPosition(
            client.account.address,
            marketConfig.id,
            client,
          );
          expect(collateral).toBe(shares);

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(MathLib.MAX_UINT_160 - amount);
          expect(
            await client.allowance({ erc20: usdt, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should simulate bbETH mint on behalf with slippage & unwrap remaining WETH",
        async ({ client, config }) => {
          const shares = parseEther("99");
          const assets = await client.previewMint({
            erc4626: bbEth.address,
            shares,
          });
          await client.deal({
            erc20: wNative,
            amount: assets + parseEther("10"),
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                eth_wstEth.id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
              ],
              users: [client.account.address, bundler, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
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
                address: bbEth.address,
                args: {
                  shares,
                  owner: donator.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              onBundleTx: donate(
                client,
                wNative,
                parseEther("1"),
                bbEth.address,
                morpho,
              ),
            },
          );

          expect(bundle.requirements.signatures.length).toBe(1);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: expect.any(BigInt),
                spender: bundler,
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: expect.any(BigInt),
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbEth.address,
              args: {
                shares,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              address: wNative,
              sender: bundler,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          expect(
            await client.balanceOf({ erc20: wNative, owner: bundler }),
          ).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);
          expect(
            format.number.of(await client.balanceOf({ erc20: wNative }), 18),
          ).toBeCloseTo(10, 1);

          expect(
            await client.allowance({ erc20: wNative, spender: permit2 }),
          ).not.toBe(0n);
          expect(
            await client.allowance({ erc20: wNative, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wNative, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should fail bbETH mint on behalf with slippage exceeded",
        async ({ client, config }) => {
          const shares = parseEther("99");
          const assets = await client.previewMint({
            erc4626: bbEth.address,
            shares,
          });
          await client.deal({
            erc20: wNative,
            amount: assets + parseEther("10"),
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                eth_wstEth.id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
              ],
              users: [client.account.address, bundler, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          await expect(
            setupBundle(
              client,
              data,
              [
                {
                  type: "MetaMorpho_Deposit",
                  sender: client.account.address,
                  address: bbEth.address,
                  args: {
                    shares,
                    owner: donator.address,
                    slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                  },
                },
              ],
              {
                onBundleTx: donate(
                  client,
                  wNative,
                  parseEther("10"),
                  bbEth.address,
                  morpho,
                ),
              },
            ),
          ).rejects.toThrow();
        },
      );

      test[ChainId.EthMainnet](
        "should borrow USDC against wstETH into steakUSDC half deposit on behalf with slippage & unwrap remaining wstETH",
        async ({ client, config }) => {
          const { id } = usdc_wstEth;
          const collateralAssets = parseEther("100");
          const loanShares = parseUnits("5000", 12);
          const loanAssets = (await fetchMarket(id, client)).toBorrowAssets(
            loanShares,
          );
          await client.deal({ erc20: wstEth, amount: collateralAssets });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id, usdc_idle.id, usdc_wbtc.id, usdc_wbIB01.id],
              users: [
                client.account.address,
                bundler,
                steakUsdc.address,
                donator.address,
              ],
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
                  shares: loanShares,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: steakUsdc.address,
                args: {
                  assets: loanAssets / 2n,
                  owner: donator.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              unwrapTokens: new Set([wstEth]),
              onBundleTx: donate(
                client,
                usdc,
                parseUnits("1000", 6),
                steakUsdc.address,
                morpho,
              ),
            },
          );

          expect(bundle.requirements.signatures.length).toBe(2);

          expect(bundle.requirements.txs).toStrictEqual([]);

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
                shares: loanShares,
                onBehalf: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: steakUsdc.address,
              args: {
                assets: loanAssets / 2n,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: usdc,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(
            format.number.of(await client.balanceOf({ erc20: usdc }), 6),
          ).toBeCloseTo(Number(format.number.of(loanAssets / 2n, 6)), -1);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bbEth.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should redeem all bbETH with slippage + wstETH leverage into bbETH deposit & unwrap remaining WETH",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const collateralAssets = parseEther("100");
          const loanAssets = parseEther("95");

          await client.deal({ erc20: wstEth, amount: collateralAssets });
          await client.deal({ erc20: wNative, amount: loanAssets });
          await client.approve({
            address: wstEth,
            args: [morpho, collateralAssets],
          });
          await client.approve({
            address: wNative,
            args: [bbEth.address, loanAssets],
          });
          await client.deposit({
            address: bbEth.address,
            args: [loanAssets, client.account.address],
          });

          const shares = await client.balanceOf({ erc20: bbEth.address });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
              ],
              users: [client.account.address, bundler, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth, bbEth.address],
              vaults: [bbEth.address],
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
                type: "MetaMorpho_Withdraw",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  shares,
                  owner: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
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
                  assets: loanAssets,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  assets: loanAssets,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              unwrapTokens: new Set([wstEth, wNative]),
              onBundleTx: donate(
                client,
                wNative,
                parseEther("1"),
                bbEth.address,
                morpho,
              ),
            },
          );

          expect(bundle.requirements.signatures.length).toBe(3);

          expect(bundle.requirements.txs).toStrictEqual([]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: bbEth.address,
              args: {
                amount: shares,
                spender: bundler,
                nonce: 0n,
              },
            },
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
              type: "MetaMorpho_Withdraw",
              sender: bundler,
              address: bbEth.address,
              args: {
                shares,
                owner: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
                assets: loanAssets,
                onBehalf: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbEth.address,
              args: {
                assets: loanAssets,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Unwrap",
              sender: bundler,
              address: wNative,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: NATIVE_ADDRESS,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);
        },
      );

      test[ChainId.EthMainnet](
        "should deleverage wstETH into MetaMorpho bbETH -> re7WETH arbitrage with slippage",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const collateralAssets = parseEther("100");
          const loanAssets = parseEther("95");

          await client.deal({ erc20: wstEth, amount: collateralAssets });
          await client.deal({ erc20: wNative, amount: loanAssets });
          await client.approve({
            address: wstEth,
            args: [morpho, collateralAssets],
          });
          await client.approve({
            address: wNative,
            args: [bbEth.address, loanAssets],
          });
          await client.deposit({
            address: bbEth.address,
            args: [loanAssets, client.account.address],
          });

          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [eth_wstEth, collateralAssets, client.account.address, "0x"],
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "borrow",
            args: [
              eth_wstEth,
              loanAssets,
              0n,
              client.account.address,
              client.account.address,
            ],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
                eth_ezEth.id,
                eth_apxEth.id,
                eth_osEth.id,
                eth_weEth.id,
              ],
              users: [
                client.account.address,
                bundler,
                bbEth.address,
                re7Weth.address,
              ],
              tokens: [
                NATIVE_ADDRESS,
                wNative,
                stEth,
                wstEth,
                bbEth.address,
                re7Weth.address,
              ],
              vaults: [bbEth.address, re7Weth.address],
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
                type: "Blue_Repay",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets: loanAssets / 2n,
                  onBehalf: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets: collateralAssets / 2n,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                },
              },
              {
                type: "MetaMorpho_Withdraw",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  assets: loanAssets / 2n,
                  owner: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_Repay",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets: loanAssets / 4n,
                  onBehalf: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: re7Weth.address,
                args: {
                  assets: loanAssets / 4n,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              unwrapTokens: new Set([wNative]),
              onBundleTx: async (data) => {
                await donate(
                  client,
                  wNative,
                  parseEther("0.5"),
                  bbEth.address,
                  morpho,
                )(data);
                await donate(
                  client,
                  wNative,
                  parseEther("0.5"),
                  re7Weth.address,
                  morpho,
                )(data);
              },
            },
          );

          expect(bundle.requirements.signatures.length).toBe(3);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: bbEth.address,
              args: {
                spender: bundler,
                nonce: 0n,
                amount: expect.any(BigInt),
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: loanAssets / 2n,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: loanAssets / 2n,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Blue_Repay",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets: loanAssets / 2n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets: collateralAssets / 2n,
                onBehalf: client.account.address,
                receiver: client.account.address,
              },
            },
            {
              type: "MetaMorpho_Withdraw",
              sender: bundler,
              address: bbEth.address,
              args: {
                assets: loanAssets / 2n,
                owner: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_Repay",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets: loanAssets / 4n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: re7Weth.address,
              args: {
                assets: loanAssets / 4n,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);
        },
      );

      test[ChainId.EthMainnet](
        "should borrow USDC with shared liquidity and reallocation fee + unwrap remaining WETH",
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

          const bbUsdcFee = parseEther("0.002");

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
            functionName: "setFee",
            args: [bbUsdc.address, bbUsdcFee],
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
                    maxOut: parseUnits("100000", 6),
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

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const loanAssets = data
            .getMarketPublicReallocations(id)
            .data.getMarket(id).liquidity;

          const { operations, bundle } = await setupBundle(
            client,
            data,
            [
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  assets: depositAssets,
                  owner: donator.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
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
                  assets: loanAssets,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              unwrapTokens: new Set([wNative]),
            },
          );

          expect(bundle.requirements.signatures.length).toBe(3);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
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
                amount: collateralAssets,
                spender: bundler,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: depositAssets,
                spender: bundler,
                expiration: expect.any(BigInt),
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
              type: "Erc20_Transfer",
              sender: client.account.address,
              address: NATIVE_ADDRESS,
              args: {
                amount: bbUsdcFee,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: depositAssets,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbEth.address,
              args: {
                assets: depositAssets,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
                    assets: parseUnits("100000", 6),
                  },
                ],
                supplyMarketId: id,
              },
            },
            {
              type: "MetaMorpho_PublicReallocate",
              sender: bundler,
              address: steakUsdc.address,
              args: {
                withdrawals: [
                  {
                    id: usdc_wbtc.id,
                    assets: parseUnits("10000", 6),
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
                assets: loanAssets,
                onBehalf: client.account.address,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(await client.balanceOf({ erc20: usdc })).toBe(loanAssets);

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bbEth.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should close a WETH/wstETH position + unwrap wstEth + skim WETH",
        async ({ client, config }) => {
          const collateralAmount = parseEther("1");
          const borrowAmount = parseEther("0.5");

          await client.deal({ erc20: wstEth, amount: collateralAmount });
          await client.deal({ erc20: stEth, amount: 0n });

          await client.approve({ address: wstEth, args: [morpho, maxUint256] });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [eth_wstEth, collateralAmount, client.account.address, "0x"],
          });

          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "borrow",
            args: [
              eth_wstEth,
              borrowAmount,
              0n,
              client.account.address,
              client.account.address,
            ],
          });

          const extraWethAmount = parseEther("0.1");

          await client.deal({
            erc20: wNative,
            amount: borrowAmount + extraWethAmount,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [eth_wstEth.id],
              users: [client.account.address, bundler],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const position = data.getAccrualPosition(
            client.account.address,
            eth_wstEth.id,
          );

          const { operations, bundle } = await setupBundle(
            client,
            data,
            [
              {
                type: "Blue_Repay",
                sender: client.account.address,
                address: morpho,
                args: {
                  id: eth_wstEth.id,
                  shares: position.borrowShares,
                  onBehalf: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                sender: client.account.address,
                address: morpho,
                args: {
                  id: eth_wstEth.id,
                  assets: position.collateral,
                  receiver: client.account.address,
                  onBehalf: client.account.address,
                },
              },
            ],
            { unwrapTokens: new Set([wstEth]) },
          );

          const repayAmount = MathLib.wMulUp(
            position.borrowAssets,
            MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
          );

          expect(bundle.requirements.signatures.length).toBe(2);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, permit2, MathLib.MAX_UINT_160],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: repayAmount,
                spender: bundler,
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: repayAmount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Blue_Repay",
              sender: bundler,
              address: morpho,
              args: {
                id: eth_wstEth.id,
                shares: position.borrowShares,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id: eth_wstEth.id,
                assets: position.collateral,
                receiver: bundler,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Unwrap",
              address: wstEth,
              sender: bundler,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              address: wNative,
              sender: bundler,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              address: stEth,
              sender: bundler,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          const chainPosition = await fetchPosition(
            client.account.address,
            eth_wstEth.id,
            client,
          );

          const wstEthToken = data.getWrappedToken(wstEth);

          const latestBlock = await client.getBlock();

          const accruedInterests =
            position.accrueInterest(latestBlock.timestamp).borrowAssets -
            borrowAmount;

          expect(chainPosition.collateral).toBe(0n);
          expect(chainPosition.supplyShares).toBe(0n);
          expect(chainPosition.borrowShares).toBe(0n);

          expect(
            await client.balanceOf({ erc20: wstEth, owner: bundler }),
          ).toBe(0n);
          expect(await client.balanceOf({ erc20: stEth, owner: bundler })).toBe(
            1n,
          ); // 1 stETH is always remaining in the bundler
          expect(
            await client.balanceOf({ erc20: wNative, owner: bundler }),
          ).toBe(0n);

          expect(await client.balanceOf({ erc20: stEth })).toBe(
            wstEthToken.toUnwrappedExactAmountIn(collateralAmount, 0n) - 2n,
          );
          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(await client.balanceOf({ erc20: wNative })).toBe(
            extraWethAmount - accruedInterests,
          ); // we normally didn't experienced any slippage
        },
      );
    });
  });

  describe("without signatures", () => {
    describe("ethereum", () => {
      const {
        morpho,
        permit2,
        bundler,
        publicAllocator,
        wNative,
        wstEth,
        stEth,
        usdc,
        usdt,
      } = addresses[ChainId.EthMainnet];
      const {
        eth_idle,
        eth_sDai,
        eth_wbtc,
        eth_rEth,
        eth_wstEth,
        eth_wstEth_2,
        eth_ezEth,
        eth_apxEth,
        eth_osEth,
        eth_weEth,
        usdc_wstEth,
        usdc_idle,
        usdc_wbtc,
        usdc_wbIB01,
        usdt_idle,
        usdt_weth_86,
        usdt_weth_91_5,
        usdt_wbtc,
        usdt_wstEth,
        usdt_sDai,
      } = markets[ChainId.EthMainnet];
      const { steakUsdc, bbUsdt, bbEth, bbUsdc, re7Weth } =
        vaults[ChainId.EthMainnet];

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
              tx: { to: wstEth, data: expect.any(String) },
              args: [wstEth, bundler, wBalance],
            },
            {
              type: "erc20Approve",
              tx: { to: stEth, data: expect.any(String) },
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
            format.number.of(await client.balanceOf({ erc20: stEth }), 18),
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
              type: "erc20Approve",
              tx: { to: usdc, data: expect.any(String) },
              args: [usdc, bundler, amount],
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

      test[ChainId.EthMainnet](
        "should deposit bbUsdt via permit2",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          await client.deal({ erc20: usdt, amount });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                usdt_wstEth.id,
                usdt_idle.id,
                usdt_wbtc.id,
                usdt_weth_86.id,
                usdt_weth_91_5.id,
                usdt_sDai.id,
              ],
              users: [client.account.address, bundler, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
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
                address: bbUsdt.address,
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
              type: "erc20Approve",
              tx: { to: usdt, data: expect.any(String) },
              args: [usdt, bundler, amount],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: usdt,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: usdt,
              args: {
                amount,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: bbUsdt.address })).toBe(
            amount - 1n,
          );

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should simulate bbUSDT deposit into supply max collateral without skim",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          const expectedShares = await client.convertToShares({
            erc4626: bbUsdt.address,
            assets: amount,
          });
          await client.deal({ erc20: usdt, amount });

          const marketConfig = new MarketConfig({
            loanToken: zeroAddress,
            collateralToken: bbUsdt.address,
            lltv: 0n,
            oracle: zeroAddress,
            irm: zeroAddress,
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "createMarket",
            args: [marketConfig],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                marketConfig.id,
                usdt_wstEth.id,
                usdt_idle.id,
                usdt_wbtc.id,
                usdt_weth_86.id,
                usdt_weth_91_5.id,
                usdt_sDai.id,
              ],
              users: [client.account.address, bundler, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
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
                address: bbUsdt.address,
                args: {
                  assets: amount,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_SupplyCollateral",
                sender: client.account.address,
                address: morpho,
                args: {
                  id: marketConfig.id,
                  assets: maxUint256,
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
                to: usdt,
                data: expect.any(String),
              },
              args: [usdt, bundler, amount],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: usdt,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: usdt,
              args: {
                amount,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id: marketConfig.id,
                assets: maxUint256,
                onBehalf: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(await client.balanceOf({ erc20: bbUsdt.address })).toBe(0n);

          const { collateral } = await fetchPosition(
            client.account.address,
            marketConfig.id,
            client,
          );
          expect(format.number.of(collateral, 18)).toBeCloseTo(
            Number(format.number.of(expectedShares, 18)),
            1,
          );

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should simulate bbUSDT deposit into supply collateral with skim",
        async ({ client, config }) => {
          const amount = parseUnits("1000000", 6);
          const shares = parseEther("500000");
          const expectedShares = await client.convertToShares({
            erc4626: bbUsdt.address,
            assets: amount,
          });
          await client.deal({ erc20: usdt, amount });

          const marketConfig = new MarketConfig({
            loanToken: zeroAddress,
            collateralToken: bbUsdt.address,
            lltv: 0n,
            oracle: zeroAddress,
            irm: zeroAddress,
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "createMarket",
            args: [marketConfig],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                marketConfig.id,
                usdt_wstEth.id,
                usdt_idle.id,
                usdt_wbtc.id,
                usdt_weth_86.id,
                usdt_weth_91_5.id,
                usdt_sDai.id,
              ],
              users: [client.account.address, bundler, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
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
                address: bbUsdt.address,
                args: {
                  assets: amount,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_SupplyCollateral",
                sender: client.account.address,
                address: morpho,
                args: {
                  id: marketConfig.id,
                  assets: shares,
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
              tx: { to: usdt, data: expect.any(String) },
              args: [usdt, bundler, amount],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: usdt,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: usdt,
              args: {
                amount,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id: marketConfig.id,
                assets: shares,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: bbUsdt.address,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(
            format.number.of(
              await client.balanceOf({ erc20: bbUsdt.address }),
              18,
            ),
          ).toBeCloseTo(
            Number(format.number.of(expectedShares - shares, 18)),
            1,
          );

          const { collateral } = await fetchPosition(
            client.account.address,
            marketConfig.id,
            client,
          );
          expect(collateral).toBe(shares);

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should simulate bbETH mint on behalf with slippage & unwrap remaining WETH",
        async ({ client, config }) => {
          const shares = parseEther("99");
          const assets = await client.previewMint({
            erc4626: bbEth.address,
            shares,
          });
          await client.deal({
            erc20: wNative,
            amount: assets + parseEther("10"),
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                eth_wstEth.id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
              ],
              users: [client.account.address, bundler, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
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
                address: bbEth.address,
                args: {
                  shares,
                  owner: donator.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              supportsSignature: false,
              onBundleTx: donate(
                client,
                wNative,
                parseEther("1"),
                bbEth.address,
                morpho,
              ),
            },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, bundler, expect.any(BigInt)],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: expect.any(BigInt),
                spender: bundler,
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: expect.any(BigInt),
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbEth.address,
              args: {
                shares,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              address: wNative,
              sender: bundler,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          expect(
            await client.balanceOf({ erc20: wNative, owner: bundler }),
          ).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);
          expect(
            format.number.of(await client.balanceOf({ erc20: wNative }), 18),
          ).toBeCloseTo(10, 1);

          expect(
            await client.allowance({ erc20: wNative, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wNative, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wNative, spender: bbUsdt.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should fail bbETH mint on behalf with slippage exceeded",
        async ({ client, config }) => {
          const shares = parseEther("99");
          const assets = await client.previewMint({
            erc4626: bbEth.address,
            shares,
          });
          await client.deal({
            erc20: wNative,
            amount: assets + parseEther("10"),
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                eth_wstEth.id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
              ],
              users: [client.account.address, bundler, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          await expect(
            setupBundle(
              client,
              data,
              [
                {
                  type: "MetaMorpho_Deposit",
                  sender: client.account.address,
                  address: bbEth.address,
                  args: {
                    shares,
                    owner: donator.address,
                    slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                  },
                },
              ],
              {
                supportsSignature: false,
                onBundleTx: donate(
                  client,
                  wNative,
                  parseEther("10"),
                  bbEth.address,
                  morpho,
                ),
              },
            ),
          ).rejects.toThrow();
        },
      );

      test[ChainId.EthMainnet](
        "should borrow USDC against wstETH into steakUSDC half deposit on behalf with slippage & unwrap remaining wstETH",
        async ({ client, config }) => {
          const { id } = usdc_wstEth;
          const collateralAssets = parseEther("100");
          const loanShares = parseUnits("5000", 12);
          const loanAssets = (await fetchMarket(id, client)).toBorrowAssets(
            loanShares,
          );
          await client.deal({ erc20: wstEth, amount: collateralAssets });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id, usdc_idle.id, usdc_wbtc.id, usdc_wbIB01.id],
              users: [
                client.account.address,
                bundler,
                steakUsdc.address,
                donator.address,
              ],
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
                  shares: loanShares,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: steakUsdc.address,
                args: {
                  assets: loanAssets / 2n,
                  owner: donator.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              supportsSignature: false,
              unwrapTokens: new Set([wstEth]),
              onBundleTx: donate(
                client,
                usdc,
                parseUnits("1000", 6),
                steakUsdc.address,
                morpho,
              ),
            },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wstEth, data: expect.any(String) },
              args: [wstEth, bundler, collateralAssets],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [bundler, true],
            },
          ]);

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
                shares: loanShares,
                onBehalf: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: steakUsdc.address,
              args: {
                assets: loanAssets / 2n,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: usdc,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(
            format.number.of(await client.balanceOf({ erc20: usdc }), 6),
          ).toBeCloseTo(Number(format.number.of(loanAssets / 2n, 6)), -1);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bbEth.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should redeem all bbETH with slippage + wstETH leverage into bbETH deposit & unwrap remaining WETH",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const collateralAssets = parseEther("100");
          const loanAssets = parseEther("95");

          await client.deal({ erc20: wstEth, amount: collateralAssets });
          await client.deal({ erc20: wNative, amount: loanAssets });
          await client.approve({
            address: wstEth,
            args: [morpho, collateralAssets],
          });
          await client.approve({
            address: wNative,
            args: [bbEth.address, loanAssets],
          });
          await client.deposit({
            address: bbEth.address,
            args: [loanAssets, client.account.address],
          });

          const shares = await client.balanceOf({ erc20: bbEth.address });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
              ],
              users: [client.account.address, bundler, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth, bbEth.address],
              vaults: [bbEth.address],
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
                type: "MetaMorpho_Withdraw",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  shares,
                  owner: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
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
                  assets: loanAssets,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  assets: loanAssets,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              supportsSignature: false,
              unwrapTokens: new Set([wstEth, wNative]),
              onBundleTx: donate(
                client,
                wNative,
                parseEther("1"),
                bbEth.address,
                morpho,
              ),
            },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: bbEth.address, data: expect.any(String) },
              args: [bbEth.address, bundler, shares],
            },
            {
              type: "erc20Approve",
              tx: { to: wstEth, data: expect.any(String) },
              args: [wstEth, bundler, collateralAssets],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [bundler, true],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: bbEth.address,
              args: {
                amount: shares,
                spender: bundler,
                nonce: 0n,
              },
            },
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
              type: "MetaMorpho_Withdraw",
              sender: bundler,
              address: bbEth.address,
              args: {
                shares,
                owner: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
                assets: loanAssets,
                onBehalf: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbEth.address,
              args: {
                assets: loanAssets,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Unwrap",
              sender: bundler,
              address: wNative,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: bundler,
              address: NATIVE_ADDRESS,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);
        },
      );

      test[ChainId.EthMainnet](
        "should deleverage wstETH into MetaMorpho bbETH -> re7WETH arbitrage with slippage",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const collateralAssets = parseEther("100");
          const loanAssets = parseEther("95");

          await client.deal({ erc20: wstEth, amount: collateralAssets });
          await client.deal({ erc20: wNative, amount: loanAssets });
          await client.approve({
            address: wstEth,
            args: [morpho, collateralAssets],
          });
          await client.approve({
            address: wNative,
            args: [bbEth.address, loanAssets],
          });
          await client.deposit({
            address: bbEth.address,
            args: [loanAssets, client.account.address],
          });

          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [eth_wstEth, collateralAssets, client.account.address, "0x"],
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "borrow",
            args: [
              eth_wstEth,
              loanAssets,
              0n,
              client.account.address,
              client.account.address,
            ],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [
                eth_idle.id,
                id,
                eth_rEth.id,
                eth_sDai.id,
                eth_wbtc.id,
                eth_wstEth_2.id,
                eth_ezEth.id,
                eth_apxEth.id,
                eth_osEth.id,
                eth_weEth.id,
              ],
              users: [
                client.account.address,
                bundler,
                bbEth.address,
                re7Weth.address,
              ],
              tokens: [
                NATIVE_ADDRESS,
                wNative,
                stEth,
                wstEth,
                bbEth.address,
                re7Weth.address,
              ],
              vaults: [bbEth.address, re7Weth.address],
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
                type: "Blue_Repay",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets: loanAssets / 2n,
                  onBehalf: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets: collateralAssets / 2n,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                },
              },
              {
                type: "MetaMorpho_Withdraw",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  assets: loanAssets / 2n,
                  owner: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_Repay",
                sender: client.account.address,
                address: morpho,
                args: {
                  id,
                  assets: loanAssets / 4n,
                  onBehalf: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: re7Weth.address,
                args: {
                  assets: loanAssets / 4n,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              supportsSignature: false,
              unwrapTokens: new Set([wNative]),
              onBundleTx: async (data) => {
                await donate(
                  client,
                  wNative,
                  parseEther("0.5"),
                  bbEth.address,
                  morpho,
                )(data);
                await donate(
                  client,
                  wNative,
                  parseEther("0.5"),
                  re7Weth.address,
                  morpho,
                )(data);
              },
            },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: bbEth.address, data: expect.any(String) },
              args: [bbEth.address, bundler, expect.any(BigInt)],
            },
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, bundler, loanAssets / 2n],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [bundler, true],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: bbEth.address,
              args: {
                spender: bundler,
                nonce: 0n,
                amount: expect.any(BigInt),
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: loanAssets / 2n,
                spender: bundler,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: loanAssets / 2n,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Blue_Repay",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets: loanAssets / 2n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets: collateralAssets / 2n,
                onBehalf: client.account.address,
                receiver: client.account.address,
              },
            },
            {
              type: "MetaMorpho_Withdraw",
              sender: bundler,
              address: bbEth.address,
              args: {
                assets: loanAssets / 2n,
                owner: client.account.address,
                receiver: bundler,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_Repay",
              sender: bundler,
              address: morpho,
              args: {
                id,
                assets: loanAssets / 4n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: re7Weth.address,
              args: {
                assets: loanAssets / 4n,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);
        },
      );

      test[ChainId.EthMainnet](
        "should borrow USDC with shared liquidity and reallocation fee + unwrap remaining WETH",
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

          const bbUsdcFee = parseEther("0.002");

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
            functionName: "setFee",
            args: [bbUsdc.address, bbUsdcFee],
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
                    maxOut: parseUnits("100000", 6),
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

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const loanAssets = data
            .getMarketPublicReallocations(id)
            .data.getMarket(id).liquidity;

          const { operations, bundle } = await setupBundle(
            client,
            data,
            [
              {
                type: "MetaMorpho_Deposit",
                sender: client.account.address,
                address: bbEth.address,
                args: {
                  assets: depositAssets,
                  owner: donator.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
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
                  assets: loanAssets,
                  onBehalf: client.account.address,
                  receiver: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            {
              supportsSignature: false,
              unwrapTokens: new Set([wNative]),
            },
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wstEth, data: expect.any(String) },
              args: [wstEth, bundler, collateralAssets],
            },
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, bundler, depositAssets],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [bundler, true],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
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
                amount: collateralAssets,
                spender: bundler,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: depositAssets,
                spender: bundler,
                expiration: expect.any(BigInt),
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
              type: "Erc20_Transfer",
              sender: client.account.address,
              address: NATIVE_ADDRESS,
              args: {
                amount: bbUsdcFee,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: depositAssets,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: bundler,
              address: bbEth.address,
              args: {
                assets: depositAssets,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
                    assets: parseUnits("100000", 6),
                  },
                ],
                supplyMarketId: id,
              },
            },
            {
              type: "MetaMorpho_PublicReallocate",
              sender: bundler,
              address: steakUsdc.address,
              args: {
                withdrawals: [
                  {
                    id: usdc_wbtc.id,
                    assets: parseUnits("10000", 6),
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
                assets: loanAssets,
                onBehalf: client.account.address,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(await client.balanceOf({ erc20: usdc })).toBe(loanAssets);

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bundler }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bbEth.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should close a WETH/wstETH position + unwrap wstEth + skim WETH",
        async ({ client, config }) => {
          const collateralAmount = parseEther("1");
          const borrowAmount = parseEther("0.5");

          await client.deal({ erc20: wstEth, amount: collateralAmount });
          await client.deal({ erc20: stEth, amount: 0n });

          await client.approve({ address: wstEth, args: [morpho, maxUint256] });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [eth_wstEth, collateralAmount, client.account.address, "0x"],
          });

          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "borrow",
            args: [
              eth_wstEth,
              borrowAmount,
              0n,
              client.account.address,
              client.account.address,
            ],
          });

          const extraWethAmount = parseEther("0.1");

          await client.deal({
            erc20: wNative,
            amount: borrowAmount + extraWethAmount,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [eth_wstEth.id],
              users: [client.account.address, bundler],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const position = data.getAccrualPosition(
            client.account.address,
            eth_wstEth.id,
          );

          const { operations, bundle } = await setupBundle(
            client,
            data,
            [
              {
                type: "Blue_Repay",
                sender: client.account.address,
                address: morpho,
                args: {
                  id: eth_wstEth.id,
                  shares: position.borrowShares,
                  onBehalf: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_WithdrawCollateral",
                sender: client.account.address,
                address: morpho,
                args: {
                  id: eth_wstEth.id,
                  assets: position.collateral,
                  receiver: client.account.address,
                  onBehalf: client.account.address,
                },
              },
            ],
            { supportsSignature: false, unwrapTokens: new Set([wstEth]) },
          );

          const repayAmount = MathLib.wMulUp(
            position.borrowAssets,
            MathLib.WAD + DEFAULT_SLIPPAGE_TOLERANCE,
          );

          expect(bundle.requirements.signatures).toStrictEqual([]);

          expect(bundle.requirements.txs).toStrictEqual([
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, bundler, expect.any(BigInt)],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [bundler, true],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Approve",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: MathLib.MAX_UINT_160,
                spender: permit2,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: wNative,
              args: {
                amount: repayAmount,
                spender: bundler,
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: bundler,
              address: wNative,
              args: {
                amount: repayAmount,
                from: client.account.address,
                to: bundler,
              },
            },
            {
              type: "Blue_Repay",
              sender: bundler,
              address: morpho,
              args: {
                id: eth_wstEth.id,
                shares: position.borrowShares,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: bundler,
              address: morpho,
              args: {
                id: eth_wstEth.id,
                assets: position.collateral,
                receiver: bundler,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Unwrap",
              address: wstEth,
              sender: bundler,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              address: wNative,
              sender: bundler,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              address: stEth,
              sender: bundler,
              args: {
                amount: maxUint256,
                from: bundler,
                to: client.account.address,
              },
            },
          ]);

          const chainPosition = await fetchPosition(
            client.account.address,
            eth_wstEth.id,
            client,
          );

          const wstEthToken = data.getWrappedToken(wstEth);

          const latestBlock = await client.getBlock();

          const accruedInterests =
            position.accrueInterest(latestBlock.timestamp).borrowAssets -
            borrowAmount;

          expect(chainPosition.collateral).toBe(0n);
          expect(chainPosition.supplyShares).toBe(0n);
          expect(chainPosition.borrowShares).toBe(0n);

          expect(
            await client.balanceOf({ erc20: wstEth, owner: bundler }),
          ).toBe(0n);
          expect(await client.balanceOf({ erc20: stEth, owner: bundler })).toBe(
            1n,
          ); // 1 stETH is always remaining in the bundler
          expect(
            await client.balanceOf({ erc20: wNative, owner: bundler }),
          ).toBe(0n);

          expect(await client.balanceOf({ erc20: stEth })).toBe(
            wstEthToken.toUnwrappedExactAmountIn(collateralAmount, 0n) - 2n,
          );
          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(await client.balanceOf({ erc20: wNative })).toBe(
            extraWethAmount - accruedInterests,
          ); // we normally didn't experienced any slippage
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
