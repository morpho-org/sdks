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
  InputExceedsMaxError,
  NativeFundingAmountMismatchError,
  NegativeInputError,
  NonPositiveInputError,
  ReallocationsRequireBorrowError,
  UnexpectedRequirementSignatureError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";

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
const ltvArbitrary = fc.bigInt({ min: 0n, max: MathLib.WAD });

describe("blueSupplyCollateralBorrow", () => {
  test("default", () => {
    const referralFeePct = MathLib.WAD / 10n;
    const plain = blueSupplyCollateralBorrow({
      market,
      args: {
        userAddress,
        collateralAssets: 5n,
        borrowAssets: 7n,
        maxLtv,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    });
    const transaction = blueSupplyCollateralBorrow({
      market,
      args: {
        userAddress,
        collateralAssets: 5n,
        borrowAssets: 7n,
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
      functionName: "blueBundlesV1SupplyCollateralAndBorrow",
      args: [
        marketParamsInput,
        5n,
        7n,
        maxLtv,
        emptyPermit,
        emptyAuthorization,
        [],
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    });
    expect(transaction.action).toEqual({
      type: "blueSupplyCollateralBorrow",
      args: {
        market: marketParams.id,
        collateralAssets: 5n,
        borrowAssets: 7n,
        maxLtv,
        onBehalf: userAddress,
        nativeAmount: undefined,
        reallocations: 0,
        reallocationPenaltyAssets: 0n,
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
          collateralAssets: positiveUint256Arbitrary,
          borrowAssets: positiveUint256Arbitrary,
          maxLtv: ltvArbitrary,
          deadline: positiveUint256Arbitrary,
        }),
        ({
          collateralAssets,
          borrowAssets,
          maxLtv: generatedMaxLtv,
          deadline: generatedDeadline,
        }) => {
          const transaction = blueSupplyCollateralBorrow({
            market,
            args: {
              userAddress,
              collateralAssets,
              borrowAssets,
              maxLtv: generatedMaxLtv,
              deadline: generatedDeadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: blueBundlesV1Abi,
            data: transaction.data,
          });
          if (
            decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow"
          ) {
            throw new TypeError(
              "Unexpected BlueBundlesV1 collateral supply and borrow function",
            );
          }

          expect(decoded.args[0]).toEqual(marketParamsInput);
          expect(decoded.args.slice(1, 4)).toEqual([
            collateralAssets,
            borrowAssets,
            generatedMaxLtv,
          ]);
          expect(decoded.args[9]).toBe(generatedDeadline);
          expect(transaction.action.args).toMatchObject({
            collateralAssets,
            borrowAssets,
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
    const collateralOnly = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 5n,
          borrowAssets: 0n,
          maxLtv: maxUint256,
          deadline,
        },
      }).data,
    });
    const borrowOnly = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 0n,
          borrowAssets: 7n,
          maxLtv,
          deadline,
        },
      }).data,
    });

    expect(collateralOnly.args?.slice(1, 4)).toEqual([5n, 0n, maxUint256]);
    expect(borrowOnly.args?.slice(1, 4)).toEqual([0n, 7n, maxLtv]);
    expect(collateralOnly.args?.[7]).toBe(0n);
    expect(collateralOnly.args?.[8]).toBe(zeroAddress);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 0n,
          borrowAssets: 0n,
          maxLtv,
          deadline,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NegativeInputError for negative operation inputs", () => {
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: -1n,
          borrowAssets: 0n,
          maxLtv,
          deadline,
        },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 0n,
          borrowAssets: -1n,
          maxLtv,
          deadline,
        },
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 1n,
          borrowAssets: 0n,
          maxLtv: -1n,
          deadline,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError when a uint256 argument overflows", () => {
    for (const field of [
      "collateralAssets",
      "borrowAssets",
      "maxLtv",
    ] as const) {
      expect(() =>
        blueSupplyCollateralBorrow({
          market,
          args: {
            userAddress,
            collateralAssets: 1n,
            borrowAssets: 1n,
            maxLtv,
            deadline,
            [field]: maxUint256 + 1n,
          },
        }),
      ).toThrow(InputExceedsMaxError);
    }
  });

  test("behavior: maps Vault V2 reallocations and accounts for rounded-up penalties", () => {
    const vault = getAddress("0x0000000000000000000000000000000000000031");
    const adapter = getAddress("0x0000000000000000000000000000000000000032");
    const reallocation = {
      vault,
      from: { type: "idle" },
      to: { adapter },
      assets: 3n,
      penalty: MathLib.WAD / 2n,
    } satisfies VaultV2BlueReallocation;
    const transaction = blueSupplyCollateralBorrow({
      market,
      args: {
        userAddress,
        collateralAssets: 0n,
        borrowAssets: 5n,
        maxLtv,
        reallocations: [reallocation],
        deadline,
      },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });

    expect(decoded.args?.[6]).toEqual([
      {
        vault,
        adapter,
        marketParams: marketParamsInput,
        fromIdle: true,
        sourceAdapter: zeroAddress,
        sourceMarketParams: {
          loanToken: marketParams.loanToken,
          collateralToken: zeroAddress,
          oracle: zeroAddress,
          irm: zeroAddress,
          lltv: 0n,
        },
        assets: 3n,
        penalty: MathLib.WAD / 2n,
      },
    ]);
    expect(transaction.action.args.reallocationPenaltyAssets).toBe(2n);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 0n,
          borrowAssets: 1n,
          maxLtv,
          reallocations: [reallocation],
          deadline,
        },
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 1n,
          borrowAssets: 0n,
          maxLtv: maxUint256,
          reallocations: [reallocation],
          deadline,
        },
      }),
    ).toThrow(ReallocationsRequireBorrowError);
  });

  test("behavior: native collateral funding equals the full collateral leg", () => {
    const nativeMarketParams = new MarketParams({
      ...marketParamsInput,
      collateralToken: getChainAddress(chainId, "wNative"),
    });
    const nativeMarket = { chainId, marketParams: nativeMarketParams };

    expect(
      blueSupplyCollateralBorrow({
        market: nativeMarket,
        args: {
          userAddress,
          collateralAssets: 2n,
          borrowAssets: 0n,
          maxLtv: maxUint256,
          nativeAmount: 2n,
          deadline,
        },
      }).value,
    ).toBe(2n);
    expect(() =>
      blueSupplyCollateralBorrow({
        market: nativeMarket,
        args: {
          userAddress,
          collateralAssets: 2n,
          borrowAssets: 0n,
          maxLtv: maxUint256,
          nativeAmount: 1n,
          deadline,
        },
      }),
    ).toThrow(NativeFundingAmountMismatchError);
  });

  test("error: UnexpectedRequirementSignatureError for inactive legs", () => {
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const serializedSignature = serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    });
    const tokenSignature = {
      args: {
        owner: userAddress,
        nonce: 1n,
        asset: marketParams.collateralToken,
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
        signature: serializedSignature,
      },
      action: {
        type: "authorization",
        args: { authorized: blueBundlesV1, isAuthorized: true, deadline },
      },
    } satisfies AuthorizationRequirementSignature;

    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 0n,
          borrowAssets: 5n,
          maxLtv,
          requirementSignature: tokenSignature,
          deadline,
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
    expect(() =>
      blueSupplyCollateralBorrow({
        market,
        args: {
          userAddress,
          collateralAssets: 5n,
          borrowAssets: 0n,
          maxLtv: maxUint256,
          authorizationSignature,
          deadline,
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });
});
