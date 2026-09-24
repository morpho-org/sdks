import { getAddress } from "viem";
import { InvalidSimulationResponseError } from "../../errors.js";
import { encodeUint256 } from "../../test-helpers/index.js";
import {
  decodeNativeBalanceProbe,
  encodeNativeBalanceProbe,
  NATIVE_BALANCE_PROBE_ADDRESS,
  NATIVE_BALANCE_PROBE_BYTECODE,
} from "./native-balance-probe.js";

const ACCOUNT = getAddress("0x1111111111111111111111111111111111111111");

describe("native balance probe", () => {
  test("default: encodes getEthBalance(account) calldata", () => {
    const data = encodeNativeBalanceProbe(ACCOUNT);
    // 4-byte selector + one 32-byte address argument.
    expect(data).toHaveLength(2 + 8 + 64);
    expect(data.endsWith(ACCOUNT.slice(2).toLowerCase())).toBe(true);
    expect(data.slice(0, 10)).toBe("0x4d2301cc"); // selector of getEthBalance(address)
  });

  test("behavior: decodes a 32-byte balance", () => {
    expect(decodeNativeBalanceProbe(encodeUint256(42n))).toBe(42n);
  });

  test("error: InvalidSimulationResponseError for malformed data", () => {
    expect(() => decodeNativeBalanceProbe("0x1234")).toThrow(
      InvalidSimulationResponseError,
    );
    expect(() => decodeNativeBalanceProbe("0x")).toThrow(
      InvalidSimulationResponseError,
    );
  });

  test("behavior: probe constants are stable", () => {
    expect(NATIVE_BALANCE_PROBE_ADDRESS).toBe(
      "0x000000000000000000000000000000000000Ba1a",
    );
    expect(NATIVE_BALANCE_PROBE_BYTECODE).toBe("0x6004353160005260206000f3");
  });
});
