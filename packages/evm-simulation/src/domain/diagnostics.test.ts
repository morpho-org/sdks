import { expect, expectTypeOf } from "vitest";
import type {
  BlacklistViolationError,
  ExternalServiceError,
  SimulationRevertedError,
  SimulationValidationError,
  UnsupportedChainError,
} from "../errors.js";
import type {
  ConsumerConstraintContext,
  SimulationErrorCode,
  SimulationErrorCodes,
  SimulationErrorContext,
  SimulationErrorLocation,
  SimulationErrorShape,
  SimulationExecutionReason,
  SimulationStage,
  SimulationSubject,
} from "./diagnostics.js";
import type { DecodedOperation } from "./operations.js";

describe("simulation diagnostics", () => {
  test("behavior: the five existing error codes remain unchanged", () => {
    expectTypeOf<
      SimulationErrorCodes["SimulationValidationError"]
    >().toEqualTypeOf<SimulationValidationError["code"]>();
    expectTypeOf<SimulationErrorCodes["UnsupportedChainError"]>().toEqualTypeOf<
      UnsupportedChainError["code"]
    >();
    expectTypeOf<SimulationErrorCodes["ExternalServiceError"]>().toEqualTypeOf<
      ExternalServiceError["code"]
    >();
    expectTypeOf<
      SimulationErrorCodes["SimulationRevertedError"]
    >().toEqualTypeOf<SimulationRevertedError["code"]>();
    expectTypeOf<
      SimulationErrorCodes["BlacklistViolationError"]
    >().toEqualTypeOf<BlacklistViolationError["code"]>();
  });

  test("behavior: consumer diagnostics name only applicable fields", () => {
    expectTypeOf<"maxSharesBurned">().not.toExtend<
      Extract<ConsumerConstraintContext, { type: "blueBorrow" }>["field"]
    >();
    expectTypeOf<"maxBorrowApyAfterWad">().toExtend<
      Extract<ConsumerConstraintContext, { type: "blueBorrow" }>["field"]
    >();
    expectTypeOf<"txIdx">().not.toExtend<
      keyof Extract<SimulationErrorLocation, { type: "authorization" }>
    >();
  });

  test("behavior: the error contract is exhaustive and machine-readable", () => {
    expectTypeOf<SimulationErrorCode>().toEqualTypeOf<
      SimulationErrorCodes[keyof SimulationErrorCodes]
    >();
    expectTypeOf<SimulationExecutionReason>().toEqualTypeOf<
      | "INSUFFICIENT_BALANCE"
      | "INSUFFICIENT_ALLOWANCE"
      | "INSUFFICIENT_LIQUIDITY"
      | "POSITION_UNHEALTHY"
      | "SLIPPAGE_EXCEEDED"
      | "SIGNATURE_EXPIRED"
      | "SIGNATURE_INVALID"
      | "NONCE_ALREADY_USED"
      | "CAP_EXCEEDED"
      | "ACCESS_RESTRICTED"
      | "UNKNOWN_REVERT"
    >();
    expectTypeOf<
      SimulationErrorContext["stage"]
    >().toEqualTypeOf<SimulationStage>();
    expectTypeOf<
      Extract<SimulationErrorContext, { stage: "execution" }>["subject"]
    >().toEqualTypeOf<SimulationSubject>();
    expectTypeOf<
      Extract<SimulationErrorContext, { stage: "verification" }>["operation"]
    >().toEqualTypeOf<DecodedOperation["type"]>();
    expectTypeOf<
      Extract<SimulationErrorContext, { stage: "preparation" }>["blockNumber"]
    >().toEqualTypeOf<bigint>();
    expectTypeOf<
      Extract<SimulationErrorContext, { stage: "validation" }>["blockNumber"]
    >().toEqualTypeOf<bigint | undefined>();
    expectTypeOf<"reasonCode">().not.toExtend<keyof SimulationErrorContext>();
    expectTypeOf<"txIdx">().not.toExtend<
      keyof Extract<SimulationErrorLocation, { type: "transaction" }>
    >();
  });

  test("behavior: the error shape links name, code and class fields", () => {
    expectTypeOf<
      SimulationErrorShape<"SimulationRevertedError">["code"]
    >().toEqualTypeOf<"SIMULATION_REVERTED">();
    expectTypeOf<
      SimulationErrorShape<"SimulationRevertedError">["reasonCode"]
    >().toEqualTypeOf<SimulationExecutionReason>();
    expectTypeOf<"reasonCode">().not.toExtend<
      keyof SimulationErrorShape<"FeeMismatchError">
    >();
    expectTypeOf<
      Extract<SimulationErrorShape, { code: "FEE_MISMATCH" }>["name"]
    >().toEqualTypeOf<"FeeMismatchError">();
    expectTypeOf<{
      name: "SimulationRevertedError";
      code: "FEE_MISMATCH";
      context: SimulationErrorContext;
      reasonCode: "UNKNOWN_REVERT";
    }>().not.toExtend<SimulationErrorShape>();
    const preparationRevert: SimulationErrorShape<"SimulationRevertedError"> = {
      name: "SimulationRevertedError",
      code: "SIMULATION_REVERTED",
      reasonCode: "INSUFFICIENT_ALLOWANCE",
      context: {
        mode: "preview",
        stage: "preparation",
        chainId: 1,
        blockNumber: 1n,
        location: { type: "authorization", authorizationIndex: 0 },
      },
    };
    expect(preparationRevert.context.stage).toBe("preparation");
  });
});
