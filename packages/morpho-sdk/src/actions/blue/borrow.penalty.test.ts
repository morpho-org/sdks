import { fc, test } from "@fast-check/vitest";
import { MarketParams, MathLib } from "@morpho-org/blue-sdk";
import { decodeFunctionData, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  InputExceedsMaxError,
  InvalidBigIntInputError,
  InvalidVaultV2BlueReallocationShapeError,
  NegativeInputError,
  NonPositiveInputError,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import { blueBorrow } from "./borrow.js";
import { blueRefinance } from "./refinance.js";
import { blueSupplyCollateralBorrow } from "./supplyCollateralBorrow.js";
import { blueWithdraw } from "./withdraw.js";

const marketParams = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000011",
  collateralToken: "0x0000000000000000000000000000000000000012",
  oracle: "0x0000000000000000000000000000000000000013",
  irm: "0x0000000000000000000000000000000000000014",
  lltv: 860000000000000000n,
});
const market = { chainId: mainnet.id, marketParams };
const baseArgs = {
  userAddress: zeroAddress,
  borrowAssets: 1_000_000n,
  maxLtv: 850000000000000000n,
  deadline: 1_900_000_000n,
};
const reallocation = (penalty: bigint): VaultV2BlueReallocation => ({
  vault: "0x00000000000000000000000000000000000000BA",
  from: { type: "idle" },
  to: { adapter: "0x00000000000000000000000000000000000000bb" },
  assets: baseArgs.borrowAssets,
  penalty,
});
const build = (penalty: bigint, maxPenalty?: bigint) =>
  blueBorrow({
    market,
    args: { ...baseArgs, reallocations: [reallocation(penalty)], maxPenalty },
  });

