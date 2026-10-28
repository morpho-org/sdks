import { readFileSync } from "node:fs";
import { MathLib } from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import * as publicApi from "../index.js";
import {
  InputExceedsMaxError,
  MidnightReferralFeePctExceededError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
} from "./error.js";

describe("NegativeInputError", () => {
  test("default", () => {
    const error = new NegativeInputError("nativeAmount", -1n);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NegativeInputError");
    expect(error.field).toBe("nativeAmount");
    expect(error.value).toBe(-1n);
    expect(error.message).toBe(
      'Input "nativeAmount" must be non-negative, got "-1".',
    );
  });
});
describe("NonPositiveInputError", () => {
  test("default", () => {
    const error = new NonPositiveInputError("assets", 0n);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("NonPositiveInputError");
    expect(error.field).toBe("assets");
    expect(error.value).toBe(0n);
    expect(error.message).toBe('Input "assets" must be positive, got "0".');
  });
});
describe("ReferralFeePctExceededError", () => {
  test("default", () => {
    const error = new ReferralFeePctExceededError(MathLib.WAD);

    expect(error.name).toBe("ReferralFeePctExceededError");
    expect(error.referralFeePct).toBe(MathLib.WAD);
    expect(error.message).toBe(
      'Referral fee percentage "1000000000000000000" must be below WAD. Reduce referralFeePct or disable the referral fee.',
    );
  });

  test("behavior: stays catchable as the generic maximum-bound error", () => {
    const error = new ReferralFeePctExceededError(MathLib.WAD);

    expect(error).toBeInstanceOf(InputExceedsMaxError);
    expect(error.field).toBe("referralFeePct");
    expect(error.value).toBe(MathLib.WAD);
    expect(error.max).toBe(MathLib.WAD - 1n);
  });
});

describe("error classes", () => {
  const sources = ["./error.ts"].map((file) =>
    readFileSync(new URL(file, import.meta.url), "utf8"),
  );
  const classes = sources.flatMap((source) =>
    [...source.matchAll(/export class (\w+) extends/g)].map(([, name]) => ({
      name: name!,
      source,
    })),
  );

  test("behavior: every class sets its own name and is exported from the package root", () => {
    expect(classes.length).toBeGreaterThan(100);
    for (const { name, source } of classes) {
      expect(source, name).toContain(`this.name = "${name}";`);
      expect(publicApi, name).toHaveProperty(name);
    }
  });
});

describe("MidnightReferralFeePctExceededError", () => {
  const referralFeePct = MathLib.WAD / 10n + 1n;

  test("default", () => {
    const error = new MidnightReferralFeePctExceededError(referralFeePct);

    expect(error.name).toBe("MidnightReferralFeePctExceededError");
    expect(error.referralFeePct).toBe(referralFeePct);
    expect(error.message).toBe(
      `Referral fee "${referralFeePct}" exceeds the SDK's 10% Midnight referral-fee cap "${MathLib.WAD / 10n}". Reduce referralFeePct.`,
    );
  });

  test("behavior: stays catchable as the generic maximum-bound error", () => {
    const error = new MidnightReferralFeePctExceededError(referralFeePct);

    expect(error).toBeInstanceOf(InputExceedsMaxError);
    expect(error.field).toBe("referralFeePct");
    expect(error.value).toBe(referralFeePct);
    expect(error.max).toBe(MathLib.WAD / 10n);
  });
});
