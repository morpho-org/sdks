import { describe, expect, it } from "vitest";
import type { SimulationTransaction } from "../types.js";
import {
  DEFAULT_SIMULATION_GAS_PRICE,
  resolveFeeContext,
} from "./fee-context.js";

const BASE: SimulationTransaction = {
  from: "0x1111111111111111111111111111111111111111",
  to: "0x2222222222222222222222222222222222222222",
  data: "0x",
};

describe("resolveFeeContext", () => {
  it("defaults to a non-zero gas price when no fee is set (Cantina 1631)", () => {
    expect(DEFAULT_SIMULATION_GAS_PRICE > 0n).toBe(true);
    expect(resolveFeeContext(BASE)).toEqual({
      gasPrice: DEFAULT_SIMULATION_GAS_PRICE,
    });
  });

  it("behavior: honors an explicit legacy gasPrice", () => {
    expect(resolveFeeContext({ ...BASE, gasPrice: 7n })).toEqual({
      gasPrice: 7n,
    });
  });

  it("behavior: honors an explicit EIP-1559 fee", () => {
    expect(
      resolveFeeContext({
        ...BASE,
        maxFeePerGas: 9n,
        maxPriorityFeePerGas: 2n,
      }),
    ).toEqual({ maxFeePerGas: 9n, maxPriorityFeePerGas: 2n });
  });

  it("behavior: does not apply the default when only maxFeePerGas is set", () => {
    expect(resolveFeeContext({ ...BASE, maxFeePerGas: 9n })).toEqual({
      maxFeePerGas: 9n,
    });
  });
  // A zero gas price is not tested here: input validation rejects it upstream
  // (see validate-input.test.ts), so it never reaches resolveFeeContext.
});
