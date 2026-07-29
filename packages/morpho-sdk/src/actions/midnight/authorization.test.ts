import { midnightAbi } from "@morpho-org/midnight-sdk";
import { decodeFunctionData, isAddressEqual, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightChainId,
} from "../../../test/fixtures/midnight.js";
import { UnsupportedMidnightAuthorizationTargetError } from "../../types/index.js";
import { midnightSetIsAuthorized } from "./authorization.js";

describe("midnightSetIsAuthorized", () => {
  test("default", () => {
    const tx = midnightSetIsAuthorized({
      chainId: midnightChainId,
      authorized: midnightAddresses.midnightBundles,
      onBehalf: midnightAddresses.taker,
    });
    const decoded = decodeFunctionData({ abi: midnightAbi, data: tx.data });

    expect(tx.to).toBe(midnightAddresses.midnight);
    expect(tx.action.args).toEqual({
      authorized: midnightAddresses.midnightBundles,
      isAuthorized: true,
      onBehalf: midnightAddresses.taker,
    });
    expect(decoded.functionName).toBe("setIsAuthorized");
    expect(decoded.args[0]).toBe(midnightAddresses.midnightBundles);
    expect(decoded.args[1]).toBe(true);
    const onBehalf = decoded.args[2];
    if (typeof onBehalf !== "string") {
      throw new Error("expected onBehalf argument");
    }
    expect(isAddressEqual(onBehalf, midnightAddresses.taker)).toBe(true);
  });

  test("behavior: revokes authorization and appends metadata", () => {
    const tx = midnightSetIsAuthorized({
      chainId: midnightChainId,
      authorized: zeroAddress,
      onBehalf: midnightAddresses.taker,
      isAuthorized: false,
      metadata: { origin: "a1b2c3d4" },
    });

    expect(tx.action.args.isAuthorized).toBe(false);
    expect(tx.data.endsWith("a1b2c3d4")).toBe(true);
  });

  test("error: UnsupportedMidnightAuthorizationTargetError", () => {
    expect(() =>
      midnightSetIsAuthorized({
        chainId: midnightChainId,
        authorized: zeroAddress,
        onBehalf: midnightAddresses.taker,
      }),
    ).toThrow(UnsupportedMidnightAuthorizationTargetError);
  });
});
