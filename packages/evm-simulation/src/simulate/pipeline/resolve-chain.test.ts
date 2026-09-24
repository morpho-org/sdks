import { expectTypeOf } from "vitest";
import { UnsupportedChainError } from "../../errors.js";
import type { ChainSimulationConfig, SimulationConfig } from "../../types.js";
import { resolveChain } from "./resolve-chain.js";

describe("resolveChain", () => {
  test("default", () => {
    const config: SimulationConfig = {
      chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]),
    };
    expect(resolveChain(config, 1)).toEqual({
      simulateV1Url: "https://rpc.example",
    });
  });

  test("behavior: endpoint is required at compile time", () => {
    expectTypeOf<{}>().not.toExtend<ChainSimulationConfig>();
    expectTypeOf<{
      tenderlyRpc: { rpcUrl: string };
    }>().not.toExtend<ChainSimulationConfig>();
    expectTypeOf<
      keyof ChainSimulationConfig
    >().toEqualTypeOf<"simulateV1Url">();
  });

  test("error: UnsupportedChainError for an absent chain", () => {
    expect(() => resolveChain({ chains: new Map() }, 42)).toThrow(
      UnsupportedChainError,
    );
    try {
      resolveChain({ chains: new Map() }, 42);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedChainError);
      if (error instanceof UnsupportedChainError)
        expect(error.chainId).toBe(42);
    }
  });

  test.each([
    {},
    { tenderlyRpc: { rpcUrl: "https://legacy.example" } },
    { simulateV1Url: "" },
    { simulateV1Url: "  " },
    { simulateV1Url: 42 },
  ])(
    "error: UnsupportedChainError for invalid runtime configuration %j",
    (entry) => {
      const config = {
        chains: new Map([[1, entry]]),
      } as unknown as SimulationConfig;
      expect(() => resolveChain(config, 1)).toThrow(UnsupportedChainError);
    },
  );
});
