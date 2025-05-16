import { ChainId, addressesRegistry } from "@morpho-org/blue-sdk";

import { blueAbi, fetchPosition } from "@morpho-org/blue-sdk-viem";
import { markets } from "@morpho-org/morpho-test";
import { paraswapContractMethodOffsets } from "@morpho-org/simulation-sdk";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { createWagmiTest, renderHook, waitFor } from "@morpho-org/test-wagmi";
import { configure } from "@testing-library/dom";
import { maxUint160, maxUint256, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { donator, setupTestBundle } from "./helpers.js";

configure({ asyncUtilTimeout: 10_000 });

const testLeverage = createWagmiTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 22_418_491,
});

const testCloseCollateral = createWagmiTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 22_425_541,
});

const testDeleverageCollateral = createWagmiTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 22_465_879,
});

describe("paraswap", () => {
  describe("ethereum", () => {
    const {
      morpho,
      permit2,
      bundler3: { generalAdapter1 },
      usdc,
    } = addressesRegistry[ChainId.EthMainnet];
    const { usdc_wbtc } = markets[ChainId.EthMainnet];
    zeroAddress;

    testLeverage("should leverage WBTC/USDC", async ({ client, config }) => {
      const id = usdc_wbtc.id;

      const balance = parseUnits("1", 8);
      await client.deal({
        erc20: usdc_wbtc.collateralToken,
        amount: balance,
      });

      const block = await client.getBlock();

      const { result } = await renderHook(config, () =>
        useSimulationState({
          marketIds: [id],
          users: [client.account.address, generalAdapter1],
          tokens: [usdc_wbtc.collateralToken, usdc],
          vaults: [],
          block,
        }),
      );

      await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

      const debt = parseUnits("190000", 6);

      const { bundle } = await setupTestBundle(client, result.current.data!, [
        {
          type: "Blue_SupplyCollateral",
          sender: client.account.address,
          args: {
            id,
            assets: balance * 3n,
            onBehalf: client.account.address,
            callback: [
              {
                type: "Blue_Borrow",
                args: {
                  id,
                  assets: debt,
                  onBehalf: client.account.address,
                  receiver: generalAdapter1,
                },
              },
              {
                type: "Paraswap_Buy",
                address: usdc_wbtc.collateralToken,
                args: {
                  srcToken: usdc,
                  amount: balance * 2n,
                  // https://api.paraswap.io/swap?network=1&slippage=100&side=BUY&srcToken=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&destToken=0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599&amount=200000000&userAddress=0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f&version=6.2
                  swap: {
                    to: "0x6a000f20005980200259b80c5102003040001068",
                    data: "0x7f457675000000000000000000000000a0f408a000017007015e0f00320e470d00090a5b000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000002260fac5e5542a773aa44fbcfedf7c193bc2c5990000000000000000000000000000000000000000000000000000002c2de5311f000000000000000000000000000000000000000000000000000000000bebc2000000000000000000000000000000000000000000000000000000002bbdea86d035ccdf5bf4e8489ea680fbabfec9070d0000000000000000000000000156143b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000005200000016000000000000000000000012000000000000001370000000000001068e592427a0aece92de3edee1f18e0157c058615640140008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c51020030400010680000000000000000000000000000000000000000000000000000000068221688000000000000000000000000000000000000000000000000000000000501bd00000000000000000000000000000000000000000000000000000000125e767dd2000000000000000000000000000000000000000000000000000000000000002b2260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000180000000000000000000000120000000000000014e0000000000000960e592427a0aece92de3edee1f18e0157c058615640160008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c510200304000106800000000000000000000000000000000000000000000000000000000682216880000000000000000000000000000000000000000000000000000000002dc6c000000000000000000000000000000000000000000000000000000000a7f4e161200000000000000000000000000000000000000000000000000000000000000422260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4dac17f958d2ee523a2206206994597c13d831ec7000064a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000000000180000000000000000000000120000000000000014e0000000000000d48e592427a0aece92de3edee1f18e0157c058615640160008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c5102003040001068000000000000000000000000000000000000000000000000000000006822168800000000000000000000000000000000000000000000000000000000040d99000000000000000000000000000000000000000000000000000000000ee025f2ec00000000000000000000000000000000000000000000000000000000000000422260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000000",
                    offsets: paraswapContractMethodOffsets.swapExactAmountOut,
                  },
                  receiver: generalAdapter1,
                },
              },
            ],
          },
        },
      ]);

      expect(bundle.requirements.signatures).toStrictEqual([
        {
          action: {
            type: "approve2",
            args: [
              client.account.address,
              {
                details: {
                  amount: balance,
                  expiration: expect.any(Number),
                  nonce: 0,
                  token: usdc_wbtc.collateralToken,
                },
                sigDeadline: expect.any(BigInt),
              },
              expect.any(String),
              undefined,
            ],
          },
          sign: expect.any(Function),
        },
        {
          action: {
            type: "morphoSetAuthorizationWithSig",
            args: [
              {
                authorized: generalAdapter1,
                authorizer: client.account.address,
                deadline: expect.any(BigInt),
                isAuthorized: true,
                nonce: 0n,
              },
              expect.any(String),
              undefined,
            ],
          },
          sign: expect.any(Function),
        },
      ]);

      expect(bundle.requirements.txs).toStrictEqual([
        {
          type: "erc20Approve",
          args: [usdc_wbtc.collateralToken, permit2, maxUint160],
          tx: {
            to: usdc_wbtc.collateralToken,
            data: expect.any(String),
          },
        },
      ]);

      const position = await fetchPosition(client.account.address, id, client);

      expect(await client.balanceOf({ erc20: usdc_wbtc.collateralToken })).toBe(
        0n,
      );
      expect(position.collateral).toBe(3_00000000n);
      expect(position.supplyShares).toBe(0n);
      expect(position.borrowShares).toBe(173100968463978694n);

      expect(
        await client.allowance({
          erc20: usdc_wbtc.collateralToken,
          spender: permit2,
        }),
      ).toBe(maxUint160 - balance);
      expect(
        await client.allowance({
          erc20: usdc_wbtc.collateralToken,
          spender: morpho,
        }),
      ).toBe(0n);
    });

    testCloseCollateral(
      "should close position with collateral",
      async ({ client, config }) => {
        const id = usdc_wbtc.id;

        const collateral = parseUnits("3", 8);
        const debt = parseUnits("190000", 6);
        await client.deal({
          erc20: usdc_wbtc.collateralToken,
          amount: collateral,
        });
        await client.approve({
          address: usdc_wbtc.collateralToken,
          args: [morpho, collateral],
        });
        await client.writeContract({
          abi: blueAbi,
          address: morpho,
          functionName: "supplyCollateral",
          args: [usdc_wbtc, collateral, client.account.address, "0x"],
        });
        await client.writeContract({
          abi: blueAbi,
          address: morpho,
          functionName: "borrow",
          args: [
            { ...usdc_wbtc },
            debt,
            0n,
            client.account.address,
            donator.address,
          ],
        });

        const block = await client.getBlock();

        const { result } = await renderHook(config, () =>
          useSimulationState({
            marketIds: [id],
            users: [client.account.address, generalAdapter1],
            tokens: [usdc_wbtc.collateralToken, usdc],
            vaults: [],
            block,
          }),
        );

        await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

        const data = result.current.data!;
        const shares = data.getPosition(
          client.account.address,
          id,
        ).borrowShares;

        const { bundle } = await setupTestBundle(client, data, [
          {
            type: "Blue_FlashLoan",
            sender: client.account.address,
            args: {
              token: usdc_wbtc.collateralToken,
              assets: collateral,
              callback: [
                {
                  type: "Blue_Paraswap_BuyDebt",
                  args: {
                    id,
                    srcToken: usdc_wbtc.collateralToken,
                    // https://api.paraswap.io/swap?network=1&slippage=100&side=BUY&srcToken=0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599&destToken=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&amount=190000000000&userAddress=0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f&version=6.2
                    swap: {
                      to: "0x6a000f20005980200259b80c5102003040001068",
                      data: "0x7f457675000000000000000000000000a0f408a000017007015e0f00320e470d00090a5b0000000000000000000000002260fac5e5542a773aa44fbcfedf7c193bc2c599000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000c21dd730000000000000000000000000000000000000000000000000000002c3ce1ec00000000000000000000000000000000000000000000000000000000000c031d283c96d3db49e249a1a8f60208611603c100000000000000000000000001562fc5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000005200000016000000000000000000000012000000000000001370000000000000960e592427a0aece92de3edee1f18e0157c058615640140008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c510200304000106800000000000000000000000000000000000000000000000000000000682364560000000000000000000000000000000000000000000000000000000a9df8c8000000000000000000000000000000000000000000000000000000000002e204f0000000000000000000000000000000000000000000000000000000000000002ba0b86991c6218b36c1d19d4a2e9eb0ce3606eb480001f42260fac5e5542a773aa44fbcfedf7c193bc2c59900000000000000000000000000000000000000000000000180000000000000000000000120000000000000014e0000000000001130e592427a0aece92de3edee1f18e0157c058615640160008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c510200304000106800000000000000000000000000000000000000000000000000000000682364560000000000000000000000000000000000000000000000000000001376f2c4000000000000000000000000000000000000000000000000000000000005490d240000000000000000000000000000000000000000000000000000000000000042a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000064dac17f958d2ee523a2206206994597c13d831ec70001f42260fac5e5542a773aa44fbcfedf7c193bc2c59900000000000000000000000000000000000000000000000000000000000000000180000000000000000000000120000000000000014e0000000000000c80e592427a0aece92de3edee1f18e0157c058615640160008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c510200304000106800000000000000000000000000000000000000000000000000000000682364560000000000000000000000000000000000000000000000000000000e27f660000000000000000000000000000000000000000000000000000000000003d80b140000000000000000000000000000000000000000000000000000000000000042a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480001f4c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f42260fac5e5542a773aa44fbcfedf7c193bc2c599000000000000000000000000000000000000000000000000000000000000",
                      offsets: paraswapContractMethodOffsets.swapExactAmountOut,
                    },
                    onBehalf: client.account.address,
                    receiver: generalAdapter1,
                  },
                },
                {
                  type: "Blue_Repay",
                  args: {
                    id,
                    shares,
                    onBehalf: client.account.address,
                  },
                },
                {
                  type: "Blue_WithdrawCollateral",
                  args: {
                    id,
                    assets: collateral,
                    onBehalf: client.account.address,
                    receiver: generalAdapter1,
                  },
                },
              ],
            },
          },
        ]);

        expect(bundle.requirements.signatures).toStrictEqual([
          {
            action: {
              type: "morphoSetAuthorizationWithSig",
              args: [
                {
                  authorized: generalAdapter1,
                  authorizer: client.account.address,
                  deadline: expect.any(BigInt),
                  isAuthorized: true,
                  nonce: 0n,
                },
                expect.any(String),
                undefined,
              ],
            },
            sign: expect.any(Function),
          },
        ]);
        expect(bundle.requirements.txs).toStrictEqual([]);

        const position = await fetchPosition(
          client.account.address,
          id,
          client,
        );

        expect(
          await client.balanceOf({ erc20: usdc_wbtc.collateralToken }),
        ).toBe(98469334n);
        expect(position.collateral).toBe(0n);
        expect(position.supplyShares).toBe(0n);
        expect(position.borrowShares).toBe(0n);

        expect(
          await client.allowance({
            erc20: usdc_wbtc.collateralToken,
            spender: permit2,
          }),
        ).toBe(0n);
        expect(
          await client.allowance({
            erc20: usdc_wbtc.collateralToken,
            spender: morpho,
          }),
        ).toBe(0n);
      },
    );

    testDeleverageCollateral(
      "should deleverage with collateral",
      async ({ client, config }) => {
        const id = usdc_wbtc.id;

        const collateral = parseUnits("4", 8);
        const debt = parseUnits("190000", 6);
        await client.deal({
          erc20: usdc_wbtc.collateralToken,
          amount: collateral,
        });
        await client.approve({
          address: usdc_wbtc.collateralToken,
          args: [morpho, collateral],
        });
        await client.writeContract({
          abi: blueAbi,
          address: morpho,
          functionName: "supplyCollateral",
          args: [usdc_wbtc, collateral, client.account.address, "0x"],
        });
        await client.writeContract({
          abi: blueAbi,
          address: morpho,
          functionName: "borrow",
          args: [
            { ...usdc_wbtc },
            debt,
            0n,
            client.account.address,
            donator.address,
          ],
        });

        const block = await client.getBlock();

        const { result } = await renderHook(config, () =>
          useSimulationState({
            marketIds: [id],
            users: [client.account.address, generalAdapter1],
            tokens: [usdc_wbtc.collateralToken, usdc],
            vaults: [],
            block,
          }),
        );

        await waitFor(() => expect(result.current.isFetchingAny).toBeFalsy());

        const data = result.current.data!;

        const withdrawn = parseUnits("1.5", 8);

        const { bundle } = await setupTestBundle(client, data, [
          {
            type: "Blue_FlashLoan",
            sender: client.account.address,
            args: {
              token: usdc_wbtc.collateralToken,
              assets: withdrawn,
              callback: [
                {
                  type: "Paraswap_Sell",
                  address: usdc_wbtc.collateralToken,
                  args: {
                    dstToken: usdc,
                    // https://api.paraswap.io/swap?network=1&slippage=100&side=SELL&srcToken=0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599&destToken=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&amount=150000000&userAddress=0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f&version=6.2
                    swap: {
                      to: "0x6a000f20005980200259b80c5102003040001068",
                      data: "0xe3ead59e00000000000000000000000000c600b30fb0400701010f4b080409018b9006e00000000000000000000000002260fac5e5542a773aa44fbcfedf7c193bc2c599000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000008f0d180000000000000000000000000000000000000000000000000000000240b2a78af00000000000000000000000000000000000000000000000000000024685e9e1b5d2ea061acb04f0b96538d0fa0498f6f0000000000000000000000000156cd57000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000980000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000009800000000000000000000000000000016000000000000001200000000000001838e592427a0aece92de3edee1f18e0157c0586156400000140008400000000000300000000000000000000000000000000000000000000000000000000c04b8d59000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c510200304000106800000000000000000000000000000000000000000000000000000000682ae4ee00000000000000000000000000000000000000000000000000000000058b11400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b2260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000000000000000000060000000000000001200000000000000a28e592427a0aece92de3edee1f18e0157c0586156400000140008400ef0000000b00000000000000000000000000000000000000000000000000000000c04b8d59000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000c600b30fb0400701010f4b080409018b9006e000000000000000000000000000000000000000000000000000000000682ae4ee00000000000000000000000000000000000000000000000000000000025317c00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b2260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4dac17f958d2ee523a2206206994597c13d831ec700000000000000000000000000000000000000000066a9893cc07d91d95644aedd05d03f95e1dba8af0000048002e40000ff0000030000000000000000000000000000000000000000000000000000000024856bc30000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000380000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003060b0e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000026000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000976ee43e90000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000060000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000006a000f20005980200259b80c5102003040001068000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000180000000000000012000000000000004b0e592427a0aece92de3edee1f18e0157c0586156400000160008400000000000300000000000000000000000000000000000000000000000000000000c04b8d59000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c510200304000106800000000000000000000000000000000000000000000000000000000682ae4ee000000000000000000000000000000000000000000000000000000000112a880000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000422260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000000",
                      offsets: paraswapContractMethodOffsets.swapExactAmountIn,
                    },
                    sellEntireBalance: true,
                    receiver: generalAdapter1,
                  },
                },
                {
                  type: "Blue_Repay",
                  args: {
                    id,
                    assets: maxUint256,
                    onBehalf: client.account.address,
                  },
                },
                {
                  type: "Blue_WithdrawCollateral",
                  args: {
                    id,
                    assets: withdrawn,
                    onBehalf: client.account.address,
                    receiver: generalAdapter1,
                  },
                },
              ],
            },
          },
        ]);

        expect(bundle.requirements.signatures).toStrictEqual([
          {
            action: {
              type: "morphoSetAuthorizationWithSig",
              args: [
                {
                  authorized: generalAdapter1,
                  authorizer: client.account.address,
                  deadline: expect.any(BigInt),
                  isAuthorized: true,
                  nonce: 0n,
                },
                expect.any(String),
                undefined,
              ],
            },
            sign: expect.any(Function),
          },
        ]);
        expect(bundle.requirements.txs).toStrictEqual([]);

        const position = await fetchPosition(
          client.account.address,
          id,
          client,
        );

        expect(
          await client.balanceOf({ erc20: usdc_wbtc.collateralToken }),
        ).toBe(0n);
        expect(position.collateral).toBe(collateral - withdrawn);
        expect(position.supplyShares).toBe(0n);
        expect(position.borrowShares).toBe(30615135298059917n);

        expect(
          await client.allowance({
            erc20: usdc_wbtc.collateralToken,
            spender: permit2,
          }),
        ).toBe(0n);
        expect(
          await client.allowance({
            erc20: usdc_wbtc.collateralToken,
            spender: morpho,
          }),
        ).toBe(0n);
      },
    );
  });
});
