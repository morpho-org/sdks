import type {
  OperationType,
  SimulationResult,
} from "@morpho-org/simulation-sdk";
import type { Address } from "viem";
import { describe, expect, test } from "vitest";
import { BundlerErrors } from "./errors.js";
import type { ActionType, InputBundlerOperation } from "./types/index.js";

const ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

describe("BundlerErrors namespace", () => {
  test("Bundle wraps an underlying error and preserves index, op, steps", () => {
    const inner = new Error("boom");
    const inputOp = {} as InputBundlerOperation;
    const steps = [] as unknown as SimulationResult;
    const err = new BundlerErrors.Bundle(inner, 3, inputOp, steps);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("boom");
    expect(err.error).toBe(inner);
    expect(err.index).toBe(3);
    expect(err.inputOperation).toBe(inputOp);
    expect(err.steps).toBe(steps);
    expect(err.stack).toBe(inner.stack);
  });

  test("MissingSignature has the right message", () => {
    const err = new BundlerErrors.MissingSignature();
    expect(err.message).toBe("missing signature");
    expect(err).toBeInstanceOf(Error);
  });

  test("MissingSwapData has the right message", () => {
    expect(new BundlerErrors.MissingSwapData().message).toBe(
      "missing swap data",
    );
  });

  test("UnexpectedAction includes type and chainId in the message", () => {
    const err = new BundlerErrors.UnexpectedAction(
      "erc20Transfer" as ActionType,
      1,
    );
    expect(err.message).toContain("erc20Transfer");
    expect(err.message).toContain('"1"');
  });

  test("UnexpectedSignature includes the spender address", () => {
    const err = new BundlerErrors.UnexpectedSignature(ADDRESS);
    expect(err.message).toContain(ADDRESS);
  });

  test("MissingSkimHandler includes the operation type", () => {
    const err = new BundlerErrors.MissingSkimHandler(
      "Blue_Supply" as OperationType,
    );
    expect(err.message).toContain("Blue_Supply");
  });

  test("UnskimedToken includes the token address", () => {
    const err = new BundlerErrors.UnskimedToken(ADDRESS);
    expect(err.message).toContain(ADDRESS);
  });
});
