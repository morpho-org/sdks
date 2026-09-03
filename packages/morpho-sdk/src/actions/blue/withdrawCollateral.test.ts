import { MarketParams } from "@morpho-org/blue-sdk";
import { decodeFunctionData, getAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { blueWithdrawCollateral } from "./withdrawCollateral.js";

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

describe("blueWithdrawCollateral", () => {
  test("default", () => {
    const args = {
      userAddress,
      collateralAssets: 1_000_000_000_000_000_000n,
      maxLtv: 850000000000000000n,
      deadline: 1_900_000_000n,
    } as const;
    const transaction = blueWithdrawCollateral({ market, args });
    const combined = blueRepayWithdrawCollateral({
      market,
      args: {
        ...args,
        repayAssets: 0n,
        repayShares: 0n,
        maxRepayAssets: 0n,
      },
    });

    expect(transaction).toEqual({
      ...combined,
      action: { ...combined.action, type: "blueWithdrawCollateral" },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe(
      "blueBundlesV1RepayAndWithdrawCollateral",
    );
    expect(decoded.args?.slice(1, 4)).toEqual([0n, 0n, 0n]);
    expect(transaction.action.type).toBe("blueWithdrawCollateral");
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });
});
