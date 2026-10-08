import type { BlockTag } from "viem";
import { expectTypeOf } from "vitest";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";
import {
  SIMULATION_MODES,
  type SimulateParams,
  type SimulationMode,
} from "./params.js";
import type { SimulationLogger, SimulationTransaction } from "./types.js";

describe("SimulateParams", () => {
  test("default", () => {
    expect(SIMULATION_MODES).toEqual(["preview", "final"]);
    expectTypeOf<SimulationMode>().toEqualTypeOf<"preview" | "final">();
  });

  test("behavior: v6 field set", () => {
    expectTypeOf<keyof SimulateParams>().toEqualTypeOf<
      | "transactions"
      | "mode"
      | "authorizations"
      | "blockNumber"
      | "block"
      | "limits"
      | "blockOverrides"
      | "parentHashCheck"
      | "timeoutMs"
      | "logger"
    >();
    expectTypeOf<SimulateParams["transactions"]>().toEqualTypeOf<
      readonly SimulationTransaction[]
    >();
    expectTypeOf<SimulateParams["mode"]>().toEqualTypeOf<
      SimulationMode | undefined
    >();
    expectTypeOf<SimulateParams["authorizations"]>().toEqualTypeOf<
      readonly SimulationAuthorization[] | undefined
    >();
    expectTypeOf<SimulateParams["blockNumber"]>().toEqualTypeOf<
      bigint | Exclude<BlockTag, "pending"> | undefined
    >();
    expectTypeOf<SimulateParams["limits"]>().toEqualTypeOf<
      SimulationLimits | undefined
    >();
    expectTypeOf<SimulateParams["blockOverrides"]>().toEqualTypeOf<
      { readonly gasLimit?: bigint } | undefined
    >();
    expectTypeOf<SimulateParams["parentHashCheck"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<SimulateParams["timeoutMs"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<SimulateParams["logger"]>().toEqualTypeOf<
      SimulationLogger | undefined
    >();
  });

  test("behavior: only transactions is required", () => {
    expectTypeOf<{
      readonly transactions: readonly SimulationTransaction[];
    }>().toMatchTypeOf<SimulateParams>();
  });
});
