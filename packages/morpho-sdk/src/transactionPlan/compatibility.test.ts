import { zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
} from "../../test/fixtures/inKindRedeem.js";
import * as sdk from "../index.js";
import {
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
  UnsupportedErc20ApprovalSpenderError,
} from "../types/error.js";
import {
  UnsupportedTransactionPlanActionError,
  UnsupportedTransactionPlanVersionError,
} from "./error.js";
import * as transactionPlan from "./index.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "./plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "./serde.js";
import type { Step, TransactionPlan } from "./types.js";

const inputs = {
  chainId: 1,
  account: IN_KIND_USER,
  vault: IN_KIND_VAULT,
  asset: IN_KIND_ASSET,
  amount: 100n,
  maxSharePrice: 10n ** 27n,
  deadline: 2_000_000_000n,
  referralFeePct: 0n,
  referralFeeRecipient: zeroAddress,
};
const step = {
  id: "deposit",
  label: "Deposit",
  action: { type: "vaultV2Deposit", inputs, signatureRequestIds: {} },
} as const satisfies Step;
const plan: TransactionPlan = {
  version: 1,
  chainId: 1,
  account: IN_KIND_USER,
  expiresAt: Number(inputs.deadline),
  steps: [step],
  signatureRequests: [],
};

describe("stored plan compatibility", () => {
  test("package-root exports preserve TransactionPlan error identities", () => {
    expect(sdk).toMatchObject({
      ZeroAccountError: transactionPlan.ZeroAccountError,
      UnsupportedTransactionPlanVersionError:
        transactionPlan.UnsupportedTransactionPlanVersionError,
      UnsupportedTransactionPlanActionError:
        transactionPlan.UnsupportedTransactionPlanActionError,
      InvalidTransactionPlanError: transactionPlan.InvalidTransactionPlanError,
      IncompleteTransactionPlanError:
        transactionPlan.IncompleteTransactionPlanError,
      TransactionPlanSignatureMismatchError:
        transactionPlan.TransactionPlanSignatureMismatchError,
      InvalidCalldataOriginError: transactionPlan.InvalidCalldataOriginError,
      NonIntegerInputError: transactionPlan.NonIntegerInputError,
    });
  });

  test.each([false, true])(
    "all interpreters reject an unsupported saved version, empty: %s",
    (empty) => {
      const saved = serializeTransactionPlan({
        ...plan,
        steps: empty ? [] : [step],
      });
      const unsupported = {
        ...plan,
        version: 2,
        steps: empty ? [] : [step],
      } as unknown as TransactionPlan;
      expect(unsupported.version).toBe(2);
      const error = new UnsupportedTransactionPlanVersionError(2);
      expect(() =>
        parseTransactionPlan(saved.replace('"version":1', '"version":2')),
      ).toThrow(error);
      expect(error).toMatchObject({
        name: "UnsupportedTransactionPlanVersionError",
        version: 2,
      });
      expect(() => getPendingSignatureRequests(unsupported)).toThrow(error);
      expect(() => buildTransaction(unsupported, step)).toThrow(error);
      expect(() => buildTransactions(unsupported)).toThrow(error);
      for (const signatures of [
        [],
        [{ id: "unknown", signature: "0x" as const }],
      ]) {
        expect(() => applySignatures(unsupported, signatures)).toThrow(error);
      }
    },
  );

  test("rejects the version before reading steps, requests or updates", () => {
    const unsupported = { version: 3 } as unknown as TransactionPlan;
    const unreadable = {
      get() {
        throw new Error("Stored fields must not be read");
      },
    };
    Object.defineProperties(unsupported, {
      steps: unreadable,
      signatureRequests: unreadable,
    });
    const signatures = Object.defineProperty([], "map", unreadable);
    const error = new UnsupportedTransactionPlanVersionError(3);
    expect(() => getPendingSignatureRequests(unsupported)).toThrow(error);
    expect(() => applySignatures(unsupported, signatures)).toThrow(error);
    expect(() => buildTransaction(unsupported, step)).toThrow(error);
    expect(() => buildTransactions(unsupported)).toThrow(error);
  });

  test.each([
    "futureAction",
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
  ])(
    "all interpreters reject unsupported action %s before requests or updates",
    (actionType) => {
      const unsupported = {
        ...plan,
        steps: [{ ...step, action: { ...step.action, type: actionType } }],
      } as unknown as TransactionPlan;
      const selected = unsupported.steps[0]!;
      const known: Step = {
        ...step,
        id: "known",
        action: {
          ...step.action,
          signatureRequestIds: { tokenPermit: "required" },
        },
      };
      const mixed = { ...unsupported, steps: [known, selected] };
      const unreadable = {
        get() {
          throw new Error("Requests and updates must not be read");
        },
      };
      Object.defineProperty(mixed, "signatureRequests", unreadable);
      const unreadableUpdates = Object.defineProperty([], "map", unreadable);
      Object.defineProperty(selected.action, "signatureRequestIds", {
        get() {
          throw new Error("Unknown actions must not be interpreted");
        },
      });
      const error = new UnsupportedTransactionPlanActionError(actionType);
      expect(error).toMatchObject({
        name: "UnsupportedTransactionPlanActionError",
        actionType,
      });
      expect(() => buildTransaction(mixed, selected)).toThrow(error);
      expect(() => buildTransaction(mixed, known)).toThrow(error);
      expect(() => buildTransactions(mixed)).toThrow(error);
      expect(() => getPendingSignatureRequests(mixed)).toThrow(error);
      for (const signatures of [[], unreadableUpdates]) {
        expect(() => applySignatures(mixed, signatures)).toThrow(error);
      }
      expect(() => buildTransaction({ ...plan, steps: [] }, selected)).toThrow(
        error,
      );
    },
  );
});

