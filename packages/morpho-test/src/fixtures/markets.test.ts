import { ChainId, MarketParams } from "@morpho-org/blue-sdk";
import { isAddress } from "viem";
import { describe, expect, test } from "vitest";
import { markets, randomMarket } from "./markets.js";

describe("markets fixture registry", () => {
  test("has entries for all four supported chains", () => {
    expect(markets[ChainId.EthMainnet]).toBeDefined();
    expect(markets[ChainId.BaseMainnet]).toBeDefined();
    expect(markets[ChainId.ArbitrumMainnet]).toBeDefined();
    expect(markets[ChainId.PolygonMainnet]).toBeDefined();
  });

  test("every entry is a MarketParams instance with valid addresses", () => {
    for (const chainMarkets of Object.values(markets)) {
      for (const [name, m] of Object.entries(chainMarkets)) {
        expect(m, `markets entry ${name}`).toBeInstanceOf(MarketParams);
        expect(isAddress(m.loanToken)).toBe(true);
        expect(isAddress(m.collateralToken)).toBe(true);
        expect(isAddress(m.oracle)).toBe(true);
        expect(isAddress(m.irm)).toBe(true);
      }
    }
  });

  test("idle markets have ZERO_ADDRESS oracle/irm and lltv=0", () => {
    const ethIdle = markets[ChainId.EthMainnet].eth_idle;
    expect(ethIdle.oracle).toBe("0x0000000000000000000000000000000000000000");
    expect(ethIdle.irm).toBe("0x0000000000000000000000000000000000000000");
    expect(ethIdle.lltv).toBe(0n);
  });

  test("market id is the canonical hash of params (deterministic)", () => {
    const ethWst = markets[ChainId.EthMainnet].eth_wstEth;
    const recomputed = new MarketParams({
      loanToken: ethWst.loanToken,
      collateralToken: ethWst.collateralToken,
      oracle: ethWst.oracle,
      irm: ethWst.irm,
      lltv: ethWst.lltv,
    });
    expect(recomputed.id).toBe(ethWst.id);
  });

  test("non-idle markets have a non-zero LLTV", () => {
    for (const chainMarkets of Object.values(markets)) {
      for (const [name, m] of Object.entries(chainMarkets)) {
        if (name.includes("idle")) continue;
        expect(m.lltv, `${name}.lltv`).toBeGreaterThan(0n);
      }
    }
  });
});

describe("randomMarket", () => {
  test("returns a MarketParams with random valid addresses", () => {
    const m = randomMarket();
    expect(m).toBeInstanceOf(MarketParams);
    expect(isAddress(m.loanToken)).toBe(true);
    expect(isAddress(m.collateralToken)).toBe(true);
    expect(isAddress(m.oracle)).toBe(true);
    expect(isAddress(m.irm)).toBe(true);
  });

  test("default LLTV is 80% (parseEther('0.80'))", () => {
    expect(randomMarket().lltv).toBe(800_000_000_000_000_000n);
  });

  test("accepts a partial override (loanToken)", () => {
    const m = randomMarket({
      loanToken: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
    });
    expect(m.loanToken).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
  });

  test("accepts a custom lltv override", () => {
    const m = randomMarket({ lltv: 900_000_000_000_000_000n });
    expect(m.lltv).toBe(900_000_000_000_000_000n);
  });

  test("two consecutive randomMarket() calls produce different ids", () => {
    const a = randomMarket();
    const b = randomMarket();
    expect(a.id).not.toBe(b.id);
  });
});
