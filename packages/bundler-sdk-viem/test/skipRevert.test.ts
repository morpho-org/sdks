import {
  ChainId,
  Holding,
  Token,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { SimulationState } from "@morpho-org/simulation-sdk";
import {
  concat,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";

import { BundlerAction, encodeOperation } from "../src/index.js";

const {
  bundler3: { generalAdapter1 },
} = getChainAddresses(ChainId.EthMainnet);

const tokenA = "0x1111111111111111111111111111111111111111" as const;
const tokenB = "0x2222222222222222222222222222222222222222" as const;

const makeHolding = (
  user: typeof tokenA,
  token: typeof tokenA,
  balance: bigint,
) =>
  new Holding({
    erc20Allowances: {
      morpho: 0n,
      permit2: 0n,
      "bundler3.generalAdapter1": maxUint256,
    },
    user,
    token,
    balance,
    permit2BundlerAllowance: { amount: 0n, expiration: 0n, nonce: 0n },
  });

const state = new SimulationState({
  chainId: ChainId.EthMainnet,
  block: { number: 1n, timestamp: 12345n },
  tokens: {
    [tokenA]: new Token({
      address: tokenA,
      decimals: 6,
      symbol: "TA",
      name: "Token A",
    }),
    [tokenB]: new Token({
      address: tokenB,
      decimals: 18,
      symbol: "TB",
      name: "Token B",
    }),
  },
  holdings: {
    [generalAdapter1]: {
      [tokenA]: makeHolding(generalAdapter1, tokenA, parseUnits("100000", 6)),
      [tokenB]: makeHolding(generalAdapter1, tokenB, parseEther("100000")),
    },
  },
});

describe("skipRevert on recovery transfers", () => {
  describe("BundlerAction", () => {
    test("erc20WrapperDepositFor recovery should never skip revert", () => {
      const calls = BundlerAction.erc20WrapperDepositFor(
        ChainId.EthMainnet,
        tokenA,
        tokenB,
        1000n,
        true,
      );

      expect(calls).toHaveLength(3);
      expect(calls[0]!.skipRevert).toBe(true);
      expect(calls[1]!.skipRevert).toBe(true);
      expect(calls[2]!.skipRevert).toBe(false);
    });

    test("erc20WrapperWithdrawTo recovery should never skip revert", () => {
      const calls = BundlerAction.erc20WrapperWithdrawTo(
        ChainId.EthMainnet,
        tokenA,
        generalAdapter1,
        1000n,
        true,
      );

      expect(calls).toHaveLength(3);
      expect(calls[0]!.skipRevert).toBe(true);
      expect(calls[1]!.skipRevert).toBe(true);
      expect(calls[2]!.skipRevert).toBe(false);
    });
  });

  describe("encodeOperation", () => {
    const amount = parseUnits("1", 6);
    const quotedAmount = parseEther("1");

    test("Paraswap_Buy recovery should never skip revert", () => {
      const { actions } = encodeOperation(
        {
          type: "Paraswap_Buy",
          sender: generalAdapter1,
          address: tokenA,
          skipRevert: true,
          args: {
            srcToken: tokenB,
            swap: {
              to: zeroAddress,
              data: concat([
                padHex(`0x${amount.toString(16)}`, { size: 32 }),
                padHex(`0x${quotedAmount.toString(16)}`, { size: 32 }),
              ]),
              offsets: {
                exactAmount: 0n,
                limitAmount: 32n,
                quotedAmount: 32n,
              },
            },
            receiver: generalAdapter1,
          },
        },
        state,
      );

      // Actions: fund erc20Transfer, paraswapBuy, recovery erc20Transfer
      expect(actions).toHaveLength(3);
      expect(actions[0]!.type).toBe("erc20Transfer");
      expect(actions[1]!.type).toBe("paraswapBuy");
      expect(actions[2]!.type).toBe("erc20Transfer");

      // Fund and swap inherit operation.skipRevert
      expect(actions[0]!.args.at(-1)).toBe(true);
      expect(actions[1]!.args.at(-1)).toBe(true);
      // Recovery must never skip revert
      expect(actions[2]!.args.at(-1)).toBe(false);
    });

    test("Paraswap_Sell recovery should never skip revert", () => {
      const { actions } = encodeOperation(
        {
          type: "Paraswap_Sell",
          sender: generalAdapter1,
          address: tokenA,
          skipRevert: true,
          args: {
            dstToken: tokenB,
            swap: {
              to: zeroAddress,
              data: concat([
                padHex(`0x${quotedAmount.toString(16)}`, { size: 32 }),
                padHex(`0x${amount.toString(16)}`, { size: 32 }),
              ]),
              offsets: {
                exactAmount: 32n,
                limitAmount: 0n,
                quotedAmount: 0n,
              },
            },
            receiver: generalAdapter1,
          },
        },
        state,
      );

      // Actions: fund erc20Transfer, paraswapSell, recovery erc20Transfer
      expect(actions).toHaveLength(3);
      expect(actions[0]!.type).toBe("erc20Transfer");
      expect(actions[1]!.type).toBe("paraswapSell");
      expect(actions[2]!.type).toBe("erc20Transfer");

      // Fund and swap inherit operation.skipRevert
      expect(actions[0]!.args.at(-1)).toBe(true);
      expect(actions[1]!.args.at(-1)).toBe(true);
      // Recovery must never skip revert
      expect(actions[2]!.args.at(-1)).toBe(false);
    });
  });
});
