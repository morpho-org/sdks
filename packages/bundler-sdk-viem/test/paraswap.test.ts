import { ChainId, addressesRegistry } from "@morpho-org/blue-sdk";

import { fetchPosition } from "@morpho-org/blue-sdk-viem";
import { markets } from "@morpho-org/morpho-test";
import { useSimulationState } from "@morpho-org/simulation-sdk-wagmi";
import { createWagmiTest, renderHook, waitFor } from "@morpho-org/test-wagmi";
import { configure } from "@testing-library/dom";
import { formatUnits, maxUint160, parseUnits, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { setupTestBundle } from "./helpers.js";

configure({ asyncUtilTimeout: 10_000 });

const testLeverage = createWagmiTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 22_418_491,
});

describe("paraswap", () => {
  describe("with signatures", () => {
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
            address: morpho,
            args: {
              id,
              assets: balance * 3n,
              onBehalf: client.account.address,
              callback: [
                {
                  type: "Blue_Borrow",
                  sender: client.account.address,
                  address: morpho,
                  args: {
                    id,
                    assets: debt,
                    onBehalf: client.account.address,
                    receiver: client.account.address,
                  },
                },
                {
                  type: "Paraswap_Buy",
                  sender: client.account.address,
                  address: usdc_wbtc.collateralToken,
                  args: {
                    srcToken: usdc,
                    amount: balance * 2n,
                    // https://api.paraswap.io/swap?network=1&slippage=100&side=BUY&srcToken=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&destToken=0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599&amount=200000000&userAddress=0x03b5259Bd204BfD4A616E5B79b0B786d90c6C38f&version=6.2
                    swap: {
                      to: "0x6a000f20005980200259b80c5102003040001068",
                      data: "0x7f457675000000000000000000000000a0f408a000017007015e0f00320e470d00090a5b000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000002260fac5e5542a773aa44fbcfedf7c193bc2c5990000000000000000000000000000000000000000000000000000002c2de5311f000000000000000000000000000000000000000000000000000000000bebc2000000000000000000000000000000000000000000000000000000002bbdea86d035ccdf5bf4e8489ea680fbabfec9070d0000000000000000000000000156143b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000005200000016000000000000000000000012000000000000001370000000000001068e592427a0aece92de3edee1f18e0157c058615640140008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c51020030400010680000000000000000000000000000000000000000000000000000000068221688000000000000000000000000000000000000000000000000000000000501bd00000000000000000000000000000000000000000000000000000000125e767dd2000000000000000000000000000000000000000000000000000000000000002b2260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000180000000000000000000000120000000000000014e0000000000000960e592427a0aece92de3edee1f18e0157c058615640160008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c510200304000106800000000000000000000000000000000000000000000000000000000682216880000000000000000000000000000000000000000000000000000000002dc6c000000000000000000000000000000000000000000000000000000000a7f4e161200000000000000000000000000000000000000000000000000000000000000422260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4dac17f958d2ee523a2206206994597c13d831ec7000064a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000000000180000000000000000000000120000000000000014e0000000000000d48e592427a0aece92de3edee1f18e0157c058615640160008400a400000000000300000000000000000000000000000000000000000000000000000000f28c0498000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c5102003040001068000000000000000000000000000000000000000000000000000000006822168800000000000000000000000000000000000000000000000000000000040d99000000000000000000000000000000000000000000000000000000000ee025f2ec00000000000000000000000000000000000000000000000000000000000000422260fac5e5542a773aa44fbcfedf7c193bc2c5990001f4c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000000000000000",
                      offsets: {
                        exactAmount: 4n + 32n * 4n,
                        limitAmount: 4n + 32n * 3n,
                        quotedAmount: 4n + 32n * 5n,
                      },
                    },
                    receiver: client.account.address,
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

        const position = await fetchPosition(
          client.account.address,
          id,
          client,
        );

        expect(
          formatUnits(
            await client.balanceOf({ erc20: usdc_wbtc.collateralToken }),
            18,
          ),
        ).toBeCloseTo(0, 8);
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
            spender: generalAdapter1,
          }),
        ).toBe(0n);
        expect(
          await client.allowance({
            erc20: usdc_wbtc.collateralToken,
            spender: morpho,
          }),
        ).toBe(0n);
      });
    });
  });
});
