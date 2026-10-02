import {
  InvalidTreeError,
  MarketParams,
  MarketUtils,
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  registerCustomAddresses,
  UnknownAddressError,
} from "@morpho-org/morpho-ts";
import fc from "fast-check";
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
import {
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightGroupCancellationsError,
  InputExceedsMaxError,
  MidnightMarketAddressMismatchError,
  MidnightReplacementGroupCancelledError,
  NegativeInputError,
  NonPositiveInputError,
  UnknownMidnightRatifierError,
} from "../../types/index.js";
import { midnightCancelAndMake } from "./cancelAndMake.js";

const midnightBundlesV2 = getAddress(
  "0x00000000000000000000000000000000000b2002",
);
registerCustomAddresses({
  addresses: { [midnightChainId]: { midnightBundlesV2 } },
});

const rateRatifierV1 = getChainAddress(midnightChainId, "rateRatifierV1");
const priceRatifierV1 = getChainAddress(midnightChainId, "priceRatifierV1");
const root = `0x${"cd".repeat(32)}` as Hex;
const groupA = `0x${"11".repeat(32)}` as Hex;
const groupB = `0x${"22".repeat(32)}` as Hex;
const market = new MarketParams(midnightMarket);

const params = {
  chainId: midnightChainId,
  ratifier: rateRatifierV1,
  root,
  groups: [groupA],
  payload: "0x1234" as Hex,
  cancellations: [{ group: groupB, maxConsumed: 5n }],
  deadline: maxUint256,
};

describe("midnightCancelAndMake", () => {
  test("default", () => {
    const tx = midnightCancelAndMake(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(decoded.functionName).toBe("midnightBundlesV2CancelAndMake");
    expect(decoded.args.slice(1, 3)).toEqual([0n, zeroHash]);
    expect(decoded.args.slice(4)).toEqual([
      [],
      rateRatifierV1,
      root,
      0n,
      0n,
      0n,
      0,
      zeroHash,
      zeroHash,
      [{ group: groupB, maxConsumed: 5n }],
      "0x1234",
      maxUint256,
      zeroAddress,
    ]);
    expect(tx.action).toEqual({
      type: "midnightCancelAndMake",
      args: {
        ratifier: rateRatifierV1,
        root,
        groups: [groupA],
        cancellations: [{ group: groupB, maxConsumed: 5n }],
        collateralSupplies: [],
        deadline: maxUint256,
      },
    });
    expect(Object.isFrozen(tx.action.args.groups)).toBe(true);
  });

  test("behavior: accepts PriceRatifierV1 and an explicit root signature", () => {
    const rootSignature = {
      height: 3n,
      nonce: 7n,
      deadline: 1_900_000_000n,
      v: 27,
      r: `0x${"aa".repeat(32)}` as Hex,
      s: `0x${"bb".repeat(32)}` as Hex,
    };
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightCancelAndMake({
        ...params,
        ratifier: priceRatifierV1,
        rootSignature,
      }).data,
    });

    expect(decoded.args.slice(5, 13)).toEqual([
      priceRatifierV1,
      root,
      3n,
      7n,
      1_900_000_000n,
      27,
      rootSignature.r,
      rootSignature.s,
    ]);
  });

  test("behavior: encodes collateral supplies against the market", () => {
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: midnightCancelAndMake({
        ...params,
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 10n }],
        },
      }).data,
    });

    expect(decoded.args[3]).toEqual(MarketUtils.toStruct(market));
    expect(decoded.args[4]).toEqual([{ collateralIndex: 0n, assets: 10n }]);
  });

  test("behavior: appends metadata and does not freeze caller input", () => {
    const groups = [groupA];
    const cancellations = [{ group: groupB, maxConsumed: 5n }];
    const supplies = [{ collateralIndex: 0n, assets: 10n }];
    const tx = midnightCancelAndMake({
      ...params,
      groups,
      cancellations,
      collateral: { market, supplies },
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
    expect(Object.isFrozen(groups)).toBe(false);
    expect(Object.isFrozen(cancellations[0])).toBe(false);
    expect(Object.isFrozen(supplies[0])).toBe(false);
  });

  test("error: MidnightMarketAddressMismatchError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        collateral: {
          market: new MarketParams({
            ...midnightMarket,
            midnight: zeroAddress,
          }),
          supplies: [{ collateralIndex: 0n, assets: 10n }],
        },
      }),
    ).toThrow(MidnightMarketAddressMismatchError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        collateral: {
          market,
          supplies: [{ collateralIndex: 1n, assets: 10n }],
        },
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: UnknownMidnightRatifierError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        ratifier: getChainAddress(midnightChainId, "setterRatifier"),
      }),
    ).toThrow(UnknownMidnightRatifierError);
  });

  test("error: InvalidTreeError on empty root, payload, or groups", () => {
    expect(() => midnightCancelAndMake({ ...params, root: zeroHash })).toThrow(
      InvalidTreeError,
    );
    expect(() => midnightCancelAndMake({ ...params, payload: "0x" })).toThrow(
      InvalidTreeError,
    );
    expect(() => midnightCancelAndMake({ ...params, groups: [] })).toThrow(
      InvalidTreeError,
    );
  });

  test("error: MidnightReplacementGroupCancelledError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [
          { group: groupA.toUpperCase() as Hex, maxConsumed: 0n },
        ],
      }),
    ).toThrow(MidnightReplacementGroupCancelledError);
  });

  test("error: cancellation limits", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [{ group: groupB, maxConsumed: maxUint128 + 1n }],
      }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [
          { group: groupB, maxConsumed: 0n },
          { group: groupB, maxConsumed: 1n },
        ],
      }),
    ).toThrow(DuplicateMidnightGroupCancellationError);
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [{ group: groupB, maxConsumed: -1n }],
      }),
    ).toThrow(NegativeInputError);
    expect(() => midnightCancelAndMake({ ...params, deadline: 0n })).toThrow(
      NonPositiveInputError,
    );
  });

  test("error: ChainIdMismatchError on a collateral market from another chain", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        collateral: {
          market: new MarketParams({
            ...midnightMarket,
            chainId: midnightMarket.chainId + 1n,
          }),
          supplies: [{ collateralIndex: 0n, assets: 1n }],
        },
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: NonPositiveInputError on a zero collateral supply", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        collateral: { market, supplies: [{ collateralIndex: 0n, assets: 0n }] },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: encodes a Blue supply for the maker's callback", () => {
    const blueSupply = {
      market: {
        loanToken: midnightMarket.loanToken,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      },
      assets: 1_000n,
      callbackSalt: `0x${"ee".repeat(32)}` as Hex,
    };
    const tx = midnightCancelAndMake({ ...params, blueSupply });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(decoded.args.slice(0, 3)).toEqual([
      blueSupply.market,
      1_000n,
      blueSupply.callbackSalt,
    ]);
    expect(tx.action.args.blueSupply).toEqual(blueSupply);
  });

  test("error: NonPositiveInputError on a zero Blue supply", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        blueSupply: {
          market: {
            loanToken: midnightMarket.loanToken,
            collateralToken: zeroAddress,
            oracle: zeroAddress,
            irm: zeroAddress,
            lltv: 0n,
          },
          assets: 0n,
          callbackSalt: zeroHash,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });
});

