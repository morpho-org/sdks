import { expectTypeOf } from "vitest";
import type {
  DecodedOperation,
  OperationAmount,
  OperationFunding,
} from "./operations.js";

describe("DecodedOperation", () => {
  test("behavior: full-position refinance and direct force-redemption keep distinct recipes", () => {
    expectTypeOf<
      Extract<DecodedOperation, { type: "blueRefinance" }>["sourceFullClose"]
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Extract<DecodedOperation, { type: "vaultV2ForceRedeem" }>["route"]
    >().toEqualTypeOf<"vaultV2Multicall">();
    expectTypeOf<
      Extract<DecodedOperation, { type: "vaultV2ForceWithdraw" }>["route"]
    >().toEqualTypeOf<"vaultExitBundlesV1">();
    expectTypeOf<
      "midnightBorrow" | "bluePartialRefinance" | "aaveMigrate"
    >().not.toExtend<DecodedOperation["type"]>();
  });

  test("behavior: amount modes are exclusive and deposits require funding", () => {
    expectTypeOf<{
      type: "assets";
      assets: bigint;
      shares: bigint;
    }>().not.toExtend<OperationAmount>();
    expectTypeOf<{ type: "none" }>().toExtend<OperationFunding>();
    expectTypeOf<{ type: "none" }>().not.toExtend<
      Extract<DecodedOperation, { type: "vaultV2Deposit" }>["funding"]
    >();
  });
});
