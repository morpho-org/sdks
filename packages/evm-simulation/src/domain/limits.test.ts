import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { expectTypeOf } from "vitest";
import type {
  OperationLimit,
  OperationLimitFields,
  SimulationLimits,
} from "./limits.js";
import type { DecodedOperationFields } from "./operations.js";
import type { OperationOutcomeFields } from "./result.js";

describe("OperationLimit", () => {
  test("default", () => {
    expectTypeOf<keyof OperationLimitFields>().toEqualTypeOf<
      keyof DecodedOperationFields
    >();
    expectTypeOf<keyof OperationLimitFields>().toEqualTypeOf<
      keyof OperationOutcomeFields
    >();
    const limits = {
      maxSlippageWad: 100_000_000_000_000n,
      operations: [],
    } as const satisfies SimulationLimits;
    expectTypeOf(limits).toExtend<SimulationLimits>();
    expectTypeOf<{
      readonly type: "blueBorrow";
      readonly marketId: MarketId;
      readonly expectedAssets: bigint;
      readonly maxLtvAfterWad: bigint;
    }>().toExtend<OperationLimit>();
  });

  test("behavior: subjects and units are operation-specific", () => {
    expectTypeOf<{
      type: "blueBorrow";
      vault: Address;
    }>().not.toExtend<OperationLimit>();
    expectTypeOf<{
      type: "blueRefinance";
      marketId: MarketId;
    }>().not.toExtend<OperationLimit>();
    expectTypeOf<{
      type: "blueBorrow";
      marketId: MarketId;
      maxLtvAfterWad: number;
    }>().not.toExtend<OperationLimit>();
    expectTypeOf<"maxSharesBurned">().not.toExtend<
      keyof OperationLimitFields["blueBorrow"]
    >();
    expectTypeOf<"maxLtvAfterWad">().not.toExtend<
      keyof OperationLimitFields["vaultV2Deposit"]
    >();
    expectTypeOf<"metric" | "timeBasis">().not.toExtend<keyof OperationLimit>();
  });

  test("behavior: migration permits at most one amount pin", () => {
    type Migration = {
      type: "vaultV1MigrateToV2";
      sourceVault: Address;
      targetVault: Address;
    };
    expectTypeOf<
      Migration & { expectedAssets: bigint }
    >().toExtend<OperationLimit>();
    expectTypeOf<
      Migration & { expectedShares: bigint }
    >().toExtend<OperationLimit>();
    expectTypeOf<
      Migration & { expectedAssets: bigint; expectedShares: bigint }
    >().not.toExtend<OperationLimit>();
  });
});
