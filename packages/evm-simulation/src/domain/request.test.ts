import { expectTypeOf } from "vitest";
import type { SimulationTransaction } from "../types.js";
import type { SimulationAuthorization } from "./authorizations.js";
import type {
  FinalSimulateParams,
  NormalizedSimulateParams,
  PreviewSimulateParams,
  SimulateParams,
} from "./request.js";

describe("SimulateParams", () => {
  test("default", () => {
    expectTypeOf<{
      chainId: number;
      transactions: readonly Readonly<SimulationTransaction>[];
    }>().toExtend<FinalSimulateParams>();
    expectTypeOf<PreviewSimulateParams>().toExtend<SimulateParams>();
    expectTypeOf<FinalSimulateParams>().toExtend<SimulateParams>();
  });

  test("behavior: final and omitted mode reject pending authorizations", () => {
    type Pending = {
      chainId: number;
      transactions: readonly SimulationTransaction[];
      authorizations: readonly SimulationAuthorization[];
    };
    expectTypeOf<Pending>().not.toExtend<SimulateParams>();
    expectTypeOf<Pending & { mode: "final" }>().not.toExtend<SimulateParams>();
    expectTypeOf<Pending & { mode: "preview" }>().toExtend<SimulateParams>();
    expectTypeOf<
      Pending & { mode: "final" | "preview" }
    >().not.toExtend<SimulateParams>();
  });

  test("behavior: normalization keeps an explicit discriminant", () => {
    expectTypeOf<NormalizedSimulateParams["mode"]>().toEqualTypeOf<
      "preview" | "final"
    >();
    expectTypeOf<
      Extract<NormalizedSimulateParams, { mode: "final" }>["authorizations"]
    >().toEqualTypeOf<readonly []>();
  });
});
