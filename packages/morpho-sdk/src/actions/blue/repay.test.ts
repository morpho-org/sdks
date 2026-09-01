import { MarketParams } from "@morpho-org/blue-sdk";
import { decodeFunctionData, getAddress, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import { blueRepay } from "./repay.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

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

describe("blueRepay", () => {
  test("default", () => {
    const args = {
      userAddress,
      repayAssets: 1_000_000n,
      repayShares: 0n,
      maxRepayAssets: 1_000_000n,
      deadline: 1_900_000_000n,
    } as const;
    const transaction = blueRepay({ market, args });
    const combined = blueRepayWithdrawCollateral({
      market,
      args: { ...args, collateralAssets: 0n, maxLtv: maxUint256 },
    });

    expect(transaction).toEqual({
      ...combined,
      action: { ...combined.action, type: "blueRepay" },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe(
      "blueBundlesV1RepayAndWithdrawCollateral",
    );
    expect(decoded.args?.[4]).toBe(0n);
    expect(decoded.args?.[5]).toBe(maxUint256);
    expect(transaction.action.type).toBe("blueRepay");
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });
});
