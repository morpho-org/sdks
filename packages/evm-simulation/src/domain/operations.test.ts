import { expectTypeOf } from "vitest";
import type {
  DecodedOperation,
  OperationAmount,
  OperationFunding,
  OperationSignature,
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

  test("behavior: pure Blue legs only carry the signature their ABI accepts", () => {
    type None = Extract<OperationSignature, { type: "none" }>;
    expectTypeOf<
      Extract<
        DecodedOperation,
        { type: "blueSupply" | "blueSupplyCollateral" | "blueRepay" }
      >["authorizationSignature"]
    >().toEqualTypeOf<None>();
    expectTypeOf<
      Extract<
        DecodedOperation,
        { type: "blueWithdraw" | "blueBorrow" | "blueWithdrawCollateral" }
      >["tokenSignature"]
    >().toEqualTypeOf<None>();
    expectTypeOf<
      Extract<
        DecodedOperation,
        { type: "blueSupplyCollateralBorrow" | "blueRepayWithdrawCollateral" }
      >["tokenSignature" | "authorizationSignature"]
    >().toEqualTypeOf<OperationSignature>();
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
