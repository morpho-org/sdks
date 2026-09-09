import { MarketParams } from "@morpho-org/blue-sdk";
import { decodeFunctionData, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import { blueBorrow } from "./borrow.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";

const market = {
  chainId: mainnet.id,
  marketParams: new MarketParams({
    loanToken: getAddress("0x0000000000000000000000000000000000000011"),
    collateralToken: getAddress("0x0000000000000000000000000000000000000012"),
    oracle: getAddress("0x0000000000000000000000000000000000000013"),
    irm: getAddress("0x0000000000000000000000000000000000000014"),
    lltv: 860000000000000000n,
  }),
};
const userAddress = getAddress("0x00000000000000000000000000000000000000A1");

describe("blueBorrow", () => {
  test("default", () => {
    const args = {
      userAddress,
      borrowAssets: 1_000_000n,
      maxLtv: 850000000000000000n,
      deadline: 1_900_000_000n,
    } as const;
    const transaction = blueBorrow({ market, args });
    const combined = blueSupplyCollateralBorrow({
      market,
      args: { ...args, collateralAssets: 0n },
    });

    expect(transaction).toEqual({
      ...combined,
      action: { ...combined.action, type: "blueBorrow" },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("blueBundlesV1SupplyCollateralAndBorrow");
    expect(decoded.args?.[1]).toBe(0n);
    expect(transaction.action.type).toBe("blueBorrow");
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });
});