describe("midnightCancelAndMake without publication", () => {
  const cancellations = [
    { group: groupA, maxConsumed: 0n },
    { group: groupB, maxConsumed: 5n },
  ];

  test("default", () => {
    const tx = midnightCancelAndMake({
      chainId: midnightChainId,
      cancellations,
      deadline: maxUint256,
    });
    const { args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(args.slice(4)).toEqual([
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
    expect(tx.action.args).toEqual({
      ratifier: zeroAddress,
      root: zeroHash,
      groups: [],
      cancellations,
      collateralSupplies: [],
      deadline: maxUint256,
    });
  });

  test("error: EmptyMidnightGroupCancellationsError on no groups", () => {
    expect(() =>
      midnightCancelAndMake({
        chainId: midnightChainId,
        cancellations: [],
        deadline: maxUint256,
      }),
    ).toThrow(EmptyMidnightGroupCancellationsError);
  });

  test("error: cancellation limits", () => {
    const cancel =
      (
        groupCancellations: { group: Hex; maxConsumed: bigint }[],
        deadline = maxUint256,
      ) =>
      () =>
        midnightCancelAndMake({
          chainId: midnightChainId,
          cancellations: groupCancellations,
          deadline,
        });

    expect(
      cancel([
        { group: groupA, maxConsumed: 0n },
        {
          group: groupA.toUpperCase().replace("0X", "0x") as Hex,
          maxConsumed: 1n,
        },
      ]),
    ).toThrow(DuplicateMidnightGroupCancellationError);
    expect(cancel([{ group: groupA, maxConsumed: -1n }])).toThrow(
      NegativeInputError,
    );
    expect(cancel([{ group: groupA, maxConsumed: maxUint128 + 1n }])).toThrow(
      InputExceedsMaxError,
    );
    expect(cancel([{ group: groupA, maxConsumed: 0n }], 0n)).toThrow(
      NonPositiveInputError,
    );
    expect(
      cancel([{ group: groupA, maxConsumed: 0n }], maxUint256 + 1n),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnknownAddressError without a midnightBundlesV2 deployment", () => {
    expect(() =>
      midnightCancelAndMake({
        chainId: 1,
        cancellations: [{ group: groupA, maxConsumed: 0n }],
        deadline: maxUint256,
      }),
    ).toThrow(UnknownAddressError);
  });

  test("property: groupsToCancel and deadline round-trip through calldata", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            group: fc
              .uint8Array({ minLength: 32, maxLength: 32 })
              .map((bytes): Hex => `0x${Buffer.from(bytes).toString("hex")}`),
            maxConsumed: fc.bigInt({ min: 0n, max: maxUint128 }),
          }),
          { minLength: 1, maxLength: 8, selector: ({ group }) => group },
        ),
        fc.bigInt({ min: 1n, max: maxUint256 }),
        (groupCancellations, deadline) => {
          const { args } = decodeFunctionData({
            abi: midnightBundlesV2Abi,
            data: midnightCancelAndMake({
              chainId: midnightChainId,
              cancellations: groupCancellations,
              deadline,
            }).data,
          });
          expect(args[13]).toEqual(groupCancellations);
          expect(args[15]).toBe(deadline);
        },
      ),
      { seed: 42 },
    );
  });
});
