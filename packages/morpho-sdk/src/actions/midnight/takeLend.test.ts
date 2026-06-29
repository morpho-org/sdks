import { midnightBundlesAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightApiTake,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  EmptyMidnightTakesError,
  MidnightTakeMarketMismatchError,
  MidnightTakeSideMismatchError,
  type TokenRequirementSignature,
} from "../../types/index.js";
import { midnightTakeLend } from "./takeLend.js";
import { PermitKind } from "./types.js";

describe("midnightTakeLend", () => {
  test("default", () => {
    const takes = [midnightApiTake()];
    const tx = midnightTakeLend({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      takes,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesAbi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightAddresses.midnightBundles);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      takes: 1,
    });
    expect(decoded.functionName).toBe(
      "buyWithAssetsTargetAndWithdrawCollateral",
    );
    expect(decoded.args[0]).toBe(1_000n);
    expect(decoded.args[1]).toBe(900n);
    expect(decoded.args?.[3]).toEqual({
      kind: PermitKind.None,
      data: "0x",
    });
  });

  test("behavior: encodes loan token permit", () => {
    const tx = midnightTakeLend({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1_000n,
      minUnits: 900n,
      taker: midnightAddresses.taker,
      takes: [midnightApiTake()],
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

  test("error: EmptyMidnightTakesError", () => {
    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takes: [],
      }),
    ).toThrow(EmptyMidnightTakesError);
  });

  test("error: MidnightTakeSideMismatchError", () => {
    const takes = [midnightApiTake({ buy: true })];

    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takes,
      }),
    ).toThrow(MidnightTakeSideMismatchError);
  });

  test("error: MidnightTakeMarketMismatchError", () => {
    const takes = [midnightApiTake({ market: midnightOtherMarket })];

    expect(() =>
      midnightTakeLend({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 1_000n,
        minUnits: 900n,
        taker: midnightAddresses.taker,
        takes,
      }),
    ).toThrow(MidnightTakeMarketMismatchError);
  });
});
