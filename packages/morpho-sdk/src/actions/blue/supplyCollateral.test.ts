import { MarketParams } from "@morpho-org/blue-sdk";
import { decodeFunctionData, getAddress, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import { blueSupplyCollateral } from "./supplyCollateral.js";
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

describe("blueSupplyCollateral", () => {
  test("default", () => {
    const args = {
      userAddress,
      collateralAssets: 1_000_000_000_000_000_000n,
      deadline: 1_900_000_000n,
    } as const;
    const transaction = blueSupplyCollateral({ market, args });
    const combined = blueSupplyCollateralBorrow({
      market,
      args: { ...args, borrowAssets: 0n, maxLtv: maxUint256 },
    });

    expect(transaction).toEqual({
      ...combined,
      action: { ...combined.action, type: "blueSupplyCollateral" },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("blueBundlesV1SupplyCollateralAndBorrow");
    expect(decoded.args?.[2]).toBe(0n);
    expect(decoded.args?.[3]).toBe(maxUint256);
    expect(transaction.action.type).toBe("blueSupplyCollateral");
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });
});
