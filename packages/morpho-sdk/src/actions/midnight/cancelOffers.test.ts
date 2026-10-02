import { midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import {
  registerCustomAddresses,
  UnknownAddressError,
} from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  getAddress,
  type Hex,
  maxUint128,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import { midnightChainId } from "../../../test/fixtures/midnight.js";
import {
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightGroupCancellationsError,
  InputExceedsMaxError,
  NegativeInputError,
} from "../../types/index.js";
import { midnightSetIsAuthorized } from "./authorization.js";
import { midnightCancelOffers } from "./cancelOffers.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const groupA = `0x${"11".repeat(32)}` as Hex;
const groupB = `0x${"22".repeat(32)}` as Hex;

describe("midnightCancelOffers", () => {
  test("default", () => {
    const cancellations = [
      { group: groupA, maxConsumed: 0n },
      { group: groupB, maxConsumed: 5n },
    ];
    const tx = midnightCancelOffers({
      chainId: midnightChainId,
      cancellations,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(decoded.functionName).toBe("midnightBundlesV2CancelAndMake");
    expect(decoded.args).toEqual([
      {
        loanToken: zeroAddress,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      },
      0n,
      zeroHash,
      {
        chainId: 0n,
        midnight: zeroAddress,
        loanToken: zeroAddress,
        collateralParams: [],
        maturity: 0n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      },
      [],
      zeroAddress,
      zeroHash,
      0n,
      0n,
      0n,
      0,
      zeroHash,
      zeroHash,
      cancellations,
      "0x",
      maxUint256,
      zeroAddress,
    ]);
    expect(tx.action).toEqual({
      type: "midnightCancelOffers",
      args: { cancellations, deadline: maxUint256 },
    });
    expect(Object.isFrozen(tx.action.args.cancellations[0])).toBe(true);
  });

  test("behavior: appends metadata and does not freeze caller input", () => {
    const cancellations = [{ group: groupA, maxConsumed: maxUint128 }];
    const tx = midnightCancelOffers({
      chainId: midnightChainId,
      cancellations,
      deadline: 1n,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    expect(Object.isFrozen(cancellations[0])).toBe(false);
  });

  test("error: EmptyMidnightGroupCancellationsError on no groups", () => {
    expect(() =>
      midnightCancelOffers({
        chainId: midnightChainId,
        cancellations: [],
        deadline: maxUint256,
      }),
    ).toThrow(EmptyMidnightGroupCancellationsError);
  });

  test("error: DuplicateMidnightGroupCancellationError on repeated group", () => {
    expect(() =>
      midnightCancelOffers({
        chainId: midnightChainId,
        cancellations: [
          { group: groupA, maxConsumed: 0n },
          {
            group: groupA.toUpperCase().replace("0X", "0x") as Hex,
            maxConsumed: 1n,
          },
        ],
        deadline: maxUint256,
      }),
    ).toThrow(DuplicateMidnightGroupCancellationError);
  });

  test("error: NegativeInputError on negative ceiling or deadline", () => {
    expect(() =>
      midnightCancelOffers({
        chainId: midnightChainId,
        cancellations: [{ group: groupA, maxConsumed: -1n }],
        deadline: maxUint256,
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      midnightCancelOffers({
        chainId: midnightChainId,
        cancellations: [{ group: groupA, maxConsumed: 0n }],
        deadline: -1n,
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError on ceiling above uint128", () => {
    expect(() =>
      midnightCancelOffers({
        chainId: midnightChainId,
        cancellations: [{ group: groupA, maxConsumed: maxUint128 + 1n }],
        deadline: maxUint256,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnknownAddressError without a midnightBundlesV2 deployment", () => {
    expect(() =>
      midnightCancelOffers({
        chainId: 1,
        cancellations: [{ group: zeroHash, maxConsumed: 0n }],
        deadline: maxUint256,
      }),
    ).toThrow(UnknownAddressError);
  });

  test("behavior: MidnightBundlesV2 is an accepted Midnight authorization target", () => {
    const tx = midnightSetIsAuthorized({
      chainId: midnightChainId,
      authorized: midnightBundlesV2,
      onBehalf: zeroAddress,
    });

    expect(tx.action.args.authorized).toBe(midnightBundlesV2);
  });
});
