import { SimulationValidationError } from "../../errors.js";
import {
  DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS,
  DEFAULT_MAX_SLIPPAGE_WAD,
  DEFAULT_MIN_LLTV_BUFFER_WAD,
  resolveEffectiveLimits,
} from "./effective-limits.js";

describe("resolveEffectiveLimits", () => {
  test("default", () => {
    const resolved = resolveEffectiveLimits();
    expect(resolved).toEqual({
      maxSlippageWad: 3_00000000000000n,
      minLltvBufferWad: 10n ** 18n / 200n,
      maxSignatureLifetimeSeconds: 7200n,
      wallet: { maxDebit: [], minCredit: [] },
      operations: [],
    });
    expect(resolved.maxSlippageWad).toBe(DEFAULT_MAX_SLIPPAGE_WAD);
    expect(resolved.minLltvBufferWad).toBe(DEFAULT_MIN_LLTV_BUFFER_WAD);
    expect(resolved.maxSignatureLifetimeSeconds).toBe(
      DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS,
    );
  });

  test("behavior: accepts values equal to the defaults", () => {
    const resolved = resolveEffectiveLimits({
      maxSlippageWad: DEFAULT_MAX_SLIPPAGE_WAD,
      minLltvBufferWad: DEFAULT_MIN_LLTV_BUFFER_WAD,
      maxSignatureLifetimeSeconds: DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS,
    });
    expect(resolved.maxSlippageWad).toBe(DEFAULT_MAX_SLIPPAGE_WAD);
  });

  test("behavior: accepts tighter values", () => {
    const resolved = resolveEffectiveLimits({
      maxSlippageWad: DEFAULT_MAX_SLIPPAGE_WAD / 2n,
      minLltvBufferWad: DEFAULT_MIN_LLTV_BUFFER_WAD * 2n,
      maxSignatureLifetimeSeconds: 60n,
    });
    expect(resolved.maxSlippageWad).toBe(DEFAULT_MAX_SLIPPAGE_WAD / 2n);
    expect(resolved.minLltvBufferWad).toBe(DEFAULT_MIN_LLTV_BUFFER_WAD * 2n);
    expect(resolved.maxSignatureLifetimeSeconds).toBe(60n);
  });

  test.each([
    { maxSlippageWad: DEFAULT_MAX_SLIPPAGE_WAD + 1n },
    { minLltvBufferWad: DEFAULT_MIN_LLTV_BUFFER_WAD - 1n },
    {
      maxSignatureLifetimeSeconds: DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS + 1n,
    },
    { maxSignatureLifetimeSeconds: 0n },
    { maxSlippageWad: -1n },
    {
      wallet: {
        maxDebit: [
          {
            token:
              "0x0000000000000000000000000000000000000001" as `0x${string}`,
            amount: -1n,
          },
        ],
      },
    },
    {
      wallet: {
        minCredit: [
          {
            token:
              "0x0000000000000000000000000000000000000001" as `0x${string}`,
            amount: -1n,
          },
        ],
      },
    },
  ])(
    "error: SimulationValidationError for weaker or invalid limits %#",
    (limits) => {
      expect(() => resolveEffectiveLimits(limits)).toThrow(
        SimulationValidationError,
      );
    },
  );

  test("behavior: carries wallet and operation constraints", () => {
    const resolved = resolveEffectiveLimits({
      wallet: {
        maxDebit: [
          {
            token: "0x0000000000000000000000000000000000000001",
            amount: 5n,
          },
        ],
      },
    });
    expect(resolved.wallet.maxDebit[0]?.amount).toBe(5n);
  });

  test("behavior: result is deep-frozen", () => {
    const resolved = resolveEffectiveLimits();
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.wallet)).toBe(true);
  });
});
