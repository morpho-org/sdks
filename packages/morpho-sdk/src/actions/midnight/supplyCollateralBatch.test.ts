import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  MarketUtils,
  midnightAbi,
  UnknownCollateralIndexError,
} from "@morpho-org/midnight-sdk";
import { decodeFunctionData, maxUint128, zeroAddress } from "viem";
import { expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
  midnightTwoCollateralMarket,
} from "../../../test/fixtures/midnight.js";
import {
  ChainIdMismatchError,
  DuplicateMidnightCollateralIndexError,
  EmptyMidnightCollateralSuppliesError,
  InputExceedsMaxError,
  MidnightCalldataEncodingError,
  MidnightMarketAddressMismatchError,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightSupplyCollateral } from "./supplyCollateral.js";
import { midnightSupplyCollateralBatch } from "./supplyCollateralBatch.js";

const params = {
  chainId: midnightChainId,
  market: midnightTwoCollateralMarket,
  onBehalf: midnightAddresses.taker,
  collateralSupplies: [
    { collateralIndex: 1n, assets: 200n },
    { collateralIndex: 0n, assets: 100n },
  ],
};

test("does not freeze caller-owned collateral supplies", () => {
  const collateralSupplies = params.collateralSupplies.map((supply) => ({
    ...supply,
  }));
  midnightSupplyCollateralBatch({ ...params, collateralSupplies });
  expect(Object.isFrozen(collateralSupplies)).toBe(false);
  for (const supply of collateralSupplies) {
    expect(Object.isFrozen(supply)).toBe(false);
  }
});

test("ordered multicall and frozen transaction shape", () => {
  const tx = midnightSupplyCollateralBatch(params);
  const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });
  expect(decoded.functionName).toBe("multicall");
  if (decoded.functionName !== "multicall")
    throw new Error("expected multicall");
  expect(
    decoded.args[0].map((data) =>
      decodeFunctionData({ abi: midnightAbi, data }),
    ),
  ).toEqual(
    params.collateralSupplies.map(({ collateralIndex, assets }) => ({
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(params.market),
        collateralIndex,
        assets,
        params.onBehalf,
      ],
    })),
  );
  expect(Object.isFrozen(tx)).toBe(true);
  expect(Object.isFrozen(tx.action.args.collateralSupplies)).toBe(true);
  expect(tx).toMatchInlineSnapshot(`
    {
      "action": {
        "args": {
          "collateralSupplies": [
            {
              "assets": 200n,
              "collateralIndex": 1n,
            },
            {
              "assets": 100n,
              "collateralIndex": 0n,
            },
          ],
          "market": "0x0449f570224b8fe7c24c32a6dfd620784d73a8575d98c44e6c242644a5fcb28a",
          "onBehalf": "0x000000000000000000000000000000000000A000",
        },
        "type": "midnightSupplyCollateralBatch",
      },
      "data": "0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000002a432292d960000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c8000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a432292d96000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000",
      "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
      "value": 0n,
    }
  `);
});

test.each([
  [{ collateralSupplies: [] }, EmptyMidnightCollateralSuppliesError],
  [
    {
      collateralSupplies: [
        params.collateralSupplies[0]!,
        params.collateralSupplies[0]!,
      ],
    },
    DuplicateMidnightCollateralIndexError,
  ],
  [{ onBehalf: zeroAddress }, MidnightZeroOnBehalfError],
  [{ onBehalf: "bad" as typeof zeroAddress }, MidnightCalldataEncodingError],
  [{ market: { ...params.market, chainId: 1n } }, ChainIdMismatchError],
  [
    { market: { ...params.market, midnight: zeroAddress } },
    MidnightMarketAddressMismatchError,
  ],
  [
    { collateralSupplies: [{ collateralIndex: 0n, assets: 0n }] },
    NonPositiveInputError,
  ],
  [
    { collateralSupplies: [{ collateralIndex: 0n, assets: -1n }] },
    NonPositiveInputError,
  ],
  [
    { collateralSupplies: [{ collateralIndex: 0n, assets: maxUint128 + 1n }] },
    InputExceedsMaxError,
  ],
  [
    { collateralSupplies: [{ collateralIndex: 2n, assets: 1n }] },
    UnknownCollateralIndexError,
  ],
])("rejects invalid batch %#", (overrides, error) => {
  expect(() =>
    midnightSupplyCollateralBatch({ ...params, ...overrides }),
  ).toThrow(error);
});

test("duplicate message names index and metadata matches single action suffix", () => {
  expect(() =>
    midnightSupplyCollateralBatch({
      ...params,
      collateralSupplies: [
        params.collateralSupplies[0]!,
        params.collateralSupplies[0]!,
      ],
    }),
  ).toThrow('index "1"');
  const metadata = { origin: "a1b2c3d4" };
  const single = midnightSupplyCollateral({ ...params, assets: 1n, metadata });
  expect(
    midnightSupplyCollateralBatch({ ...params, metadata }).data.slice(-8),
  ).toBe(single.data.slice(-8));
});

propertyTest.prop(
  [
    fc.uniqueArray(
      fc.record({
        collateralIndex: fc.bigInt({ min: 0n, max: 1n }),
        assets: fc.bigInt({ min: 1n, max: maxUint128 }),
      }),
      {
        minLength: 1,
        maxLength: 2,
        selector: (entry) => entry.collateralIndex,
      },
    ),
  ],
  { numRuns: 200 },
)("round trips unique supplies", (collateralSupplies) => {
  const tx = midnightSupplyCollateralBatch({ ...params, collateralSupplies });
  const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });
  expect(decoded.functionName).toBe("multicall");
  if (decoded.functionName !== "multicall")
    throw new Error("expected multicall");
  expect(
    decoded.args[0].map(
      (data) => decodeFunctionData({ abi: midnightAbi, data }).args,
    ),
  ).toEqual(
    collateralSupplies.map(({ collateralIndex, assets }) => [
      MarketUtils.toStruct(params.market),
      collateralIndex,
      assets,
      params.onBehalf,
    ]),
  );
});
