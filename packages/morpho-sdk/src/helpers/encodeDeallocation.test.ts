import { MarketParams, marketParamsAbi } from "@morpho-org/blue-sdk";
import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  parseEther,
} from "viem";
import { describe, expect, test } from "vitest";
import { NonPositiveAssetAmountError } from "../types/index.js";
import { encodeForceDeallocateCall } from "./encodeDeallocation.js";

const ADAPTER: Address = "0x1111111111111111111111111111111111111111";
const ON_BEHALF: Address = "0x2222222222222222222222222222222222222222";

const FIXTURE_PARAMS = new MarketParams({
  loanToken: "0x3333333333333333333333333333333333333333",
  collateralToken: "0x4444444444444444444444444444444444444444",
  oracle: "0x5555555555555555555555555555555555555555",
  irm: "0x6666666666666666666666666666666666666666",
  lltv: parseEther("0.86"),
});

describe("encodeForceDeallocateCall", () => {
  test("encodes a Vault V1-style deallocation (no marketParams) with empty data", () => {
    const calldata = encodeForceDeallocateCall(
      { adapter: ADAPTER, amount: 100n },
      ON_BEHALF,
    );

    const decoded = decodeFunctionData({ abi: vaultV2Abi, data: calldata });
    expect(decoded.functionName).toBe("forceDeallocate");
    expect(decoded.args).toEqual([ADAPTER, "0x", 100n, ON_BEHALF]);
  });

  test("encodes a Morpho Market V1 deallocation (with marketParams) with ABI-encoded data", () => {
    const calldata = encodeForceDeallocateCall(
      { adapter: ADAPTER, marketParams: FIXTURE_PARAMS, amount: 500n },
      ON_BEHALF,
    );

    const decoded = decodeFunctionData({ abi: vaultV2Abi, data: calldata });
    expect(decoded.functionName).toBe("forceDeallocate");

    const [adapter, data, amount, onBehalf] = decoded.args as readonly [
      Address,
      `0x${string}`,
      bigint,
      Address,
    ];
    expect(adapter).toBe(ADAPTER);
    expect(amount).toBe(500n);
    expect(onBehalf).toBe(ON_BEHALF);

    // The data field round-trips back to the original MarketParams.
    const [decodedParams] = decodeAbiParameters([marketParamsAbi], data);
    expect(decodedParams.loanToken).toBe(FIXTURE_PARAMS.loanToken);
    expect(decodedParams.collateralToken).toBe(FIXTURE_PARAMS.collateralToken);
    expect(decodedParams.oracle).toBe(FIXTURE_PARAMS.oracle);
    expect(decodedParams.irm).toBe(FIXTURE_PARAMS.irm);
    expect(decodedParams.lltv).toBe(FIXTURE_PARAMS.lltv);
  });

  test("throws NonPositiveAssetAmountError on amount=0", () => {
    expect(() =>
      encodeForceDeallocateCall({ adapter: ADAPTER, amount: 0n }, ON_BEHALF),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("throws NonPositiveAssetAmountError on negative amount", () => {
    expect(() =>
      encodeForceDeallocateCall({ adapter: ADAPTER, amount: -1n }, ON_BEHALF),
    ).toThrow(NonPositiveAssetAmountError);
  });

  test("error message references the adapter context", () => {
    try {
      encodeForceDeallocateCall({ adapter: ADAPTER, amount: 0n }, ON_BEHALF);
      expect.fail("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(NonPositiveAssetAmountError);
    }
  });
});
