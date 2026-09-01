import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import {
  decodeFunctionData,
  getAddress,
  maxUint256,
  serializeSignature,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  type AuthorizationRequirementSignature,
  type BlueBundlesV1TokenRequirementSignature,
  MaxRepayAssetsBelowRepayAssetsError,
  MutuallyExclusiveRepayAmountsError,
  NativeFundingAmountMismatchError,
  NonPositiveInputError,
  UnexpectedRequirementSignatureError,
} from "../../types/index.js";
import { blueRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";

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
const maxLtv = 850000000000000000n;
const deadline = 1_900_000_000n;
const metadata = { origin: "a1b2c3d4" } as const;
const emptyPermit = { kind: 0, data: "0x" } as const;
const emptyAuthorization = {
  signature: { v: 0, r: zeroHash, s: zeroHash },
  nonce: 0n,
  deadline: 0n,
} as const;
const positiveUint256Arbitrary = fc.bigInt({ min: 1n, max: maxUint256 });
const uint256Arbitrary = fc.bigInt({ min: 0n, max: maxUint256 });
const ltvArbitrary = fc.bigInt({ min: 0n, max: MathLib.WAD });

describe("blueRepayWithdrawCollateral", () => {
  test("default", () => {
    const referralFeePct = MathLib.WAD / 10n;
    const plain = blueRepayWithdrawCollateral({
      market,
      args: {
        userAddress,
        repayAssets: 5n,
        repayShares: 0n,
        maxRepayAssets: 7n,
        collateralAssets: 2n,
        maxLtv,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    });
    const transaction = blueRepayWithdrawCollateral({
      market,
      args: {
        userAddress,
        repayAssets: 5n,
        repayShares: 0n,
        maxRepayAssets: 7n,
        collateralAssets: 2n,
        maxLtv,
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
      functionName: "blueBundlesV1RepayAndWithdrawCollateral",
      args: [
        marketParamsInput,
        5n,
        0n,
        7n,
        2n,
        maxLtv,
        emptyPermit,
        emptyAuthorization,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    });
    expect(transaction.action).toEqual({
      type: "blueRepayWithdrawCollateral",
      args: {
        market: marketParams.id,
        repayAssets: 5n,
        repayShares: 0n,
        maxRepayAssets: 7n,
        collateralAssets: 2n,
        maxLtv,
        onBehalf: userAddress,
        nativeAmount: undefined,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      },
    });
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });

  test("behavior: calldata round-trips across bounded primitive inputs", () => {
    fc.assert(
      fc.property(
        fc.record({
          repayAssets: positiveUint256Arbitrary,
          collateralAssets: uint256Arbitrary,
          maxLtv: ltvArbitrary,
          deadline: positiveUint256Arbitrary,
        }),
        ({
          repayAssets,
          collateralAssets,
          maxLtv: generatedMaxLtv,
          deadline: generatedDeadline,
        }) => {
          const transaction = blueRepayWithdrawCollateral({
            market,
            args: {
              userAddress,
              repayAssets,
              repayShares: 0n,
              maxRepayAssets: repayAssets,
              collateralAssets,
              maxLtv: generatedMaxLtv,
              deadline: generatedDeadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: blueBundlesV1Abi,
            data: transaction.data,
          });
          if (
            decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral"
          ) {
            throw new TypeError(
              "Unexpected BlueBundlesV1 repay and collateral withdrawal function",
            );
          }

          expect(decoded.args[0]).toEqual(marketParamsInput);
          expect(decoded.args.slice(1, 6)).toEqual([
            repayAssets,
            0n,
            repayAssets,
            collateralAssets,
            generatedMaxLtv,
          ]);
          expect(decoded.args[10]).toBe(generatedDeadline);
          expect(transaction.action.args).toMatchObject({
            repayAssets,
            repayShares: 0n,
            maxRepayAssets: repayAssets,
            collateralAssets,
            maxLtv: generatedMaxLtv,
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

  test("behavior: composes either leg independently and normalizes fees", () => {
    const repayOnly = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 5n,
          repayShares: 0n,
          maxRepayAssets: 5n,
          collateralAssets: 0n,
          maxLtv: maxUint256,
          deadline,
        },
      }).data,
    });
    const withdrawalOnly = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 0n,
          repayShares: 0n,
          maxRepayAssets: 0n,
          collateralAssets: 2n,
          maxLtv,
          deadline,
        },
      }).data,
    });

    expect(repayOnly.args?.slice(1, 6)).toEqual([5n, 0n, 5n, 0n, maxUint256]);
    expect(withdrawalOnly.args?.slice(1, 6)).toEqual([0n, 0n, 0n, 2n, maxLtv]);
    expect(withdrawalOnly.args?.[8]).toBe(0n);
    expect(withdrawalOnly.args?.[9]).toBe(zeroAddress);
    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 0n,
          repayShares: 0n,
          maxRepayAssets: 0n,
          collateralAssets: 0n,
          maxLtv,
          deadline,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: preserves the saturated full-repay sentinel and refund cap", () => {
    const transaction = blueRepayWithdrawCollateral({
      market,
      args: {
        userAddress,
        repayAssets: 0n,
        repayShares: maxUint256,
        maxRepayAssets: 123n,
        collateralAssets: 0n,
        maxLtv: maxUint256,
        deadline,
      },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });

    expect(decoded.args?.slice(1, 6)).toEqual([
      0n,
      maxUint256,
      123n,
      0n,
      maxUint256,
    ]);
    expect(transaction.action.args.repayShares).toBe(maxUint256);
    expect(transaction.action.args.maxRepayAssets).toBe(123n);
  });

  test("behavior: native repayment funds the full refund cap", () => {
    const nativeMarketParams = new MarketParams({
      ...marketParamsInput,
      loanToken: getChainAddress(chainId, "wNative"),
    });
    const nativeMarket = { chainId, marketParams: nativeMarketParams };
    const transaction = blueRepayWithdrawCollateral({
      market: nativeMarket,
      args: {
        userAddress,
        repayAssets: 0n,
        repayShares: maxUint256,
        maxRepayAssets: 9n,
        collateralAssets: 0n,
        maxLtv: maxUint256,
        nativeAmount: 9n,
        deadline,
      },
    });

    expect(transaction.value).toBe(9n);
    expect(transaction.action.args.nativeAmount).toBe(9n);
    expect(() =>
      blueRepayWithdrawCollateral({
        market: nativeMarket,
        args: {
          userAddress,
          repayAssets: 0n,
          repayShares: maxUint256,
          maxRepayAssets: 9n,
          collateralAssets: 0n,
          maxLtv: maxUint256,
          nativeAmount: 8n,
          deadline,
        },
      }),
    ).toThrow(NativeFundingAmountMismatchError);
    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 5n,
          repayShares: 0n,
          maxRepayAssets: 4n,
          collateralAssets: 0n,
          maxLtv: maxUint256,
          deadline,
        },
      }),
    ).toThrow(MaxRepayAssetsBelowRepayAssetsError);
    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 9n,
          repayShares: 0n,
          maxRepayAssets: 9n,
          collateralAssets: 0n,
          maxLtv: maxUint256,
          deadline,
          referralFeePct: MathLib.WAD / 10n,
          referralFeeRecipient,
        },
      }),
    ).toThrow(MaxRepayAssetsBelowRepayAssetsError);
  });

  test("error: rejects mutually exclusive amounts and inactive signatures", () => {
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const signature = serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    });
    const tokenSignature = {
      args: {
        owner: userAddress,
        nonce: 1n,
        asset: marketParams.loanToken,
        signature: "0x1234",
        amount: 5n,
        deadline,
      },
      action: {
        type: "permit2TransferFrom",
        args: { spender: blueBundlesV1, amount: 5n, nonce: 1n, deadline },
      },
    } satisfies BlueBundlesV1TokenRequirementSignature;
    const authorizationSignature = {
      args: {
        owner: userAddress,
        authorized: blueBundlesV1,
        isAuthorized: true,
        nonce: 1n,
        deadline,
        signature,
      },
      action: {
        type: "authorization",
        args: { authorized: blueBundlesV1, isAuthorized: true, deadline },
      },
    } satisfies AuthorizationRequirementSignature;

    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 1n,
          repayShares: 1n,
          maxRepayAssets: 2n,
          collateralAssets: 0n,
          maxLtv: maxUint256,
          deadline,
        },
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 0n,
          repayShares: 0n,
          maxRepayAssets: 0n,
          collateralAssets: 1n,
          maxLtv,
          requirementSignature: tokenSignature,
          deadline,
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
    expect(() =>
      blueRepayWithdrawCollateral({
        market,
        args: {
          userAddress,
          repayAssets: 5n,
          repayShares: 0n,
          maxRepayAssets: 5n,
          collateralAssets: 0n,
          maxLtv: maxUint256,
          authorizationSignature,
          deadline,
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });
});
