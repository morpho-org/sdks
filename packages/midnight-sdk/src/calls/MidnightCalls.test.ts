import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { addresses, baseMarket } from "../__test__/fixtures.js";
import { midnightAbi } from "../abis.js";
import { MidnightCalls } from "./MidnightCalls.js";

describe("MidnightCalls.supplyCollateral", () => {
  test("default", () => {
    const call = MidnightCalls.supplyCollateral({
      midnight: addresses.midnight,
      market: baseMarket(),
      collateralIndex: 0n,
      assets: 100n,
      onBehalf: addresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: call.data });

    expect(call.to).toBe(addresses.midnight);
    expect(decoded.functionName).toMatchInlineSnapshot(`"supplyCollateral"`);
    expect(decoded.args[1]).toMatchInlineSnapshot(`0n`);
    expect(decoded.args[2]).toMatchInlineSnapshot(`100n`);
  });
});

describe("MidnightCalls.withdrawCollateral", () => {
  test("default", () => {
    const call = MidnightCalls.withdrawCollateral({
      midnight: addresses.midnight,
      market: baseMarket(),
      collateralIndex: 0n,
      assets: 100n,
      onBehalf: addresses.taker,
      receiver: addresses.receiver,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: call.data });

    expect(decoded.functionName).toMatchInlineSnapshot(`"withdrawCollateral"`);
    expect(decoded.args[1]).toBe(0n);
    expect(decoded.args[2]).toBe(100n);
    expect(decoded.args[4]).toBe(addresses.receiver);
  });
});

describe("MidnightCalls.repay", () => {
  test("default", () => {
    const call = MidnightCalls.repay({
      midnight: addresses.midnight,
      market: baseMarket(),
      units: 100n,
      onBehalf: addresses.taker,
      callback: addresses.callback,
      data: "0x1234",
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: call.data });

    expect(decoded.functionName).toMatchInlineSnapshot(`"repay"`);
    expect(decoded.args[1]).toBe(100n);
    expect(decoded.args[3]).toBe(addresses.callback);
    expect(decoded.args[4]).toBe("0x1234");
  });
});

describe("MidnightCalls.setIsAuthorized", () => {
  test("default", () => {
    const call = MidnightCalls.setIsAuthorized({
      midnight: addresses.midnight,
      authorized: addresses.midnightBundles,
      newIsAuthorized: true,
      onBehalf: addresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: call.data });

    expect(decoded.functionName).toMatchInlineSnapshot(`"setIsAuthorized"`);
    expect(decoded.args[1]).toBe(true);
  });
});
