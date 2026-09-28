import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress, type Hex } from "viem";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DecodedOperation } from "../../decode/operation.js";
import { SimulationValidationError } from "../../errors.js";
import type { SimulationConfig } from "../../types.js";
import type { ParsedRequest } from "../request/parse-request.js";

const backends = vi.hoisted(() => ({
  createSimulationClient: vi.fn(() => ({})),
  resolvePinnedBlock: vi.fn(async () => ({
    number: 1n,
    hash: `0x${"ab".repeat(32)}` as Hex,
    timestamp: 1n,
  })),
  readBindings: vi.fn(async () => ({ vaults: [], preLiquidations: [] })),
  readPinnedInputs: vi.fn(),
  executePlan: vi.fn(),
}));
vi.mock("../backends/client.js", () => ({
  createSimulationClient: backends.createSimulationClient,
}));
vi.mock("../backends/resolve-pinned-block.js", () => ({
  resolvePinnedBlock: backends.resolvePinnedBlock,
}));
vi.mock("../backends/read-bindings.js", () => ({
  readBindings: backends.readBindings,
}));
vi.mock("../backends/read-pinned-state.js", () => ({
  readPinnedInputs: backends.readPinnedInputs,
}));
vi.mock("../backends/index.js", () => ({ executePlan: backends.executePlan }));

const decoded = vi.hoisted(() => ({ decodeOperations: vi.fn() }));
vi.mock("../../decode/operations.js", () => decoded);

import { runPipeline } from "./run-pipeline.js";

const USER: Address = getAddress("0x1111111111111111111111111111111111111111");
const MARKET_A = `0x${"aa".repeat(32)}` as MarketId;
const MARKET_B = `0x${"bb".repeat(32)}` as MarketId;

const config: SimulationConfig = {
  chains: new Map([[1, { simulateV1Url: "http://localhost" }]]),
};

const request = (limits: object): ParsedRequest =>
  ({
    chainId: 1,
    mode: "preview",
    authorizations: [],
    transactions: [{ from: USER, to: USER, data: "0x" as Hex }],
    limits,
  }) as unknown as ParsedRequest;

const borrow = (transactionIndex: number): DecodedOperation =>
  ({
    type: "blueBorrow",
    transactionIndex,
    callPath: [0],
    market: { marketId: MARKET_A },
    maxLtvWad: 10n ** 18n,
  }) as unknown as DecodedOperation;

describe("runPipeline", () => {
  beforeEach(() => {
    decoded.decodeOperations.mockReturnValue({
      owner: USER,
      operations: [borrow(0), borrow(1)],
    });
  });

  // Tests run concurrently in this project, so both cases share one test and
  // the pinned-read counter is asserted on the same mock.
  test("error: unbindable operation limits reject before any pinned-state read", async () => {
    const run = (operations: readonly object[]) =>
      runPipeline({ config, request: request({ operations }) });
    const reads = () => backends.readPinnedInputs.mock.calls.length;
    const before = reads();

    // Names a market no decoded operation touches.
    await expect(
      run([{ type: "blueBorrow", marketId: MARKET_B, maxLtvAfterWad: 1n }]),
    ).rejects.toBeInstanceOf(SimulationValidationError);
    // Ambiguous: two borrows on MARKET_A without a transactionIndex.
    await expect(
      run([{ type: "blueBorrow", marketId: MARKET_A, maxLtvAfterWad: 1n }]),
    ).rejects.toBeInstanceOf(SimulationValidationError);
    // Weaker than the calldata protection.
    await expect(
      run([
        {
          type: "blueBorrow",
          marketId: MARKET_A,
          transactionIndex: 0,
          maxLtvAfterWad: 10n ** 18n + 1n,
        },
      ]),
    ).rejects.toBeInstanceOf(SimulationValidationError);
    expect(reads()).toBe(before);

    // A bindable limit reaches the pinned-state read.
    backends.readPinnedInputs.mockRejectedValueOnce(new Error("stop here"));
    await expect(
      run([
        {
          type: "blueBorrow",
          marketId: MARKET_A,
          transactionIndex: 0,
          maxLtvAfterWad: 1n,
        },
      ]),
    ).rejects.toThrow("stop here");
    expect(reads()).toBe(before + 1);
  });
});
