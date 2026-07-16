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

const permitSignature: PermitRequirementSignature = {
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
};

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

function permitRequest(): Requirement<PermitRequirementSignature> {
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
      buildPrimaryCall: vi.fn(() => primaryTx),
    };

    const plan = TransactionPlan.create(handler);
    const prepared = await plan.prepare();

    expect(plan).toBeInstanceOf(TransactionPlan);
    expect("buildTx" in plan).toBe(false);
    expect("getRequirements" in plan).toBe(false);
    expect(Object.hasOwn(plan, "prepare")).toBe(false);
    expect(prepared.flowKind).toBe("mixed_requests");
    expect(prepared.hasSignatureRequests).toBe(true);
    expect(prepared.hasCallRequests).toBe(true);
    expect(prepared.steps.map((request) => request.kind)).toEqual([
      "call",
      "signature",
      "signature",
      "call",
    ]);
    expect(prepared.callRequests.map((request) => request.id)).toEqual([
      "request-0",
      "primary",
    ]);
    expect(prepared.callRequests.map((request) => request.phase)).toEqual([
      "preparation",
      "primary",
    ]);
    expect(prepared.signatureRequests).toHaveLength(2);
    expect(prepared.requestCount).toBe(4);
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

  test("behavior: builds ordered call requests only after requested signatures are provided", async () => {
    const permit = permitRequest();
    const authorization = authorizationRequest();
    const buildPrimaryCall = vi.fn(
      (_signatures?: readonly RequirementSignature[]) => primaryTx,
    );
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      getRequirementRequests: vi.fn(async () => [
        approvalTx,
        permit,
        authorization,
      ]),
      buildPrimaryCall,
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

    expect(buildPrimaryCall).toHaveBeenCalledWith([
      permitSignature,
      authorizationSignature,
    ]);
    expect(executable.callRequests.map((request) => request.id)).toEqual([
      "request-0",
      "primary",
    ]);
    expect(executable.callRequests.at(-1)?.tx).toBe(primaryTx);
    expect(executable.viemCalls).toEqual([
      { to: TOKEN, value: 0n, data: "0xa1" },
      { to: BUNDLER, value: 0n, data: "0xf1" },
    ]);
  });

  test("behavior: preserves prerequisite and primary action types through execution", async () => {
    const plan = TransactionPlan.create<
      VaultV2DepositAction,
      unknown,
      | Readonly<Transaction<ERC20ApprovalAction>>
      | Requirement<PermitRequirementSignature>
    >({
      getRequirementRequests: vi.fn(async () => [approvalTx, permitRequest()]),
      buildPrimaryCall: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();
    type Prepared = typeof prepared;
    type SignatureRequest = Prepared["signatureRequests"][number];
    type PreparationCall = Extract<
      Prepared["callRequests"][number],
      { readonly phase: "preparation" }
    >;
    type Executable = ReturnType<Prepared["build"]>;
    type PrimaryCall = Extract<
      Executable["callRequests"][number],
      { readonly phase: "primary" }
    >;

    expectTypeOf<SignatureRequest["request"]>().toEqualTypeOf<
      Requirement<PermitRequirementSignature>
    >();
    expectTypeOf<ReturnType<SignatureRequest["sign"]>>().toEqualTypeOf<
      Promise<PermitRequirementSignature>
    >();
    expectTypeOf<PreparationCall["tx"]>().toEqualTypeOf<
      Readonly<Transaction<ERC20ApprovalAction>>
    >();
    expectTypeOf<PrimaryCall["action"]>().toEqualTypeOf<VaultV2DepositAction>();
  });

  test("behavior: requirement call requests keep authorization intent separate from token approval", async () => {
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      getRequirementRequests: vi.fn(async () => [authorizationTx]),
      buildPrimaryCall: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();

    expect(prepared.flowKind).toBe("call_requests");
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

  test("behavior: a non-previewable primary call appears after build", async () => {
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      getRequirementRequests: vi.fn(async () => [permitRequest()]),
      previewPrimaryCall: false,
      buildPrimaryCall: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();

    expect(prepared.flowKind).toBe("signature_requests");
    expect(prepared.callRequests).toEqual([]);
    expect(prepared.steps.map((request) => request.id)).toEqual(["request-0"]);

    const executable = prepared.build([permitSignature]);

    expect(executable.callRequests.at(-1)?.tx).toBe(primaryTx);
    expect(executable.callRequests.map((request) => request.id)).toEqual([
      "primary",
    ]);
  });

  test("behavior: a handler without requirement requests is a single call", async () => {
    const plan = TransactionPlan.create<VaultV2DepositAction>({
      buildPrimaryCall: vi.fn(() => primaryTx),
    });

    const prepared = await plan.prepare();
    const executable = prepared.build();

    expect(prepared.flowKind).toBe("single_call");
    expect(prepared.requestCount).toBe(1);
    expect(prepared.signatureRequests).toEqual([]);
    expect(prepared.callRequests.map((request) => request.id)).toEqual([
      "primary",
    ]);
    expect(executable.callRequests.map((request) => request.id)).toEqual([
      "primary",
    ]);
    expect(executable.viemCalls).toEqual([
      { to: BUNDLER, value: 0n, data: "0xf1" },
    ]);
  });
});
