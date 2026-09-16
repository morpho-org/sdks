import { MarketParams, registerCustomAddresses } from "@morpho-org/blue-sdk";
import fc from "fast-check";
import {
  bytesToHex,
  decodeFunctionData,
  getAddress,
  maxUint256,
  serializeSignature,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { vaultExitBundlesV1Abi } from "../../abis.js";
import {
  EmptyMarketParamsListError,
  InputExceedsMaxError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  VaultExitBundlesV1PermitMismatchError,
} from "../../types/index.js";
import { vaultV1InKindRedeem } from "./inKindRedeem.js";

const chainId = 31_337;
const blue = "0x0000000000000000000000000000000000000001" as const;
const vault = "0x0000000000000000000000000000000000000002" as const;
const userAddress = "0x0000000000000000000000000000000000000004" as const;
const vaultExitBundlesV1 =
  "0x0000000000000000000000000000000000000005" as const;
const permit: PermitRequirementSignature = {
  args: {
    owner: userAddress,
    nonce: 7n,
    asset: vault,
    signature: serializeSignature({
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
      yParity: 1,
    }),
    amount: 125n,
    deadline: 1_900_000_000n,
  },
  action: {
    type: "permit",
    args: {
      spender: vaultExitBundlesV1,
      amount: 125n,
      deadline: 1_900_000_000n,
    },
  },
};
const marketParams = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000006",
  collateralToken: "0x0000000000000000000000000000000000000007",
  oracle: "0x0000000000000000000000000000000000000008",
  irm: "0x0000000000000000000000000000000000000009",
  lltv: 860_000_000_000_000_000n,
});
const addressArbitrary = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => getAddress(bytesToHex(bytes)));
const positiveUint256Arbitrary = fc.bigInt({ min: 1n, max: maxUint256 });
const marketParamsArbitrary = fc.record({
  loanToken: addressArbitrary,
  collateralToken: addressArbitrary,
  oracle: addressArbitrary,
  irm: addressArbitrary,
  lltv: fc.bigInt({ min: 0n, max: maxUint256 }),
});
const inKindRedeemArbitrary = fc.record({
  vaultAddress: addressArbitrary,
  amount: positiveUint256Arbitrary,
  marketParamsList: fc.array(marketParamsArbitrary, {
    minLength: 1,
    maxLength: 3,
  }),
  onBehalf: addressArbitrary,
  deadline: positiveUint256Arbitrary,
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
  test("error: InputExceedsMaxError for an unencodable deadline", () => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: maxUint256 + 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("behavior: accepts maxUint256 for the bundle and empty permit", () => {
    const tx = vaultV1InKindRedeem({
      vault: { chainId, address: vault },
      args: {
        amount: 100n,
        marketParamsList: [marketParams],
        userAddress,
        deadline: maxUint256,
      },
    });
    const decoded = decodeFunctionData({
      abi: vaultExitBundlesV1Abi,
      data: tx.data,
    });
    expect(decoded.args?.[3]).toMatchObject({ deadline: maxUint256 });
    expect(decoded.args?.[4]).toBe(maxUint256);
  });

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
      value: 0n,
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
            "value": 0n,
          },
          1900000000n,
        ],
        "functionName": "vaultExitBundlesV1InKindRedemptionVaultV1",
      }
    `);
    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(marketParams)).toBe(false);
  });

  test("behavior: encodes a matching permit's signature fields", () => {
    const tx = vaultV1InKindRedeem({
      vault: { chainId, address: vault },
      args: {
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

    expect(decoded.args?.[3]).toMatchObject({
      value: 125n,
      nonce: 7n,
      deadline: 1_900_000_000n,
      v: 28,
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
    });
  });

  test("error: VaultExitBundlesV1PermitMismatchError on deadline disagreement", () => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: 1_900_000_000n,
          requirementSignature: {
            ...permit,
            action: {
              ...permit.action,
              args: {
                ...permit.action.args,
                deadline: permit.action.args.deadline + 1n,
              },
            },
          },
        },
      }),
    ).toThrow(VaultExitBundlesV1PermitMismatchError);
  });

  test("error: VaultExitBundlesV1PermitMismatchError on amount disagreement", () => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: 1_900_000_000n,
          requirementSignature: {
            ...permit,
            action: {
              ...permit.action,
              args: {
                ...permit.action.args,
                amount: permit.action.args.amount + 1n,
              },
            },
          },
        },
      }),
    ).toThrow(VaultExitBundlesV1PermitMismatchError);
  });

  test("error: VaultExitBundlesV1PermitMismatchError for a permit with another owner", () => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: 1_900_000_000n,
          requirementSignature: {
            ...permit,
            args: {
              ...permit.args,
              owner: blue,
            },
          },
        },
      }),
    ).toThrow(VaultExitBundlesV1PermitMismatchError);
  });

  test("error: VaultExitBundlesV1PermitMismatchError for a permit with another spender", () => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount: 100n,
          marketParamsList: [marketParams],
          userAddress,
          deadline: 1_900_000_000n,
          requirementSignature: {
            ...permit,
            action: {
              ...permit.action,
              args: {
                ...permit.action.args,
                spender: blue,
              },
            },
          },
        },
      }),
    ).toThrow(VaultExitBundlesV1PermitMismatchError);
  });

  test("behavior: calldata round-trips across valid primitive inputs", () => {
    fc.assert(
      fc.property(
        inKindRedeemArbitrary,
        ({ vaultAddress, amount, marketParamsList, onBehalf, deadline }) => {
          const tx = vaultV1InKindRedeem({
            vault: { chainId, address: vaultAddress },
            args: {
              amount,
              marketParamsList,
              userAddress: onBehalf,
              deadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: vaultExitBundlesV1Abi,
            data: tx.data,
          });
          if (
            decoded.functionName !== "vaultExitBundlesV1InKindRedemptionVaultV1"
          ) {
            throw new TypeError("Unexpected VaultExitBundlesV1 function");
          }

          expect(decoded.args[0]).toBe(vaultAddress);
          expect(decoded.args[1]).toEqual(marketParamsList);
          expect(decoded.args[2]).toBe(amount);
          expect(decoded.args[3]).toEqual({
            value: 0n,
            nonce: 0n,
            deadline,
            v: 0,
            r: zeroHash,
            s: zeroHash,
          });
          expect(decoded.args[4]).toBe(deadline);
          expect(tx.action.args).toMatchObject({
            vault: vaultAddress,
            amount,
            marketParamsList,
            onBehalf,
            deadline,
          });
        },
      ),
      { numRuns: 50, seed: 20_260_804 },
    );
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
    { field: "amount", amount: 0n, deadline: 1_900_000_000n },
    { field: "amount", amount: -1n, deadline: 1_900_000_000n },
    { field: "deadline", amount: 100n, deadline: 0n },
    { field: "deadline", amount: 100n, deadline: -1n },
  ])("error: NonPositiveInputError for $field", ({ amount, deadline }) => {
    expect(() =>
      vaultV1InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          amount,
          marketParamsList: [marketParams],
          userAddress,
          deadline,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
