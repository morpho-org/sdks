import {
  InvalidTreeError,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  UnsupportedChainIdError,
} from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  maxUint128,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightChainId,
  midnightMarket,
} from "../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  EmptyMidnightCollateralSuppliesError,
  InputExceedsMaxError,
  MidnightCalldataEncodingError,
  MidnightMarketAddressMismatchError,
  MidnightReplacementGroupCancelledError,
  NonPositiveInputError,
  UnsupportedMidnightAuthorizationTargetError,
} from "../types/index.js";
import {
  normalizeMidnightCancelAndMakePublication,
  validateMidnightCancelAndMakePublication,
} from "./validateMidnightCancelAndMakePublication.js";

const group = `0x${"aa".repeat(32)}` as Hex;
const publication = {
  ratifier: getChainAddress(midnightChainId, "rateRatifierV1"),
  root: `0x${"bb".repeat(32)}` as Hex,
  groups: [group],
  payload: "0x1234" as Hex,
};
const params = {
  publication,
  chainId: midnightChainId,
  cancelledGroups: new Set<string>(),
};
const blueSupply = {
  market: {
    loanToken: midnightMarket.loanToken,
    collateralToken: zeroAddress,
    oracle: zeroAddress,
    irm: zeroAddress,
    lltv: 0n,
  },
  assets: 1n,
  callbackSalt: group,
};
const collateral = {
  market: midnightMarket,
  supplies: [{ collateralIndex: 0n, assets: 1n }],
};

describe("validateMidnightCancelAndMakePublication", () => {
  test("accepts both supported ratifiers and optional funding", () => {
    for (const ratifier of [
      publication.ratifier,
      getChainAddress(midnightChainId, "priceRatifierV1"),
    ]) {
      expect(() =>
        validateMidnightCancelAndMakePublication({
          ...params,
          publication: { ...publication, ratifier, blueSupply, collateral },
        }),
      ).not.toThrow();
    }
    expect(() =>
      validateMidnightCancelAndMakePublication(params),
    ).not.toThrow();
  });

  test.each([{ root: zeroHash }, { payload: "0x" as Hex }, { groups: [] }])(
    "rejects empty publication content: %o",
    (overrides) => {
      expect(() =>
        validateMidnightCancelAndMakePublication({
          ...params,
          publication: { ...publication, ...overrides },
        }),
      ).toThrow(InvalidTreeError);
    },
  );

  test("rejects unsupported chains and malformed or unsupported ratifiers", () => {
    expect(() =>
      validateMidnightCancelAndMakePublication({ ...params, chainId: -1 }),
    ).toThrow(UnsupportedChainIdError);
    expect(() =>
      validateMidnightCancelAndMakePublication({
        ...params,
        publication: { ...publication, ratifier: "0x12" as Address },
      }),
    ).toThrow(MidnightCalldataEncodingError);
    expect(() =>
      validateMidnightCancelAndMakePublication({
        ...params,
        publication: { ...publication, ratifier: zeroAddress },
      }),
    ).toThrow(UnsupportedMidnightAuthorizationTargetError);
  });

  test("rejects cancelled replacement groups", () => {
    expect(() =>
      validateMidnightCancelAndMakePublication({
        ...params,
        cancelledGroups: new Set([group.toLowerCase()]),
      }),
    ).toThrow(MidnightReplacementGroupCancelledError);
  });

  test.each([0n, -1n, maxUint128 + 1n])(
    "rejects invalid Blue funding %s",
    (assets) => {
      expect(() =>
        validateMidnightCancelAndMakePublication({
          ...params,
          publication: {
            ...publication,
            blueSupply: { ...blueSupply, assets },
          },
        }),
      ).toThrow(assets <= 0n ? NonPositiveInputError : InputExceedsMaxError);
    },
  );

  test("rejects empty supplies before validating the collateral market", () => {
    expect(() =>
      validateMidnightCancelAndMakePublication({
        ...params,
        publication: {
          ...publication,
          collateral: {
            market: { ...midnightMarket, chainId: -1 },
            supplies: [],
          },
        },
      }),
    ).toThrow(EmptyMidnightCollateralSuppliesError);
  });

  test("rejects collateral market mismatches", () => {
    expect(() =>
      validateMidnightCancelAndMakePublication({
        ...params,
        publication: {
          ...publication,
          collateral: {
            ...collateral,
            market: { ...midnightMarket, chainId: -1 },
          },
        },
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      validateMidnightCancelAndMakePublication({
        ...params,
        publication: {
          ...publication,
          collateral: {
            ...collateral,
            market: { ...midnightMarket, midnight: zeroAddress },
          },
        },
      }),
    ).toThrow(MidnightMarketAddressMismatchError);
  });

  test.each([
    {
      supplies: [{ collateralIndex: 0n, assets: 0n }],
      error: NonPositiveInputError,
    },
    {
      supplies: [{ collateralIndex: 0n, assets: maxUint128 + 1n }],
      error: InputExceedsMaxError,
    },
    {
      supplies: [{ collateralIndex: 99n, assets: 1n }],
      error: UnknownCollateralIndexError,
    },
    {
      supplies: [
        { collateralIndex: 0n, assets: maxUint128 },
        { collateralIndex: 0n, assets: 1n },
      ],
      error: InputExceedsMaxError,
    },
  ])(
    "propagates collateral entry and sum errors: %o",
    ({ supplies, error }) => {
      expect(() =>
        validateMidnightCancelAndMakePublication({
          ...params,
          publication: {
            ...publication,
            collateral: { ...collateral, supplies },
          },
        }),
      ).toThrow(error);
    },
  );
});

describe("normalizeMidnightCancelAndMakePublication", () => {
  test("defaults omitted publication fields for cancellation-only bundles", () => {
    expect(normalizeMidnightCancelAndMakePublication(undefined)).toEqual({
      supplies: [],
      blueSupply: undefined,
      signature: {
        height: 0n,
        nonce: 0n,
        deadline: 0n,
        v: 0,
        r: zeroHash,
        s: zeroHash,
      },
      blueMarket: {
        loanToken: zeroAddress,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      },
      assetsToPark: 0n,
      callbackSalt: zeroHash,
      ratifier: zeroAddress,
      root: zeroHash,
      groups: [],
      payload: "0x",
    });
  });

  test("copies funding and groups while preserving the root signature", () => {
    const rootSignature = {
      height: 1n,
      nonce: 2n,
      deadline: 3n,
      v: 27,
      r: group,
      s: group,
    };
    const input = { ...publication, blueSupply, collateral, rootSignature };
    const normalized = normalizeMidnightCancelAndMakePublication(input);
    expect(normalized).toMatchObject({
      supplies: collateral.supplies,
      blueSupply,
      signature: rootSignature,
      blueMarket: blueSupply.market,
      assetsToPark: 1n,
      callbackSalt: group,
      ratifier: publication.ratifier,
      root: publication.root,
      groups: publication.groups,
      payload: publication.payload,
    });
    expect(normalized.groups).not.toBe(input.groups);
    expect(normalized.supplies).not.toBe(collateral.supplies);
    expect(normalized.supplies[0]).not.toBe(collateral.supplies[0]);
    expect(normalized.blueSupply).not.toBe(blueSupply);
    expect(normalized.blueMarket).not.toBe(blueSupply.market);
    expect(normalized.signature).toBe(rootSignature);
  });
});
