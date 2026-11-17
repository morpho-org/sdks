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
  EmptyMidnightCollateralWithdrawalsError,
  InputExceedsMaxError,
  MidnightCalldataEncodingError,
  MidnightContractReceiverError,
  MidnightMarketAddressMismatchError,
  MidnightZeroOnBehalfError,
  MidnightZeroReceiverError,
  NonPositiveInputError,
} from "../../types/index.js";
import { midnightWithdrawCollateral } from "./withdrawCollateral.js";
import { midnightWithdrawCollateralBatch } from "./withdrawCollateralBatch.js";

const params = {
  chainId: midnightChainId,
  market: midnightTwoCollateralMarket,
  onBehalf: midnightAddresses.taker,
  receiver: midnightAddresses.maker,
  collateralWithdrawals: [
    { collateralIndex: 1n, assets: 200n },
    { collateralIndex: 0n, assets: 100n },
  ],
};

test("does not freeze caller-owned collateral withdrawals", () => {
  const collateralWithdrawals = params.collateralWithdrawals.map(
    (withdrawal) => ({
      ...withdrawal,
    }),
  );
  midnightWithdrawCollateralBatch({ ...params, collateralWithdrawals });
  expect(Object.isFrozen(collateralWithdrawals)).toBe(false);
  for (const withdrawal of collateralWithdrawals) {
    expect(Object.isFrozen(withdrawal)).toBe(false);
  }
});

test("ordered multicall and frozen transaction shape", () => {
  const tx = midnightWithdrawCollateralBatch(params);
  const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });
  expect(decoded.functionName).toBe("multicall");
  if (decoded.functionName !== "multicall")
    throw new Error("expected multicall");
  expect(
    decoded.args[0].map((data) =>
      decodeFunctionData({ abi: midnightAbi, data }),
    ),
  ).toEqual(
    params.collateralWithdrawals.map(({ collateralIndex, assets }) => ({
      functionName: "withdrawCollateral",
      args: [
        MarketUtils.toStruct(params.market),
        collateralIndex,
        assets,
        params.onBehalf,
        params.receiver,
      ],
    })),
  );
  expect(Object.isFrozen(tx)).toBe(true);
  expect(Object.isFrozen(tx.action.args.collateralWithdrawals)).toBe(true);
  expect(tx).toMatchInlineSnapshot(`
    {
      "action": {
        "args": {
          "collateralWithdrawals": [
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
          "receiver": "0x0000000000000000000000000000000000009000",
        },
        "type": "midnightWithdrawCollateralBatch",
      },
      "data": "0xac9650d8000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000034000000000000000000000000000000000000000000000000000000000000002c4a121e2a900000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c8000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d9000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c4a121e2a900000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000002105000000000000000000000000adedd8ab6de832766fedf0fac4992e5c4d3ea18a0000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000070000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000071000000000000000000000000000000000000000000000000000aaf96eb9d0d000000000000000000000000000000000000000000000000000003782dace9d90000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000",
      "to": "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
      "value": 0n,
    }
  `);
});

test.each([
  [{ collateralWithdrawals: [] }, EmptyMidnightCollateralWithdrawalsError],
  [
    {
      collateralWithdrawals: [
        params.collateralWithdrawals[0]!,
        params.collateralWithdrawals[0]!,
      ],
    },
    DuplicateMidnightCollateralIndexError,
  ],
  [{ receiver: zeroAddress }, MidnightZeroReceiverError],
  [{ receiver: midnightAddresses.midnight }, MidnightContractReceiverError],
  [
    { receiver: params.market.collateralParams[0]!.token },
    MidnightContractReceiverError,
  ],
  [{ receiver: "bad" as typeof zeroAddress }, MidnightCalldataEncodingError],
  [{ onBehalf: zeroAddress }, MidnightZeroOnBehalfError],
  [{ onBehalf: "bad" as typeof zeroAddress }, MidnightCalldataEncodingError],
  [{ market: { ...params.market, chainId: 1n } }, ChainIdMismatchError],
  [
    { market: { ...params.market, midnight: zeroAddress } },
    MidnightMarketAddressMismatchError,
  ],
  [
    { collateralWithdrawals: [{ collateralIndex: 0n, assets: 0n }] },
    NonPositiveInputError,
  ],
  [
    { collateralWithdrawals: [{ collateralIndex: 0n, assets: -1n }] },
    NonPositiveInputError,
  ],
  [
    {
      collateralWithdrawals: [{ collateralIndex: 0n, assets: maxUint128 + 1n }],
    },
    InputExceedsMaxError,
  ],
  [
    { collateralWithdrawals: [{ collateralIndex: 2n, assets: 1n }] },
    UnknownCollateralIndexError,
  ],
])("rejects invalid batch %#", (overrides, error) => {
  expect(() =>
    midnightWithdrawCollateralBatch({ ...params, ...overrides }),
  ).toThrow(error);
});

test("duplicate message names index and metadata matches single action suffix", () => {
  expect(() =>
    midnightWithdrawCollateralBatch({
      ...params,
      collateralWithdrawals: [
        params.collateralWithdrawals[0]!,
        params.collateralWithdrawals[0]!,
      ],
    }),
  ).toThrow('index "1"');
  const metadata = { origin: "a1b2c3d4" };
  const single = midnightWithdrawCollateral({
    ...params,
    assets: 1n,
    metadata,
  });
  expect(
    midnightWithdrawCollateralBatch({ ...params, metadata }).data.slice(-8),
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
)("round trips unique withdrawals", (collateralWithdrawals) => {
  const tx = midnightWithdrawCollateralBatch({
    ...params,
    collateralWithdrawals,
  });
  const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });
  expect(decoded.functionName).toBe("multicall");
  if (decoded.functionName !== "multicall")
    throw new Error("expected multicall");
  expect(
    decoded.args[0].map(
      (data) => decodeFunctionData({ abi: midnightAbi, data }).args,
    ),
  ).toEqual(
    collateralWithdrawals.map(({ collateralIndex, assets }) => [
      MarketUtils.toStruct(params.market),
      collateralIndex,
      assets,
      params.onBehalf,
      params.receiver,
    ]),
  );
});

test("one entry still uses multicall", () => {
  const tx = midnightWithdrawCollateralBatch({
    ...params,
    collateralWithdrawals: [params.collateralWithdrawals[0]!],
  });
  const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });
  expect(decoded.functionName).toBe("multicall");
  if (decoded.functionName !== "multicall")
    throw new Error("expected multicall");
  expect(decoded.args[0]).toHaveLength(1);
});
