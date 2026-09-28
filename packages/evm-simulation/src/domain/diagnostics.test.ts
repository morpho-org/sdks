import { expectTypeOf } from "vitest";
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
} from "./diagnostics.js";

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
    expectTypeOf<"UNKNOWN_REVERT">().toExtend<SimulationExecutionReason>();
    expectTypeOf<
      Extract<SimulationErrorContext, { stage: "execution" }>["reasonCode"]
    >().toEqualTypeOf<SimulationExecutionReason>();
    expectTypeOf<"reasonCode">().not.toExtend<
      keyof Extract<SimulationErrorContext, { stage: "verification" }>
    >();
    expectTypeOf<
      SimulationErrorContext["blockNumber"]
    >().toEqualTypeOf<bigint>();
    expectTypeOf<"txIdx">().not.toExtend<
      keyof Extract<SimulationErrorLocation, { type: "transaction" }>
    >();
    expectTypeOf<
      SimulationErrorShape<"SimulationRevertedError">["code"]
    >().toEqualTypeOf<"SIMULATION_REVERTED">();
  });
});
