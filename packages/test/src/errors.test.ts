import { describe, expect, test } from "vitest";
import {
  MidnightAdapterFactoryCodeError,
  MidnightAdapterFactoryDeploymentError,
} from "./errors.js";

describe("MidnightAdapterFactoryDeploymentError", () => {
  test("default", () => {
    const hash = `0x${"ab".repeat(32)}` as const;
    const error = new MidnightAdapterFactoryDeploymentError(hash);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MidnightAdapterFactoryDeploymentError");
    expect(error.hash).toBe(hash);
  });
});

describe("MidnightAdapterFactoryCodeError", () => {
  test("default", () => {
    const address = "0x0000000000000000000000000000000000000001";
    const cause = new Error("cause");
    const error = new MidnightAdapterFactoryCodeError(address, { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MidnightAdapterFactoryCodeError");
    expect(error.address).toBe(address);
    expect(error.cause).toBe(cause);
  });
});
