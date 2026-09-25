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
  test("behavior: EcrecoverRatifier shares codecs with its legacy API", () => {
    expect(EcrecoverRatifierUtils.encodeRatifierData).toBe(
      EcrecoverRatifier.encodeRatifierData,
    );
    expect(EcrecoverRatifierUtils.decodeRatifierData).toBe(
      EcrecoverRatifier.decodeRatifierData,
    );
    expect(EcrecoverRatifierUtils.treeTypeHash).toBe(
      EcrecoverRatifier.treeTypeHash,
    );
    expect(EcrecoverRatifierUtils.digestForRoot).toBe(
      EcrecoverRatifier.digestForRoot,
    );
    expect(EcrecoverRatifierUtils.digestRatifierData).toBe(
      EcrecoverRatifier.digestRatifierData,
    );
    expect(EcrecoverRatifierUtils.verifyRatifierData).toBe(
      EcrecoverRatifier.verifyRatifierData,
    );
    expect(EcrecoverRatifierUtils.toSignature).toBe(
      EcrecoverRatifier.toSignature,
    );
  });
  test("behavior: SetterRatifier shares codecs with its legacy API", () => {
    expect(SetterRatifierUtils.encodeRatifierData).toBe(
      SetterRatifier.encodeRatifierData,
    );
    expect(SetterRatifierUtils.decodeRatifierData).toBe(
      SetterRatifier.decodeRatifierData,
    );
    expect(SetterRatifierUtils.verifyRatifierData).toBe(
      SetterRatifier.verifyRatifierData,
    );
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
