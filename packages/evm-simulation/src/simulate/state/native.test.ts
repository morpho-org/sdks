import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { encodeUint256 } from "../../test-helpers/index.js";
import { NATIVE_BALANCE_PROBE_ADDRESS } from "../plan/native-balance-probe.js";
import { decodeNativeValue, nativeReads } from "./native.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");

describe("nativeReads", () => {
  test("targets the injected probe contract", () => {
    const [read] = nativeReads([OWNER]);
    expect(read?.to).toBe(NATIVE_BALANCE_PROBE_ADDRESS);
    expect(read?.id).toBe(`native.balance:${OWNER}`);
    expect(read?.data.length).toBeGreaterThan(2);
  });

  test("decodes the 32-byte balance", () => {
    const [read] = nativeReads([OWNER]);
    expect(
      decodeNativeValue(
        read as Extract<typeof read, { kind: "native.balance" }>,
        encodeUint256(99n),
      ),
    ).toBe(99n);
  });
});
