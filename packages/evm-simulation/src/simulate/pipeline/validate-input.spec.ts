import { type Address, type Hex, zeroAddress } from "viem";

import type { SimulateParams, SimulationAuthorization } from "../../types.js";

import { SimulationValidationError } from "../../errors.js";
import { validateInput } from "./validate-input.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const OTHER: Address = "0x2222222222222222222222222222222222222222";
const VAULT: Address = "0x3333333333333333333333333333333333333333";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const SPENDER: Address = "0x4444444444444444444444444444444444444444";

function params(overrides: Partial<SimulateParams> = {}): SimulateParams {
  return {
    chainId: 1,
    transactions: [{ from: USER, to: VAULT, data: "0x12" as Hex }],
    ...overrides,
  };
}

describe("validateInput", () => {
  it("does not throw on a single valid transaction", () => {
    expect(() => validateInput(params())).not.toThrow();
  });

  it("does not throw on multiple transactions with the same sender", () => {
    expect(() =>
      validateInput(
        params({
          transactions: [
            { from: USER, to: VAULT, data: "0x11" as Hex },
            { from: USER, to: VAULT, data: "0x22" as Hex },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("throws when transactions is empty", () => {
    expect(() => validateInput(params({ transactions: [] }))).toThrow(
      SimulationValidationError,
    );
  });

  it("throws when a tx has zero-address from", () => {
    expect(() =>
      validateInput(
        params({
          transactions: [{ from: zeroAddress, to: VAULT, data: "0x12" as Hex }],
        }),
      ),
    ).toThrow(SimulationValidationError);
  });

  it("throws when a tx has zero-address to", () => {
    expect(() =>
      validateInput(
        params({
          transactions: [{ from: USER, to: zeroAddress, data: "0x12" as Hex }],
        }),
      ),
    ).toThrow(SimulationValidationError);
  });

  it("throws when a tx has a malformed from address", () => {
    expect(() =>
      validateInput(
        params({
          transactions: [
            {
              from: "0xnotanaddress" as Address,
              to: VAULT,
              data: "0x12" as Hex,
            },
          ],
        }),
      ),
    ).toThrow(SimulationValidationError);
  });

  it("throws when a tx has empty data", () => {
    expect(() =>
      validateInput(
        params({ transactions: [{ from: USER, to: VAULT, data: "" as Hex }] }),
      ),
    ).toThrow(SimulationValidationError);
  });

  it("throws when multiple transactions have different senders", () => {
    expect(() =>
      validateInput(
        params({
          transactions: [
            { from: USER, to: VAULT, data: "0x11" as Hex },
            { from: OTHER, to: VAULT, data: "0x22" as Hex },
          ],
        }),
      ),
    ).toThrow(SimulationValidationError);
  });

  it("does not throw when senders differ only in case (checksum-equivalent)", () => {
    // Use a REAL mixed-case address so checksum vs lowercase are byte-different —
    // a palindromic all-1s address would degenerate to the same string either way
    // and leave the case-normalization path unexercised.
    const checksum: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const lower = checksum.toLowerCase() as Address;
    expect(checksum).not.toBe(lower); // sanity: addresses differ byte-for-byte

    expect(() =>
      validateInput(
        params({
          transactions: [
            { from: checksum, to: VAULT, data: "0x11" as Hex },
            { from: lower, to: VAULT, data: "0x22" as Hex },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("collects multiple errors in fieldErrors[]", () => {
    try {
      validateInput(
        params({
          transactions: [
            { from: zeroAddress, to: zeroAddress, data: "" as Hex },
          ],
        }),
      );
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationValidationError);
      const fieldErrors = (err as SimulationValidationError).fieldErrors ?? [];
      expect(fieldErrors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("runs validateAuthorizations and includes its errors", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: zeroAddress, spender: SPENDER },
    ];
    try {
      validateInput(params({ authorizations: auths }));
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SimulationValidationError);
      const fieldErrors = (err as SimulationValidationError).fieldErrors ?? [];
      expect(fieldErrors.some((e) => e.includes("zero-address token"))).toBe(
        true,
      );
    }
  });

  it("does not throw when signature authorizations are valid", () => {
    const auths: SimulationAuthorization[] = [
      { type: "signature", token: USDC, spender: SPENDER },
    ];
    expect(() =>
      validateInput(params({ authorizations: auths })),
    ).not.toThrow();
  });

  it("throws when chainId is 0, negative, or non-integer", () => {
    for (const badChainId of [0, -1, 1.5, Number.NaN]) {
      expect(() => validateInput(params({ chainId: badChainId }))).toThrow(
        SimulationValidationError,
      );
    }
  });

  it("throws when a tx has negative value", () => {
    expect(() =>
      validateInput(
        params({
          transactions: [
            { from: USER, to: VAULT, data: "0x12" as Hex, value: -1n },
          ],
        }),
      ),
    ).toThrow(SimulationValidationError);
  });
});
