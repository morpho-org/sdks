import { MarketParams } from "@morpho-org/blue-sdk";
import { createMockClient } from "@morpho-org/test/mock";
import { decodeFunctionData, getAddress, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  blueBorrow,
  blueRefinance,
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateral,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  blueWithdrawCollateral,
} from "./index.js";

const marketParams = new MarketParams({
  loanToken: getAddress("0x0000000000000000000000000000000000000011"),
  collateralToken: getAddress("0x0000000000000000000000000000000000000012"),
  oracle: getAddress("0x0000000000000000000000000000000000000013"),
  irm: getAddress("0x0000000000000000000000000000000000000014"),
  lltv: 860_000000000000000n,
});
const market = { chainId: mainnet.id, marketParams };
const common = {
  userAddress: getAddress("0x00000000000000000000000000000000000000A1"),
  deadline: 1_900_000_000n,
};
const fees = {
  referralFeePct: 10_000000000000000n,
  referralFeeRecipient: getAddress(
    "0x00000000000000000000000000000000000000f1",
  ),
};
type FeeStyle = "own" | "prototype" | "non-enumerable getters";

function withFees<T extends object>(args: T, style: FeeStyle): T & typeof fees {
  if (style === "prototype") {
    return Object.assign(Object.create(fees), args);
  }
  if (style === "non-enumerable getters") {
    return Object.defineProperties(
      { ...args },
      {
        referralFeePct: { get: () => fees.referralFeePct },
        referralFeeRecipient: { get: () => fees.referralFeeRecipient },
      },
    ) as T & typeof fees;
  }
  return { ...args, ...fees };
}

describe.each(["prototype", "non-enumerable getters"] as const)(
  "Blue referral fields from %s",
  (style) => {
    const args = <T extends object>(fields: T) =>
      withFees({ ...common, ...fields }, style);
    const plain = <T extends object>(fields: T) =>
      withFees({ ...common, ...fields }, "own");

    test.each([
      [
        "supply",
        (decorate: typeof args) =>
          blueSupply({ market, args: decorate({ assets: 100n }) }),
      ],
      [
        "withdraw",
        (decorate: typeof args) =>
          blueWithdraw({
            market,
            args: decorate({ withdrawAssets: 100n, withdrawShares: 0n }),
          }),
      ],
      [
        "supplyCollateral",
        (decorate: typeof args) =>
          blueSupplyCollateral({
            market,
            args: decorate({ collateralAssets: 100n }),
          }),
      ],
      [
        "borrow",
        (decorate: typeof args) =>
          blueBorrow({
            market,
            args: decorate({ borrowAssets: 100n, maxLtv: maxUint256 }),
          }),
      ],
      [
        "supplyCollateralBorrow",
        (decorate: typeof args) =>
          blueSupplyCollateralBorrow({
            market,
            args: decorate({
              collateralAssets: 100n,
              borrowAssets: 100n,
              maxLtv: maxUint256,
            }),
          }),
      ],
      [
        "repay",
        (decorate: typeof args) =>
          blueRepay({
            market,
            args: decorate({
              repayAssets: 100n,
              repayShares: 0n,
              maxRepayAssets: 200n,
            }),
          }),
      ],
      [
        "withdrawCollateral",
        (decorate: typeof args) =>
          blueWithdrawCollateral({
            market,
            args: decorate({ collateralAssets: 100n, maxLtv: maxUint256 }),
          }),
      ],
      [
        "repayWithdrawCollateral",
        (decorate: typeof args) =>
          blueRepayWithdrawCollateral({
            market,
            args: decorate({
              repayAssets: 100n,
              repayShares: 0n,
              maxRepayAssets: 200n,
              collateralAssets: 100n,
              maxLtv: maxUint256,
            }),
          }),
      ],
      [
        "refinance",
        (decorate: typeof args) =>
          blueRefinance({
            market: {
              chainId: mainnet.id,
              sourceMarketParams: marketParams,
              destinationMarketParams: new MarketParams({
                ...marketParams,
                lltv: 800_000000000000000n,
              }),
            },
            args: decorate({ maxLtv: maxUint256 }),
          }),
      ],
    ] as const)(
      "%s preserves the encoded fee and recipient",
      (_name, build) => {
        const expected = build(plain);
        const decoded = decodeFunctionData({
          abi: blueBundlesV1Abi,
          data: expected.data,
        });
        expect(decoded.args).toContain(fees.referralFeePct);
        expect(decoded.args).toContain(fees.referralFeeRecipient);
        expect(build(args)).toEqual(expected);
      },
    );

    test("entity preserves the same encoded fee as standalone supply", () => {
      const { client } = createMockClient(mainnet);
      const entity = client
        .extend(morphoViemExtension())
        .morpho.blue(marketParams, mainnet.id);
      const input = args({ assets: 100n, now: 1_700_000_000n });
      expect(entity.supply(input).buildTx()).toEqual(
        blueSupply({ market, args: plain({ assets: 100n }) }),
      );
    });
  },
);
