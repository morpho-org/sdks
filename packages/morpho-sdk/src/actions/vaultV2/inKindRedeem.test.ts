import { MarketParams, registerCustomAddresses } from "@morpho-org/blue-sdk";
import { decodeFunctionData, maxUint256, serializeSignature } from "viem";
import { describe, expect, test } from "vitest";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import type { PermitRequirementSignature } from "../../types/index.js";
import { vaultV2InKindRedeem } from "./inKindRedeem.js";

const chainId = 31_338;
const blue = "0x0000000000000000000000000000000000000001" as const;
const vault = "0x0000000000000000000000000000000000000002" as const;
const adapter = "0x0000000000000000000000000000000000000003" as const;
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
const serializedSignature = serializeSignature({
  r: `0x${"11".repeat(32)}`,
  s: `0x${"22".repeat(32)}`,
  yParity: 1,
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

const permit: PermitRequirementSignature = {
  args: {
    owner: userAddress,
    nonce: 7n,
    asset: vault,
    signature: serializedSignature,
    amount: maxUint256,
    deadline: 1_900_000_000n,
  },
  action: {
    type: "permit",
    args: {
      spender: vaultExitBundlesV1,
      amount: maxUint256,
      deadline: 1_900_000_000n,
    },
  },
};

describe("vaultV2InKindRedeem", () => {
  test("default", () => {
    const tx = vaultV2InKindRedeem({
      vault: { chainId, address: vault },
      args: {
        adapter,
        amount: 100n,
        marketParamsList: [marketParams],
        userAddress,
        deadline: 1_900_000_000n,
        requirementSignature: permit,
      },
    });
    const decoded = decodeFunctionData({
      abi: vaultExitBundlesV1Abi,
      data: tx.data,
    });

    expect(tx.action.type).toBe("vaultV2InKindRedeem");
    expect(decoded.functionName).toBe(
      "vaultExitBundlesV1InKindRedemptionVaultV2",
    );
    expect(decoded.args?.[4]).toMatchObject({
      value: maxUint256,
      nonce: 7n,
      deadline: 1_900_000_000n,
      v: 28,
    });
    expect(decoded).toMatchInlineSnapshot(`
      {
        "args": [
          "0x0000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000003",
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
            "nonce": 7n,
            "r": "0x1111111111111111111111111111111111111111111111111111111111111111",
            "s": "0x2222222222222222222222222222222222222222222222222222222222222222",
            "v": 28,
            "value": 115792089237316195423570985008687907853269984665640564039457584007913129639935n,
          },
          1900000000n,
        ],
        "functionName": "vaultExitBundlesV1InKindRedemptionVaultV2",
      }
    `);
  });
});
