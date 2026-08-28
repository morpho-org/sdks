import { UnsupportedChainError } from "../../errors.js";
import type { ChainSimulationConfig, SimulationConfig } from "../../types.js";
import { resolveChain } from "./resolve-chain.js";

const TENDERLY = { rpcUrl: "https://mainnet.gateway.tenderly.co/key" };

function makeConfig(
  chains: Array<[number, ChainSimulationConfig]>,
): SimulationConfig {
  return { chains: new Map(chains) };
}

describe("resolveChain", () => {
  it("returns both backends when both are configured", () => {
    const cap = resolveChain(
      makeConfig([
        [1, { tenderlyRpc: TENDERLY, simulateV1Url: "http://rpc.local" }],
      ]),
      1,
    );
    expect(cap.tenderlyRpc).toEqual(TENDERLY);
    expect(cap.simulateV1Url).toBe("http://rpc.local");
  });

  it("returns only simulateV1Url when Tenderly is absent", () => {
    const cap = resolveChain(
      makeConfig([[137, { simulateV1Url: "http://poly" }]]),
      137,
    );
    expect(cap.tenderlyRpc).toBeUndefined();
    expect(cap.simulateV1Url).toBe("http://poly");
  });

  it("returns only tenderlyRpc when fallback is absent", () => {
    const cap = resolveChain(makeConfig([[1, { tenderlyRpc: TENDERLY }]]), 1);
    expect(cap.tenderlyRpc).toEqual(TENDERLY);
    expect(cap.simulateV1Url).toBeUndefined();
  });

  it("throws UnsupportedChainError when the chainId is missing from the map", () => {
    expect(() =>
      resolveChain(makeConfig([[1, { tenderlyRpc: TENDERLY }]]), 999999),
    ).toThrow(UnsupportedChainError);
  });

  it("throws UnsupportedChainError when neither backend is configured for the chain", () => {
    expect(() =>
      resolveChain(
        // Cast: the discriminated union prevents this at compile time;
        // the runtime guard exists for callers bypassing the type.
        { chains: new Map([[1, {} as ChainSimulationConfig]]) },
        1,
      ),
    ).toThrow(UnsupportedChainError);
  });

  it("UnsupportedChainError carries the offending chainId", () => {
    try {
      resolveChain(makeConfig([]), 42);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedChainError);
      expect((err as UnsupportedChainError).chainId).toBe(42);
    }
  });
});
