import { ChainId, Holding, addressesRegistry } from "@gfxlabs/blue-sdk";
import { SimulationState } from "@gfxlabs/simulation-sdk";
import { concat, maxUint256, padHex, parseUnits, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { encodeOperation } from "../src/actions.js";

const {
  bundler3: { generalAdapter1, paraswapAdapter },
} = addressesRegistry[ChainId.EthMainnet];

const srcToken = "0x1111111111111111111111111111111111111111";
const dstToken = "0x2222222222222222222222222222222222222222";

const amount = parseUnits("1", 6);
const quotedAmount = parseUnits("1", 18);

const makeMinimalState = (sender: string, balance: bigint) =>
  new SimulationState({
    chainId: ChainId.EthMainnet,
    block: { number: 1n, timestamp: 1n },
    holdings: {
      [sender]: {
        [srcToken]: new Holding({
          user: sender,
          token: srcToken,
          balance,
          erc20Allowances: {
            morpho: 0n,
            permit2: 0n,
            "bundler3.generalAdapter1": 0n,
          },
          permit2BundlerAllowance: {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        }),
      },
    },
  });

const makeSwapData = () =>
  concat([
    padHex("0x00", { size: 4 }), // selector
    padHex("0x00", { size: 32 }), // arg0
    padHex("0x00", { size: 32 }), // arg1
    padHex("0x00", { size: 32 }), // arg2
    padHex(`0x${amount.toString(16)}`, { size: 32 }), // arg3 = exactAmount
    padHex(`0x${amount.toString(16)}`, { size: 32 }), // arg4 = limitAmount
    padHex(`0x${quotedAmount.toString(16)}`, { size: 32 }), // arg5 = quotedAmount
  ]);

describe("encodeOperation", () => {
  describe("Paraswap_Sell", () => {
    test("should sweep srcToken from paraswapAdapter when sellEntireBalance is true", () => {
      const sender = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
      const data = makeMinimalState(sender, parseUnits("10", 6));

      const { actions } = encodeOperation(
        {
          type: "Paraswap_Sell",
          sender,
          address: srcToken,
          args: {
            dstToken,
            swap: {
              to: zeroAddress,
              data: makeSwapData(),
              offsets: {
                exactAmount: 4n + 32n * 3n,
                limitAmount: 4n + 32n * 4n,
                quotedAmount: 4n + 32n * 5n,
              },
            },
            sellEntireBalance: true,
            receiver: generalAdapter1,
          },
        },
        data,
      );

      // Should contain the sweep: erc20Transfer of srcToken from paraswapAdapter back to generalAdapter1
      expect(actions).toContainEqual({
        type: "erc20Transfer",
        args: [srcToken, generalAdapter1, maxUint256, paraswapAdapter, false],
      });
    });

    test("should sweep srcToken from paraswapAdapter when sellEntireBalance is false", () => {
      const sender = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
      const data = makeMinimalState(sender, parseUnits("10", 6));

      const { actions } = encodeOperation(
        {
          type: "Paraswap_Sell",
          sender,
          address: srcToken,
          args: {
            dstToken,
            swap: {
              to: zeroAddress,
              data: makeSwapData(),
              offsets: {
                exactAmount: 4n + 32n * 3n,
                limitAmount: 4n + 32n * 4n,
                quotedAmount: 4n + 32n * 5n,
              },
            },
            sellEntireBalance: false,
            receiver: generalAdapter1,
          },
        },
        data,
      );

      // Should contain the sweep regardless of sellEntireBalance
      expect(actions).toContainEqual({
        type: "erc20Transfer",
        args: [srcToken, generalAdapter1, maxUint256, paraswapAdapter, false],
      });
    });
  });
});
