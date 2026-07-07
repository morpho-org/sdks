import {
  midnightBundlesAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
} from "../../../test/fixtures/midnight.js";
import type { TokenRequirementSignature } from "../../types/index.js";
import { midnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import { PermitKind } from "./types.js";

describe("midnightRepayWithdrawCollateral", () => {
  test("default", () => {
    const tx = midnightRepayWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      repayAssets: 1_000n,
      withdrawCollateralAssets: 2_000n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      repayAssets: 1_000n,
      collateralWithdrawals: 1,
      onBehalf: midnightAddresses.taker,
      collateralReceiver: midnightAddresses.taker,
      referralFeePct: 0n,
      referralFeeRecipient: zeroAddress,
      deadline: maxUint256,
    });
    expect(decoded.functionName).toBe(
      "midnightBundlesV1RepayAndWithdrawCollateral",
    );
    expect(decoded.args[1]).toBe(1_000n);
    expect(decoded.args?.[3]).toEqual({
      kind: PermitKind.None,
      data: "0x",
    });
  });

  test("behavior: encodes loan token permit", () => {
    const tx = midnightRepayWithdrawCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      repayAssets: 1_000n,
      withdrawCollateralAssets: 0n,
      onBehalf: midnightAddresses.taker,
      deadline: maxUint256,
      signatures: [
        {
          action: {
            type: "permit2Transfer",
            args: {
              spender: midnightAddresses.midnightBundles,
              amount: 1_000n,
              deadline: 123n,
            },
          },
          args: {
            owner: midnightAddresses.taker,
            nonce: 42n,
            asset: midnightAddresses.loanToken,
            signature: "0x1234",
            amount: 1_000n,
            deadline: 123n,
          },
        } satisfies TokenRequirementSignature,
      ],
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(decoded.args?.[3]).toMatchObject({
      kind: PermitKind.Permit2,
    });
  });

  test("error: UnknownCollateralIndexError for default withdrawal", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        repayAssets: 0n,
        withdrawCollateralAssets: 2_000n,
        collateralIndex: 1n,
        onBehalf: midnightAddresses.taker,
        deadline: maxUint256,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: UnknownCollateralIndexError for listed withdrawal", () => {
    expect(() =>
      midnightRepayWithdrawCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        repayAssets: 1_000n,
        withdrawCollateralAssets: 0n,
        collateralWithdrawals: [{ collateralIndex: 1n, assets: 2_000n }],
        onBehalf: midnightAddresses.taker,
        deadline: maxUint256,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });
});