describe("stored plan action-layer validation", () => {
  test("both builders reject an unregistered approval spender", () => {
    const approval = {
      id: "approval",
      label: "Approve",
      action: {
        type: "erc20Approval",
        inputs: {
          chainId: 1,
          account: IN_KIND_USER,
          token: IN_KIND_ASSET,
          spender: IN_KIND_USER,
          amount: 100n,
        },
      },
    } as const satisfies Step;
    expect(() => buildTransaction(plan, approval)).toThrow(
      UnsupportedErc20ApprovalSpenderError,
    );
    expect(() => buildTransactions({ ...plan, steps: [approval] })).toThrow(
      UnsupportedErc20ApprovalSpenderError,
    );
  });

  test.each([0n, -1n])(
    "both builders reject deposit maxSharePrice %s",
    (maxSharePrice) => {
      const invalid = {
        ...step,
        action: { ...step.action, inputs: { ...inputs, maxSharePrice } },
      };
      const error = new NonPositiveInputError("maxSharePrice", maxSharePrice);
      expect(() => buildTransaction(plan, invalid)).toThrow(error);
      expect(() => buildTransactions({ ...plan, steps: [invalid] })).toThrow(
        error,
      );
    },
  );

  test.each([
    {
      patch: { deadline: 0n },
      error: NonPositiveInputError,
      label: "zero deadline",
    },
    {
      patch: { deadline: -1n },
      error: NonPositiveInputError,
      label: "negative deadline",
    },
    {
      patch: { referralFeePct: 10n ** 18n },
      error: ReferralFeePctExceededError,
      label: "fee equal to WAD",
    },
    {
      patch: { referralFeePct: 10n ** 18n + 1n },
      error: ReferralFeePctExceededError,
      label: "fee above WAD",
    },
    {
      patch: { referralFeePct: 1n },
      error: ReferralFeeRecipientMissingError,
      label: "fee with zero recipient",
    },
    {
      patch: { referralFeePct: 1n, referralFeeRecipient: undefined },
      error: ReferralFeeRecipientMissingError,
      label: "fee without recipient",
    },
  ])(
    "both builders reject $label for deposits and withdrawals",
    ({ patch, error }) => {
      // Stored inputs may omit fields required by the prepared-plan type.
      const invalidInputs = { ...inputs, ...patch } as typeof inputs;
      const deposit = {
        ...step,
        action: { ...step.action, inputs: invalidInputs },
      };
      const withdrawal = {
        ...step,
        action: {
          type: "vaultV2Withdraw",
          inputs: { ...invalidInputs, requiredShareAllowance: 120n },
          signatureRequestIds: {},
        },
      } as const satisfies Step;
      for (const invalid of [deposit, withdrawal]) {
        expect(() => buildTransaction(plan, invalid)).toThrow(error);
        expect(() => buildTransactions({ ...plan, steps: [invalid] })).toThrow(
          error,
        );
      }
    },
  );
});
