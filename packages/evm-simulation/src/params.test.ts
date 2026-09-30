import type { BlockTag } from "viem";
import { expectTypeOf } from "vitest";
import type { PendingAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";
import {
  SIMULATION_MODES,
  type SimulateParams,
  type SimulationMode,
} from "./params.js";
import type { SimulationTransaction } from "./types.js";

describe("SimulateParams", () => {
  test("default", () => {
    expect(SIMULATION_MODES).toEqual(["preview", "final"]);
    expectTypeOf<SimulationMode>().toEqualTypeOf<"preview" | "final">();
  });

  test("behavior: v5 field set", () => {
    expectTypeOf<keyof SimulateParams>().toEqualTypeOf<
      | "chainId"
      | "transactions"
      | "mode"
      | "authorizations"
      | "blockNumber"
      | "limits"
    >();
    expectTypeOf<SimulateParams["chainId"]>().toEqualTypeOf<number>();
    expectTypeOf<SimulateParams["transactions"]>().toEqualTypeOf<
      readonly SimulationTransaction[]
    >();
    expectTypeOf<SimulateParams["mode"]>().toEqualTypeOf<
      SimulationMode | undefined
    >();
    expectTypeOf<SimulateParams["authorizations"]>().toEqualTypeOf<
      readonly PendingAuthorization[] | undefined
    >();
    expectTypeOf<SimulateParams["blockNumber"]>().toEqualTypeOf<
      bigint | Exclude<BlockTag, "pending"> | undefined
    >();
    expectTypeOf<SimulateParams["limits"]>().toEqualTypeOf<
      SimulationLimits | undefined
    >();
  });

  test("behavior: only chainId and transactions are required", () => {
    expectTypeOf<{
      readonly chainId: number;
      readonly transactions: readonly SimulationTransaction[];
    }>().toMatchTypeOf<SimulateParams>();
  });
});
