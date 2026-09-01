import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import fc from "fast-check";
import {
  decodeFunctionData,
  getAddress,
  maxUint256,
  serializeSignature,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  type AuthorizationRequirementSignature,
  InputExceedsMaxError,
  NegativeInputError,
  RefinanceSameMarketError,
  RefinanceTokenMismatchError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { blueRefinance } from "./refinance.js";

const chainId = mainnet.id;
const userAddress = getAddress("0x00000000000000000000000000000000000000A1");
const referralFeeRecipient = getAddress(
  "0x00000000000000000000000000000000000000f1",
);
const sourceMarketParamsInput = {
  loanToken: getAddress("0x0000000000000000000000000000000000000011"),
  collateralToken: getAddress("0x0000000000000000000000000000000000000012"),
  oracle: getAddress("0x0000000000000000000000000000000000000013"),
  irm: getAddress("0x0000000000000000000000000000000000000014"),
  lltv: 860000000000000000n,
} as const;
const destinationMarketParamsInput = {
  ...sourceMarketParamsInput,
  oracle: getAddress("0x0000000000000000000000000000000000000023"),
} as const;
const sourceMarketParams = new MarketParams(sourceMarketParamsInput);
const destinationMarketParams = new MarketParams(destinationMarketParamsInput);
const market = {
  chainId,
  sourceMarketParams,
  destinationMarketParams,
};
const maxLtv = 850000000000000000n;
const deadline = 1_900_000_000n;
const metadata = { origin: "a1b2c3d4" } as const;
const compatibleMarketOraclesArbitrary = fc
  .bigInt({ min: 1n, max: (1n << 160n) - 2n })
  .map(
    (sourceOracle) =>
      [
        getAddress(toHex(sourceOracle, { size: 20 })),
        getAddress(toHex(sourceOracle + 1n, { size: 20 })),
      ] as const,
  );
const ltvArbitrary = fc.bigInt({ min: 0n, max: MathLib.WAD });
const positiveUint256Arbitrary = fc.bigInt({ min: 1n, max: maxUint256 });

describe("blueRefinance", () => {
  test("default", () => {
    const blueBundlesV1 = getChainAddress(chainId, "bundles.blueBundlesV1");
    const signature = serializeSignature({
      r: toHex(1n, { size: 32 }),
      s: toHex(2n, { size: 32 }),
      yParity: 0,
    });
    const authorizationSignature = {
      args: {
        owner: userAddress,
        authorized: blueBundlesV1,
        isAuthorized: true,
        nonce: 7n,
        deadline: 456n,
        signature,
      },
      action: {
        type: "authorization",
        args: {
          authorized: blueBundlesV1,
          isAuthorized: true,
          deadline: 456n,
        },
      },
    } satisfies AuthorizationRequirementSignature;
    const referralFeePct = MathLib.WAD / 10n;
    const args = {
      userAddress,
      maxLtv,
      authorizationSignature,
      deadline,
      referralFeePct,
      referralFeeRecipient,
    } as const;
    const plain = blueRefinance({ market, args });
    const transaction = blueRefinance({ market, args, metadata });

    expect(transaction.to).toBe(blueBundlesV1);
    expect(transaction.value).toBe(0n);
    expect(transaction.data).toBe(`${plain.data}${metadata.origin}`);
    expect(
      decodeFunctionData({ abi: blueBundlesV1Abi, data: transaction.data }),
    ).toEqual({
      functionName: "blueBundlesV1MigrateBorrowPosition",
      args: [
        sourceMarketParamsInput,
        destinationMarketParamsInput,
        maxLtv,
        {
          signature: {
            v: 27,
            r: toHex(1n, { size: 32 }),
            s: toHex(2n, { size: 32 }),
          },
          nonce: 7n,
          deadline: 456n,
        },
        [],
        referralFeePct,
        referralFeeRecipient,
        deadline,
      ],
    });
    expect(transaction.action).toEqual({
      type: "blueRefinance",
      args: {
        sourceMarket: sourceMarketParams.id,
        destinationMarket: destinationMarketParams.id,
        maxLtv,
        onBehalf: userAddress,
        reallocations: 0,
        reallocationPenaltyAssets: 0n,
        referralFeePct,
        referralFeeRecipient,
        deadline,
      },
    });
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });

  test("behavior: calldata round-trips across compatible markets", () => {
    fc.assert(
      fc.property(
        fc.record({
          oracles: compatibleMarketOraclesArbitrary,
          maxLtv: ltvArbitrary,
          deadline: positiveUint256Arbitrary,
        }),
        ({
          oracles: [sourceOracle, destinationOracle],
          maxLtv: generatedMaxLtv,
          deadline: generatedDeadline,
        }) => {
          const generatedSourceInput = {
            ...sourceMarketParamsInput,
            oracle: sourceOracle,
          } as const;
          const generatedDestinationInput = {
            ...destinationMarketParamsInput,
            oracle: destinationOracle,
          } as const;
          const generatedSource = new MarketParams(generatedSourceInput);
          const generatedDestination = new MarketParams(
            generatedDestinationInput,
          );
          const transaction = blueRefinance({
            market: {
              chainId,
              sourceMarketParams: generatedSource,
              destinationMarketParams: generatedDestination,
            },
            args: {
              userAddress,
              maxLtv: generatedMaxLtv,
              deadline: generatedDeadline,
            },
          });
          const decoded = decodeFunctionData({
            abi: blueBundlesV1Abi,
            data: transaction.data,
          });
          if (decoded.functionName !== "blueBundlesV1MigrateBorrowPosition") {
            throw new TypeError(
              "Unexpected BlueBundlesV1 borrow migration function",
            );
          }

          expect(decoded.args[0]).toEqual(generatedSourceInput);
          expect(decoded.args[1]).toEqual(generatedDestinationInput);
          expect(decoded.args[2]).toBe(generatedMaxLtv);
          expect(decoded.args[7]).toBe(generatedDeadline);
          expect(transaction.action.args).toMatchObject({
            sourceMarket: generatedSource.id,
            destinationMarket: generatedDestination.id,
            maxLtv: generatedMaxLtv,
            deadline: generatedDeadline,
          });
          expect(Object.isFrozen(transaction)).toBe(true);
          expect(Object.isFrozen(transaction.action)).toBe(true);
          expect(Object.isFrozen(transaction.action.args)).toBe(true);
        },
      ),
      { numRuns: 50, seed: 20_260_828 },
    );
  });

  test("behavior: maps destination reallocations and accounts for rounded-up penalties", () => {
    const vault = getAddress("0x0000000000000000000000000000000000000031");
    const adapter = getAddress("0x0000000000000000000000000000000000000032");
    const reallocation = {
      vault,
      from: { type: "idle" },
      to: { adapter },
      assets: 3n,
      penalty: MathLib.WAD / 2n,
    } satisfies VaultV2BlueReallocation;
    const transaction = blueRefinance({
      market,
      args: {
        userAddress,
        maxLtv,
        reallocations: [reallocation],
        deadline,
      },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });

    expect(decoded.args?.[4]).toEqual([
      {
        vault,
        adapter,
        marketParams: destinationMarketParamsInput,
        fromIdle: true,
        sourceAdapter: zeroAddress,
        sourceMarketParams: {
          loanToken: destinationMarketParams.loanToken,
          collateralToken: zeroAddress,
          oracle: zeroAddress,
          irm: zeroAddress,
          lltv: 0n,
        },
        assets: 3n,
        penalty: MathLib.WAD / 2n,
      },
    ]);
    expect(decoded.args?.[5]).toBe(0n);
    expect(decoded.args?.[6]).toBe(zeroAddress);
    expect(transaction.action.args.reallocationPenaltyAssets).toBe(2n);
  });

  test("error: RefinanceSameMarketError", () => {
    expect(() =>
      blueRefinance({
        market: {
          chainId,
          sourceMarketParams,
          destinationMarketParams: sourceMarketParams,
        },
        args: { userAddress, maxLtv, deadline },
      }),
    ).toThrow(RefinanceSameMarketError);
  });

  test.each([
    {
      name: "loan token",
      destination: new MarketParams({
        ...destinationMarketParamsInput,
        loanToken: getAddress("0x0000000000000000000000000000000000000091"),
      }),
    },
    {
      name: "collateral token",
      destination: new MarketParams({
        ...destinationMarketParamsInput,
        collateralToken: getAddress(
          "0x0000000000000000000000000000000000000092",
        ),
      }),
    },
  ])("error: RefinanceTokenMismatchError for $name", ({ destination }) => {
    expect(() =>
      blueRefinance({
        market: {
          chainId,
          sourceMarketParams,
          destinationMarketParams: destination,
        },
        args: { userAddress, maxLtv, deadline },
      }),
    ).toThrow(RefinanceTokenMismatchError);
  });

  test("error: NegativeInputError when maxLtv is negative", () => {
    expect(() =>
      blueRefinance({
        market,
        args: { userAddress, maxLtv: -1n, deadline },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: InputExceedsMaxError when maxLtv overflows uint256", () => {
    expect(() =>
      blueRefinance({
        market,
        args: { userAddress, maxLtv: maxUint256 + 1n, deadline },
      }),
    ).toThrow(InputExceedsMaxError);
  });
});
