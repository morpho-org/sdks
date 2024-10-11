import {
  ChainId,
  DEFAULT_SLIPPAGE_TOLERANCE,
  MarketConfig,
  MathLib,
  NATIVE_ADDRESS,
  addresses,
} from "@morpho-org/blue-sdk";

import { blueAbi, fetchPosition } from "@morpho-org/blue-sdk-viem";
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
  describe("without signatures", () => {
    describe("ethereum", () => {
      const { morpho, permit2, bundler, wNative, wstEth, stEth } =
        addresses[ChainId.EthMainnet];
      const { eth_wstEth } = markets[ChainId.EthMainnet];
      const { steakUsdc } = vaults[ChainId.EthMainnet];

      test[ChainId.EthMainnet](
        "should fail if balance exceeded",
        async ({ client, config }) => {
          const id = eth_wstEth.id;

          const wBalance = parseEther("5000");
          const balance = await client.getBalance(client.account);
          await client.deal({
            erc20: wNative,
            recipient: client.account.address,
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
            recipient: client.account.address,
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
        async () => {
          const id = MAINNET_MARKETS.usdc_wstEth.id;
          bundlerService.simulationService.metaMorphoService.addMarkets(id);

          const blue = Morpho__factory.connect(morpho, signer);
          const erc20 = ERC20__factory.connect(wstEth, signer);

          const collateral = parseUnits("50");
          const assets = parseUnits("13000", 6);
          await deal(wstEth, signer.address, collateral);
          await erc20.approve(morpho, MaxUint256);
          await blue.supplyCollateral(
            MAINNET_MARKETS.usdc_wstEth,
            collateral,
            signer.address,
            "0x",
          );
          await mine();

          const { operations, bundle } = await setupBundle(
            bundlerService,
            signer,
            [
              {
                type: "Blue_Borrow",
                sender: signer.address,
                address: morpho,
                args: {
                  id,
                  assets,
                  onBehalf: signer.address,
                  receiver: signer.address,
                  slippage: DEFAULT_SLIPPAGE_TOLERANCE,
                },
              },
            ],
          );

          expect(operations.length).to.equal(2);
          expect(bundle.requirements.txs.length).to.equal(1);
          expect(bundle.requirements.signatures.length).to.equal(0);

          expect(bundle.requirements.txs[0]!.type).to.equal(
            "morphoSetAuthorization",
          );
          expect(bundle.requirements.txs[0]!.args).to.eql([bundler, true]);

          expect(operations[0]).to.eql({
            type: "Blue_SetAuthorization",
            sender: bundler,
            address: morpho,
            args: {
              owner: signer.address,
              isBundlerAuthorized: true,
            },
          });
          expect(operations[1]).to.eql({
            type: "Blue_Borrow",
            sender: bundler,
            address: morpho,
            args: {
              id,
              assets,
              onBehalf: signer.address,
              receiver: signer.address,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          });

          const market = await blue.market(id);
          const position = await blue.position(id, signer.address);

          expect(await erc20.balanceOf(signer.address)).to.equal(0);
          expect(position.collateral).to.equal(collateral);
          expect(position.supplyShares).to.equal(0);
          expect(
            MarketUtils.toBorrowAssets(position.borrowShares, market),
          ).to.equal(assets + 1n);

          expect(await erc20.allowance(signer.address, permit2)).to.equal(0);
          expect(await erc20.allowance(signer.address, bundler)).to.equal(0);
          expect(
            await erc20.allowance(signer.address, steakUsdc.address),
          ).to.equal(0);
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
