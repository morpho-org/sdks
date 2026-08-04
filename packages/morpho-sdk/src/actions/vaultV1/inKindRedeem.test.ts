import { MarketParams, registerCustomAddresses } from "@morpho-org/blue-sdk";
import { decodeFunctionData, maxUint256, zeroHash } from "viem";
import { describe, expect, test } from "vitest";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import { EmptyMarketParamsListError } from "../../types/index.js";
import { vaultV1InKindRedeem } from "./inKindRedeem.js";

const chainId = 31_337;
const blue = "0x0000000000000000000000000000000000000001" as const;
const vault = "0x0000000000000000000000000000000000000002" as const;
const userAddress = "0x0000000000000000000000000000000000000004" as const;
const vaultExitBundlesV1 =
  "0x0000000000000000000000000000000000000005" as const;
const marketParams = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000006",
  collateralToken: "0x0000000000000000000000000000000000000007",
  oracle: "0x0000000000000000000000000000000000000008",
  irm: "0x0000000000000000000000000000000000000009",
  lltv: 860_000_000_000_000_000n,
});

registerCustomAddresses({
  addresses: {
    [chainId]: {
      blue,
      morpho: blue,
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000010",
        generalAdapter1: "0x0000000000000000000000000000000000000011",
      },
      bundles: { vaultExitBundlesV1 },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000012",
    },
  },
});

describe("vaultV1InKindRedeem", () => {
  test("default", () => {
    const tx = vaultV1InKindRedeem({
      vault: { chainId, address: vault },
      args: {
        amount: 100n,
        marketParamsList: [marketParams],
        userAddress,
        deadline: 1_900_000_000n,
      },
    });
    const decoded = decodeFunctionData({
      abi: vaultExitBundlesV1Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(vaultExitBundlesV1);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("vaultV1InKindRedeem");
    expect(decoded.functionName).toBe(
      "vaultExitBundlesV1InKindRedemptionVaultV1",
    );
    expect(decoded.args?.[3]).toEqual({
      value: maxUint256,
      nonce: 0n,
      deadline: 1_900_000_000n,
      v: 0,
      r: zeroHash,
      s: zeroHash,
    });
    expect(decoded).toMatchInlineSnapshot(`
      {
        "args": [
          "0x0000000000000000000000000000000000000002",
          [
            {
              "collateralToken": "0x0000000000000000000000000000000000000007",
              "irm": "0x0000000000000000000000000000000000000009",
              "lltv": 860000000000000000n,
              "loanToken": "0x0000000000000000000000000000000000000006",
              "oracle": "0x0000000000000000000000000000000000000008",
            },
          ],
          100n,
          {
            "deadline": 1900000000n,
            "nonce": 0n,
            "r": "0x0000000000000000000000000000000000000000000000000000000000000000",
            "s": "0x0000000000000000000000000000000000000000000000000000000000000000",
            "v": 0,
            "value": 115792089237316195423570985008687907853269984665640564039457584007913129639935n,
          },
          1900000000n,
        ],
        "functionName": "vaultExitBundlesV1InKindRedemptionVaultV1",
      }
    `);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(marketParams)).toBe(false);
  });

  test("error: EmptyMarketParamsListError", () => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount: 100n,
          marketParamsList: [],
          userAddress,
          deadline: 1_900_000_000n,
        },
      }),
    ).toThrow(EmptyMarketParamsListError);
  });
});
