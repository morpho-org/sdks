import { Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type Address,
  maxUint256,
  serializeSignature,
  toHex,
  zeroAddress,
} from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
} from "../../test/fixtures/inKindRedeem.js";
import { vaultV2Deposit } from "../actions/vaultV2/deposit.js";
import { BundlesPermitMismatchError } from "../types/error.js";
import type { Transaction } from "../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "./error.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "./plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "./serde.js";
import type { SignatureRequest, Step, TransactionPlan } from "./types.js";
import { buildVaultV2Deposit } from "./vaultv2/deposit.js";

const spender = getChainAddress(1, "bundles.vaultBundlesV1");
const inputs = {
  chainId: 1,
  account: IN_KIND_USER,
  vault: IN_KIND_VAULT,
  asset: IN_KIND_ASSET,
  maxSharePrice: 10n ** 27n,
  assets: 100n,
  deadline: 2_000_000_000n,
  referralFeePct: 0n,
  referralFeeRecipient: zeroAddress,
};
const permitArgs = {
  spender,
  amount: inputs.assets,
  deadline: inputs.deadline,
  nonce: 0n,
};
const typedData = getPermitTypedData(
  {
    erc20: new Token({ address: IN_KIND_ASSET, name: "Asset" }),
    owner: IN_KIND_USER,
    allowance: permitArgs.amount,
    ...permitArgs,
  },
  1,
);
const permitRequest = (id: string): SignatureRequest => ({
  id,
  kind: "permit",
  typedData,
  args: permitArgs,
});
const signature = serializeSignature({
  r: toHex(1n, { size: 32 }),
  s: toHex(2n, { size: 32 }),
  yParity: 0,
});
const approveStep = {
  id: "approval",
  label: "Approve",
  action: {
    type: "erc20Approval",
    inputs: {
      token: IN_KIND_ASSET,
      spender,
      assets: inputs.assets,
      chainId: 1,
      account: IN_KIND_USER,
    },
  },
} as const satisfies Step;
const depositStep = {
  id: "deposit",
  label: "Deposit",
  action: {
    type: "vaultV2Deposit",
    inputs,
    signatureRequestIds: { tokenPermit: "tokenPermit" },
  },
} as const satisfies Step;
const pendingPlan: TransactionPlan = {
  version: 2,
  chainId: 1,
  account: IN_KIND_USER,
  expiresAt: Number(inputs.deadline),
  steps: [approveStep, depositStep],
  signatureRequests: [permitRequest("tokenPermit")],
};
const completePlan: TransactionPlan = {
  ...pendingPlan,
  signatureRequests: [{ ...permitRequest("tokenPermit"), signature }],
};
const { asset, chainId, account, ...depositArgs } = inputs;
const expectedDeposit = vaultV2Deposit({
  vault: { chainId, address: IN_KIND_VAULT, asset },
  args: {
    ...depositArgs,
    amount: inputs.assets,
    userAddress: account,
    requirementSignature: {
      action: { type: "permit", args: permitArgs, typedData },
      args: {
        owner: IN_KIND_USER,
        asset,
        amount: inputs.assets,
        nonce: 0n,
        deadline: inputs.deadline,
        signature,
      },
    },
  },
});
const findSignature = (target: TransactionPlan, id: string) =>
  target.signatureRequests.find((request) => request.id === id);

