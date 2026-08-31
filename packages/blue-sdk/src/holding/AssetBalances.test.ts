import { describe, expect, test } from "vitest";
import { Token } from "../token/Token.js";
import type { Address } from "../types.js";
import { AssetBalances, type PeripheralBalance } from "./AssetBalances.js";

const ETH = new Token({
  address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address,
  symbol: "ETH",
  decimals: 18,
});
const WSTETH = new Token({
  address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as Address,
  symbol: "wstETH",
  decimals: 18,
});

describe("AssetBalances", () => {
  test("constructor seeds the base allocation and total", () => {
    const ab = new AssetBalances({
      srcToken: ETH,
      srcAmount: 1n,
      dstAmount: 1_000n,
    });
    expect(ab.total).toBe(1_000n);
    expect(ab.allocations.base).toMatchObject({
      type: "base",
      srcToken: ETH,
      srcAmount: 1n,
      dstAmount: 1_000n,
    });
  });

  test("add accumulates total and creates allocation entry", () => {
    const ab = new AssetBalances({
      srcToken: ETH,
      srcAmount: 0n,
      dstAmount: 0n,
    });
    const peripheral: PeripheralBalance = {
      type: "wrapped",
      srcToken: WSTETH,
      srcAmount: 100n,
      dstAmount: 120n,
    };
    ab.add(peripheral);
    expect(ab.total).toBe(120n);
    expect(ab.allocations.wrapped).toMatchObject({
      type: "wrapped",
      srcAmount: 100n,
      dstAmount: 120n,
    });
  });

  test("add accumulates into an existing allocation", () => {
    const ab = new AssetBalances({
      srcToken: ETH,
      srcAmount: 0n,
      dstAmount: 0n,
    });
    ab.add({ type: "wrapped", srcToken: WSTETH, srcAmount: 1n, dstAmount: 2n });
    ab.add({
      type: "wrapped",
      srcToken: WSTETH,
      srcAmount: 5n,
      dstAmount: 10n,
    });
    expect(ab.allocations.wrapped?.srcAmount).toBe(6n);
    expect(ab.allocations.wrapped?.dstAmount).toBe(12n);
    expect(ab.total).toBe(12n);
  });

  test("sub decrements total and updates allocation", () => {
    const ab = new AssetBalances({
      srcToken: ETH,
      srcAmount: 0n,
      dstAmount: 100n,
    });
    ab.sub({
      type: "wrapped",
      srcToken: WSTETH,
      srcAmount: 5n,
      dstAmount: 30n,
    });
    expect(ab.total).toBe(70n);
    expect(ab.allocations.wrapped?.srcAmount).toBe(-5n);
    expect(ab.allocations.wrapped?.dstAmount).toBe(-30n);
  });

  test("add returns the same instance (chainable)", () => {
    const ab = new AssetBalances({
      srcToken: ETH,
      srcAmount: 0n,
      dstAmount: 0n,
    });
    const result = ab.add({
      type: "vault",
      srcToken: ETH,
      srcAmount: 1n,
      dstAmount: 1n,
    });
    expect(result).toBe(ab);
  });

  test("sub returns the same instance (chainable)", () => {
    const ab = new AssetBalances({
      srcToken: ETH,
      srcAmount: 0n,
      dstAmount: 100n,
    });
    const result = ab.sub({
      type: "vault",
      srcToken: ETH,
      srcAmount: 1n,
      dstAmount: 1n,
    });
    expect(result).toBe(ab);
  });

  test("supports all peripheral balance types", () => {
    const ab = new AssetBalances({
      srcToken: ETH,
      srcAmount: 0n,
      dstAmount: 0n,
    });
    const types = [
      "wrapped",
      "staked-wrapped",
      "vault",
      "wrapped-vault",
      "unwrapped-staked-wrapped",
    ] as const;
    for (const type of types) {
      ab.add({ type, srcToken: ETH, srcAmount: 1n, dstAmount: 1n });
      expect(ab.allocations[type]).toBeDefined();
    }
    expect(ab.total).toBe(BigInt(types.length));
  });
});
