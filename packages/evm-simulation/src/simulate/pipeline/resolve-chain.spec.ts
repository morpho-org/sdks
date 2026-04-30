import type { SimulationConfig, TenderlyRestConfig } from "../../types.js";

import { UnsupportedChainError } from "../../errors.js";
import { resolveChain } from "./resolve-chain.js";

const TENDERLY: TenderlyRestConfig = {
  apiBaseUrl: "https://api.tenderly.co",
  accessToken: "t",
  accountSlug: "a",
  projectSlug: "p",
  supportedChainIds: new Set([1, 8453]),
};

function makeConfig(
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  return {
    chains: new Map([[1, { simulateV1Url: "http://rpc.local" }]]),
    tenderlyRest: TENDERLY,
    ...overrides,
  };
}

describe("resolveChain", () => {
  it("flags tenderlySupported=true when chainId is in Tenderly supportedChainIds", () => {
    const cap = resolveChain(makeConfig(), 1);
    expect(cap.tenderlySupported).toBe(true);
    expect(cap.simulateV1Url).toBe("http://rpc.local");
  });

  it("flags tenderlySupported=false when chainId is missing from Tenderly supportedChainIds", () => {
    const cap = resolveChain(
      makeConfig({
        chains: new Map([[137, { simulateV1Url: "http://poly" }]]),
      }),
      137,
    );
    expect(cap.tenderlySupported).toBe(false);
    expect(cap.simulateV1Url).toBe("http://poly");
  });

  it("returns simulateV1Url undefined when chains map has no entry for chainId", () => {
    const cap = resolveChain(
      makeConfig({ chains: new Map(), tenderlyRest: TENDERLY }),
      1, // Tenderly supports it; no simulateV1Url
    );
    expect(cap.tenderlySupported).toBe(true);
    expect(cap.simulateV1Url).toBeUndefined();
  });

  it("returns simulateV1Url undefined when entry exists but simulateV1Url is not set", () => {
    const cap = resolveChain(makeConfig({ chains: new Map([[1, {}]]) }), 1);
    expect(cap.simulateV1Url).toBeUndefined();
  });

  it("treats missing tenderlyRest as tenderlySupported=false", () => {
    const cap = resolveChain(
      { chains: new Map([[1, { simulateV1Url: "http://rpc.local" }]]) },
      1,
    );
    expect(cap.tenderlySupported).toBe(false);
    expect(cap.simulateV1Url).toBe("http://rpc.local");
  });

  it("throws UnsupportedChainError when neither Tenderly nor simulateV1Url is available", () => {
    expect(() =>
      resolveChain(
        { chains: new Map(), tenderlyRest: TENDERLY },
        999999, // not in Tenderly supportedChainIds
      ),
    ).toThrow(UnsupportedChainError);
  });

  it("throws UnsupportedChainError when tenderlyRest is absent and simulateV1Url is absent", () => {
    expect(() => resolveChain({ chains: new Map() }, 1)).toThrow(
      UnsupportedChainError,
    );
  });

  it("UnsupportedChainError carries the offending chainId", () => {
    try {
      resolveChain({ chains: new Map() }, 42);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedChainError);
      expect((err as UnsupportedChainError).chainId).toBe(42);
    }
  });
});
