import { expectTypeOf } from "vitest";
import type { SimulationResult, simulate } from "../index.js";
import type { SimulationAuthorization } from "./authorizations.js";
import type { SimulationLimits } from "./limits.js";
import type { DecodedOperation } from "./operations.js";
import type {
  SimulationVerification,
  VerifiedOperation,
  VerifiedSimulationResult,
} from "./result.js";

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

type MutableFields<T> = T extends
  | string
  | number
  | bigint
  | boolean
  | symbol
  | null
  | undefined
  ? never
  : T extends readonly (infer Item)[]
    ? (T extends Item[] ? "mutableArray" : never) | MutableFields<Item>
    : {
        [Key in keyof T]-?: Equal<
          Pick<T, Key>,
          Readonly<Pick<T, Key>>
        > extends true
          ? MutableFields<T[Key]>
          : Key;
      }[keyof T];

describe("VerifiedSimulationResult", () => {
  test("default", () => {
    expectTypeOf<VerifiedSimulationResult>().toExtend<SimulationResult>();
    expectTypeOf<SimulationResult>().not.toExtend<VerifiedSimulationResult>();
    expectTypeOf<
      Awaited<ReturnType<typeof simulate>>
    >().toEqualTypeOf<VerifiedSimulationResult>();
  });

  test("behavior: nested request and output fields are readonly", () => {
    expectTypeOf<MutableFields<VerifiedSimulationResult>>().toBeNever();
    expectTypeOf<MutableFields<SimulationAuthorization>>().toBeNever();
    expectTypeOf<MutableFields<SimulationLimits>>().toBeNever();
    expectTypeOf<MutableFields<DecodedOperation>>().toBeNever();
  });

  test("behavior: final has no preparation and outcomes match operations", () => {
    expectTypeOf<
      Extract<SimulationVerification, { mode: "final" }>["authorizations"]
    >().toEqualTypeOf<readonly []>();
    expectTypeOf<{
      operation: Extract<DecodedOperation, { type: "blueBorrow" }>;
      outcome: { sharesMinted: bigint };
    }>().not.toExtend<VerifiedOperation>();
  });
});
