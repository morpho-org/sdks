import {
  InvalidTreeError,
  MarketParams,
  MarketUtils,
  midnightBundlesV2Abi,
  Payload,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import {
  ChainId,
  getChainAddress,
  UnknownAddressError,
} from "@morpho-org/morpho-ts";
import fc from "fast-check";
import type { Address } from "viem";
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
  midnightOtherMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  DuplicateMidnightGroupCancellationError,
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightGroupCancellationsError,
  InputExceedsMaxError,
  InvalidMidnightHexInputError,
  MidnightMarketAddressMismatchError,
  MidnightReplacementGroupCancelledError,
  NegativeInputError,
  NonPositiveInputError,
  UnsupportedMidnightAuthorizationTargetError,
} from "../../types/index.js";
import { midnightCancelAndMake } from "./cancelAndMake.js";

const midnightBundlesV2 = getChainAddress(midnightChainId, "midnightBundlesV2");
const wNative = getChainAddress(midnightChainId, "wNative");

const rateRatifierV1 = getChainAddress(midnightChainId, "rateRatifierV1");
const priceRatifierV1 = getChainAddress(midnightChainId, "priceRatifierV1");
const root = `0x${"cd".repeat(32)}` as Hex;
const groupA = `0x${"11".repeat(32)}` as Hex;
const groupB = `0x${"22".repeat(32)}` as Hex;
const oddLengthBytes32 = `0x${"a".repeat(63)}` as Hex;
const market = new MarketParams(midnightMarket);
const wNativeMarket = new MarketParams({
  ...midnightMarket,
  collateralParams: midnightMarket.collateralParams.map((collateral) => ({
    ...collateral,
    token: wNative,
  })),
});

const params = {
  chainId: midnightChainId,
  cancellations: [{ group: groupB, maxConsumed: 5n }],
  deadline: maxUint256,
  publication: {
    ratifier: rateRatifierV1,
    root,
    groups: [groupA],
    payload: "0x1234" as Hex,
  },
};

const captureError = (callback: () => unknown) => {
  try {
    callback();
  } catch (error) {
    return error;
  }
};

