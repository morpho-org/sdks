import { describe, expect, test } from "vitest";
import { freezeWarning, type SimulationWarning } from "./warnings.js";

describe("freezeWarning", () => {
  test.each([[], ["0x0000000000000000000000000000000000000003"]] as const)(
    "copies and freezes plain warning context (%j)",
    (...recipients) => {
      const input: SimulationWarning = {
        code: "UNEXPECTED_TOKEN_TRANSFER",
        severity: "warn",
        chainId: 1,
        message: "outflow",
        token: "0x0000000000000000000000000000000000000001",
        sender: "0x0000000000000000000000000000000000000002",
        recipients: [...recipients],
      };
      const warning = freezeWarning(input);
      expect(warning).toEqual(input);
      expect(warning).not.toBe(input);
      expect(warning).not.toBeInstanceOf(Error);
      expect(Object.getPrototypeOf(warning)).toBe(Object.prototype);
      expect(Object.isFrozen(warning)).toBe(true);
      if (warning.code === "UNEXPECTED_TOKEN_TRANSFER") {
        expect(Object.isFrozen(warning.recipients)).toBe(true);
        expect(warning.recipients).not.toBe(input.recipients);
      }
      expect(Object.isFrozen(input)).toBe(false);
      expect(Object.isFrozen(input.recipients)).toBe(false);
      expect(freezeWarning(input)).toEqual(warning);
    },
  );
});
