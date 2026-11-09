import { type MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { decodeFunctionData, getAddress, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueAbi } from "../../abis.js";
import {
  InputExceedsMaxError,
  MarketIdMismatchError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import { blueWithdrawBuyCallback } from "./withdrawBuyCallback.js";

const chainId = mainnet.id;
const userAddress = getAddress("0x00000000000000000000000000000000000000A1");
const callbackAddress = getAddress(
  "0x00000000000000000000000000000000000000C1",
);
const marketParams = new MarketParams({
  loanToken: getAddress("0x0000000000000000000000000000000000000011"),
  collateralToken: getAddress("0x0000000000000000000000000000000000000012"),
  oracle: getAddress("0x0000000000000000000000000000000000000013"),
  irm: getAddress("0x0000000000000000000000000000000000000014"),
  lltv: 860000000000000000n,
});
const market = { chainId, marketParams };

describe("blueWithdrawBuyCallback", () => {
  test("default", () => {
    const transaction = blueWithdrawBuyCallback({
      market,
      args: { callbackAddress, userAddress, shares: 7n },
    });

    expect(transaction.to).toBe(getChainAddress(chainId, "blue"));
    expect(transaction.value).toBe(0n);
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(transaction.action).toEqual({
      type: "blueWithdrawBuyCallback",
      args: {
        market: marketParams.id,
        shares: 7n,
        onBehalf: callbackAddress,
        receiver: userAddress,
      },
    });
    const decoded = decodeFunctionData({
      abi: blueAbi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("withdraw");
    expect(decoded.args).toEqual([
      {
        loanToken: marketParams.loanToken,
        collateralToken: marketParams.collateralToken,
        oracle: marketParams.oracle,
        irm: marketParams.irm,
        lltv: marketParams.lltv,
      },
      0n,
      7n,
      callbackAddress,
      userAddress,
    ]);
  });

  test("behavior: appends metadata", () => {
    const plain = blueWithdrawBuyCallback({
      market,
      args: { callbackAddress, userAddress, shares: 7n },
    });
    const transaction = blueWithdrawBuyCallback({
      market,
      args: { callbackAddress, userAddress, shares: 7n },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(transaction.data.startsWith(plain.data)).toBe(true);
    expect(transaction.data.length).toBeGreaterThan(plain.data.length);
  });

  test("validation: rejects zero, negative and above-uint256 shares", () => {
    const build = (shares: bigint) =>
      blueWithdrawBuyCallback({
        market,
        args: { callbackAddress, userAddress, shares },
      });

    expect(() => build(0n)).toThrow(NonPositiveInputError);
    expect(() => build(-1n)).toThrow(NegativeInputError);
    expect(() => build(maxUint256 + 1n)).toThrow(InputExceedsMaxError);
  });

  test("validation: rejects market params whose id does not hash from the tuple", () => {
    const stale: MarketParams = Object.assign(
      Object.create(MarketParams.prototype),
      new MarketParams({ ...marketParams, lltv: 1n }),
      { id: marketParams.id as MarketId },
    );

    expect(() =>
      blueWithdrawBuyCallback({
        market: { chainId, marketParams: stale },
        args: { callbackAddress, userAddress, shares: 1n },
      }),
    ).toThrow(MarketIdMismatchError);
  });
});
