import { expectTypeOf } from "vitest";
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
    expectTypeOf<VerifiedEffects>().not.toExtend<ConstrainedEffects>();
  });

  test("behavior: verification and assembly consume their required stages", () => {
    expectTypeOf<
      Parameters<SimulationStageContracts["verifyEffects"]>
    >().toEqualTypeOf<[evidence: CompleteEvidence]>();
    expectTypeOf<
      Parameters<SimulationStageContracts["assembleResult"]>
    >().toEqualTypeOf<[effects: ConstrainedEffects]>();
    expectTypeOf<
      Awaited<ReturnType<SimulationStageContracts["executePlan"]>>
    >().toBeUnknown();
  });
});
