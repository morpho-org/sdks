import { UnsupportedChainError } from "../../errors.js";
import type { ChainSimulationConfig, SimulationConfig } from "../../types.js";
import { resolveChain } from "./resolve-chain.js";

function makeConfig(
  entries: [number, ChainSimulationConfig][],
): SimulationConfig {
  return { chains: new Map(entries) };
}

describe("resolveChain", () => {
  it("returns the configured simulateV1Url", () => {
    const cap = resolveChain(
      makeConfig([[1, { simulateV1Url: "http://rpc.local" }]]),
      1,
    );
    expect(cap.simulateV1Url).toBe("http://rpc.local");
  });

  it("throws UnsupportedChainError for missing chain", () => {
    expect(() =>
      resolveChain(
        makeConfig([[1, { simulateV1Url: "http://rpc.local" }]]),
        999999,
      ),
    ).toThrow(UnsupportedChainError);
  });

  it("throws UnsupportedChainError when the runtime entry has no URL", () => {
    const empty = {} as unknown as ChainSimulationConfig;
    expect(() => resolveChain(makeConfig([[1, empty]]), 1)).toThrow(
      UnsupportedChainError,
    );
  });

  it("UnsupportedChainError carries chainId", () => {
    try {
      resolveChain(makeConfig([]), 42);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedChainError);
      expect((e as UnsupportedChainError).chainId).toBe(42);
    }
  });
});
