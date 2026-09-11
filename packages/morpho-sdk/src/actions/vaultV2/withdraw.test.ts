import { MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import { decodeFunctionData, maxUint256, zeroHash } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, expectTypeOf, test } from "vitest";
import { vaultBundlesV1Abi } from "../../abis.js";
import {
  BundlesPermitMismatchError,
  type Erc2612RequirementSignature,
  InputExceedsMaxError,
  NonPositiveInputError,
  type VaultWithdrawalAuthorization,
} from "../../types/index.js";
import { vaultV2Withdraw } from "./withdraw.js";

const chainId = mainnet.id;
const vault = "0x0000000000000000000000000000000000000041" as const;
const userAddress = "0x0000000000000000000000000000000000000042" as const;
const feeRecipient = "0x0000000000000000000000000000000000000043" as const;
const positiveUint256 = fc.bigInt({ min: 1n, max: maxUint256 });

describe("vaultV2Withdraw", () => {
  test("default", () => {
    const deadline = 1_900_000_000n;
    const referralFeePct = MathLib.WAD / 2n;
    const transaction = vaultV2Withdraw({
      vault: { chainId, address: vault },
      args: {
        authorization: { type: "allowance" },
        amount: 100n,
        userAddress,
        referralFeePct,
        referralFeeRecipient: feeRecipient,
        deadline,
      },
    });
    expect(transaction.to).toBe(
      getChainAddress(chainId, "bundles.vaultBundlesV1"),
    );
    expect(
      decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
    ).toEqual({
      functionName: "vaultBundlesV1Withdraw",
      args: [
        vault,
        100n,
        0n,
        { value: 0n, nonce: 0n, deadline, v: 0, r: zeroHash, s: zeroHash },
        referralFeePct,
        feeRecipient,
        deadline,
      ],
    });
    expect(transaction.action.args.referralFeeAssets).toBe(50n);
    expect(transaction.action.args.netAssets).toBe(50n);
  });

  test("behavior: permit calldata binds an independently supplied share allowance", () => {
    fc.assert(
      fc.property(
        fc.record({
          assets: positiveUint256,
          shareAllowance: positiveUint256,
          deadline: positiveUint256,
        }),
        ({ assets, shareAllowance, deadline }) => {
          const signature: Erc2612RequirementSignature = {
            args: {
              owner: userAddress,
              asset: vault,
              amount: shareAllowance,
              nonce: 7n,
              deadline,
              signature: `0x${"11".repeat(64)}1b`,
            },
            action: {
              type: "permit",
              args: {
                spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
                amount: shareAllowance,
                deadline,
                nonce: 7n,
              },
            },
          };
          const tx = vaultV2Withdraw({
            vault: { chainId, address: vault },
            args: {
              amount: assets,
              userAddress,
              deadline,
              authorization: { type: "permit", signature, shareAllowance },
            },
          });
          const decoded = decodeFunctionData({
            abi: vaultBundlesV1Abi,
            data: tx.data,
          });
          expect(decoded.args?.[1]).toBe(assets);
          expect(decoded.args?.[3]).toMatchObject({
            value: shareAllowance,
            nonce: 7n,
            deadline,
            v: 27,
          });
          expect(Object.isFrozen(tx)).toBe(true);
        },
      ),
      { numRuns: 50, seed: 20_260_911 },
    );
  });

  test.each([99n, 101n, undefined])(
    "error: BundlesPermitMismatchError for share allowance %s",
    (shareAllowance) => {
      const signature: Erc2612RequirementSignature = {
        args: {
          owner: userAddress,
          asset: vault,
          amount: 100n,
          nonce: 0n,
          deadline: 1n,
          signature: `0x${"11".repeat(64)}1b`,
        },
        action: {
          type: "permit",
          args: {
            spender: getChainAddress(chainId, "bundles.vaultBundlesV1"),
            amount: 100n,
            deadline: 1n,
            nonce: 0n,
          },
        },
      };
      // Exercise malformed JavaScript input as well as mismatched explicit share caps.
      const authorization = {
        type: "permit",
        signature,
        shareAllowance,
      } as VaultWithdrawalAuthorization;
      expect(() =>
        vaultV2Withdraw({
          vault: { chainId, address: vault },
          args: { amount: 1n, userAddress, deadline: 1n, authorization },
        }),
      ).toThrow(BundlesPermitMismatchError);
    },
  );

  test("behavior: permit authorization requires a share allowance at the type boundary", () => {
    expectTypeOf<{
      readonly type: "permit";
      readonly signature: Erc2612RequirementSignature;
    }>().not.toExtend<VaultWithdrawalAuthorization>();
  });

  test("behavior: calldata round-trips across uint256 inputs", () => {
    fc.assert(
      fc.property(positiveUint256, positiveUint256, (amount, deadline) => {
        const transaction = vaultV2Withdraw({
          vault: { chainId, address: vault },
          args: {
            authorization: { type: "allowance" },
            amount,
            userAddress,
            deadline,
          },
        });
        const decoded = decodeFunctionData({
          abi: vaultBundlesV1Abi,
          data: transaction.data,
        });
        expect(decoded.functionName).toBe("vaultBundlesV1Withdraw");
        expect(decoded.args?.[1]).toBe(amount);
        expect(decoded.args?.[2]).toBe(0n);
        expect(decoded.args?.[6]).toBe(deadline);
      }),
      { numRuns: 50, seed: 20_260_905 },
    );
  });

  test("behavior: accepts maxUint256 assets", () => {
    const transaction = vaultV2Withdraw({
      vault: { chainId, address: vault },
      args: {
        authorization: { type: "allowance" },
        amount: maxUint256,
        userAddress,
        deadline: 1n,
      },
    });

    expect(
      decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data })
        .args?.[1],
    ).toBe(maxUint256);
  });

  test("error: InputExceedsMaxError", () => {
    expect(() =>
      vaultV2Withdraw({
        vault: { chainId, address: vault },
        args: {
          authorization: { type: "allowance" },
          amount: maxUint256 + 1n,
          userAddress,
          deadline: 1n,
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      vaultV2Withdraw({
        vault: { chainId, address: vault },
        args: {
          authorization: { type: "allowance" },
          amount: -1n,
          userAddress,
          deadline: 1n,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });
});