describe("midnightCancelAndMake", () => {
  test("snapshots ratifier getters once before validating and encoding", () => {
    let reads = 0;
    const publication = {
      ...params.publication,
      get ratifier() {
        reads += 1;
        return reads === 1 ? rateRatifierV1 : priceRatifierV1;
      },
    };
    const tx = midnightCancelAndMake({ ...params, publication });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args[5]).toBe(rateRatifierV1);
    expect(tx.action.args.ratifier).toBe(rateRatifierV1);
  });

  test("snapshots publication root getters once before validation and encoding", () => {
    let reads = 0;
    const publication = {
      ...params.publication,
      get root() {
        reads += 1;
        return reads === 1 ? root : ("0x" as Hex);
      },
    };
    const tx = midnightCancelAndMake({ ...params, publication });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args[6]).toBe(root);
  });

  test("snapshots publication payload getters once before validation and encoding", () => {
    const firstPayload = "0x1234" as Hex;
    let reads = 0;
    const publication = {
      ...params.publication,
      get payload() {
        reads += 1;
        return reads === 1 ? firstPayload : ("0xzz" as Hex);
      },
    };
    const tx = midnightCancelAndMake({ ...params, publication });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args[14]).toBe(firstPayload);
  });

  test("snapshots Blue supply market getters once before encoding", () => {
    const firstMarket = {
      loanToken: midnightMarket.loanToken,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    };
    const laterMarket = { ...firstMarket, loanToken: wNative };
    const assets = 1_000n;
    const callbackSalt = `0x${"ee".repeat(32)}` as Hex;
    let reads = 0;
    const blueSupply = {
      get market() {
        reads += 1;
        return reads === 1 ? firstMarket : laterMarket;
      },
      assets,
      callbackSalt,
    };
    const tx = midnightCancelAndMake({
      ...params,
      publication: { ...params.publication, blueSupply },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args.slice(0, 3)).toEqual([
      firstMarket,
      assets,
      callbackSalt,
    ]);
    expect(tx.action.args.blueSupply).toEqual({
      market: firstMarket,
      assets,
      callbackSalt,
    });
  });

  test("snapshots Blue supply assets getters once before validation and encoding", () => {
    const blueMarket = {
      loanToken: midnightMarket.loanToken,
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    };
    const assets = 1_000n;
    const callbackSalt = `0x${"ee".repeat(32)}` as Hex;
    let reads = 0;
    const blueSupply = {
      market: blueMarket,
      get assets() {
        reads += 1;
        return reads === 1 ? assets : 0n;
      },
      callbackSalt,
    };
    const tx = midnightCancelAndMake({
      ...params,
      publication: { ...params.publication, blueSupply },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args.slice(0, 3)).toEqual([
      blueMarket,
      assets,
      callbackSalt,
    ]);
    expect(tx.action.args.blueSupply).toEqual({
      market: blueMarket,
      assets,
      callbackSalt,
    });
  });

  test("snapshots root signature r getters once before encoding", () => {
    const firstR = `0x${"aa".repeat(32)}` as Hex;
    const laterR = `0x${"cc".repeat(32)}` as Hex;
    let reads = 0;
    const rootSignature = {
      height: 3n,
      nonce: 7n,
      deadline: 1_900_000_000n,
      v: 27,
      get r() {
        reads += 1;
        return reads === 1 ? firstR : laterR;
      },
      s: `0x${"bb".repeat(32)}` as Hex,
    };
    const tx = midnightCancelAndMake({
      ...params,
      publication: { ...params.publication, rootSignature },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args[11]).toBe(firstR);
    expect(tx.action.args).toEqual({
      market: zeroHash,
      ratifier: rateRatifierV1,
      root,
      groups: [groupA],
      cancellations: [{ group: groupB, maxConsumed: 5n }],
      collateralSupplies: [],
      deadline: maxUint256,
    });
  });

  test("snapshots cancellation group getters once before encoding", () => {
    let reads = 0;
    const cancellations = [
      {
        get group() {
          reads += 1;
          return reads === 1 ? groupA : groupB;
        },
        maxConsumed: 0n,
      },
      { group: groupB, maxConsumed: 0n },
    ];
    const tx = midnightCancelAndMake({
      chainId: midnightChainId,
      cancellations,
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args[13]).toEqual([
      { group: groupA, maxConsumed: 0n },
      { group: groupB, maxConsumed: 0n },
    ]);
  });

  test("snapshots maxConsumed getters once before validating and encoding", () => {
    let reads = 0;
    const cancellation = {
      group: groupA,
      get maxConsumed() {
        reads += 1;
        return reads === 1 ? 0n : -1n;
      },
    };
    const tx = midnightCancelAndMake({
      chainId: midnightChainId,
      cancellations: [cancellation],
      deadline: maxUint256,
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args[13]).toEqual([{ group: groupA, maxConsumed: 0n }]);
  });

  test("snapshots deadline getters once before validating and encoding", () => {
    let reads = 0;
    const tx = midnightCancelAndMake({
      ...params,
      get deadline() {
        reads += 1;
        return reads === 1 ? maxUint256 : 0n;
      },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toBe(1);
    expect(decoded.args[15]).toBe(maxUint256);
    expect(tx.action.args.deadline).toBe(maxUint256);
  });

  test("snapshots metadata getters once before encoding", () => {
    let originReads = 0;
    let timestampReads = 0;
    const tx = midnightCancelAndMake({
      ...params,
      metadata: {
        get origin() {
          originReads += 1;
          return originReads === 1 ? "a1b2c3d4" : "deadbeef";
        },
        get timestamp() {
          timestampReads += 1;
          return timestampReads === 1 ? undefined : true;
        },
      },
    });
    const untagged = midnightCancelAndMake(params);

    expect(originReads).toBe(1);
    expect(timestampReads).toBe(1);
    expect(tx.data).toBe(`${untagged.data}a1b2c3d4`);
  });

  test.each([
    { field: "publication.payload", value: "0x123", reason: "oddLength" },
    { field: "publication.payload", value: "0xzz", reason: "notHex" },
  ] as const)(
    "rejects malformed payload $value",
    ({ field, value, reason }) => {
      const error = captureError(() =>
        midnightCancelAndMake({
          ...params,
          publication: { ...params.publication, payload: value as Hex },
        }),
      );
      expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
      expect(error).toMatchObject({ field, reason });
    },
  );

  test.each([
    {
      value: `0x${"aa".repeat(31)}`,
      reason: "wrongSize",
    },
    {
      value: `0x${"aa".repeat(31)}a`,
      reason: "oddLength",
    },
  ] as const)(
    "rejects callback salt with reason $reason",
    ({ value, reason }) => {
      const error = captureError(() =>
        midnightCancelAndMake({
          ...params,
          publication: {
            ...params.publication,
            blueSupply: {
              market: {
                loanToken: zeroAddress,
                collateralToken: zeroAddress,
                oracle: zeroAddress,
                irm: zeroAddress,
                lltv: 0n,
              },
              assets: 1n,
              callbackSalt: value as Hex,
            },
          },
        }),
      );

      expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
      expect(error).toMatchObject({
        field: "publication.blueSupply.callbackSalt",
        reason,
      });
    },
  );

  test.each(
    (["r", "s"] as const).flatMap((field) =>
      (
        [
          { value: `0x${"aa".repeat(31)}`, reason: "wrongSize" },
          { value: `0x${"aa".repeat(31)}a`, reason: "oddLength" },
          { value: `0x${"zz".repeat(32)}`, reason: "notHex" },
        ] as const
      ).map(({ value, reason }) => ({ field, value, reason })),
    ),
  )(
    "rejects root signature $field with reason $reason",
    ({ field, value, reason }) => {
      const invalid = value as Hex;
      const rootSignature = {
        height: 3n,
        nonce: 7n,
        deadline: 1_900_000_000n,
        v: 27,
        r: field === "r" ? invalid : root,
        s: field === "s" ? invalid : root,
      };
      const error = captureError(() =>
        midnightCancelAndMake({
          ...params,
          publication: { ...params.publication, rootSignature },
        }),
      );

      expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
      expect(error).toMatchObject({
        field: `publication.rootSignature.${field}`,
        reason,
      });
    },
  );

  test("accepts a payload at the maximum size", () => {
    const value = `0x${"00".repeat(Payload.MAX_PAYLOAD_BYTES)}` as Hex;
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: { ...params.publication, payload: value },
      }),
    ).not.toThrow();
  });

  test("rejects oversized payloads and truncates the error message", () => {
    const value = `0x${"00".repeat(Payload.MAX_PAYLOAD_BYTES + 1)}` as Hex;
    try {
      midnightCancelAndMake({
        ...params,
        publication: { ...params.publication, payload: value },
      });
      throw new Error("expected an oversized payload error");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
      expect(error).toMatchObject({
        field: "publication.payload",
        reason: "tooLong",
        value,
      });
      expect((error as Error).message.length).toBeLessThan(200);
      expect((error as Error).message).toContain(
        Payload.MAX_PAYLOAD_BYTES.toLocaleString("en-US"),
      );
      expect((error as Error).message).toContain(
        "Split the offers across smaller trees so the encoded payload fits.",
      );
    }
  });

  test.each([
    { field: "root", publication: { ...params.publication, root: "0x01" } },
    {
      field: "group",
      publication: { ...params.publication, groups: ["0x01" as Hex] },
    },
  ] as const)(
    "rejects a wrong-size publication $field",
    ({ field, publication }) => {
      const error = captureError(() =>
        midnightCancelAndMake({
          ...params,
          publication: { ...publication, root: publication.root as Hex },
        }),
      );
      expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
      expect(error).toMatchObject({
        field: field === "root" ? "publication.root" : "publication.groups[0]",
        reason: "wrongSize",
      });
      expect((error as Error).message).toContain(
        "Pass exactly 32 bytes of hex.",
      );
    },
  );

  test.each([
    {
      field: "publication.root",
      value: `0x${"gg".repeat(32)}`,
      reason: "notHex",
    },
    {
      field: "publication.groups[0]",
      value: `0x${"gg".repeat(32)}`,
      reason: "notHex",
    },
    {
      field: "cancellations[0].group",
      value: `0x${"gg".repeat(32)}`,
      reason: "notHex",
    },
    {
      field: "publication.groups[0]",
      value: `0X${"11".repeat(32)}`,
      reason: "notHex",
    },
    {
      field: "cancellations[0].group",
      value: `0X${"22".repeat(32)}`,
      reason: "notHex",
    },
    { field: "publication.root", value: "0x123", reason: "oddLength" },
    { field: "publication.groups[0]", value: "0x123", reason: "oddLength" },
    { field: "cancellations[0].group", value: "0x123", reason: "oddLength" },
  ] as const)("rejects $reason for $field", ({ field, value, reason }) => {
    const input =
      field === "publication.root"
        ? {
            ...params,
            publication: { ...params.publication, root: value as Hex },
          }
        : field === "publication.groups[0]"
          ? {
              ...params,
              publication: { ...params.publication, groups: [value as Hex] },
            }
          : {
              ...params,
              cancellations: [{ group: value as Hex, maxConsumed: 0n }],
            };
    const error = captureError(() => midnightCancelAndMake(input));

    expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
    expect(error).toMatchObject({ field, reason });
    expect((error as Error).message).toContain(
      "Re-encode the value as 0x-prefixed hex.",
    );
  });

  test.each([
    {
      field: "publication.root",
      input: {
        ...params,
        publication: {
          ...params.publication,
          root: undefined as unknown as Hex,
        },
      },
    },
    {
      field: "publication.groups[0]",
      input: {
        ...params,
        publication: {
          ...params.publication,
          groups: [undefined as unknown as Hex],
        },
      },
    },
    {
      field: "cancellations[0].group",
      input: {
        ...params,
        cancellations: [
          { group: undefined as unknown as Hex, maxConsumed: 0n },
        ],
      },
    },
    {
      field: "publication.payload",
      input: {
        ...params,
        publication: {
          ...params.publication,
          payload: undefined as unknown as Hex,
        },
      },
    },
  ])("rejects undefined for $field", ({ field, input }) => {
    const error = captureError(() => midnightCancelAndMake(input));

    expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
    expect(error).toMatchObject({ field, reason: "notHex" });
  });

  test("rejects a wrong-size cancellation group", () => {
    const error = captureError(() =>
      midnightCancelAndMake({
        chainId: midnightChainId,
        cancellations: [{ group: "0x01" as Hex, maxConsumed: 0n }],
        deadline: maxUint256,
      }),
    );
    expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
    expect(error).toMatchObject({
      field: "cancellations[0].group",
      reason: "wrongSize",
    });
    expect((error as Error).message).toContain("Pass exactly 32 bytes of hex.");
  });

  test("default", () => {
    const tx = midnightCancelAndMake(params);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.to).toBe(midnightBundlesV2);
    expect(tx.value).toBe(0n);
    expect(tx.action.args).not.toHaveProperty("nativeAmount");
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
        market: zeroHash,
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

  test.each([
    [
      "cancellations[0].group",
      () =>
        midnightCancelAndMake({
          ...params,
          cancellations: [{ group: oddLengthBytes32, maxConsumed: 5n }],
        }),
    ],
    [
      "publication.root",
      () =>
        midnightCancelAndMake({
          ...params,
          publication: { ...params.publication, root: oddLengthBytes32 },
        }),
    ],
    [
      "publication.groups[0]",
      () =>
        midnightCancelAndMake({
          ...params,
          publication: {
            ...params.publication,
            groups: [oddLengthBytes32],
          },
        }),
    ],
    [
      "publication.rootSignature.r",
      () =>
        midnightCancelAndMake({
          ...params,
          publication: {
            ...params.publication,
            rootSignature: {
              height: 1n,
              nonce: 1n,
              deadline: maxUint256,
              v: 27,
              r: oddLengthBytes32,
              s: zeroHash,
            },
          },
        }),
    ],
    [
      "publication.rootSignature.s",
      () =>
        midnightCancelAndMake({
          ...params,
          publication: {
            ...params.publication,
            rootSignature: {
              height: 1n,
              nonce: 1n,
              deadline: maxUint256,
              v: 27,
              r: zeroHash,
              s: oddLengthBytes32,
            },
          },
        }),
    ],
    [
      "publication.blueSupply.callbackSalt",
      () =>
        midnightCancelAndMake({
          ...params,
          publication: {
            ...params.publication,
            blueSupply: {
              market: {
                loanToken: midnightMarket.loanToken,
                collateralToken: zeroAddress,
                oracle: zeroAddress,
                irm: zeroAddress,
                lltv: 0n,
              },
              assets: 1_000n,
              callbackSalt: oddLengthBytes32,
            },
          },
        }),
    ],
  ] as const)("error: rejects a 63-digit bytes32 in %s", (field, build) => {
    let error: unknown;
    try {
      build();
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(InvalidMidnightHexInputError);
    expect(error).toMatchObject({ field, reason: "oddLength" });
  });

  test("behavior: wraps native ETH for the wNative collateral pull", () => {
    const nativeAmount = 500n;
    const tx = midnightCancelAndMake({
      ...params,
      nativeAmount,
      publication: {
        ...params.publication,
        collateral: {
          market: wNativeMarket,
          supplies: [{ collateralIndex: 0n, assets: 1_000n }],
        },
      },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.value).toBe(nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(decoded.args.at(-1)).toBe(wNative);
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
        publication: {
          ...params.publication,
          ratifier: priceRatifierV1,
          rootSignature,
        },
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
    const tx = midnightCancelAndMake({
      ...params,
      publication: {
        ...params.publication,
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 10n }],
        },
      },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.action.args.market).toBe(MarketUtils.toId(market));
    expect(decoded.args[3]).toEqual(MarketUtils.toStruct(market));
    expect(decoded.args[4]).toEqual([{ collateralIndex: 0n, assets: 10n }]);
  });

  test("snapshots collateral market getters once before validating and encoding", () => {
    const firstMarket = midnightMarket;
    const secondMarket = midnightOtherMarket;
    const firstCollateral = firstMarket.collateralParams[0]!;
    const secondCollateral = secondMarket.collateralParams[0]!;
    const reads = {
      chainId: 0,
      midnight: 0,
      loanToken: 0,
      collateralParams: 0,
      maturity: 0,
      rcfThreshold: 0,
      enterGate: 0,
      liquidatorGate: 0,
      collateralToken: 0,
      collateralLltv: 0,
      collateralLiquidationCursor: 0,
      collateralOracle: 0,
    };
    const collateralMarket = {
      get chainId() {
        reads.chainId += 1;
        return reads.chainId === 1 ? firstMarket.chainId : secondMarket.chainId;
      },
      get midnight() {
        reads.midnight += 1;
        return reads.midnight === 1
          ? firstMarket.midnight
          : secondMarket.midnight;
      },
      get loanToken() {
        reads.loanToken += 1;
        return reads.loanToken === 1
          ? firstMarket.loanToken
          : secondMarket.loanToken;
      },
      get collateralParams() {
        reads.collateralParams += 1;
        const collateral =
          reads.collateralParams === 1 ? firstCollateral : secondCollateral;
        return [
          {
            get token() {
              reads.collateralToken += 1;
              return collateral.token;
            },
            get lltv() {
              reads.collateralLltv += 1;
              return collateral.lltv;
            },
            get liquidationCursor() {
              reads.collateralLiquidationCursor += 1;
              return collateral.liquidationCursor;
            },
            get oracle() {
              reads.collateralOracle += 1;
              return collateral.oracle;
            },
          },
        ];
      },
      get maturity() {
        reads.maturity += 1;
        return reads.maturity === 1
          ? firstMarket.maturity
          : secondMarket.maturity;
      },
      get rcfThreshold() {
        reads.rcfThreshold += 1;
        return reads.rcfThreshold === 1
          ? firstMarket.rcfThreshold
          : secondMarket.rcfThreshold;
      },
      get enterGate() {
        reads.enterGate += 1;
        return reads.enterGate === 1
          ? firstMarket.enterGate
          : secondMarket.enterGate;
      },
      get liquidatorGate() {
        reads.liquidatorGate += 1;
        return reads.liquidatorGate === 1
          ? firstMarket.liquidatorGate
          : secondMarket.liquidatorGate;
      },
    };
    const tx = midnightCancelAndMake({
      ...params,
      publication: {
        ...params.publication,
        collateral: {
          market: collateralMarket,
          supplies: [{ collateralIndex: 0n, assets: 10n }],
        },
      },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(reads).toEqual(
      Object.fromEntries(Object.keys(reads).map((key) => [key, 1])),
    );
    expect(decoded.args[3]).toEqual(MarketUtils.toStruct(firstMarket));
    expect(tx.action.args.market).toBe(MarketUtils.toId(firstMarket));
  });

  test("behavior: accepts a plain-object collateral market", () => {
    const supplies = [{ collateralIndex: 0n, assets: 10n }];
    const withMarketParams = midnightCancelAndMake({
      ...params,
      publication: {
        ...params.publication,
        collateral: { market, supplies },
      },
    });
    const withPlainObject = midnightCancelAndMake({
      ...params,
      publication: {
        ...params.publication,
        collateral: { market: midnightMarket, supplies },
      },
    });

    expect(withPlainObject.data).toBe(withMarketParams.data);
  });

  test("behavior: appends metadata and does not freeze caller input", () => {
    const groups = [groupA];
    const cancellations = [{ group: groupB, maxConsumed: 5n }];
    const supplies = [{ collateralIndex: 0n, assets: 10n }];
    const tx = midnightCancelAndMake({
      ...params,
      cancellations,
      publication: {
        ...params.publication,
        groups,
        collateral: { market, supplies },
      },
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
        publication: {
          ...params.publication,
          collateral: {
            market: new MarketParams({
              ...midnightMarket,
              midnight: zeroAddress,
            }),
            supplies: [{ collateralIndex: 0n, assets: 10n }],
          },
        },
      }),
    ).toThrow(MidnightMarketAddressMismatchError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: {
          ...params.publication,
          collateral: {
            market,
            supplies: [{ collateralIndex: 1n, assets: 10n }],
          },
        },
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: EmptyMidnightCollateralSuppliesError", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: {
          ...params.publication,
          collateral: { market, supplies: [] },
        },
      }),
    ).toThrow(EmptyMidnightCollateralSuppliesError);
  });

  test("error: InputExceedsMaxError on collateral supply above uint128", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: {
          ...params.publication,
          collateral: {
            market,
            supplies: [{ collateralIndex: 0n, assets: maxUint128 + 1n }],
          },
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: InputExceedsMaxError on aggregate collateral supply", () => {
    let error: unknown;
    try {
      midnightCancelAndMake({
        ...params,
        publication: {
          ...params.publication,
          collateral: {
            market,
            supplies: [
              { collateralIndex: 0n, assets: maxUint128 },
              { collateralIndex: 0n, assets: 1n },
            ],
          },
        },
      });
    } catch (reason) {
      error = reason;
    }
    expect(error).toBeInstanceOf(InputExceedsMaxError);
    expect(error).toMatchObject({
      field: "collateral.supplies(collateralIndex=0)",
    });
  });

  test("error: InputExceedsMaxError on Blue supply above uint128", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: {
          ...params.publication,
          blueSupply: {
            market: {
              loanToken: midnightMarket.loanToken,
              collateralToken: zeroAddress,
              oracle: zeroAddress,
              irm: zeroAddress,
              lltv: 0n,
            },
            assets: maxUint128 + 1n,
            callbackSalt: `0x${"ee".repeat(32)}` as Hex,
          },
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnsupportedMidnightAuthorizationTargetError", () => {
    const ratifier = getAddress("0x000000000000000000000000000000000000dEaD");
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: { ...params.publication, ratifier },
      }),
    ).toThrow(UnsupportedMidnightAuthorizationTargetError);
  });

  test("error: InvalidTreeError on empty root, payload, or groups", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: { ...params.publication, root: zeroHash },
      }),
    ).toThrow(InvalidTreeError);
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: { ...params.publication, payload: "0x" },
      }),
    ).toThrow(InvalidTreeError);
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: { ...params.publication, groups: [] },
      }),
    ).toThrow(InvalidTreeError);
  });

  test("error: MidnightReplacementGroupCancelledError", () => {
    const group = `0x${"ab".repeat(32)}` as Hex;
    expect(() =>
      midnightCancelAndMake({
        ...params,
        cancellations: [
          { group: `0x${"AB".repeat(32)}` as Hex, maxConsumed: 0n },
        ],
        publication: { ...params.publication, groups: [group] },
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
        publication: {
          ...params.publication,
          collateral: {
            market: new MarketParams({
              ...midnightMarket,
              chainId: midnightMarket.chainId + 1n,
            }),
            supplies: [{ collateralIndex: 0n, assets: 1n }],
          },
        },
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("error: NonPositiveInputError on a zero collateral supply", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: {
          ...params.publication,
          collateral: {
            market,
            supplies: [{ collateralIndex: 0n, assets: 0n }],
          },
        },
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
    const tx = midnightCancelAndMake({
      ...params,
      publication: { ...params.publication, blueSupply },
    });
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

  test("behavior: wraps native ETH for a wNative Blue supply", () => {
    const nativeAmount = 1_000n;
    const blueSupply = {
      market: {
        loanToken: wNative,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      },
      assets: 1_000n,
      callbackSalt: `0x${"ee".repeat(32)}` as Hex,
    };
    const tx = midnightCancelAndMake({
      ...params,
      nativeAmount,
      publication: { ...params.publication, blueSupply },
    });
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });

    expect(tx.value).toBe(nativeAmount);
    expect(decoded.args.at(-1)).toBe(wNative);
  });

  describe("combined wNative supplies", () => {
    const blueSupply = {
      market: {
        loanToken: wNative,
        collateralToken: zeroAddress,
        oracle: zeroAddress,
        irm: zeroAddress,
        lltv: 0n,
      },
      assets: 1_000n,
      callbackSalt: zeroHash,
    };
    const publication = {
      ...params.publication,
      blueSupply,
      collateral: {
        market: wNativeMarket,
        supplies: [{ collateralIndex: 0n, assets: 1_000n }],
      },
    };

    test("behavior: wraps native ETH across both wNative pulls", () => {
      const nativeAmount = 1_500n;
      const tx = midnightCancelAndMake({
        ...params,
        nativeAmount,
        publication,
      });
      const decoded = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });

      expect(tx.value).toBe(nativeAmount);
      expect(decoded.args.at(-1)).toBe(wNative);
    });

    test("error: native funding exceeds the combined wNative pulls", () => {
      expect(() =>
        midnightCancelAndMake({
          ...params,
          nativeAmount: 2_001n,
          publication,
        }),
      ).toThrow(InputExceedsMaxError);
    });
  });

  test("error: native funding exceeds the wNative Blue supply", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        nativeAmount: 1_001n,
        publication: {
          ...params.publication,
          blueSupply: {
            market: {
              loanToken: wNative,
              collateralToken: zeroAddress,
              oracle: zeroAddress,
              irm: zeroAddress,
              lltv: 0n,
            },
            assets: 1_000n,
            callbackSalt: zeroHash,
          },
        },
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: NonPositiveInputError on a zero Blue supply", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: {
          ...params.publication,
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
      market: zeroHash,
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
        chainId: ChainId.ArbitrumMainnet,
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
    );
  });
});

describe("midnightCancelAndMake malformed address", () => {
  test("error: a malformed publication.ratifier throws a typed encoding error", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        publication: { ...params.publication, ratifier: "0x123" as Address },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightCalldataEncodingError",
        input: "publication.ratifier",
        cause: expect.objectContaining({ name: "InvalidAddressError" }),
      }),
    );
  });

  test("error: a malformed native-funded collateral token throws a typed encoding error", () => {
    expect(() =>
      midnightCancelAndMake({
        ...params,
        nativeAmount: 1n,
        publication: {
          ...params.publication,
          collateral: {
            market: new MarketParams({
              ...midnightMarket,
              collateralParams: midnightMarket.collateralParams.map(
                (collateral) => ({ ...collateral, token: "0x123" as Address }),
              ),
            }),
            supplies: [{ collateralIndex: 0n, assets: 1_000n }],
          },
        },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightCalldataEncodingError",
        input: "token",
        cause: expect.objectContaining({ name: "InvalidAddressError" }),
      }),
    );
  });
});
