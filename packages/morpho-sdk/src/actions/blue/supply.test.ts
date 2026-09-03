import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  maxUint256,
  serializeSignature,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  BlueBundlesV1RequirementSignatureMismatchError,
  type BundlesTokenRequirementSignature,
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  DepositOwnerMismatchError,
  DepositSpenderMismatchError,
  MissingReferralFeeRecipientError,
  NativeFundingAmountMismatchError,
  NonPositiveInputError,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import { blueSupply } from "./supply.js";

const chainId = mainnet.id;
const userAddress = getAddress("0x00000000000000000000000000000000000000A1");
const referralFeeRecipient = getAddress(
  "0x00000000000000000000000000000000000000f1",
);
const marketParamsInput = {
  loanToken: getAddress("0x0000000000000000000000000000000000000011"),
  collateralToken: getAddress("0x0000000000000000000000000000000000000012"),
  oracle: getAddress("0x0000000000000000000000000000000000000013"),
  irm: getAddress("0x0000000000000000000000000000000000000014"),
  lltv: 860000000000000000n,
} as const;
const marketParams = new MarketParams(marketParamsInput);
const market = { chainId, marketParams };
const deadline = 1_900_000_000n;
const metadata = { origin: "a1b2c3d4" } as const;
const positiveUint256Arbitrary = fc.bigInt({ min: 1n, max: maxUint256 });

