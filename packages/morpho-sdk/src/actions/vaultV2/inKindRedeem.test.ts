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
  NonPositiveInputError,
  type PermitRequirementSignature,
} from "../../types/index.js";
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
  adapterAddress: addressArbitrary,
  amount: positiveUint256Arbitrary,
  marketParamsList: fc.array(marketParamsArbitrary, {
    minLength: 0,
    maxLength: 3,
  }),
  onBehalf: addressArbitrary,
  deadline: positiveUint256Arbitrary,
});
const serializedSignature = serializeSignature({
  r: `0x${"11".repeat(32)}`,
  s: `0x${"22".repeat(32)}`,
  yParity: 1,
});
const permitAmount = 125n;

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
    amount: permitAmount,
    deadline: 1_900_000_000n,
  },
  action: {
    type: "permit",
    args: {
      spender: vaultExitBundlesV1,
      amount: permitAmount,
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
      value: permitAmount,
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
            "value": 125n,
          },
          1900000000n,
        ],
        "functionName": "vaultExitBundlesV1InKindRedemptionVaultV2",
      }
    `);
  });

  test("behavior: calldata round-trips across valid primitive inputs", () => {
    fc.assert(
      fc.property(
        inKindRedeemArbitrary,
        ({
          vaultAddress,
          adapterAddress,
          amount,
          marketParamsList,
          onBehalf,
          deadline,
        }) => {
          const tx = vaultV2InKindRedeem({
            vault: { chainId, address: vaultAddress },
            args: {
              adapter: adapterAddress,
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
            decoded.functionName !== "vaultExitBundlesV1InKindRedemptionVaultV2"
          ) {
            throw new TypeError("Unexpected VaultExitBundlesV1 function");
          }

          expect(decoded.args[0]).toBe(vaultAddress);
          expect(decoded.args[1]).toBe(adapterAddress);
          expect(decoded.args[2]).toEqual(marketParamsList);
          expect(decoded.args[3]).toBe(amount);
          expect(decoded.args[4]).toEqual({
            value: 0n,
            nonce: 0n,
            deadline,
            v: 0,
            r: zeroHash,
            s: zeroHash,
          });
          expect(decoded.args[5]).toBe(deadline);
          expect(tx.action.args).toMatchObject({
            vault: vaultAddress,
            adapter: adapterAddress,
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

  test("behavior: accepts an empty market list for an idle-only exit", () => {
    const tx = vaultV2InKindRedeem({
      vault: { chainId, address: vault },
      args: {
        adapter,
        amount: 100n,
        marketParamsList: [],
        userAddress,
        deadline: 1_900_000_000n,
      },
    });

    const decoded = decodeFunctionData({
      abi: vaultExitBundlesV1Abi,
      data: tx.data,
    });
    expect(decoded.args?.[2]).toEqual([]);
  });

  test.each([
    { field: "amount", amount: 0n, deadline: 1_900_000_000n },
    { field: "amount", amount: -1n, deadline: 1_900_000_000n },
    { field: "deadline", amount: 100n, deadline: 0n },
    { field: "deadline", amount: 100n, deadline: -1n },
  ])("error: NonPositiveInputError for $field", ({ amount, deadline }) => {
    expect(() =>
      vaultV2InKindRedeem({
        vault: { chainId, address: vault },
        args: {
          adapter,
          amount,
          marketParamsList: [marketParams],
          userAddress,
          deadline,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
