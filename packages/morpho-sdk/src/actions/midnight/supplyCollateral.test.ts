import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import {
  getChainAddress,
  getChainAddresses,
  registerCustomAddresses,
} from "@morpho-org/morpho-ts";
import { decodeFunctionData, maxUint128, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightMarket,
  midnightMarketId,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  ChainWNativeMissingError,
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidMidnightNativeAmountTypeError,
  MidnightCalldataEncodingError,
  MidnightZeroOnBehalfError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  midnightSupplyCollateral,
  parseMidnightSupplyCollateral,
} from "./supplyCollateral.js";
import {
  midnightSupplyCollateralWithNative,
  parseMidnightSupplyCollateralWithNative,
} from "./supplyCollateralWithNative.js";

const wNative = getChainAddress(midnightChainId, "wNative");
const nativeMarket = new MarketParams({
  ...midnightMarket,
  collateralParams: [
    { ...MarketUtils.getCollateralByIndex(midnightMarket, 0n), token: wNative },
  ],
});
const nativeParams = {
  chainId: midnightChainId,
  market: nativeMarket,
  assets: 2_000n,
  accountAddress: midnightAddresses.taker,
  nativeAmount: 500n,
  deadline: 1_900_000_000n,
};

describe("midnightSupplyCollateral", () => {
  test("parsed input owns and freezes static transaction values", () => {
    const parsed = parseMidnightSupplyCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 1n,
      onBehalf: midnightAddresses.taker,
    });
    expect(parsed.assets).toBe(1n);
    expect(parsed.market.id).toBe(midnightMarketId);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.market.struct.collateralParams)).toBe(true);
  });

  test("default", () => {
    const tx = midnightSupplyCollateral({
      chainId: midnightChainId,
      market: midnightMarket,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args).toEqual({
      market: midnightMarketId,
      collateralIndex: 0n,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
    });
    expect(decoded).toEqual({
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(midnightMarket),
        0n,
        2_000n,
        midnightAddresses.taker,
      ],
    });
  });

  test("behavior: uses explicit collateral index and appends metadata", () => {
    const tx = midnightSupplyCollateral({
      chainId: midnightChainId,
      market: midnightTwoCollateralMarket,
      collateralIndex: 1n,
      assets: 2_000n,
      onBehalf: midnightAddresses.taker,
      metadata: { origin: "a1b2c3d4" },
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.action.args.collateralIndex).toBe(1n);
    expect(decoded.args[1]).toBe(1n);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("behavior: direct transaction and descriptor match main", () => {
    expect(
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 2_000n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toMatchInlineSnapshot(`
      {
        "action": {
          "args": {
            "assets": 2000n,
            "collateralIndex": 0n,
            "market": "0x994ce88b951db7a30742bb05a4dedd42dd42ce6633884ea82d7d525b1a56ed1f",
            "onBehalf": "0x000000000000000000000000000000000000A000",
          },
          "type": "midnightSupplyCollateral",
        },
        "data": "0x32292d960000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d900000000000000000000000000000000000000000000000000000000000000008000",
        "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
        "value": 0n,
      }
    `);
  });

  test("behavior: native funding encodes a payable supply with no other bundle steps", () => {
    const { data, ...descriptor } =
      midnightSupplyCollateralWithNative(nativeParams);
    expect({
      ...descriptor,
      call: decodeFunctionData({ abi: midnightBundlesV2Abi, data }),
    }).toMatchInlineSnapshot(`
      {
        "action": {
          "args": {
            "accountAddress": "0x000000000000000000000000000000000000A000",
            "assets": 2000n,
            "collateralIndex": 0n,
            "deadline": 1900000000n,
            "market": "0x93bde5139f21b9020a0ba87e9f44aef5104aca08feda74782ae95202f376b5e3",
            "nativeAmount": 500n,
          },
          "type": "midnightSupplyCollateralWithNative",
        },
        "call": {
          "args": [
            {
              "collateralToken": "0x0000000000000000000000000000000000000000",
              "irm": "0x0000000000000000000000000000000000000000",
              "lltv": 0n,
              "loanToken": "0x0000000000000000000000000000000000000000",
              "oracle": "0x0000000000000000000000000000000000000000",
            },
            0n,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            {
              "chainId": 8453n,
              "collateralParams": [
                {
                  "liquidationCursor": 250000000000000000n,
                  "lltv": 770000000000000000n,
                  "oracle": "0x0000000000000000000000000000000000008000",
                  "token": "0x4200000000000000000000000000000000000006",
                },
              ],
              "enterGate": "0x0000000000000000000000000000000000000000",
              "liquidatorGate": "0x0000000000000000000000000000000000000000",
              "loanToken": "0x0000000000000000000000000000000000006000",
              "maturity": 2000n,
              "midnight": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
              "rcfThreshold": 0n,
            },
            [
              {
                "assets": 2000n,
                "collateralIndex": 0n,
              },
            ],
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            0n,
            0n,
            0n,
            0,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            [],
            "0x",
            1900000000n,
            "0x4200000000000000000000000000000000000006",
          ],
          "functionName": "midnightBundlesV2CancelAndMake",
        },
        "to": "0x0bF30B530f816a619C3F28a3b9f44C441122555D",
        "value": 500n,
      }
    `);
  });

  propertyTest.prop(
    {
      assets: fc.bigInt({ min: 1n, max: maxUint128 }),
      funding: fc.bigInt({ min: 0n, max: maxUint128 }),
    },
    { numRuns: 200 },
  )(
    "wraps exactly the requested native amount without changing the required collateral",
    ({ assets, funding }) => {
      const nativeAmount = 1n + (funding % assets);
      const tx = midnightSupplyCollateralWithNative({
        ...nativeParams,
        assets,
        nativeAmount,
      });
      const { args } = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: tx.data,
      });
      expect(tx.value).toBe(nativeAmount);
      expect(args[4]).toEqual([{ collateralIndex: 0n, assets }]);
      expect(args[16]).toBe(wNative);
    },
  );

  test("encodes native collateral at index one", () => {
    const market = new MarketParams({
      ...nativeMarket,
      collateralParams: [
        {
          ...MarketUtils.getCollateralByIndex(nativeMarket, 0n),
          token: "0x0000000000000000000000000000000000000001",
        },
        ...nativeMarket.collateralParams,
      ],
    });
    const tx = midnightSupplyCollateralWithNative({
      ...nativeParams,
      market,
      collateralIndex: 1n,
    });
    const { args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });
    expect(args[4]).toEqual([
      { collateralIndex: 1n, assets: nativeParams.assets },
    ]);
    expect(tx.action.args.collateralIndex).toBe(1n);
  });

  test.each([
    { changes: { nativeAmount: 0n }, error: NonPositiveInputError },
    { changes: { nativeAmount: -1n }, error: NegativeInputError },
    { changes: { nativeAmount: 2_001n }, error: InputExceedsMaxError },
    {
      changes: { market: midnightMarket },
      error: NativeAmountOnNonWNativeAssetError,
    },
    { changes: { deadline: 0n }, error: NonPositiveInputError },
    { changes: { deadline: maxUint256 + 1n }, error: InputExceedsMaxError },
  ])("rejects invalid native inputs: $changes", ({ changes, error }) => {
    expect(() =>
      midnightSupplyCollateralWithNative({ ...nativeParams, ...changes }),
    ).toThrow(error);
  });

  test.each([0, "1"])(
    "rejects non-bigint native funding %j",
    (nativeAmount) => {
      expect(() =>
        Reflect.apply(midnightSupplyCollateralWithNative, undefined, [
          { ...nativeParams, nativeAmount },
        ]),
      ).toThrow(InvalidMidnightNativeAmountTypeError);
    },
  );

  test("rejects a number as assets before computing native funding", () => {
    expect(() =>
      Reflect.apply(midnightSupplyCollateralWithNative, undefined, [
        { ...nativeParams, assets: 2_000 },
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: InvalidBigIntInputError,
        field: "assets",
        value: 2_000,
      }),
    );
  });

  test("error: missing native deadline from a JavaScript caller", () => {
    const { deadline: _deadline, ...params } = nativeParams;
    expect(() =>
      Reflect.apply(midnightSupplyCollateralWithNative, undefined, [params]),
    ).toThrow(NonPositiveInputError);
  });

  test("error: ChainWNativeMissingError", () => {
    const chainId = 999103;
    const { wNative: _wNative, ...addresses } =
      getChainAddresses(midnightChainId);
    registerCustomAddresses({ addresses: { [chainId]: addresses } });
    expect(() =>
      midnightSupplyCollateralWithNative({
        ...nativeParams,
        chainId,
        market: { ...nativeMarket, chainId: BigInt(chainId) },
      }),
    ).toThrow(ChainWNativeMissingError);
  });

  test("error: NonPositiveInputError", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 0n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: MidnightZeroOnBehalfError for zero onBehalf", () => {
    const buildTx = () =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: 2_000n,
        onBehalf: zeroAddress,
      });

    expect(buildTx).toThrow(MidnightZeroOnBehalfError);
    expect(buildTx).toThrow(expect.objectContaining({ field: "onBehalf" }));
  });

  test("error: assets above the uint128 collateral balance", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        assets: maxUint128 + 1n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnknownCollateralIndexError", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: midnightMarket,
        collateralIndex: 1n,
        assets: 2_000n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(UnknownCollateralIndexError);
  });

  test("error: ChainIdMismatchError", () => {
    expect(() =>
      midnightSupplyCollateral({
        chainId: midnightChainId,
        market: { ...midnightMarket, chainId: BigInt(midnightChainId + 1) },
        assets: 2_000n,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});

describe("parseMidnightSupplyCollateralWithNative", () => {
  const settle = <T>(run: () => T) => {
    try {
      return { value: run() };
    } catch (error) {
      return { error: error as Error };
    }
  };

  propertyTest.prop(
    {
      market: fc.constantFrom(
        nativeMarket,
        midnightTwoCollateralMarket,
        new MarketParams({ ...nativeMarket, chainId: 1n }),
      ),
      collateralIndex: fc.constantFrom(undefined, 0n, 1n, 2n),
      assets: fc.constantFrom(
        0n,
        1n,
        500n,
        2_000n,
        maxUint128,
        maxUint128 + 1n,
      ),
      accountAddress: fc.constantFrom(
        midnightAddresses.taker,
        zeroAddress,
        "0x01",
      ),
      nativeAmount: fc.constantFrom(undefined, -1n, 0n, 1n, 500n, 2_001n),
      deadline: fc.constantFrom(undefined, 0n, 1_900_000_000n, maxUint256 + 1n),
    },
    { numRuns: 200 },
  )(
    "matches the encoder's errors, their order and its arguments",
    (changes) => {
      const params = { ...nativeParams, ...changes } as typeof nativeParams;
      const parsed = settle(() =>
        parseMidnightSupplyCollateralWithNative(params),
      );
      const encoded = settle(() => midnightSupplyCollateralWithNative(params));
      if (encoded.error) {
        expect(parsed.error?.constructor).toBe(encoded.error.constructor);
        expect(parsed.error?.message).toBe(encoded.error.message);
        return;
      }
      expect(parsed.error).toBeUndefined();
      const { args } = decodeFunctionData({
        abi: midnightBundlesV2Abi,
        data: encoded.value.data,
      });
      expect({
        market: args[3],
        collateralSupplies: args[4],
        deadline: args[15],
        wrappedNative: args[16],
        value: encoded.value.value,
      }).toStrictEqual({
        market: parsed.value?.market,
        collateralSupplies: [
          {
            collateralIndex: parsed.value?.collateralIndex,
            assets: parsed.value?.assets,
          },
        ],
        deadline: parsed.value?.deadline,
        wrappedNative: parsed.value?.wrappedNative,
        value: parsed.value?.value,
      });
    },
  );

  test("default", () => {
    const parsed = parseMidnightSupplyCollateralWithNative(nativeParams);
    expect(parsed).toMatchObject({
      chainId: midnightChainId,
      collateralIndex: 0n,
      assets: 2_000n,
      token: wNative,
      accountAddress: midnightAddresses.taker,
      value: 500n,
      wrappedNative: wNative,
      deadline: 1_900_000_000n,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  test.each([
    {
      changes: { accountAddress: "0x01" },
      error: MidnightCalldataEncodingError,
    },
    {
      changes: { accountAddress: zeroAddress },
      error: MidnightZeroOnBehalfError,
    },
    {
      changes: {
        market: { ...nativeMarket, chainId: BigInt(midnightChainId + 1) },
      },
      error: ChainIdMismatchError,
    },
    { changes: { nativeAmount: 0n }, error: NonPositiveInputError },
    { changes: { deadline: 0n }, error: NonPositiveInputError },
    { changes: { deadline: maxUint256 + 1n }, error: InputExceedsMaxError },
  ])("error: rejects $changes", ({ changes, error }) => {
    expect(() =>
      Reflect.apply(parseMidnightSupplyCollateralWithNative, undefined, [
        { ...nativeParams, ...changes },
      ]),
    ).toThrow(error);
  });
});
