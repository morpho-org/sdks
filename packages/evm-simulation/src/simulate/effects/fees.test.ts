import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { DecodedOperation } from "../../decode/operation.js";
import { FeeMismatchError } from "../../errors.js";
import type { VerificationDiff } from "../../simulate/internal/evidence.js";
import {
  FIXTURE_NOW,
  FIXTURE_TOKEN,
  fixtureAt,
} from "../../test-helpers/index.js";
import { verifyReferralFee } from "./fees.js";

const at = fixtureAt();

const RECIPIENT: Address = getAddress(
  "0x7777777777777777777777777777777777777777",
);

const op = (
  rateWad: bigint,
  recipient: Address = RECIPIENT,
): DecodedOperation =>
  ({
    type: "blueSupply",
    transactionIndex: 0,
    callPath: [],
    market: { marketId: `0x${"11".repeat(32)}`, params: {} },
    referralFee: { rateWad, recipient },
    deadline: FIXTURE_NOW + 3600n,
  }) as unknown as DecodedOperation;

const diff = (recipient: Address, assets: bigint): VerificationDiff => ({
  wallet: [{ account: recipient, token: FIXTURE_TOKEN, assets }],
  permissions: [],
  positions: [],
  vaults: [],
  markets: [],
});

describe("verifyReferralFee", () => {
  test("zero rate expects no recipient credit", () => {
    expect(
      verifyReferralFee({
        operation: op(0n),
        asset: FIXTURE_TOKEN,
        grossAssets: 1_000n,
        actionDiff: {
          wallet: [],
          permissions: [],
          positions: [],
          vaults: [],
          markets: [],
        },
        at,
      }),
    ).toBeNull();
  });

  test("matching recipient credit returns FeeEvidence", () => {
    // 1% of 10_000 = 100.
    const evidence = verifyReferralFee({
      operation: op(10n ** 16n),
      asset: FIXTURE_TOKEN,
      grossAssets: 10_000n,
      actionDiff: diff(RECIPIENT, 100n),
      at,
    });
    expect(evidence?.type).toBe("referral");
    expect(evidence?.expectedAmount).toBe(100n);
    expect(evidence?.observedAmount).toBe(100n);
    expect(evidence?.recipient).toBe(RECIPIENT);
  });

  test("error: FeeMismatchError on short recipient credit", () => {
    expect(() =>
      verifyReferralFee({
        operation: op(10n ** 16n),
        asset: FIXTURE_TOKEN,
        grossAssets: 10_000n,
        actionDiff: diff(RECIPIENT, 50n),
        at,
      }),
    ).toThrow(FeeMismatchError);
  });

  test("error: FeeMismatchError on unmodeled positive credit at zero rate", () => {
    expect(() =>
      verifyReferralFee({
        operation: op(0n),
        asset: FIXTURE_TOKEN,
        grossAssets: 10_000n,
        actionDiff: diff(RECIPIENT, 50n),
        at,
      }),
    ).toThrow(FeeMismatchError);
  });
});
