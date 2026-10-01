import { type Address, ethAddress, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { Transfer } from "../../types.js";
import { nativeBalance, projectNativeAfter } from "./native.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const OTHER: Address = getAddress("0x2222222222222222222222222222222222222222");
const USDC: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

// biome-ignore lint/complexity/useMaxParams: positional fixture reads clearest
const transfer = (
  token: Address,
  from: Address,
  to: Address,
  amount: bigint,
): Transfer => ({ token, from, to, amount, txIdx: 0 });

describe("nativeBalance", () => {
  test("keys the balance under ethAddress", () => {
    expect(nativeBalance(OWNER, 42n)).toEqual({
      account: OWNER,
      token: ethAddress,
      assets: 42n,
    });
  });
});

describe("projectNativeAfter", () => {
  test("value deposit drops the sender and credits the recipient", () => {
    const before = [nativeBalance(OWNER, 100n), nativeBalance(OTHER, 0n)];
    const after = projectNativeAfter({
      before,
      transfers: [transfer(ethAddress, OWNER, OTHER, 30n)],
    });
    expect(after).toEqual([
      { account: OWNER, token: ethAddress, assets: 70n },
      { account: OTHER, token: ethAddress, assets: 30n },
    ]);
  });

  test("withdraw refund restores the balance", () => {
    const before = [nativeBalance(OWNER, 100n)];
    const after = projectNativeAfter({
      before,
      transfers: [
        transfer(ethAddress, OWNER, OTHER, 30n),
        transfer(ethAddress, OTHER, OWNER, 30n),
      ],
    });
    expect(after).toEqual([
      { account: OWNER, token: ethAddress, assets: 100n },
    ]);
  });

  test("account with no transfers keeps its before balance", () => {
    const before = [nativeBalance(OWNER, 100n), nativeBalance(OTHER, 7n)];
    const after = projectNativeAfter({ before, transfers: [] });
    expect(after).toEqual(before);
  });

  test("non-native transfers are ignored", () => {
    const before = [nativeBalance(OWNER, 100n)];
    const after = projectNativeAfter({
      before,
      transfers: [transfer(USDC, OWNER, OTHER, 55n)],
    });
    expect(after).toEqual(before);
  });

  test("account absent from before gains an entry from its net transfer", () => {
    const before = [nativeBalance(OWNER, 100n)];
    const after = projectNativeAfter({
      before,
      transfers: [transfer(ethAddress, OWNER, OTHER, 10n)],
    });
    expect(after).toEqual([
      { account: OWNER, token: ethAddress, assets: 90n },
      { account: OTHER, token: ethAddress, assets: 10n },
    ]);
  });
});
