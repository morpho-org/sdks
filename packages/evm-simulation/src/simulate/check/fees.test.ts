import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type { DecodedOperation } from "../../decode/operation.js";
import { FeeMismatchError } from "../../errors.js";
import {
  emptyDiff,
  makeCheckContext,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkReferralFee } from "./fees.js";

const VAULT: Address = getAddress("0xBEEF0173c205AF46a9B1C95C4D1020C0f0b864CB");
const ASSET: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const RECIPIENT: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const ctx = makeCheckContext();

const deposit = (referralFee?: { rateWad: bigint; recipient: Address }) =>
  ({
    type: "vaultV1Deposit",
    route: "vaultBundlesV1",
    transactionIndex: 0,
    vault: VAULT,
    owner: TEST_OWNER,
    funding: { type: "erc20", token: ASSET, assets: 1_000n },
    receiver: TEST_OWNER,
    ...(referralFee != null ? { referralFee } : {}),
  }) as unknown as DecodedOperation;

describe("checkReferralFee", () => {
  test("no referral fee → null", () => {
    expect(
      checkReferralFee({
        ctx,
        op: deposit(),
        asset: ASSET,
        grossAssets: 1_000n,
        actionDiff: { ...emptyDiff },
      }),
    ).toBeNull();
  });

  test("positive fee: recipient credit must match wMul(gross, rate)", () => {
    const op = deposit({ rateWad: 100000000000000000n, recipient: RECIPIENT });
    const fee = checkReferralFee({
      ctx,
      op,
      asset: ASSET,
      grossAssets: 1_000n,
      actionDiff: {
        ...emptyDiff,
        balances: [{ account: RECIPIENT, token: ASSET, assets: 100n }],
      },
    });
    expect(fee).toEqual({
      transactionIndex: 0,
      type: "referral",
      token: ASSET,
      recipient: RECIPIENT,
      expectedAmount: 100n,
      observedAmount: 100n,
    });
  });

  test("error: FeeMismatchError on missing recipient credit", () => {
    const op = deposit({ rateWad: 100000000000000000n, recipient: RECIPIENT });
    expect(() =>
      checkReferralFee({
        ctx,
        op,
        asset: ASSET,
        grossAssets: 1_000n,
        actionDiff: { ...emptyDiff },
      }),
    ).toThrow(FeeMismatchError);
  });
});
