import { expectTypeOf } from "vitest";
import type { SimulationCall } from "../types.js";
import type { NormalizedSimulateParams } from "./request.js";
import type {
  CompleteEvidence,
  ConstrainedEffects,
  ParsedRequest,
  PendingEvidence,
  SimulationStageContracts,
  VerifiedEffects,
} from "./stages.js";

describe("simulation stages", () => {
  test("behavior: raw input and partial evidence cannot skip parsing", () => {
    expectTypeOf<NormalizedSimulateParams>().not.toExtend<ParsedRequest>();
    expectTypeOf<PendingEvidence>().not.toExtend<CompleteEvidence>();
    expectTypeOf<
      CompleteEvidence["calls"][number]["result"]["status"]
    >().toEqualTypeOf<true>();
    expectTypeOf<SimulationCall>().not.toExtend<
      CompleteEvidence["calls"][number]["result"]
    >();
    expectTypeOf<VerifiedEffects>().not.toExtend<ConstrainedEffects>();
  });

  test("behavior: verification and assembly consume their required stages", () => {
    expectTypeOf<
      Parameters<SimulationStageContracts["verifyEffects"]>
    >().toEqualTypeOf<[evidence: CompleteEvidence]>();
    expectTypeOf<
      Parameters<SimulationStageContracts["enforceLimits"]>
    >().toEqualTypeOf<[effects: VerifiedEffects]>();
    expectTypeOf<
      Parameters<SimulationStageContracts["assembleResult"]>
    >().toEqualTypeOf<[effects: ConstrainedEffects]>();
    expectTypeOf<
      Awaited<ReturnType<SimulationStageContracts["executePlan"]>>
    >().toBeUnknown();
  });
});
