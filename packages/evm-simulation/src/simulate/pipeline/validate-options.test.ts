import { SimulationValidationError } from "../../errors.js";
import type { SimulationOptions } from "../../types.js";
import { validateOptions } from "./validate-options.js";

describe("validateOptions", () => {
  it.each(["hash", "number"] as const)(
    "rejects removed blockSelector option %s",
    (blockSelector) => {
      expect(() =>
        validateOptions({ blockSelector } as unknown as SimulationOptions),
      ).toThrow(SimulationValidationError);
    },
  );

  it("accepts empty options", () => {
    expect(() => validateOptions({})).not.toThrow();
  });

  it("accepts the deprecated ignored logger, including undefined", () => {
    expect(() => validateOptions({ logger: undefined })).not.toThrow();
    const fail = () => {
      throw new Error("must not run");
    };
    expect(() =>
      validateOptions({ logger: { info: fail, warn: fail, error: fail } }),
    ).not.toThrow();
  });

  it("rejects unknown keys such as 8.x's simulateV1Url", () => {
    const options = { simulateV1Url: "https://rpc" };
    expect(() => validateOptions(options as SimulationOptions)).toThrow(
      SimulationValidationError,
    );
    try {
      validateOptions(options as SimulationOptions);
    } catch (error) {
      expect((error as SimulationValidationError).fieldErrors).toEqual([
        "simulateV1Url: unknown option",
      ]);
    }
  });

  it("accepts a positive timeoutMs", () => {
    expect(() => validateOptions({ timeoutMs: 30_000 })).not.toThrow();
  });

  it.each([
    0,
    -1,
    1.5,
    2_147_483_648,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "5000",
  ])("error: SimulationValidationError for timeoutMs %o", (timeoutMs) => {
    let error: unknown;
    try {
      validateOptions({ timeoutMs } as SimulationOptions);
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect((error as SimulationValidationError).fieldErrors).toEqual([
      "timeoutMs: must be an integer from 1 to 2147483647",
    ]);
  });

  it("rejects unknown blockOverrides keys", () => {
    expect(() =>
      validateOptions({
        blockOverrides: { gasLimit: 1n, baseFee: 0n } as never,
      }),
    ).toThrow(SimulationValidationError);
  });

  it("accepts valid values", () => {
    expect(() =>
      validateOptions({
        blockOverrides: { gasLimit: 16_777_216n },
        callGasLimit: 30_000_000n,
        parentHashCheck: false,
      }),
    ).not.toThrow();
  });

  it.each([0n, -1n, 16_777_216])(
    "throws SimulationValidationError for blockOverrides.gasLimit %s",
    (gasLimit) => {
      const options = {
        blockOverrides: { gasLimit },
      } as unknown as SimulationOptions;
      expect(() => validateOptions(options)).toThrow(SimulationValidationError);
    },
  );

  it.each([0n, -1n, 30_000_000])(
    "throws SimulationValidationError for callGasLimit %s",
    (callGasLimit) => {
      const options = { callGasLimit } as unknown as SimulationOptions;
      expect(() => validateOptions(options)).toThrow(SimulationValidationError);
    },
  );

  it.each(["false", 0, null])(
    "throws SimulationValidationError for parentHashCheck %s",
    (parentHashCheck) => {
      const options = { parentHashCheck } as unknown as SimulationOptions;
      expect(() => validateOptions(options)).toThrow(SimulationValidationError);
    },
  );

  it("names the invalid field", () => {
    try {
      validateOptions({ callGasLimit: 0n });
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SimulationValidationError);
      expect((error as SimulationValidationError).fieldErrors).toEqual([
        "callGasLimit: must be a positive bigint",
      ]);
    }
  });
});
