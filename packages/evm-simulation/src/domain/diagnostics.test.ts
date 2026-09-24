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
  SimulationErrorCodes,
  SimulationErrorLocation,
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
});