describe("Blue reallocation penalty bounds", () => {
  test.each([
    {
      name: "Vault V1 entry",
      input: {
        vault: reallocation(0n).vault,
        fee: 0n,
        withdrawals: [{ marketParams, amount: 1n }],
      },
    },
    {
      name: "mixed Vault V1 and V2 entry",
      input: {
        ...reallocation(0n),
        fee: 0n,
        withdrawals: [{ marketParams, amount: 1n }],
      },
    },
    {
      name: "entry matching neither shape",
      input: { vault: reallocation(0n).vault, fee: 0n },
    },
    {
      name: "entry with inherited legacy fields",
      input: Object.create({ ...reallocation(0n), fee: 0n }),
    },
    {
      name: "entry with a non-enumerable legacy field",
      input: Object.defineProperty(reallocation(0n), "withdrawals", {
        value: [],
      }),
    },
  ])("rejects $name with the original shape error", ({ input }) => {
    expect(() =>
      blueBorrow({
        market,
        args: {
          ...baseArgs,
          reallocations: [input as unknown as VaultV2BlueReallocation],
        },
      }),
    ).toThrow(InvalidVaultV2BlueReallocationShapeError);
  });

  test("ignores an unrelated throwing metadata getter", () => {
    const input = {
      ...reallocation(0n),
      get metadata(): never {
        throw new Error("Unrelated metadata must not be read");
      },
    };
    const transaction = blueBorrow({
      market,
      args: { ...baseArgs, reallocations: [input] },
    });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("blueBundlesV1SupplyCollateralAndBorrow");
    if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow")
      return;
    expect(decoded.args[6][0]).toMatchObject({
      assets: baseArgs.borrowAssets,
      penalty: 0n,
    });
    expect(transaction.action.args.reallocationPenaltyAssets).toBe(0n);
  });

  test.each([0n, MathLib.WAD / 100n])(
    "snapshots getter-backed penalty %s and assets for validation, accounting and encoding",
    (penalty) => {
      let penaltyReads = 0;
      let assetReads = 0;
      const input: VaultV2BlueReallocation = {
        ...reallocation(0n),
        get penalty() {
          return penaltyReads++ === 0 ? penalty : MathLib.WAD;
        },
        get assets() {
          return assetReads++ === 0 ? baseArgs.borrowAssets : 2n ** 128n;
        },
      };
      const transaction = blueBorrow({
        market,
        args: { ...baseArgs, reallocations: [input], maxPenalty: penalty },
      });
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transaction.data,
      });
      expect(decoded.functionName).toBe(
        "blueBundlesV1SupplyCollateralAndBorrow",
      );
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow")
        return;
      expect(decoded.args[6][0]).toMatchObject({
        penalty,
        assets: baseArgs.borrowAssets,
      });
      expect(transaction.action.args.reallocationPenaltyAssets).toBe(
        MathLib.wMulUp(baseArgs.borrowAssets, penalty),
      );
      expect(penaltyReads).toBe(1);
      expect(assetReads).toBe(1);
    },
  );

  test.each(["penalty", "assets"] as const)(
    "rejects an invalid first %s getter value",
    (field) => {
      let reads = 0;
      const input = reallocation(0n);
      Object.defineProperty(input, field, {
        get: () => {
          reads++;
          return field === "penalty" ? MathLib.WAD : 0n;
        },
      });
      expect(() =>
        blueBorrow({
          market,
          args: { ...baseArgs, reallocations: [input] },
        }),
      ).toThrow(
        field === "penalty" ? InputExceedsMaxError : NonPositiveInputError,
      );
      expect(reads).toBe(1);
    },
  );

  test.each([1, "1", null])("rejects a non-bigint maxPenalty %s", (value) => {
    const maxPenalty = value as unknown as bigint;
    expect(() => build(0n, maxPenalty)).toThrow(InvalidBigIntInputError);
    expect(() =>
      blueBorrow({ market, args: { ...baseArgs, maxPenalty } }),
    ).toThrow(InvalidBigIntInputError);
  });

  test("default: accepts a zero penalty", () => {
    expect(build(0n).action.args.reallocationPenaltyAssets).toBe(0n);
  });

  test("error: rejects a positive penalty by default", () => {
    expect(() => build(1n)).toThrow(InputExceedsMaxError);
    expect(() => build(1n)).toThrow(
      expect.objectContaining({ field: "reallocation.penalty", max: 0n }),
    );
  });

  test.each([1n, MathLib.WAD - 1n, MathLib.WAD])(
    "behavior: explicitly accepts and encodes a penalty at its bound %s",
    (penalty) => {
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: build(penalty, penalty).data,
      });
      expect(decoded.functionName).toBe(
        "blueBundlesV1SupplyCollateralAndBorrow",
      );
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow")
        return;
      expect(decoded.args[6][0]?.penalty).toBe(penalty);
    },
  );

  test("error: rejects a penalty above an explicit bound", () => {
    expect(() => build(2n, 1n)).toThrow(InputExceedsMaxError);
    expect(() => build(2n, 1n)).toThrow(
      expect.objectContaining({ field: "reallocation.penalty", max: 1n }),
    );
  });

  test.each([
    { maxPenalty: -1n, ErrorClass: NegativeInputError },
    { maxPenalty: MathLib.WAD + 1n, ErrorClass: InputExceedsMaxError },
  ])(
    "error: validates maxPenalty even without reallocations ($maxPenalty)",
    ({ maxPenalty, ErrorClass }) => {
      expect(() =>
        blueBorrow({ market, args: { ...baseArgs, maxPenalty } }),
      ).toThrow(ErrorClass);
    },
  );

  test.each(["borrow", "combined", "withdraw", "refinance"] as const)(
    "behavior: %s enforces the same default and opt-in bounds",
    (kind) => {
      const run = (penalty: bigint, maxPenalty?: bigint) => {
        const args = {
          ...baseArgs,
          reallocations: [reallocation(penalty)],
          maxPenalty,
        };
        switch (kind) {
          case "borrow":
            return blueBorrow({ market, args });
          case "combined":
            return blueSupplyCollateralBorrow({
              market,
              args: { ...args, collateralAssets: 1n },
            });
          case "withdraw":
            return blueWithdraw({
              market,
              args: {
                ...args,
                withdrawAssets: baseArgs.borrowAssets,
                withdrawShares: 0n,
              },
            });
          case "refinance":
            return blueRefinance({
              market: {
                chainId: mainnet.id,
                sourceMarketParams: marketParams,
                destinationMarketParams: new MarketParams({
                  ...marketParams,
                  oracle: zeroAddress,
                }),
              },
              args,
            });
        }
      };
      expect(() => run(1n)).toThrow(InputExceedsMaxError);
      expect(() => run(1n, 1n)).not.toThrow();
      expect(() => run(2n, 1n)).toThrow(InputExceedsMaxError);
    },
  );

  test.prop(
    [
      fc.bigInt({ min: 0n, max: MathLib.WAD }),
      fc.option(fc.bigInt({ min: 0n, max: MathLib.WAD }), { nil: undefined }),
    ],
    { numRuns: 200 },
  )(
    "property: every built borrow encodes penalties within the effective maxPenalty",
    (penalty, maxPenalty) => {
      const effectiveMaxPenalty = maxPenalty ?? 0n;
      if (penalty > effectiveMaxPenalty) {
        expect(() => build(penalty, maxPenalty)).toThrow(InputExceedsMaxError);
        return;
      }
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: build(penalty, maxPenalty).data,
      });
      expect(decoded.functionName).toBe(
        "blueBundlesV1SupplyCollateralAndBorrow",
      );
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow")
        return;
      for (const allocation of decoded.args[6]) {
        expect(allocation.penalty).toBeLessThanOrEqual(effectiveMaxPenalty);
      }
    },
  );
});
