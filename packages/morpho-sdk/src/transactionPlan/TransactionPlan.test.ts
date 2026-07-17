import type { Address, Hex } from "viem";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  type AuthorizationRequirementSignature,
  type BlueAuthorizationAction,
  type ERC20ApprovalAction,
  MissingTransactionPlanSignaturesError,
  type PermitRequirementSignature,
  type Requirement,
  type RequirementSignature,
  type Transaction,
  type VaultV2DepositAction,
} from "../types/index.js";
import {
  TransactionPlan,
  type TransactionPlanHandler,
} from "./TransactionPlan.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const TOKEN: Address = "0x2222222222222222222222222222222222222222";
const SPENDER: Address = "0x3333333333333333333333333333333333333333";
const BUNDLER: Address = "0x4444444444444444444444444444444444444444";
const VAULT: Address = "0x5555555555555555555555555555555555555555";
const SIGNATURE: Hex = `0x${"ab".repeat(65)}`;

const approvalTx: Transaction<ERC20ApprovalAction> = {
  to: TOKEN,
  value: 0n,
  data: "0xa1",
  action: {
    type: "erc20Approval",
    args: { spender: SPENDER, amount: 100n },
  },
};

const authorizationTx: Transaction<BlueAuthorizationAction> = {
  to: VAULT,
  value: 0n,
  data: "0xa2",
  action: {
    type: "blueAuthorization",
    args: { authorized: SPENDER, isAuthorized: true },
  },
};

const primaryTx: Transaction<VaultV2DepositAction> = {
  to: BUNDLER,
  value: 0n,
  data: "0xf1",
  action: {
    type: "vaultV2Deposit",
    args: {
      vault: VAULT,
      amount: 100n,
      maxSharePrice: 1_000_000_000_000_000_000n,
      recipient: USER,
    },
  },
};

const permitSignature = {
  action: {
    type: "permit2",
    args: {
      token: TOKEN,
      spender: SPENDER,
      amount: 100n,
      deadline: 1_900_000_000n,
      expiration: 2_000_000_000n,
      chainId: 1,
    },
  },
  args: {
    owner: USER,
    asset: TOKEN,
    amount: 100n,
    nonce: 0n,
    deadline: 1_900_000_000n,
    expiration: 2_000_000_000n,
    signature: SIGNATURE,
  },
} as const satisfies PermitRequirementSignature;

const authorizationSignature: AuthorizationRequirementSignature = {
  action: {
    type: "authorization",
    args: {
      authorized: SPENDER,
      isAuthorized: true,
      deadline: 1_900_000_000n,
      chainId: 1,
    },
  },
  args: {
    owner: USER,
    authorized: SPENDER,
    isAuthorized: true,
    nonce: 0n,
    deadline: 1_900_000_000n,
    signature: SIGNATURE,
  },
};

function permitRequest(): Requirement<typeof permitSignature> {
  return {
    action: permitSignature.action,
    sign: vi.fn(async () => permitSignature),
  };
}

function authorizationRequest(): Requirement<AuthorizationRequirementSignature> {
  return {
    action: authorizationSignature.action,
    sign: vi.fn(async () => authorizationSignature),
  };
}

