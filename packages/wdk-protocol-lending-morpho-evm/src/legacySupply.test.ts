import { getChainAddress, getChainAddresses } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import {
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  type PermitRequirementSignature,
  UnexpectedRequirementSignatureError,
} from "@morpho-org/morpho-sdk";
import {
  bundler3Abi,
  coreAdapterAbi,
  generalAdapter1Abi,
} from "@morpho-org/morpho-sdk/abis";
import { decodeFunctionData, serializeSignature, toHex } from "viem";
import { describe, expect, test } from "vitest";
import { encodeLegacySupply } from "./legacySupply.js";

const { bundler3 } = getChainAddresses(1);
const wNative = getChainAddress(1, "wNative");
const usdc = getChainAddress(1, "usdc");
const vault = "0xBb50A5341368751024ddf33385BA8cf61fE65FF9";
const userAddress = "0x0000000000000000000000000000000000000001";
const params = {
  chainId: 1,
  vault,
  asset: wNative,
  userAddress,
  amount: 10n,
  nativeAmount: 0n,
  maxSharePrice: 10n ** 27n,
} as const;

const decodeCalls = (transaction: ReturnType<typeof encodeLegacySupply>) => {
  const decoded = decodeFunctionData({
    abi: bundler3Abi,
    data: transaction.data,
  });
  if (decoded.functionName !== "multicall")
    throw new Error("Expected Bundler3 multicall");
  return decoded.args[0]
    .filter((call) => call.data !== "0x")
    .map((call) => ({
      ...decodeFunctionData({
        abi: [
          ...coreAdapterAbi,
          ...generalAdapter1Abi,
          ...erc2612Abi,
          ...permit2Abi,
        ],
        data: call.data,
      }),
      to: call.to,
      skipRevert: call.skipRevert,
    }));
};

describe("encodeLegacySupply", () => {
  test.each(
    [0n, 1n, 10n ** 24n].flatMap((amount) =>
      [0n, 1n, 10n ** 24n]
        .filter((nativeAmount) => amount + nativeAmount > 0n)
        .map((nativeAmount) => ({ amount, nativeAmount })),
    ),
  )(
    "behavior: funding is conserved for ERC-20 $amount and native $nativeAmount",
    (funding) => {
      const transaction = encodeLegacySupply({ ...params, ...funding });
      expect(Object.isFrozen(transaction)).toBe(true);
      expect(transaction.to).toBe(bundler3.bundler3);
      expect(transaction.value).toBe(funding.nativeAmount);
      const calls = decodeCalls(transaction);
      expect(calls.at(-1)).toMatchObject({
        functionName: "erc4626Deposit",
        args: [
          vault,
          funding.amount + funding.nativeAmount,
          params.maxSharePrice,
          userAddress,
        ],
        to: bundler3.generalAdapter1,
        skipRevert: false,
      });
      expect(
        calls.filter((call) => call.functionName === "erc20TransferFrom"),
      ).toHaveLength(funding.amount > 0n ? 1 : 0);
      expect(
        calls.filter((call) => call.functionName === "wrapNative"),
      ).toHaveLength(funding.nativeAmount > 0n ? 1 : 0);
    },
  );

  test.each(["permit", "permit2"] as const)(
    "behavior: legacy %s is consumed before the deposit",
    (type) => {
      const args = {
        spender: bundler3.generalAdapter1,
        amount: params.amount,
        deadline: 1_900_000_000n,
        expiration: 1_900_000_000n,
      };
      const permitArgs = {
        owner: userAddress,
        asset: wNative,
        amount: params.amount,
        nonce: 0n,
        deadline: args.deadline,
        expiration: args.expiration,
        signature: serializeSignature({
          r: toHex(1n, { size: 32 }),
          s: toHex(2n, { size: 32 }),
          yParity: 0,
        }),
      } as const;
      const requirementSignature =
        type === "permit"
          ? ({
              action: { type, args },
              args: permitArgs,
            } satisfies PermitRequirementSignature)
          : ({
              action: { type, args },
              args: permitArgs,
            } satisfies PermitRequirementSignature);
      const calls = decodeCalls(
        encodeLegacySupply({ ...params, requirementSignature }),
      );
      expect(calls.map((call) => call.functionName)).toEqual(
        type === "permit"
          ? ["permit", "erc20TransferFrom", "erc4626Deposit"]
          : ["permit", "permit2TransferFrom", "erc4626Deposit"],
      );
      expect(() =>
        encodeLegacySupply({
          ...params,
          requirementSignature: {
            ...requirementSignature,
            args: { ...requirementSignature.args, amount: 1n },
          },
        }),
      ).toThrow(DepositAmountMismatchError);
      expect(() =>
        encodeLegacySupply({
          ...params,
          requirementSignature: {
            ...requirementSignature,
            args: { ...requirementSignature.args, asset: usdc },
          },
        }),
      ).toThrow(DepositAssetMismatchError);
    },
  );

  test("error: inflation guard rejects a zero share-price bound with valid funding", () => {
    expect(() => encodeLegacySupply({ ...params, maxSharePrice: 0n })).toThrow(
      NonPositiveInputError,
    );
  });

  test("error: UnexpectedRequirementSignatureError for the successor's SignatureTransfer permit", () => {
    expect(() =>
      encodeLegacySupply({
        ...params,
        requirementSignature: {
          action: {
            type: "permit2SignatureTransfer",
            args: {
              spender: bundler3.generalAdapter1,
              amount: params.amount,
              nonce: 0n,
              deadline: 1_900_000_000n,
            },
          },
          args: {
            owner: userAddress,
            asset: wNative,
            amount: params.amount,
            nonce: 0n,
            deadline: 1_900_000_000n,
            signature: "0x",
          },
        },
      }),
    ).toThrow(UnexpectedRequirementSignatureError);
  });

  test("error: native routing rejects another vault asset", () => {
    expect(() =>
      encodeLegacySupply({ ...params, asset: usdc, nativeAmount: 1n }),
    ).toThrow(NativeAmountOnNonWNativeVaultError);
  });

  test("error: zero and negative funding", () => {
    expect(() => encodeLegacySupply({ ...params, amount: 0n })).toThrow(
      NonPositiveInputError,
    );
    expect(() => encodeLegacySupply({ ...params, amount: -1n })).toThrow(
      NegativeInputError,
    );
    expect(() => encodeLegacySupply({ ...params, nativeAmount: -1n })).toThrow(
      NegativeInputError,
    );
  });

  test("behavior: metadata preserves the encoded calls", () => {
    const transaction = encodeLegacySupply({
      ...params,
      metadata: { origin: "legacy-wdk" },
    });
    expect(decodeCalls(transaction).at(-1)).toMatchObject({
      functionName: "erc4626Deposit",
    });
  });
});