describe("buildTransaction", () => {
  test("empty plans build no transactions", () => {
    expect(
      buildTransactions({ ...pendingPlan, steps: [], signatureRequests: [] }),
    ).toEqual([]);
  });
  test("builds from the action context independently of the plan header", () => {
    expect(
      buildTransactions({
        ...completePlan,
        chainId: 999,
        account: zeroAddress,
      }),
    ).toEqual(buildTransactions(completePlan));
    expect(
      buildVaultV2Deposit(depositStep.action, [
        findSignature(completePlan, "tokenPermit")!,
      ]),
    ).toEqual(expectedDeposit);
    expect(() => buildVaultV2Deposit(depositStep.action, [])).toThrow(
      new IncompleteTransactionPlanError("tokenPermit"),
    );
  });
  test("default: encodes plain frozen SDK transactions without step metadata", () => {
    const transactions = buildTransactions(completePlan);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      action: { type: "erc20Approval" },
    });
    expect(transactions[1]).toEqual(expectedDeposit);
    for (const transaction of transactions) {
      expect(Object.keys(transaction).sort()).toEqual([
        "action",
        "data",
        "to",
        "value",
      ]);
      expect(Object.isFrozen(transaction)).toBe(true);
      expect(Object.isFrozen(transaction.action)).toBe(true);
    }
  });

  test("behavior: appends the plan's calldata origin to every built transaction", () => {
    const origin = "0xdeadbeef";
    const [approval, deposit] = buildTransactions({
      ...completePlan,
      calldataOrigin: origin,
    });
    expect(approval?.data.endsWith(origin.slice(2))).toBe(true);
    expect(deposit?.data).toBe(`${expectedDeposit.data}${origin.slice(2)}`);
    expect(deposit?.action).toEqual(expectedDeposit.action);
  });

  test("behavior: returns plain SDK transactions for every step", () => {
    expectTypeOf(buildTransaction(completePlan, approveStep)).toEqualTypeOf<
      Readonly<Transaction>
    >();
    expectTypeOf(buildTransaction(completePlan, depositStep)).toEqualTypeOf<
      Readonly<Transaction>
    >();
    expectTypeOf(buildTransactions(completePlan)).toEqualTypeOf<
      readonly Readonly<Transaction>[]
    >();
  });

  test("behavior: builds an independent approval while the deposit still waits for its signature", () => {
    expect(buildTransaction(pendingPlan, approveStep).action.type).toBe(
      "erc20Approval",
    );
    expect(() => buildTransactions(pendingPlan)).toThrow(
      IncompleteTransactionPlanError,
    );
  });

  test("behavior: selects signatures by ID regardless of array order or extra entries", () => {
    const reordered: TransactionPlan = {
      ...completePlan,
      signatureRequests: [
        {
          ...permitRequest("otherPermit"),
          args: { ...permitArgs, nonce: 42n },
          signature,
        },
        ...[...completePlan.signatureRequests].reverse(),
      ],
    };
    expect(buildTransactions(reordered)).toEqual(
      buildTransactions(completePlan),
    );
    expect(
      buildTransactions({
        ...completePlan,
        steps: [...completePlan.steps].reverse(),
      }),
    ).toEqual([...buildTransactions(completePlan)].reverse());
  });

  test("error: IncompleteTransactionPlanError names the missing signature request", () => {
    const missingPermit = {
      ...depositStep,
      action: {
        ...depositStep.action,
        signatureRequestIds: { tokenPermit: "missingPermit" },
      },
    };
    expect(() => buildTransaction(completePlan, missingPermit)).toThrow(
      new IncompleteTransactionPlanError("missingPermit"),
    );
    expect(() => buildTransaction(pendingPlan, depositStep)).toThrow(
      new IncompleteTransactionPlanError("tokenPermit"),
    );
  });
});

