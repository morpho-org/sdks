import { type Address, type Hex, zeroAddress } from "viem";

import type { SimulationAuthorization } from "../../types.js";

import { validateAuthorizations } from "./validate.js";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SENDER: Address = "0x1111111111111111111111111111111111111111";
const SPENDER: Address = "0x2222222222222222222222222222222222222222";

describe("validateAuthorizations", () => {
  it("returns an empty array for valid signature authorizations", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];
    expect(validateAuthorizations(auths)).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(validateAuthorizations([])).toEqual([]);
  });

  it("reports a zero-address token", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: zeroAddress, spender: SPENDER },
    ];
    const errors = validateAuthorizations(auths);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("zero-address token");
  });

  it("reports a zero-address spender", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: zeroAddress },
    ];
    const errors = validateAuthorizations(auths);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("zero-address spender");
  });

  it("reports both zero-address fields on the same authorization", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: zeroAddress, spender: zeroAddress },
    ];
    const errors = validateAuthorizations(auths);
    expect(errors).toHaveLength(2);
  });

  it("collects errors across multiple authorizations with correct indices", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER }, // valid
      { type: "signature", token: zeroAddress, spender: SPENDER }, // bad token at [1]
      { type: "signature", token: USDC, spender: zeroAddress }, // bad spender at [2]
    ];
    const errors = validateAuthorizations(auths);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("authorizations[1]");
    expect(errors[1]).toContain("authorizations[2]");
  });

  it("skips validation entirely for approval-type entries", () => {
    const auths: SimulationAuthorization[] = [
      {
        type: "approval",
        transaction: { from: SENDER, to: USDC, data: "0x" as Hex },
      },
    ];
    expect(validateAuthorizations(auths)).toEqual([]);
  });

  it("validates signature entries even when mixed with approval entries", () => {
    const auths: SimulationAuthorization[] = [
      {
        type: "approval",
        transaction: { from: SENDER, to: USDC, data: "0x" as Hex },
      },
      { type: "signature", token: zeroAddress, spender: SPENDER },
    ];
    const errors = validateAuthorizations(auths);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("authorizations[1]");
  });
});
