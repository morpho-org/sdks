import { ChainId, addressesRegistry } from "@morpho-org/blue-sdk";
import { isAddress } from "viem";
import { describe, expect, test } from "vitest";
import { withSimplePermit } from "./tokens.js";

describe("withSimplePermit registry", () => {
  test("has entries for EthMainnet and BaseMainnet", () => {
    expect(withSimplePermit[ChainId.EthMainnet]).toBeDefined();
    expect(withSimplePermit[ChainId.BaseMainnet]).toBeDefined();
  });

  test("every listed token is a valid address", () => {
    for (const set of Object.values(withSimplePermit)) {
      for (const addr of set) {
        expect(isAddress(addr)).toBe(true);
      }
    }
  });

  test("EthMainnet set contains the expected canonical permit tokens", () => {
    const ethSet = withSimplePermit[ChainId.EthMainnet]!;
    expect(ethSet.has(addressesRegistry[ChainId.EthMainnet].wstEth)).toBe(true);
    expect(ethSet.has(addressesRegistry[ChainId.EthMainnet].dai)).toBe(true);
    expect(ethSet.has(addressesRegistry[ChainId.EthMainnet].usdc)).toBe(true);
  });

  test("BaseMainnet set contains usdc and verUsdc", () => {
    const baseSet = withSimplePermit[ChainId.BaseMainnet]!;
    expect(baseSet.has(addressesRegistry[ChainId.BaseMainnet].usdc)).toBe(true);
    expect(baseSet.has(addressesRegistry[ChainId.BaseMainnet].verUsdc)).toBe(
      true,
    );
  });

  test("each chain's set contains no duplicates", () => {
    for (const [chainId, set] of Object.entries(withSimplePermit)) {
      const arr = Array.from(set);
      expect(arr.length, `chain ${chainId}`).toBe(new Set(arr).size);
    }
  });
});