describe("getPendingSignatureRequests", () => {
  test("deposit building rejects a permit with a different deadline", () => {
    const deadline = inputs.deadline + 1n;
    const request: SignatureRequest = {
      ...permitRequest("tokenPermit"),
      signature,
      args: { ...permitArgs, deadline },
      typedData: { ...typedData, message: { ...typedData.message, deadline } },
    };
    expect(() =>
      buildTransaction(
        {
          ...pendingPlan,
          signatureRequests: [request],
        },
        depositStep,
      ),
    ).toThrow(
      new BundlesPermitMismatchError({
        field: "deadline",
        expected: String(inputs.deadline),
        actual: String(deadline),
      }),
    );
  });

  test("rejects a stray permit reference on a hand-built approval step", () => {
    const approval = {
      ...approveStep,
      action: {
        ...approveStep.action,
        signatureRequestIds: { tokenPermit: "tokenPermit" },
      },
    };
    const plan = { ...pendingPlan, steps: [approval] };
    const error = new TransactionPlanSignatureMismatchError(
      "tokenPermit",
      "reference",
    );
    expect(() => getPendingSignatureRequests(plan)).toThrow(error);
    expect(() => applySignatures(plan, [])).toThrow(error);
  });

  test("rejects unreferenced requests, including signed ones", () => {
    for (const request of [
      permitRequest("unrelated"),
      { ...permitRequest("unrelated"), signature },
    ]) {
      expect(() =>
        getPendingSignatureRequests({
          ...pendingPlan,
          signatureRequests: [request],
        }),
      ).toThrow(
        new TransactionPlanSignatureMismatchError("unrelated", "reference"),
      );
    }
  });

  const permitFor = (verifyingContract: Address, amount: bigint) =>
    ({
      ...permitRequest("tokenPermit"),
      args: { ...permitArgs, amount },
      typedData: {
        ...typedData,
        domain: { ...typedData.domain, verifyingContract },
        message: { ...typedData.message, value: amount },
      },
    }) satisfies SignatureRequest;
  const withdrawStep: Step = {
    ...depositStep,
    action: {
      type: "vaultV2Withdraw",
      inputs: { ...inputs, requiredShareAllowance: 100n },
      signatureRequestIds: { tokenPermit: "tokenPermit" },
    },
  };
  const permitCases = [
    {
      type: "vaultV1Deposit",
      step: {
        ...depositStep,
        action: { ...depositStep.action, type: "vaultV1Deposit" },
      },
      request: permitFor(inputs.asset, inputs.assets),
      tamperedAmounts: [99n, 101n, maxUint256],
    },
    {
      type: "vaultV2Deposit",
      step: depositStep,
      request: permitFor(inputs.asset, inputs.assets),
      tamperedAmounts: [99n, 101n, maxUint256],
    },
    {
      type: "vaultV2Withdraw",
      step: withdrawStep,
      request: permitFor(inputs.vault, maxUint256),
      tamperedAmounts: [99n],
    },
    {
      type: "vaultV1Withdraw",
      step: {
        ...withdrawStep,
        action: {
          type: "vaultV1Withdraw",
          inputs: { ...inputs, requiredShareAllowance: 100n },
          signatureRequestIds: { tokenPermit: "tokenPermit" },
        },
      },
      request: permitFor(inputs.vault, maxUint256),
      tamperedAmounts: [99n],
    },
    {
      type: "vaultV1Redeem",
      step: {
        ...depositStep,
        action: {
          type: "vaultV1Redeem",
          inputs: { ...inputs, shares: 100n },
          signatureRequestIds: { tokenPermit: "tokenPermit" },
        },
      },
      request: permitFor(inputs.vault, maxUint256),
      tamperedAmounts: [99n],
    },
    {
      type: "vaultV1MigrateToV2",
      step: {
        ...depositStep,
        action: {
          type: "vaultV1MigrateToV2",
          inputs: {
            ...inputs,
            sourceVault: inputs.vault,
            targetVault: inputs.asset,
            assets: undefined,
            shares: 100n,
            maxSharePrice: 10n ** 27n,
            requiredShareAllowance: 100n,
          },
          signatureRequestIds: { tokenPermit: "tokenPermit" },
        },
      },
      request: permitFor(inputs.vault, maxUint256),
      tamperedAmounts: [99n],
    },
  ] satisfies {
    type: Step["action"]["type"];
    step: Step;
    request: SignatureRequest;
    tamperedAmounts: bigint[];
  }[];

  test.each(permitCases)(
    "$type prompts and builds a matching permit and rejects another amount",
    ({ step, request, tamperedAmounts }) => {
      const plan = {
        ...pendingPlan,
        steps: [step],
        signatureRequests: [request],
      };
      expect(getPendingSignatureRequests(plan)).toEqual([request]);
      expect(getPendingSignatureRequests(plan)[0]).toBe(request);
      const deadline = inputs.deadline + 1n;
      const mismatched = {
        ...plan,
        signatureRequests: [
          {
            ...request,
            args: { ...request.args, deadline },
            typedData: {
              ...request.typedData,
              message: { ...request.typedData.message, deadline },
            },
          },
        ],
      };
      const deadlineError = new TransactionPlanSignatureMismatchError(
        request.id,
        "args.deadline",
      );
      expect(() => getPendingSignatureRequests(mismatched)).toThrow(
        deadlineError,
      );
      expect(() => applySignatures(mismatched, [])).toThrow(deadlineError);
      const saved = serializeTransactionPlan(mismatched);
      expect(() => parseTransactionPlan(saved)).toThrow(
        InvalidTransactionPlanError,
      );
      expect(() => parseTransactionPlan(saved)).toThrow(
        expect.objectContaining({
          path: "$.signatureRequests[0].args.deadline",
          cause: expect.any(TransactionPlanSignatureMismatchError),
        }),
      );
      expect(() =>
        buildTransaction(
          { ...plan, signatureRequests: [{ ...request, signature }] },
          step,
        ),
      ).not.toThrow();
      const error = new TransactionPlanSignatureMismatchError(
        request.id,
        "value",
      );
      for (const amount of tamperedAmounts) {
        const tampered = {
          ...request,
          args: { ...request.args, amount },
          typedData: {
            ...request.typedData,
            message: { ...request.typedData.message, value: amount },
          },
        };
        const corrupted = { ...plan, signatureRequests: [tampered] };
        expect(() => getPendingSignatureRequests(corrupted)).toThrow(error);
        expect(() =>
          buildTransaction(
            { ...corrupted, signatureRequests: [{ ...tampered, signature }] },
            step,
          ),
        ).toThrow(error);
      }
    },
  );

  test.each(permitCases)(
    "$type rejects a permit with any other field changed",
    ({ step, request }) => {
      const { domain, message } = request.typedData;
      const tamperings: readonly (readonly [string, SignatureRequest])[] = [
        [
          "domain.chainId",
          {
            ...request,
            typedData: {
              ...request.typedData,
              domain: { ...domain, chainId: 2 },
            },
          },
        ],
        [
          "domain.verifyingContract",
          {
            ...request,
            typedData: {
              ...request.typedData,
              domain: { ...domain, verifyingContract: zeroAddress },
            },
          },
        ],
        [
          "message.owner",
          {
            ...request,
            typedData: {
              ...request.typedData,
              message: { ...message, owner: zeroAddress },
            },
          },
        ],
        [
          "message.spender",
          {
            ...request,
            typedData: {
              ...request.typedData,
              message: { ...message, spender: zeroAddress },
            },
          },
        ],
        [
          "args.spender",
          { ...request, args: { ...request.args, spender: zeroAddress } },
        ],
        [
          "message.value",
          {
            ...request,
            typedData: {
              ...request.typedData,
              message: { ...message, value: 123n },
            },
          },
        ],
        [
          "message.nonce",
          {
            ...request,
            typedData: {
              ...request.typedData,
              message: { ...message, nonce: 42n },
            },
          },
        ],
        [
          "message.deadline",
          {
            ...request,
            typedData: {
              ...request.typedData,
              message: { ...message, deadline: 123n },
            },
          },
        ],
        [
          "primaryType",
          {
            ...request,
            typedData: { ...request.typedData, primaryType: "Other" },
          },
        ],
      ];
      for (const [field, tampered] of tamperings) {
        const corrupted = {
          ...pendingPlan,
          steps: [step],
          signatureRequests: [tampered],
        };
        const error = new TransactionPlanSignatureMismatchError(
          request.id,
          field,
        );
        expect(() => getPendingSignatureRequests(corrupted), field).toThrow(
          error,
        );
        expect(
          () =>
            buildTransaction(
              { ...corrupted, signatureRequests: [{ ...tampered, signature }] },
              step,
            ),
          field,
        ).toThrow(error);
      }
    },
  );

  test("checks every deadline when actions share a pending request", () => {
    const other = {
      ...depositStep,
      id: "other",
      action: {
        ...depositStep.action,
        inputs: { ...inputs, deadline: inputs.deadline + 1n },
      },
    };
    expect(() =>
      getPendingSignatureRequests({
        ...pendingPlan,
        steps: [depositStep, other],
      }),
    ).toThrow(
      new TransactionPlanSignatureMismatchError("tokenPermit", "args.deadline"),
    );
  });

  test.each(["vaultV2Withdraw", "vaultV1Withdraw"] as const)(
    "%s accepts a permit for exactly the required share allowance",
    (type) => {
      const minimumPermit = permitFor(inputs.vault, 100n);
      expect(
        getPendingSignatureRequests({
          ...pendingPlan,
          steps: [
            {
              ...withdrawStep,
              action: {
                type,
                inputs: { ...inputs, requiredShareAllowance: 100n },
                signatureRequestIds: { tokenPermit: "tokenPermit" },
              },
            },
          ],
          signatureRequests: [minimumPermit],
        }),
      ).toEqual([minimumPermit]);
    },
  );

  test("checks every action sharing a pending request", () => {
    const other = {
      ...depositStep,
      id: "other",
      action: {
        ...depositStep.action,
        inputs: { ...inputs, account: zeroAddress },
      },
    };
    expect(() =>
      getPendingSignatureRequests({
        ...pendingPlan,
        steps: [depositStep, other],
      }),
    ).toThrow(
      new TransactionPlanSignatureMismatchError("tokenPermit", "message.owner"),
    );
  });
  test("default: lists referenced pending requests once, in first-reference order", () => {
    expect(getPendingSignatureRequests(pendingPlan)).toEqual([
      findSignature(pendingPlan, "tokenPermit"),
    ]);
    const twice: TransactionPlan = {
      ...pendingPlan,
      steps: [depositStep, depositStep],
    };
    expect(getPendingSignatureRequests(twice).map(({ id }) => id)).toEqual([
      "tokenPermit",
    ]);
    expect(getPendingSignatureRequests(completePlan)).toEqual([]);
  });

  test("behavior: dangling IDs are omitted and fail at build time instead", () => {
    const dangling: TransactionPlan = {
      ...completePlan,
      signatureRequests: [],
    };
    expect(getPendingSignatureRequests(dangling)).toEqual([]);
    expect(() => buildTransactions(dangling)).toThrow(
      IncompleteTransactionPlanError,
    );
  });
});
