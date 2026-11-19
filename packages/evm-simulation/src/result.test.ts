import { describe, expectTypeOf, test } from "vitest";
import type {
  SimulationFailure,
  SimulationInputReport,
  SimulationReport,
  VerifiedSimulationInputResult,
  VerifiedSimulationResult,
} from "./result.js";

describe("SimulationReport", () => {
  test("behavior: a failed report has no result", () => {
    expectTypeOf<SimulationFailure>().not.toHaveProperty("result");
    expectTypeOf<Extract<SimulationReport, { ok: false }>>().not.toHaveProperty(
      "result",
    );
    expectTypeOf<
      Extract<SimulationInputReport, { ok: false }>
    >().not.toHaveProperty("result");
  });

  test("behavior: only the ok branch carries the result", () => {
    expectTypeOf<
      Extract<SimulationReport, { ok: true }>["result"]
    >().toEqualTypeOf<VerifiedSimulationResult>();
    expectTypeOf<
      Extract<SimulationInputReport, { ok: true }>["result"]
    >().toEqualTypeOf<VerifiedSimulationInputResult>();
  });
});
