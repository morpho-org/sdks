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
  BlueBundlesV1RequirementSignatureMismatchError,
  DepositOwnerMismatchError,
  InputExceedsMaxError,
  MutuallyExclusiveWithdrawAmountsError,
  ReallocationLoanTokenMismatchError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { blueWithdraw } from "./withdraw.js";

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
const emptyAuthorization = {
  signature: { v: 0, r: zeroHash, s: zeroHash },
  nonce: 0n,
  deadline: 0n,
} as const;
const positiveUint256Arbitrary = fc.bigInt({ min: 1n, max: maxUint256 });

describe("blueWithdraw", () => {
  test("default", () => {
    const referralFeePct = MathLib.WAD / 10n;
    const plain = blueWithdraw({
      market,
      args: {
        userAddress,
        withdrawAssets: 5n,
        withdrawShares: 0n,
        deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    });
    const transaction = blueWithdraw({
      market,
      args: {
        userAddress,
        withdrawAssets: 5n,
        withdrawShares: 0n,
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
      functionName: "blueBundlesV1Withdraw",
      args: [
        marketParamsInput,
        5n,
        0n,
        emptyAuthorization,
        [],
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    });
    expect(transaction.action).toEqual({
      type: "blueWithdraw",
      args: {
        market: marketParams.id,
        withdrawAssets: 5n,
        withdrawShares: 0n,
        onBehalf: userAddress,
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
          amount: positiveUint256Arbitrary,
          deadline: positiveUint256Arbitrary,
          useShares: fc.boolean(),
        }),
        ({ amount, deadline: generatedDeadline, useShares }) => {
          const withdrawAssets = useShares ? 0n : amount;
          const withdrawShares = useShares ? amount : 0n;
          const transaction = blueWithdraw({
            market,
            args: {
              userAddress,
              withdrawAssets,
              withdrawShares,
              deadline: generatedDeadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: blueBundlesV1Abi,
            data: transaction.data,
          });
          if (decoded.functionName !== "blueBundlesV1Withdraw") {
            throw new TypeError("Unexpected BlueBundlesV1 withdraw function");
          }

          expect(decoded.args[0]).toEqual(marketParamsInput);
          expect(decoded.args[1]).toBe(withdrawAssets);
          expect(decoded.args[2]).toBe(withdrawShares);
          expect(decoded.args[7]).toBe(generatedDeadline);
          expect(transaction.action.args).toMatchObject({
            withdrawAssets,
            withdrawShares,
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

  test("behavior: supports shares mode and normalizes an omitted referral fee", () => {
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueWithdraw({
        market,
        args: {
          userAddress,
          withdrawAssets: 0n,
          withdrawShares: 7n,
          deadline,
        },
      }).data,
    });

    expect(decoded.functionName).toBe("blueBundlesV1Withdraw");
    expect(decoded.args?.[1]).toBe(0n);
    expect(decoded.args?.[2]).toBe(7n);
    expect(decoded.args?.[5]).toBe(0n);
    expect(decoded.args?.[6]).toBe(zeroAddress);
  });

  test("behavior: encodes authorization and rejects mismatched signature metadata", () => {
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const signature = serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    });
    const authorizationSignature = {
      args: {
        owner: userAddress,
        authorized: blueBundlesV1,
        isAuthorized: true,
        nonce: 7n,
        deadline: 456n,
        signature,
      },
      action: {
        type: "authorization",
        args: {
          authorized: blueBundlesV1,
          isAuthorized: true,
          deadline: 456n,
        },
      },
    } satisfies AuthorizationRequirementSignature;
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: blueWithdraw({
        market,
        args: {
          userAddress,
          withdrawAssets: 5n,
          withdrawShares: 0n,
          authorizationSignature,
          deadline,
        },
      }).data,
    });

    expect(decoded.args?.[3]).toMatchObject({
      signature: { v: 27 },
      nonce: 7n,
      deadline: 456n,
    });
    expect(() =>
      blueWithdraw({
        market,
        args: {
          userAddress,
          withdrawAssets: 5n,
          withdrawShares: 0n,
          deadline,
          authorizationSignature: {
            ...authorizationSignature,
            action: {
              ...authorizationSignature.action,
              args: {
                ...authorizationSignature.action.args,
                deadline: 457n,
              },
            },
          },
        },
      }),
    ).toThrow(BlueBundlesV1RequirementSignatureMismatchError);
  });

  test("error: binds every authorization signature field", () => {
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const signature = serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    });
    const authorization = {
      args: {
        owner: userAddress,
        authorized: blueBundlesV1,
        isAuthorized: true,
        nonce: 7n,
        deadline,
        signature,
      },
      action: {
        type: "authorization",
        args: { authorized: blueBundlesV1, isAuthorized: true, deadline },
      },
    } satisfies AuthorizationRequirementSignature;
    const otherAddress = getAddress(
      "0x00000000000000000000000000000000000000B1",
    );
    const cases = [
      [
        "owner",
        {
          ...authorization,
          args: { ...authorization.args, owner: otherAddress },
        },
        DepositOwnerMismatchError,
      ],
      [
        "signed authorized",
        {
          ...authorization,
          args: { ...authorization.args, authorized: otherAddress },
        },
        BlueBundlesV1RequirementSignatureMismatchError,
      ],
      [
        "action authorized",
        {
          ...authorization,
          action: {
            ...authorization.action,
            args: { ...authorization.action.args, authorized: otherAddress },
          },
        },
        BlueBundlesV1RequirementSignatureMismatchError,
      ],
      [
        "signed isAuthorized",
        {
          ...authorization,
          args: { ...authorization.args, isAuthorized: false },
        },
        BlueBundlesV1RequirementSignatureMismatchError,
      ],
      [
        "action isAuthorized",
        {
          ...authorization,
          action: {
            ...authorization.action,
            args: { ...authorization.action.args, isAuthorized: false },
          },
        },
        BlueBundlesV1RequirementSignatureMismatchError,
      ],
      [
        "serialized signature",
        {
          ...authorization,
          args: { ...authorization.args, signature: "0x12" as const },
        },
        BlueBundlesV1RequirementSignatureMismatchError,
      ],
    ] as const;

    for (const [, authorizationSignature, ErrorClass] of cases) {
      expect(() =>
        blueWithdraw({
          market,
          args: {
            userAddress,
            withdrawAssets: 5n,
            withdrawShares: 0n,
            deadline,
            authorizationSignature,
          },
        }),
      ).toThrow(ErrorClass);
    }
  });

  test("behavior: maps Vault V2 reallocations and rounds each penalty up", () => {
    const vault = getAddress("0x0000000000000000000000000000000000000031");
    const adapter = getAddress("0x0000000000000000000000000000000000000032");
    const reallocation = {
      vault,
      from: { type: "idle" },
      to: { adapter },
      assets: 3n,
      penalty: MathLib.WAD / 2n,
    } satisfies VaultV2BlueReallocation;
    const transaction = blueWithdraw({
      market,
      args: {
        userAddress,
        withdrawAssets: 5n,
        withdrawShares: 0n,
        reallocations: [reallocation],
        deadline,
      },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });

    expect(decoded.args?.[4]).toEqual([
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
  });

  test("error: amount and reallocation invariants", () => {
    expect(() =>
      blueWithdraw({
        market,
        args: {
          userAddress,
          withdrawAssets: 1n,
          withdrawShares: 1n,
          deadline: maxUint256,
        },
      }),
    ).toThrow(MutuallyExclusiveWithdrawAmountsError);

    const sourceMarketParams = new MarketParams({
      ...marketParamsInput,
      loanToken: getAddress("0x0000000000000000000000000000000000000091"),
      oracle: getAddress("0x0000000000000000000000000000000000000093"),
    });
    const reallocation = {
      vault: getAddress("0x0000000000000000000000000000000000000041"),
      from: {
        type: "market",
        adapter: getAddress("0x0000000000000000000000000000000000000042"),
        marketParams: sourceMarketParams,
      },
      to: {
        adapter: getAddress("0x0000000000000000000000000000000000000043"),
      },
      assets: 1n,
      penalty: 0n,
    } satisfies VaultV2BlueReallocation;

    expect(() =>
      blueWithdraw({
        market,
        args: {
          userAddress,
          withdrawAssets: 1n,
          withdrawShares: 0n,
          reallocations: [reallocation],
          deadline,
        },
      }),
    ).toThrow(ReallocationLoanTokenMismatchError);
  });

  test("error: InputExceedsMaxError when a withdraw amount exceeds uint256", () => {
    expect(() =>
      blueWithdraw({
        market,
        args: {
          userAddress,
          withdrawAssets: maxUint256 + 1n,
          withdrawShares: 0n,
          deadline,
        },
      }),
    ).toThrow(InputExceedsMaxError);

    expect(() =>
      blueWithdraw({
        market,
        args: {
          userAddress,
          withdrawAssets: 0n,
          withdrawShares: maxUint256 + 1n,
          deadline,
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });
});
