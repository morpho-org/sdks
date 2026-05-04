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

    expect(err).toBeInstanceOf(BundlerErrors.Bundle);
    expect(err.error).toBe(inner);
    expect(err.index).toBe(3);
    expect(err.inputOperation).toBe(inputOp);
    expect(err.steps).toBe(steps);
    expect(err.stack).toBe(inner.stack);
  });

  test("MissingSignature is a class identity", () => {
    const err = new BundlerErrors.MissingSignature();
    expect(err).toBeInstanceOf(BundlerErrors.MissingSignature);
    expect(err).toBeInstanceOf(Error);
  });

  test("MissingSwapData is a class identity", () => {
    expect(new BundlerErrors.MissingSwapData()).toBeInstanceOf(
      BundlerErrors.MissingSwapData,
    );
  });

  // The remaining classes (UnexpectedAction, UnexpectedSignature,
  // MissingSkimHandler, UnskimedToken) don't store constructor arguments
  // as public fields — only the formatted message uses them. Per AGENTS.md
  // §3, that's a future API tightening (errors should expose typed fields).
  // Until then, class-identity is the only stable assertion.
  test("UnexpectedAction is a class identity", () => {
    expect(
      new BundlerErrors.UnexpectedAction("erc20Transfer" as ActionType, 1),
    ).toBeInstanceOf(BundlerErrors.UnexpectedAction);
  });

  test("UnexpectedSignature is a class identity", () => {
    expect(new BundlerErrors.UnexpectedSignature(ADDRESS)).toBeInstanceOf(
      BundlerErrors.UnexpectedSignature,
    );
  });

  test("MissingSkimHandler is a class identity", () => {
    expect(
      new BundlerErrors.MissingSkimHandler("Blue_Supply" as OperationType),
    ).toBeInstanceOf(BundlerErrors.MissingSkimHandler);
  });

  test("UnskimedToken is a class identity", () => {
    expect(new BundlerErrors.UnskimedToken(ADDRESS)).toBeInstanceOf(
      BundlerErrors.UnskimedToken,
    );
  });
});