describe("blueSupply", () => {
  test("default", () => {
    const referralFeePct = MathLib.WAD / 10n;
    const plain = blueSupply({
      market,
      args: {
        userAddress,
        assets: 5n,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    });
    const transaction = blueSupply({
      market,
      args: {
        userAddress,
        assets: 5n,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      },
      metadata,
    });

    expect(transaction.to).toBe(
      getChainAddress(chainId, "bundles.blueBundlesV1"),
    );
    expect(transaction.value).toBe(0n);
    expect(transaction.data).toBe(`${plain.data}${metadata.origin}`);
    expect(
      decodeFunctionData({ abi: blueBundlesV1Abi, data: transaction.data }),
    ).toEqual({
      functionName: "blueBundlesV1Supply",
      args: [
        marketParamsInput,
        5n,
        { kind: 0, data: "0x" },
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    });
    expect(transaction.action).toEqual({
      type: "blueSupply",
      args: {
        market: marketParams.id,
        assets: 5n,
        onBehalf: userAddress,
        nativeAmount: undefined,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      },
    });
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });

  test("behavior: calldata round-trips across bounded primitive inputs", () => {
    fc.assert(
      fc.property(
        positiveUint256Arbitrary,
        positiveUint256Arbitrary,
        (assets, generatedDeadline) => {
          const transaction = blueSupply({
            market,
            args: {
              userAddress,
              assets,
              deadline: generatedDeadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: blueBundlesV1Abi,
            data: transaction.data,
          });
          if (decoded.functionName !== "blueBundlesV1Supply") {
            throw new TypeError("Unexpected BlueBundlesV1 supply function");
          }

          expect(decoded.args[0]).toEqual(marketParamsInput);
          expect(decoded.args[1]).toBe(assets);
          expect(decoded.args[5]).toBe(generatedDeadline);
          expect(transaction.action.args).toMatchObject({
            assets,
            deadline: generatedDeadline,
          });
          expect(Object.isFrozen(transaction)).toBe(true);
          expect(Object.isFrozen(transaction.action)).toBe(true);
          expect(Object.isFrozen(transaction.action.args)).toBe(true);
        },
      ),
      { numRuns: 50, seed: 20_260_828 },
    );
  });

  test("behavior: normalizes an omitted referral fee", () => {
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueSupply({
        market,
        args: { userAddress, assets: 1n, deadline },
      }).data,
    });

    expect(decoded.functionName).toBe("blueBundlesV1Supply");
    expect(decoded.args?.[3]).toBe(0n);
    expect(decoded.args?.[4]).toBe(zeroAddress);
  });

  test("error: MissingReferralFeeRecipientError for the zero address", () => {
    expect(() =>
      blueSupply({
        market,
        args: {
          userAddress,
          assets: 1n,
          deadline,
          referralFeePct: 1n,
          referralFeeRecipient: zeroAddress,
        },
      }),
    ).toThrow(MissingReferralFeeRecipientError);
  });

  test("behavior: encodes ERC-2612 and Permit2 SignatureTransfer permits", () => {
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const signature = serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    });
    const erc2612 = {
      args: {
        owner: userAddress,
        nonce: 3n,
        asset: marketParams.loanToken,
        signature,
        amount: 5n,
        deadline: 123n,
      },
      action: {
        type: "permit",
        args: { spender: blueBundlesV1, amount: 5n, deadline: 123n },
      },
    } satisfies BundlesTokenRequirementSignature;
    const permit2 = {
      args: {
        owner: userAddress,
        nonce: 9n,
        asset: marketParams.loanToken,
        signature: "0x1234",
        amount: 5n,
        deadline: 789n,
      },
      action: {
        type: "permit2SignatureTransfer",
        args: { spender: blueBundlesV1, amount: 5n, nonce: 9n, deadline: 789n },
      },
    } satisfies BundlesTokenRequirementSignature;

    const erc2612Decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueSupply({
        market,
        args: {
          userAddress,
          assets: 5n,
          deadline,
          requirementSignature: erc2612,
        },
      }).data,
    });
    const permit2Decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueSupply({
        market,
        args: {
          userAddress,
          assets: 5n,
          deadline,
          requirementSignature: permit2,
        },
      }).data,
    });
    if (
      erc2612Decoded.functionName !== "blueBundlesV1Supply" ||
      permit2Decoded.functionName !== "blueBundlesV1Supply"
    ) {
      throw new Error("Unexpected BlueBundlesV1 entrypoint");
    }

    expect(erc2612Decoded.args[2].kind).toBe(1);
    expect(
      decodeAbiParameters(
        [
          { type: "uint256" },
          { type: "uint8" },
          { type: "bytes32" },
          { type: "bytes32" },
        ],
        erc2612Decoded.args[2].data,
      ),
    ).toEqual([123n, 27, toHex(1n, { size: 32 }), toHex(2n, { size: 32 })]);
    expect(permit2Decoded.args[2].kind).toBe(2);
    expect(
      decodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
        permit2Decoded.args[2].data,
      ),
    ).toEqual([9n, 789n, "0x1234"]);

    expect(() =>
      blueSupply({
        market,
        args: {
          userAddress,
          assets: 5n,
          deadline,
          requirementSignature: {
            ...erc2612,
            action: {
              ...erc2612.action,
              args: { ...erc2612.action.args, deadline: 124n },
            },
          },
        },
      }),
    ).toThrow(BlueBundlesV1RequirementSignatureMismatchError);
    expect(() =>
      blueSupply({
        market,
        args: {
          userAddress,
          assets: 5n,
          deadline,
          requirementSignature: {
            ...permit2,
            args: { ...permit2.args, expiration: 999n },
            action: {
              type: "permit2",
              args: {
                spender: blueBundlesV1,
                amount: 5n,
                deadline: 789n,
                expiration: 999n,
              },
            },
          } as unknown as BundlesTokenRequirementSignature,
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: binds every token signature field", () => {
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const signature = serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    });
    const permit = {
      args: {
        owner: userAddress,
        nonce: 3n,
        asset: marketParams.loanToken,
        signature,
        amount: 5n,
        deadline,
      },
      action: {
        type: "permit",
        args: { spender: blueBundlesV1, amount: 5n, deadline },
      },
    } satisfies BundlesTokenRequirementSignature;
    const otherAddress = getAddress(
      "0x00000000000000000000000000000000000000B1",
    );
    const cases = [
      [
        "owner",
        { ...permit, args: { ...permit.args, owner: otherAddress } },
        DepositOwnerMismatchError,
      ],
      [
        "asset",
        { ...permit, args: { ...permit.args, asset: otherAddress } },
        DepositAssetMismatchError,
      ],
      [
        "signed amount",
        { ...permit, args: { ...permit.args, amount: 4n } },
        DepositAmountMismatchError,
      ],
      [
        "spender",
        {
          ...permit,
          action: {
            ...permit.action,
            args: { ...permit.action.args, spender: otherAddress },
          },
        },
        DepositSpenderMismatchError,
      ],
      [
        "action amount",
        {
          ...permit,
          action: {
            ...permit.action,
            args: { ...permit.action.args, amount: 4n },
          },
        },
        DepositAmountMismatchError,
      ],
      [
        "serialized signature",
        { ...permit, args: { ...permit.args, signature: "0x12" as const } },
        BlueBundlesV1RequirementSignatureMismatchError,
      ],
    ] as const;

    for (const [, requirementSignature, ErrorClass] of cases) {
      expect(() =>
        blueSupply({
          market,
          args: {
            userAddress,
            assets: 5n,
            deadline,
            requirementSignature,
          },
        }),
      ).toThrow(ErrorClass);
    }
  });

  test("behavior: funds a wrapped-native market exclusively with native value", () => {
    const nativeMarketParams = new MarketParams({
      ...marketParamsInput,
      loanToken: getChainAddress(chainId, "wNative"),
    });
    const nativeMarket = { chainId, marketParams: nativeMarketParams };
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const permit2 = {
      args: {
        owner: userAddress,
        nonce: 1n,
        asset: nativeMarketParams.loanToken,
        signature: "0x1234",
        amount: 2n,
        deadline,
      },
      action: {
        type: "permit2SignatureTransfer",
        args: { spender: blueBundlesV1, amount: 2n, nonce: 1n, deadline },
      },
    } satisfies BundlesTokenRequirementSignature;

    expect(
      blueSupply({
        market: nativeMarket,
        args: { userAddress, assets: 2n, nativeAmount: 2n, deadline },
      }).value,
    ).toBe(2n);
    expect(() =>
      blueSupply({
        market: nativeMarket,
        args: { userAddress, assets: 2n, nativeAmount: 1n, deadline },
      }),
    ).toThrow(NativeFundingAmountMismatchError);
    expect(() =>
      blueSupply({
        market: nativeMarket,
        args: {
          userAddress,
          assets: 2n,
          nativeAmount: 2n,
          deadline,
          requirementSignature: permit2,
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      blueSupply({
        market,
        args: { userAddress, assets: 0n, deadline: maxUint256 },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
