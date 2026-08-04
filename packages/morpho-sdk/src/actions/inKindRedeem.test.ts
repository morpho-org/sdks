import { MarketParams, registerCustomAddresses } from "@morpho-org/blue-sdk";
import fc from "fast-check";
import {
  type Address,
  decodeFunctionData,
  maxUint256,
  serializeSignature,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { vaultExitBundlesV1Abi } from "../abis.js";
import {
  EmptyMarketParamsListError,
  InKindRedeemPermitMismatchError,
  type PermitRequirementSignature,
} from "../types/index.js";
import { vaultV1InKindRedeem } from "./vaultV1/inKindRedeem.js";
import { vaultV2InKindRedeem } from "./vaultV2/inKindRedeem.js";

const chainId = 31_337;
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

const permit = (
  overrides: Partial<PermitRequirementSignature["args"]> = {},
  actionOverrides: Partial<{
    readonly spender: Address;
    readonly amount: bigint;
    readonly deadline: bigint;
  }> = {},
): PermitRequirementSignature => ({
  args: {
    owner: userAddress,
    nonce: 7n,
    asset: vault,
    signature: serializedSignature,
    amount: maxUint256,
    deadline: 1_900_000_000n,
    ...overrides,
  },
  action: {
    type: "permit",
    args: {
      spender: vaultExitBundlesV1,
      amount: maxUint256,
      deadline: 1_900_000_000n,
      ...actionOverrides,
    },
  },
});

describe("vault in-kind redeem actions", () => {
  test("default: Vault V1 encodes the empty-permit sentinel", () => {
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

  test("default: Vault V2 encodes a signed max-share permit", () => {
    const tx = vaultV2InKindRedeem({
      vault: { chainId, address: vault },
      args: {
        adapter,
        amount: 100n,
        marketParamsList: [marketParams],
        userAddress,
        deadline: 1_900_000_000n,
        requirementSignature: permit(),
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

  test.each([
    {
      label: "asset",
      signature: permit({
        asset: "0x0000000000000000000000000000000000000099",
      }),
    },
    { label: "amount", signature: permit({ amount: maxUint256 - 1n }) },
  ])("error: rejects mismatched permit $label", ({ signature }) => {
    expect(() =>
      vaultV2InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          adapter,
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: 1_900_000_000n,
          requirementSignature: signature,
        },
      }),
    ).toThrow(InKindRedeemPermitMismatchError);
  });

  test("behavior: leaves non-security permit metadata validation onchain", () => {
    const permitDeadline = 1_900_000_001n;
    const tx = vaultV2InKindRedeem({
      vault: { chainId, address: vault },
      args: {
        adapter,
        amount: 100n,
        marketParamsList: [marketParams],
        userAddress,
        deadline: 1_900_000_000n,
        requirementSignature: permit(
          {
            owner: "0x0000000000000000000000000000000000000099",
            deadline: permitDeadline,
          },
          {
            spender: "0x0000000000000000000000000000000000000099",
            amount: maxUint256 - 1n,
            deadline: permitDeadline + 1n,
          },
        ),
      },
    });
    const decoded = decodeFunctionData({
      abi: vaultExitBundlesV1Abi,
      data: tx.data,
    });

    expect(decoded.args?.[4]).toMatchObject({ deadline: permitDeadline });
    expect(decoded.args?.[5]).toBe(1_900_000_000n);
  });

  test("error: rejects a Permit2 signature", () => {
    const requirementSignature: PermitRequirementSignature = {
      args: {
        owner: userAddress,
        nonce: 7n,
        asset: vault,
        signature: serializedSignature,
        amount: maxUint256,
        deadline: 1_900_000_000n,
        expiration: 1_900_000_000n,
      },
      action: {
        type: "permit2",
        args: {
          spender: vaultExitBundlesV1,
          amount: maxUint256,
          deadline: 1_900_000_000n,
          expiration: 1_900_000_000n,
        },
      },
    };

    expect(() =>
      vaultV2InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          adapter,
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: 1_900_000_000n,
          requirementSignature,
        },
      }),
    ).toThrow(InKindRedeemPermitMismatchError);
  });

  test("error: rejects malformed serialized signatures with a typed error", () => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: 1_900_000_000n,
          requirementSignature: permit({ signature: "0x12" }),
        },
      }),
    ).toThrow(InKindRedeemPermitMismatchError);
  });

  test("behavior: permit tuple round-trips across valid scalar inputs", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 2n ** 128n }),
        fc.bigInt({ min: 0n, max: 2n ** 128n }),
        (deadline, nonce) => {
          const requirementSignature = permit(
            { deadline, nonce },
            { deadline },
          );
          const tx = vaultV1InKindRedeem({
            vault: { chainId, address: vault },
            args: {
              amount: 1n,
              marketParamsList: [marketParams],
              userAddress,
              deadline,
              requirementSignature,
            },
          });
          const decoded = decodeFunctionData({
            abi: vaultExitBundlesV1Abi,
            data: tx.data,
          });
          expect(decoded.args?.[3]).toMatchObject({
            value: maxUint256,
            nonce,
            deadline,
            v: 28,
          });
        },
      ),
      { numRuns: 50, seed: 20_260_727 },
    );
  });
});
