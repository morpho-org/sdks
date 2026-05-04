import { describe, expect, test } from "vitest";
import { ChainId } from "../chain.js";
import { MathLib } from "../math/MathLib.js";
import type { Address } from "../types.js";
import { Token } from "./Token.js";

const ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

describe("Token constructor", () => {
  test("stores all fields", () => {
    const t = new Token({
      address: ADDRESS,
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      price: 1_000_000_000_000_000_000n,
    });
    expect(t.address).toBe(ADDRESS);
    expect(t.name).toBe("USD Coin");
    expect(t.symbol).toBe("USDC");
    expect(t.decimals).toBe(6);
    expect(t.price).toBe(MathLib.WAD);
  });

  test("decimals defaults to 0", () => {
    const t = new Token({ address: ADDRESS });
    expect(t.decimals).toBe(0);
  });

  test("decimals coerces from BigIntish", () => {
    expect(new Token({ address: ADDRESS, decimals: 18n }).decimals).toBe(18);
    expect(new Token({ address: ADDRESS, decimals: "8" }).decimals).toBe(8);
  });

  test("price is undefined when omitted", () => {
    const t = new Token({ address: ADDRESS, decimals: 6 });
    expect(t.price).toBeUndefined();
  });

  test("price coerces from BigIntish", () => {
    expect(new Token({ address: ADDRESS, price: 1n }).price).toBe(1n);
    expect(new Token({ address: ADDRESS, price: "2" }).price).toBe(2n);
    expect(new Token({ address: ADDRESS, price: 3 }).price).toBe(3n);
  });
});

describe("Token.native", () => {
  test("returns a Token with the chain's native currency metadata", () => {
    const eth = Token.native(ChainId.EthMainnet);
    expect(eth.symbol).toBe("ETH");
    expect(eth.decimals).toBe(18);
    expect(eth.address).toBeDefined();
  });
});

describe("Token.toUsd / fromUsd round-trip", () => {
  test("returns undefined when price is unknown", () => {
    const t = new Token({ address: ADDRESS, decimals: 18 });
    expect(t.toUsd(1n)).toBeUndefined();
    expect(t.fromUsd(1n)).toBeUndefined();
  });

  test("toUsd: amount * price / 10^decimals", () => {
    // 1 USDC at $1 -> 1 * 1e18 / 1e6 = 1e12 ... wait — price is in WAD scale.
    // For a $1 token with 6 decimals, price=1e18 means 1 token = $1.
    const usdc = new Token({
      address: ADDRESS,
      decimals: 6,
      price: MathLib.WAD,
    });
    expect(usdc.toUsd(1_000_000n)).toBe(MathLib.WAD); // 1 USDC -> 1 USD (WAD)
  });

  test("fromUsd: amount * 10^decimals / price", () => {
    const usdc = new Token({
      address: ADDRESS,
      decimals: 6,
      price: MathLib.WAD,
    });
    expect(usdc.fromUsd(MathLib.WAD)).toBe(1_000_000n); // $1 -> 1 USDC
  });

  test("rounding direction propagates", () => {
    // amount * 10^decimals / price with rounding
    const t = new Token({ address: ADDRESS, decimals: 0, price: 3n });
    // amount=1, 10^0=1, price=3 -> 1/3 = 0 (Down) or 1 (Up)
    expect(t.fromUsd(1n, "Down")).toBe(0n);
    expect(t.fromUsd(1n, "Up")).toBe(1n);
  });
});
