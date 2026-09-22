import { describe, expect, expectTypeOf, test } from "vitest";
import {
  EcrecoverRatifier,
  EcrecoverRatifierUtils,
  PriceRatifierV1,
  PriceRatifierV1Utils,
  RateRatifierV1,
  RateRatifierV1Utils,
  Ratifier,
  RatifierUtils,
  SetterRatifier,
  SetterRatifierUtils,
} from "../index.js";

describe("ratifier namespace compatibility", () => {
  test("behavior: EcrecoverRatifierUtils remains an alias", () => {
    expect(EcrecoverRatifierUtils).toBe(EcrecoverRatifier);
    expectTypeOf<typeof EcrecoverRatifierUtils>().toEqualTypeOf<
      typeof EcrecoverRatifier
    >();
  });
  test("behavior: SetterRatifierUtils remains an alias", () => {
    expect(SetterRatifierUtils).toBe(SetterRatifier);
    expectTypeOf<typeof SetterRatifierUtils>().toEqualTypeOf<
      typeof SetterRatifier
    >();
  });
  test("behavior: PriceRatifierV1Utils remains an alias", () => {
    expect(PriceRatifierV1Utils).toBe(PriceRatifierV1);
    expectTypeOf<typeof PriceRatifierV1Utils>().toEqualTypeOf<
      typeof PriceRatifierV1
    >();
  });
  test("behavior: RateRatifierV1Utils remains an alias", () => {
    expect(RateRatifierV1Utils).toBe(RateRatifierV1);
    expectTypeOf<typeof RateRatifierV1Utils>().toEqualTypeOf<
      typeof RateRatifierV1
    >();
  });
  test("behavior: RatifierUtils remains an alias", () => {
    expect(RatifierUtils).toBe(Ratifier);
    expectTypeOf<typeof RatifierUtils>().toEqualTypeOf<typeof Ratifier>();
  });
});
