import { MathLib } from "@morpho-org/morpho-ts";
import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { IN_KIND_USER } from "../../test/fixtures/inKindRedeem.js";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NegativeInputError,
} from "../types/index.js";
import {
  InvalidCalldataOriginError,
  NonIntegerInputError,
  ZeroAccountError,
} from "./error.js";
import { resolveIntent } from "./intent.js";

const now = 1_700_000_000n;
const params = { chainId: 1, account: IN_KIND_USER };

describe("resolveIntent", () => {
  test("rejects a zero account", () => {
    expect(() =>
      resolveIntent({ ...params, account: zeroAddress }, now),
    ).toThrow(new ZeroAccountError(zeroAddress));
  });
  test("default: two-hour expiry, no fee, no signature support", () => {
    expect(resolveIntent(params, now)).toEqual({
      expiresAt: 1_700_007_200,
      deadline: 1_700_007_200n,
      referralFeePct: 0n,
      referralFeeRecipient: undefined,
      supportSignature: false,
      calldataOrigin: undefined,
      deployless: undefined,
    });
  });

  test("behavior: converts basis points to WAD and keeps explicit intent", () => {
    expect(
      resolveIntent(
        {
          ...params,
          expiresAt: 1_700_000_001,
          referralFee: { bps: 25, recipient: zeroAddress },
          supportSignature: true,
          calldataOrigin: "0xdeadbeef",
          deployless: false,
        },
        now,
      ),
    ).toEqual({
      expiresAt: 1_700_000_001,
      deadline: 1_700_000_001n,
      referralFeePct: (25n * MathLib.WAD) / 10_000n,
      referralFeeRecipient: zeroAddress,
      supportSignature: true,
      calldataOrigin: "0xdeadbeef",
      deployless: false,
    });
  });

  test("error: ExpiredDeadlineError and NonIntegerInputError on bad expiry", () => {
    expect(() => resolveIntent({ ...params, expiresAt: 1 }, now)).toThrow(
      ExpiredDeadlineError,
    );
    expect(() =>
      resolveIntent({ ...params, expiresAt: Number(now) }, now),
    ).toThrow(ExpiredDeadlineError);
    expect(() => resolveIntent({ ...params, expiresAt: 1.5 }, now)).toThrow(
      NonIntegerInputError,
    );
    expect(() =>
      resolveIntent({ ...params, expiresAt: Number.NaN }, now),
    ).toThrow(NonIntegerInputError);
  });

  test("error: referral fee bounds", () => {
    const fee = (bps: number) =>
      resolveIntent(
        { ...params, referralFee: { bps, recipient: zeroAddress } },
        now,
      );
    expect(() => fee(-1)).toThrow(NegativeInputError);
    expect(() => fee(10_001)).toThrow(InputExceedsMaxError);
    expect(() => fee(0.5)).toThrow(NonIntegerInputError);
  });

  test("error: InvalidCalldataOriginError on empty, odd or non-hex origins", () => {
    for (const calldataOrigin of ["0x", "0xabc", "0xzz"] as const) {
      expect(() => resolveIntent({ ...params, calldataOrigin }, now)).toThrow(
        InvalidCalldataOriginError,
      );
    }
  });
});
