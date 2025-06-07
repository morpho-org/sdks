import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketParams,
  MathLib,
  NATIVE_ADDRESS,
  addressesRegistry,
} from "@morpho-org/blue-sdk";

import {
  blueAbi,
  fetchMarket,
  fetchPosition,
  metaMorphoAbi,
  publicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { markets, vaults } from "@morpho-org/morpho-test";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { renderHook, waitFor } from "@morpho-org/test-wagmi";
import { configure } from "@testing-library/dom";
import {
  formatUnits,
  maxUint256,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { describe, expect } from "vitest";
import { donate, donator, setupTestBundle } from "./helpers.js";
import { test } from "./setup.js";

configure({ asyncUtilTimeout: 10_000 });

describe("populateBundle", () => {
  describe("with signatures", () => {
    describe("ethereum", () => {
      const {
        morpho,
        permit2,
        bundler3: { bundler3, generalAdapter1 },
        publicAllocator,
        wNative,
        wstEth,
        stEth,
        usdc,
        usdt,
        dai,
      } = addressesRegistry[ChainId.EthMainnet];
      const { eth_wstEth, usdc_wstEth, usdc_wbtc, dai_sUsde } =
        markets[ChainId.EthMainnet];
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
              users: [client.account.address, generalAdapter1],
              tokens: [wNative],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const assets = balance + wBalance + 1n;

          await expect(
            setupTestBundle(client, result.current.data!, [
              {
                type: "Blue_Supply",
                sender: client.account.address,
                args: {
                  id,
                  assets,
                  onBehalf: client.account.address,
                },
              },
            ]),
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `
            [Error: insufficient balance of user "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" for token "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

            when simulating operation:
            {
              "type": "Erc20_Transfer2",
              "sender": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0",
              "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              "args": {
                "amount": "15000000000000000000001",
                "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                "to": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0"
              }
            }]
          `,
          );
        },
      );

      test[ChainId.EthMainnet](
        "should supply DAI via permit",
        async ({ client, config }) => {
          const id = dai_sUsde.id;

          const assets = parseEther("55873.253");
          await client.deal({
            erc20: dai,
            amount: assets,
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, generalAdapter1],
              tokens: [NATIVE_ADDRESS, dai, dai_sUsde.collateralToken],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(client, data, [
            {
              type: "Blue_Supply",
              sender: client.account.address,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(bundle.requirements.signatures.length).toBe(2);

          expect(bundle.requirements.txs).toStrictEqual([]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: dai,
              args: {
                amount: assets,
                spender: generalAdapter1,
                nonce: 3n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: dai,
              args: {
                amount: assets,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Blue_Supply",
              sender: generalAdapter1,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: dai,
              args: {
                amount: 0n,
                spender: generalAdapter1,
                nonce: 4n,
              },
            },
          ]);

          const position = await fetchPosition(
            client.account.address,
            id,
            client,
          );

          expect(
            formatUnits(await client.balanceOf({ erc20: dai }), 18),
          ).toBeCloseTo(0, 8);
          expect(position.collateral).toBe(0n);
          expect(position.supplyShares).toBe(50490517487541493285419804234n);
          expect(position.borrowShares).toBe(0n);

          expect(await client.allowance({ erc20: dai, spender: permit2 })).toBe(
            0n,
          );
          expect(
            await client.allowance({ erc20: dai, spender: generalAdapter1 }),
          ).toBe(0n);
          expect(await client.allowance({ erc20: dai, spender: morpho })).toBe(
            0n,
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
              users: [client.account.address, generalAdapter1],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { balance } = data.getHolding(client.account.address, stEth);
          const { balance: bundlerBalance } = data.getHolding(
            generalAdapter1,
            stEth,
          );

          const wstEthToken = data.getWrappedToken(wstEth);
          const assets =
            wstEthToken.toWrappedExactAmountIn(
              balance,
              DEFAULT_SLIPPAGE_TOLERANCE,
            ) + wBalance;

          const { operations, bundle } = await setupTestBundle(client, data, [
            {
              type: "Erc20_Wrap",
              sender: client.account.address,
              address: wstEth,
              args: {
                amount: balance,
                owner: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: client.account.address,
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
                spender: generalAdapter1,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: wstEth,
              args: {
                amount: wBalance,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Erc20_Wrap",
              sender: generalAdapter1,
              address: wstEth,
              args: {
                amount: balance,
                owner: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: generalAdapter1,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: wstEth,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
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
            formatUnits(await client.balanceOf({ erc20: stEth }), 18),
          ).toBeCloseTo(0, 8);
          expect(position.collateral).toBe(assets);
          expect(position.supplyShares).toBe(0n);
          expect(position.borrowShares).toBe(0n);

          expect(
            await client.allowance({ erc20: stEth, spender: permit2 }),
          ).toBe(MathLib.MAX_UINT_160 - (balance - bundlerBalance));
          expect(
            await client.allowance({ erc20: stEth, spender: generalAdapter1 }),
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
              users: [client.account.address, generalAdapter1],
              tokens: [usdc, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(client, data, [
            {
              type: "Blue_Borrow",
              sender: client.account.address,
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
            await client.allowance({ erc20: wstEth, spender: generalAdapter1 }),
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
              marketIds: [],
              users: [
                client.account.address,
                generalAdapter1,
                steakUsdc.address,
              ],
              tokens: [usdc, steakUsdc.address],
              vaults: [steakUsdc.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(client, data, [
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
                spender: generalAdapter1,
                nonce: 1n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: usdc,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
            await client.allowance({ erc20: usdc, spender: generalAdapter1 }),
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
              marketIds: [],
              users: [client.account.address, generalAdapter1, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(client, data, [
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
            await client.allowance({ erc20: usdt, spender: generalAdapter1 }),
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

          const marketParams = new MarketParams({
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
            args: [{ ...marketParams }],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [marketParams.id],
              users: [client.account.address, generalAdapter1, bbUsdt.address],
              tokens: [usdt, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(client, data, [
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
              args: {
                id: marketParams.id,
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: generalAdapter1,
              args: {
                id: marketParams.id,
                assets: maxUint256,
                onBehalf: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(await client.balanceOf({ erc20: bbUsdt.address })).toBe(0n);

          const { collateral } = await fetchPosition(
            client.account.address,
            marketParams.id,
            client,
          );
          expect(formatUnits(collateral, 18)).toBeCloseTo(
            Number(formatUnits(expectedShares, 18)),
            1,
          );

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(MathLib.MAX_UINT_160 - amount);
          expect(
            await client.allowance({ erc20: usdt, spender: generalAdapter1 }),
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

          const marketParams = new MarketParams({
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
            args: [{ ...marketParams }],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [marketParams.id],
              users: [client.account.address, generalAdapter1, bbUsdt.address],
              tokens: [usdt, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(client, data, [
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
              args: {
                id: marketParams.id,
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: generalAdapter1,
              args: {
                id: marketParams.id,
                assets: shares,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: bbUsdt.address,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(
            formatUnits(await client.balanceOf({ erc20: bbUsdt.address }), 18),
          ).toBeCloseTo(Number(formatUnits(expectedShares - shares, 18)), 1);

          const { collateral } = await fetchPosition(
            client.account.address,
            marketParams.id,
            client,
          );
          expect(collateral).toBe(shares);

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(MathLib.MAX_UINT_160 - amount);
          expect(
            await client.allowance({ erc20: usdt, spender: generalAdapter1 }),
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
              marketIds: [],
              users: [client.account.address, generalAdapter1, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
                parseEther("0.3"),
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
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: expect.any(BigInt),
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
          ]);

          expect(
            await client.balanceOf({ erc20: wNative, owner: generalAdapter1 }),
          ).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);
          expect(
            formatUnits(await client.balanceOf({ erc20: wNative }), 18),
          ).toBeCloseTo(10, 1);

          expect(
            await client.allowance({ erc20: wNative, spender: permit2 }),
          ).not.toBe(0n);
          expect(
            await client.allowance({
              erc20: wNative,
              spender: generalAdapter1,
            }),
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
              marketIds: [],
              users: [client.account.address, generalAdapter1, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          await expect(
            setupTestBundle(
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
                  parseEther("0.4"), // This donation induces a slippage slightly bigger than DEFAULT_SLIPPAGE_TOLERANCE
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
          const loanShares = parseUnits("50000", 12);
          const loanAssets = (await fetchMarket(id, client)).toBorrowAssets(
            loanShares,
          );
          await client.deal({ erc20: wstEth, amount: collateralAssets });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [
                client.account.address,
                generalAdapter1,
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

          const { operations, bundle } = await setupTestBundle(
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
                shares: loanShares,
                onBehalf: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: steakUsdc.address,
              args: {
                assets: loanAssets / 2n,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: usdc,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(
            formatUnits(await client.balanceOf({ erc20: usdc }), 6),
          ).toBeCloseTo(Number(formatUnits(loanAssets / 2n, 6)), -1);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: generalAdapter1 }),
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
          await client.deal({ erc20: wNative, amount: 2n * loanAssets });
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
          await client.approve({
            address: wNative,
            args: [morpho, maxUint256],
          });
          await client.writeContract({
            abi: blueAbi,
            address: morpho,
            functionName: "supply",
            args: [eth_wstEth, loanAssets, 0n, client.account.address, "0x"],
          });

          const shares = await client.balanceOf({ erc20: bbEth.address });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, generalAdapter1, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
                parseEther("0.2"),
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
                spender: generalAdapter1,
                nonce: 0n,
              },
            },
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
              type: "MetaMorpho_Withdraw",
              sender: generalAdapter1,
              address: bbEth.address,
              args: {
                shares,
                owner: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
                assets: loanAssets,
                onBehalf: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: bbEth.address,
              args: {
                assets: loanAssets,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Unwrap",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: NATIVE_ADDRESS,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
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
          await client.deal({ erc20: wNative, amount: 2n * loanAssets });
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
          await client.approve({
            address: wNative,
            args: [morpho, maxUint256],
          });
          await client.writeContract({
            abi: blueAbi,
            address: morpho,
            functionName: "supply",
            args: [eth_wstEth, loanAssets, 0n, client.account.address, "0x"],
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
              { ...eth_wstEth },
              loanAssets,
              0n,
              client.account.address,
              client.account.address,
            ],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [
                client.account.address,
                generalAdapter1,
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

          await waitFor(
            () => expect(result.current.isFetchingAny).toBeFalsy(),
            { timeout: 60_000 },
          );

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Blue_Repay",
                sender: client.account.address,
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
                spender: generalAdapter1,
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: loanAssets / 2n,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Blue_Repay",
              sender: generalAdapter1,
              args: {
                id,
                assets: loanAssets / 2n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: generalAdapter1,
              args: {
                id,
                assets: collateralAssets / 2n,
                onBehalf: client.account.address,
                receiver: client.account.address,
              },
            },
            {
              type: "MetaMorpho_Withdraw",
              sender: generalAdapter1,
              address: bbEth.address,
              args: {
                assets: loanAssets / 2n,
                owner: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_Repay",
              sender: generalAdapter1,
              args: {
                id,
                assets: loanAssets / 4n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
          await client.deal({ erc20: wstEth, amount: collateralAssets });
          await client.approve({
            address: wstEth,
            args: [morpho, collateralAssets],
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [usdc_wstEth, collateralAssets, client.account.address, "0x"],
          });

          const { id } = usdc_wstEth;

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [
                client.account.address,
                donator.address,
                bundler3,
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

          await waitFor(
            () => expect(result.current.isFetchingAny).toBeFalsy(),
            { timeout: 30_000 },
          );

          const data = result.current.data!;

          const loanAssets = data
            .getMarketPublicReallocations(id)
            .data.getMarket(id).liquidity;

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Blue_Borrow",
                sender: client.account.address,
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

          expect(bundle.requirements.signatures.length).toBe(1);

          expect(bundle.requirements.txs).toStrictEqual([]);

          expect(operations).toStrictEqual([
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
              type: "Erc20_Transfer",
              sender: client.account.address,
              address: NATIVE_ADDRESS,
              args: {
                amount: bbUsdcFee,
                from: client.account.address,
                to: bundler3,
              },
            },
            {
              type: "MetaMorpho_PublicReallocate",
              sender: bundler3,
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
              type: "MetaMorpho_PublicReallocate",
              sender: bundler3,
              address: bbUsdc.address,
              args: {
                withdrawals: [
                  {
                    id: "0x3bb29b62affbedc60b8446b235aaa349d5e3bad96c09bca1d7a2d693c06669aa",
                    assets: 885632974n,
                  },
                  {
                    id: "0xdcfd3558f75a13a3c430ee71df056b5570cbd628da91e33c27eec7c42603247b",
                    assets: 5708100889n,
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
            await client.allowance({ erc20: wstEth, spender: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: generalAdapter1 }),
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
          await client.deal({ erc20: wNative, amount: borrowAmount });

          await client.approve({ address: wstEth, args: [morpho, maxUint256] });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [eth_wstEth, collateralAmount, client.account.address, "0x"],
          });

          await client.approve({
            address: wNative,
            args: [morpho, maxUint256],
          });
          await client.writeContract({
            abi: blueAbi,
            address: morpho,
            functionName: "supply",
            args: [eth_wstEth, borrowAmount, 0n, client.account.address, "0x"],
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "borrow",
            args: [
              { ...eth_wstEth },
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
              users: [client.account.address, generalAdapter1],
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

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Blue_Repay",
                sender: client.account.address,
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
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: repayAmount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Blue_Repay",
              sender: generalAdapter1,
              args: {
                id: eth_wstEth.id,
                shares: position.borrowShares,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: generalAdapter1,
              args: {
                id: eth_wstEth.id,
                assets: position.collateral,
                receiver: generalAdapter1,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Unwrap",
              address: wstEth,
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              address: wNative,
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              address: stEth,
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
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
          expect(chainPosition.borrowShares).toBe(0n);

          expect(
            await client.balanceOf({ erc20: wstEth, owner: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.balanceOf({ erc20: stEth, owner: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.balanceOf({ erc20: wNative, owner: generalAdapter1 }),
          ).toBe(0n);

          expect(await client.balanceOf({ erc20: stEth })).toBe(
            wstEthToken.toUnwrappedExactAmountIn(collateralAmount, 0n) - 1n,
          );
          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(await client.balanceOf({ erc20: wNative })).toBe(
            extraWethAmount - accruedInterests,
          ); // should not have experienced any slippage
        },
      );
    });
  });

  describe("without signatures", () => {
    describe("ethereum", () => {
      const {
        morpho,
        permit2,
        bundler3: { bundler3, generalAdapter1 },
        publicAllocator,
        wNative,
        wstEth,
        stEth,
        usdc,
        usdt,
      } = addressesRegistry[ChainId.EthMainnet];
      const { eth_wstEth, eth_wstEth_2, usdc_wstEth, usdc_wbtc } =
        markets[ChainId.EthMainnet];
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
              users: [client.account.address, generalAdapter1],
              tokens: [wNative],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const assets = balance + wBalance + 1n;

          await expect(
            setupTestBundle(
              client,
              result.current.data!,
              [
                {
                  type: "Blue_Supply",
                  sender: client.account.address,
                  args: {
                    id,
                    assets,
                    onBehalf: client.account.address,
                  },
                },
              ],
              { supportsSignature: false },
            ),
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `
            [Error: insufficient balance of user "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" for token "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

            when simulating operation:
            {
              "type": "Erc20_Transfer2",
              "sender": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0",
              "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              "args": {
                "amount": "15000000000000000000001",
                "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                "to": "0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0"
              }
            }]
          `,
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
              users: [client.account.address, generalAdapter1],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { balance } = data.getHolding(client.account.address, stEth);
          const { balance: bundlerBalance } = data.getHolding(
            generalAdapter1,
            stEth,
          );

          const wstEthToken = data.getWrappedToken(wstEth);
          const assets =
            wstEthToken.toWrappedExactAmountIn(
              balance,
              DEFAULT_SLIPPAGE_TOLERANCE,
            ) + wBalance;

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Erc20_Wrap",
                sender: client.account.address,
                address: wstEth,
                args: {
                  amount: balance,
                  owner: generalAdapter1,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_SupplyCollateral",
                sender: client.account.address,
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
              args: [wstEth, generalAdapter1, wBalance],
            },
            {
              type: "erc20Approve",
              tx: { to: stEth, data: expect.any(String) },
              args: [stEth, generalAdapter1, balance - bundlerBalance],
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
                spender: generalAdapter1,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Permit2",
              sender: client.account.address,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: wstEth,
              args: {
                amount: wBalance,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: stEth,
              args: {
                amount: balance - bundlerBalance,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Erc20_Wrap",
              sender: generalAdapter1,
              address: wstEth,
              args: {
                amount: balance,
                owner: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: generalAdapter1,
              args: {
                id,
                assets,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: wstEth,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
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
            formatUnits(await client.balanceOf({ erc20: stEth }), 18),
          ).toBeCloseTo(0, 8);
          expect(position.collateral).toBe(assets);
          expect(position.supplyShares).toBe(0n);
          expect(position.borrowShares).toBe(0n);

          expect(
            await client.allowance({ erc20: stEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: stEth, spender: generalAdapter1 }),
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
              users: [client.account.address, generalAdapter1],
              tokens: [usdc, stEth, wstEth],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Blue_Borrow",
                sender: client.account.address,
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
              args: [generalAdapter1, true],
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
            await client.allowance({ erc20: wstEth, spender: generalAdapter1 }),
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
              marketIds: [],
              users: [
                client.account.address,
                generalAdapter1,
                steakUsdc.address,
              ],
              tokens: [usdc, stEth, wstEth, steakUsdc.address],
              vaults: [steakUsdc.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
              args: [usdc, generalAdapter1, amount],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: usdc,
              args: {
                amount,
                spender: generalAdapter1,
                nonce: 1n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: usdc,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
            await client.allowance({ erc20: usdc, spender: generalAdapter1 }),
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
              marketIds: [],
              users: [client.account.address, generalAdapter1, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
              args: [usdt, generalAdapter1, amount],
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
            await client.allowance({ erc20: usdt, spender: generalAdapter1 }),
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

          const marketParams = new MarketParams({
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
            args: [{ ...marketParams }],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [marketParams.id],
              users: [client.account.address, generalAdapter1, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
                args: {
                  id: marketParams.id,
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
              args: [usdt, generalAdapter1, amount],
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: generalAdapter1,
              args: {
                id: marketParams.id,
                assets: maxUint256,
                onBehalf: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(await client.balanceOf({ erc20: bbUsdt.address })).toBe(0n);

          const { collateral } = await fetchPosition(
            client.account.address,
            marketParams.id,
            client,
          );
          expect(formatUnits(collateral, 18)).toBeCloseTo(
            Number(formatUnits(expectedShares, 18)),
            1,
          );

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: generalAdapter1 }),
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

          const marketParams = new MarketParams({
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
            args: [{ ...marketParams }],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [marketParams.id],
              users: [client.account.address, generalAdapter1, bbUsdt.address],
              tokens: [usdt, stEth, wstEth, bbUsdt.address],
              vaults: [bbUsdt.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
                args: {
                  id: marketParams.id,
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
              args: [usdt, generalAdapter1, amount],
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: usdt,
              args: {
                amount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: bbUsdt.address,
              args: {
                assets: amount,
                owner: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_SupplyCollateral",
              sender: generalAdapter1,
              args: {
                id: marketParams.id,
                assets: shares,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: bbUsdt.address,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: usdt })).toBe(0n);
          expect(
            formatUnits(await client.balanceOf({ erc20: bbUsdt.address }), 18),
          ).toBeCloseTo(Number(formatUnits(expectedShares - shares, 18)), 1);

          const { collateral } = await fetchPosition(
            client.account.address,
            marketParams.id,
            client,
          );
          expect(collateral).toBe(shares);

          expect(
            await client.allowance({ erc20: usdt, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdt, spender: generalAdapter1 }),
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
              marketIds: [],
              users: [client.account.address, generalAdapter1, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
                parseEther("0.3"),
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
              args: [wNative, generalAdapter1, expect.any(BigInt)],
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
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: expect.any(BigInt),
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
          ]);

          expect(
            await client.balanceOf({ erc20: wNative, owner: generalAdapter1 }),
          ).toBe(0n);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);
          expect(
            formatUnits(await client.balanceOf({ erc20: wNative }), 18),
          ).toBeCloseTo(10, 1);

          expect(
            await client.allowance({ erc20: wNative, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({
              erc20: wNative,
              spender: generalAdapter1,
            }),
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
              marketIds: [],
              users: [client.account.address, generalAdapter1, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          await expect(
            setupTestBundle(
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
                  parseEther("0.4"), // This donation induces a slippage slightly bigger than DEFAULT_SLIPPAGE_TOLERANCE
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
          const loanShares = parseUnits("50000", 12);
          const loanAssets = (await fetchMarket(id, client)).toBorrowAssets(
            loanShares,
          );
          await client.deal({ erc20: wstEth, amount: collateralAssets });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [
                client.account.address,
                generalAdapter1,
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

          const { operations, bundle } = await setupTestBundle(
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
              args: [wstEth, generalAdapter1, collateralAssets],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [generalAdapter1, true],
            },
          ]);

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
                shares: loanShares,
                onBehalf: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: steakUsdc.address,
              args: {
                assets: loanAssets / 2n,
                owner: donator.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: usdc,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
          ]);

          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(
            formatUnits(await client.balanceOf({ erc20: usdc }), 6),
          ).toBeCloseTo(Number(formatUnits(loanAssets / 2n, 6)), -1);
          expect(await client.maxWithdraw({ erc4626: bbEth.address })).toBe(0n);

          expect(
            await client.allowance({ erc20: wstEth, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: bbEth.address }),
          ).toBe(0n);
        },
      );

      test[ChainId.EthMainnet](
        "should redeem all bbETH with slippage + wstETH leverage into bbETH deposit & unwrap remaining WETH",
        async ({ client, config }) => {
          const id = eth_wstEth_2.id;

          const collateralAssets = parseEther("100");
          const loanAssets = parseEther("5");

          await client.deal({ erc20: wstEth, amount: collateralAssets });
          await client.deal({ erc20: wNative, amount: 2n * loanAssets });
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
          await client.approve({
            address: wNative,
            args: [morpho, maxUint256],
          });
          await client.writeContract({
            abi: blueAbi,
            address: morpho,
            functionName: "supply",
            args: [eth_wstEth, loanAssets, 0n, client.account.address, "0x"],
          });

          const shares = await client.balanceOf({ erc20: bbEth.address });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [client.account.address, generalAdapter1, bbEth.address],
              tokens: [NATIVE_ADDRESS, wNative, stEth, wstEth, bbEth.address],
              vaults: [bbEth.address],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
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
                parseEther("0.3"),
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
              args: [bbEth.address, generalAdapter1, shares],
            },
            {
              type: "erc20Approve",
              tx: { to: wstEth, data: expect.any(String) },
              args: [wstEth, generalAdapter1, collateralAssets],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [generalAdapter1, true],
            },
          ]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Permit",
              sender: client.account.address,
              address: bbEth.address,
              args: {
                amount: shares,
                spender: generalAdapter1,
                nonce: 0n,
              },
            },
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
              type: "MetaMorpho_Withdraw",
              sender: generalAdapter1,
              address: bbEth.address,
              args: {
                shares,
                owner: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
                assets: loanAssets,
                onBehalf: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
              address: bbEth.address,
              args: {
                assets: loanAssets,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Unwrap",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: NATIVE_ADDRESS,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
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
          await client.deal({ erc20: wNative, amount: 2n * loanAssets });
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
          await client.approve({
            address: wNative,
            args: [morpho, maxUint256],
          });
          await client.writeContract({
            abi: blueAbi,
            address: morpho,
            functionName: "supply",
            args: [eth_wstEth, loanAssets, 0n, client.account.address, "0x"],
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
              { ...eth_wstEth },
              loanAssets,
              0n,
              client.account.address,
              client.account.address,
            ],
          });

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [
                client.account.address,
                generalAdapter1,
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

          await waitFor(
            () => expect(result.current.isFetchingAny).toBeFalsy(),
            { timeout: 30_000 },
          );

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Blue_Repay",
                sender: client.account.address,
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
              args: [bbEth.address, generalAdapter1, expect.any(BigInt)],
            },
            {
              type: "erc20Approve",
              tx: { to: wNative, data: expect.any(String) },
              args: [wNative, generalAdapter1, loanAssets / 2n],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [generalAdapter1, true],
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
                spender: generalAdapter1,
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
                expiration: MathLib.MAX_UINT_48,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: loanAssets / 2n,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Blue_Repay",
              sender: generalAdapter1,
              args: {
                id,
                assets: loanAssets / 2n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: generalAdapter1,
              args: {
                id,
                assets: collateralAssets / 2n,
                onBehalf: client.account.address,
                receiver: client.account.address,
              },
            },
            {
              type: "MetaMorpho_Withdraw",
              sender: generalAdapter1,
              address: bbEth.address,
              args: {
                assets: loanAssets / 2n,
                owner: client.account.address,
                receiver: generalAdapter1,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Blue_Repay",
              sender: generalAdapter1,
              args: {
                id,
                assets: loanAssets / 4n,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "MetaMorpho_Deposit",
              sender: generalAdapter1,
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
          await client.deal({ erc20: wstEth, amount: collateralAssets });
          await client.approve({
            address: wstEth,
            args: [morpho, collateralAssets],
          });
          await client.writeContract({
            address: morpho,
            abi: blueAbi,
            functionName: "supplyCollateral",
            args: [usdc_wstEth, collateralAssets, client.account.address, "0x"],
          });

          const { id } = usdc_wstEth;

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [id],
              users: [
                client.account.address,
                donator.address,
                bundler3,
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

          await waitFor(
            () => expect(result.current.isFetchingAny).toBeFalsy(),
            { timeout: 30_000 },
          );

          const data = result.current.data!;

          const loanAssets = data
            .getMarketPublicReallocations(id)
            .data.getMarket(id).liquidity;

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Blue_Borrow",
                sender: client.account.address,
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
              type: "morphoSetAuthorization",
              args: [generalAdapter1, true],
              tx: {
                data: expect.any(String),
                to: morpho,
              },
            },
          ]);

          expect(operations).toStrictEqual([
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
              type: "Erc20_Transfer",
              sender: client.account.address,
              address: NATIVE_ADDRESS,
              args: {
                amount: bbUsdcFee,
                from: client.account.address,
                to: bundler3,
              },
            },
            {
              type: "MetaMorpho_PublicReallocate",
              sender: bundler3,
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
              type: "MetaMorpho_PublicReallocate",
              sender: bundler3,
              address: bbUsdc.address,
              args: {
                withdrawals: [
                  {
                    id: "0x3bb29b62affbedc60b8446b235aaa349d5e3bad96c09bca1d7a2d693c06669aa",
                    assets: 885632974n,
                  },
                  {
                    id: "0xdcfd3558f75a13a3c430ee71df056b5570cbd628da91e33c27eec7c42603247b",
                    assets: 5708100889n,
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
            await client.allowance({ erc20: wstEth, spender: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: wstEth, spender: bbEth.address }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: permit2 }),
          ).toBe(0n);
          expect(
            await client.allowance({ erc20: usdc, spender: generalAdapter1 }),
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
          await client.deal({ erc20: wNative, amount: borrowAmount });
          await client.deal({ erc20: stEth, amount: 0n });
          await client.approve({
            address: wNative,
            args: [morpho, maxUint256],
          });
          await client.writeContract({
            abi: blueAbi,
            address: morpho,
            functionName: "supply",
            args: [eth_wstEth, borrowAmount, 0n, client.account.address, "0x"],
          });

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
              { ...eth_wstEth },
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
              users: [client.account.address, generalAdapter1],
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

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Blue_Repay",
                sender: client.account.address,
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
              args: [wNative, generalAdapter1, expect.any(BigInt)],
            },
            {
              type: "morphoSetAuthorization",
              tx: { to: morpho, data: expect.any(String) },
              args: [generalAdapter1, true],
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
                expiration: expect.any(BigInt),
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer2",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: repayAmount,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Blue_Repay",
              sender: generalAdapter1,
              args: {
                id: eth_wstEth.id,
                shares: position.borrowShares,
                onBehalf: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
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
              type: "Blue_WithdrawCollateral",
              sender: generalAdapter1,
              args: {
                id: eth_wstEth.id,
                assets: position.collateral,
                receiver: generalAdapter1,
                onBehalf: client.account.address,
              },
            },
            {
              type: "Erc20_Unwrap",
              address: wstEth,
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                receiver: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              address: wNative,
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
                to: client.account.address,
              },
            },
            {
              type: "Erc20_Transfer",
              address: stEth,
              sender: generalAdapter1,
              args: {
                amount: maxUint256,
                from: generalAdapter1,
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
          expect(chainPosition.borrowShares).toBe(0n);

          expect(
            await client.balanceOf({ erc20: wstEth, owner: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.balanceOf({ erc20: stEth, owner: generalAdapter1 }),
          ).toBe(0n);
          expect(
            await client.balanceOf({ erc20: wNative, owner: generalAdapter1 }),
          ).toBe(0n);

          expect(await client.balanceOf({ erc20: stEth })).toBe(
            wstEthToken.toUnwrappedExactAmountIn(collateralAmount, 0n) - 1n,
          );
          expect(await client.balanceOf({ erc20: wstEth })).toBe(0n);
          expect(await client.balanceOf({ erc20: wNative })).toBe(
            extraWethAmount - accruedInterests,
          ); // we normally didn't experienced any slippage
        },
      );

      test[ChainId.EthMainnet](
        "should wrap ETH",
        async ({ client, config }) => {
          const assets = parseEther("1.234567");

          await client.deal({
            amount: assets,
          });

          const initialBalance = await client.balanceOf();

          const block = await client.getBlock();

          const { result } = await renderHook(config, () =>
            useSimulationState({
              marketIds: [],
              users: [client.account.address, generalAdapter1],
              tokens: [NATIVE_ADDRESS, wNative],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const data = result.current.data!;

          const { operations, bundle } = await setupTestBundle(
            client,
            data,
            [
              {
                type: "Erc20_Wrap",
                sender: client.account.address,
                address: wNative,
                args: {
                  amount: assets,
                  owner: client.account.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
            { gasPrice: 0n },
          );

          expect(bundle.requirements.signatures.length).toBe(0);

          expect(bundle.requirements.txs).toStrictEqual([]);

          expect(operations).toStrictEqual([
            {
              type: "Erc20_Transfer",
              sender: client.account.address,
              address: NATIVE_ADDRESS,
              args: {
                amount: assets,
                from: client.account.address,
                to: generalAdapter1,
              },
            },
            {
              type: "Erc20_Wrap",
              sender: generalAdapter1,
              address: wNative,
              args: {
                amount: assets,
                owner: client.account.address,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
          ]);

          expect(await client.balanceOf()).toBe(initialBalance - assets);
          expect(await client.balanceOf({ erc20: wNative })).toBe(assets);
        },
      );
    });

    describe("base", () => {
      const {
        morpho,
        bundler3: { generalAdapter1 },
        adaptiveCurveIrm,
        wNative,
        usdc,
        verUsdc,
      } = addressesRegistry[ChainId.BaseMainnet];

      test[ChainId.BaseMainnet]
        .skip("should wrap then supply verUSDC", async ({ client, config }) => {
          const marketParams = new MarketParams({
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
            args: [{ ...marketParams }],
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
              marketIds: [marketParams.id],
              users: [whitelisted, generalAdapter1],
              tokens: [usdc, verUsdc, wNative],
              vaults: [],
              block,
            }),
          );

          await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

          const { operations } = await setupTestBundle(
            client,
            result.current.data!,
            [
              {
                type: "Erc20_Wrap",
                sender: whitelisted,
                address: verUsdc,
                args: {
                  amount: assets,
                  owner: generalAdapter1,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
              {
                type: "Blue_Supply",
                sender: whitelisted,
                args: {
                  id: marketParams.id,
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
                spender: generalAdapter1,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Permit",
              sender: whitelisted,
              address: verUsdc,
              args: {
                amount: assets,
                spender: generalAdapter1,
                nonce: 0n,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: usdc,
              args: {
                amount: assets,
                from: whitelisted,
                to: generalAdapter1,
              },
            },
            {
              type: "Erc20_Wrap",
              sender: generalAdapter1,
              address: verUsdc,
              args: {
                amount: assets,
                owner: whitelisted,
                slippage: DEFAULT_SLIPPAGE_TOLERANCE,
              },
            },
            {
              type: "Erc20_Transfer",
              sender: generalAdapter1,
              address: verUsdc,
              args: {
                amount: assets,
                from: whitelisted,
                to: generalAdapter1,
              },
            },
            {
              type: "Blue_Supply",
              sender: generalAdapter1,
              args: {
                id: marketParams.id,
                assets,
                onBehalf: whitelisted,
              },
            },
          ]);

          const position = await fetchPosition(
            whitelisted,
            marketParams.id,
            client,
          );

          expect(position.collateral).toBe(0n);
          expect(position.supplyShares).toBe(assets * 1_000000n);
          expect(position.borrowShares).toBe(0n);
        });
    });
  });
});