describe("TransactionPlan", () => {
  test("default: exposes prepare as the single public entry point and prepares semantic requests", async () => {
    const handler: TransactionPlanHandler<VaultV2DepositAction> = {
      getRequirementRequests: vi.fn(async () => [
        approvalTx,
        permitRequest(),
        authorizationRequest(),
      ]),
      buildPrimaryTransaction: vi.fn(() => primaryTx),
    };

    const plan = TransactionPlan.create(handler);
    const prepared = await plan.prepare();

    expect(plan).toBeInstanceOf(TransactionPlan);
    expect("buildTx" in plan).toBe(false);
    expect("getRequirements" in plan).toBe(false);
    expect(Object.hasOwn(plan, "prepare")).toBe(false);
    expect(prepared.flowKind).toBe("mixed_steps");
    expect(prepared.hasSignatureRequests).toBe(true);
    expect(prepared.hasTransactionSteps).toBe(true);
    expect(prepared.steps.map((step) => step.kind)).toEqual([
      "transaction",
      "signature",
      "signature",
      "transaction",
    ]);
    expect(prepared.transactionSteps.map((step) => step.id)).toEqual([
      "request-0",
      "primary",
    ]);
    expect(prepared.transactionSteps.map((step) => step.phase)).toEqual([
      "preparation",
      "primary",
    ]);
    expect(prepared.requirements.map((request) => request.action.type)).toEqual(
      ["erc20Approval", "permit2", "authorization"],
    );
    expect(Object.isFrozen(prepared.requirements)).toBe(true);
    expect(prepared.primaryStep?.transaction).toBe(primaryTx);
    expect(prepared.primaryTransaction).toBe(primaryTx);
    expect(prepared.calls).toEqual([
      { to: TOKEN, value: 0n, data: "0xa1" },
      { to: BUNDLER, value: 0n, data: "0xf1" },
    ]);
    expect(prepared.signatureRequests).toHaveLength(2);
    expect(prepared.stepCount).toBe(4);
    expect(prepared.hasIntent("tokenApproval")).toBe(true);
    expect(prepared.hasIntent("operatorAuthorization")).toBe(true);
    expect(prepared.hasIntent("primaryTransaction")).toBe(true);
    expect(
      prepared.findIntent("tokenApproval").map((request) => request.intent),
    ).toEqual([
      {
        type: "tokenApproval",
        method: "tx",
        token: TOKEN,
        spender: SPENDER,
        amount: 100n,
      },
      {
        type: "tokenApproval",
        method: "permit2",
        token: TOKEN,
        spender: SPENDER,
        amount: 100n,
        deadline: 1_900_000_000n,
        expiration: 2_000_000_000n,
        chainId: 1,
      },
    ]);
  });

  test("behavior: builds ordered transaction steps only after requested signatures are provided", async () => {
    const permit = permitRequest();
    const authorization = authorizationRequest();
    const buildPrimaryTransaction = vi.fn(
      (_signatures?: readonly RequirementSignature[]) => primaryTx,
    );
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      getRequirementRequests: vi.fn(async () => [
        approvalTx,
        permit,
        authorization,
      ]),
      buildPrimaryTransaction,
    });

    const prepared = await plan.prepare();

    expect(() => prepared.build()).toThrow(
      MissingTransactionPlanSignaturesError,
    );
    expect(() => prepared.build([permitSignature])).toThrow(
      MissingTransactionPlanSignaturesError,
    );

    const executable = prepared.build([
      permitSignature,
      authorizationSignature,
    ]);

    expect(buildPrimaryTransaction).toHaveBeenCalledWith([
      permitSignature,
      authorizationSignature,
    ]);
    expect(executable.transactionSteps.map((step) => step.id)).toEqual([
      "request-0",
      "primary",
    ]);
    expect(executable.primaryStep.transaction).toBe(primaryTx);
    expect(executable.primaryTransaction).toBe(primaryTx);
    expect(executable.calls).toEqual([
      { to: TOKEN, value: 0n, data: "0xa1" },
      { to: BUNDLER, value: 0n, data: "0xf1" },
    ]);
  });

  test("behavior: preserves prerequisite and primary action types through execution", async () => {
    const plan = TransactionPlan.create<
      VaultV2DepositAction,
      unknown,
      | Readonly<Transaction<ERC20ApprovalAction>>
      | Requirement<typeof permitSignature>
    >({
      getRequirementRequests: vi.fn(async () => [approvalTx, permitRequest()]),
      buildPrimaryTransaction: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();
    type Prepared = typeof prepared;
    type SignatureRequest = Prepared["signatureRequests"][number];
    type PreparationTransactionStep = Extract<
      Prepared["transactionSteps"][number],
      { readonly phase: "preparation" }
    >;
    type Executable = ReturnType<Prepared["build"]>;
    type PrimaryTransactionStep = Extract<
      Executable["transactionSteps"][number],
      { readonly phase: "primary" }
    >;

    expectTypeOf<Prepared["requirements"][number]>().toEqualTypeOf<
      | Readonly<Transaction<ERC20ApprovalAction>>
      | Requirement<typeof permitSignature>
    >();
    expectTypeOf<Prepared["primaryTransaction"]>().toEqualTypeOf<
      Readonly<Transaction<VaultV2DepositAction>> | undefined
    >();
    expectTypeOf<Executable["primaryTransaction"]>().toEqualTypeOf<
      Readonly<Transaction<VaultV2DepositAction>>
    >();
    expectTypeOf<SignatureRequest["request"]>().toEqualTypeOf<
      Requirement<typeof permitSignature>
    >();
    expectTypeOf<ReturnType<SignatureRequest["sign"]>>().toEqualTypeOf<
      Promise<typeof permitSignature>
    >();
    expectTypeOf<PreparationTransactionStep["transaction"]>().toEqualTypeOf<
      Readonly<Transaction<ERC20ApprovalAction>>
    >();
    expectTypeOf<
      PrimaryTransactionStep["action"]
    >().toEqualTypeOf<VaultV2DepositAction>();
  });

  test("behavior: requirement transaction steps keep authorization intent separate from token approval", async () => {
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      getRequirementRequests: vi.fn(async () => [authorizationTx]),
      buildPrimaryTransaction: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();

    expect(prepared.flowKind).toBe("transaction_steps");
    expect(
      prepared
        .findIntent("operatorAuthorization")
        .map((request) => request.intent),
    ).toEqual([
      {
        type: "operatorAuthorization",
        method: "tx",
        operator: SPENDER,
        isAuthorized: true,
      },
    ]);
    expect(prepared.findIntent("tokenApproval")).toEqual([]);
  });

  test("behavior: a non-previewable primary step appears after build", async () => {
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      getRequirementRequests: vi.fn(async () => [permitRequest()]),
      previewPrimaryTransaction: false,
      buildPrimaryTransaction: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();

    expect(prepared.flowKind).toBe("signature_steps");
    expect(prepared.primaryStep).toBeUndefined();
    expect(prepared.primaryTransaction).toBeUndefined();
    expect(prepared.calls).toEqual([]);
    expect(prepared.transactionSteps).toEqual([]);
    expect(prepared.steps.map((request) => request.id)).toEqual(["request-0"]);

    const executable = prepared.build([permitSignature]);

    expect(executable.primaryTransaction).toBe(primaryTx);
    expect(executable.transactionSteps.map((step) => step.id)).toEqual([
      "primary",
    ]);
  });

  test("behavior: a handler without requirement requests is a single transaction", async () => {
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      buildPrimaryTransaction: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();
    const executable = prepared.build();

    expect(prepared.flowKind).toBe("single_transaction");
    expect(prepared.stepCount).toBe(1);
    expect(prepared.signatureRequests).toEqual([]);
    expect(prepared.transactionSteps.map((step) => step.id)).toEqual([
      "primary",
    ]);
    expect(executable.transactionSteps.map((step) => step.id)).toEqual([
      "primary",
    ]);
    expect(executable.calls).toEqual([
      { to: BUNDLER, value: 0n, data: "0xf1" },
    ]);
  });
});
