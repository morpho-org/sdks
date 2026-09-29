import { expectTypeOf } from "vitest";
import type { SimulationCall } from "../types.js";
import type {
  Applicable,
  ApplicableChange,
  AuthorizationEvidence,
  AuthorizationPreparation,
  EvidenceRead,
  ExecutionIdentity,
  PermissionChange,
  RiskMetric,
  SuccessfulCall,
  VaultState,
  VerificationDiff,
  VerificationSnapshot,
} from "./evidence.js";

describe("verification evidence", () => {
  test("default", () => {
    expectTypeOf<AuthorizationPreparation["type"]>().toEqualTypeOf<
      "approvalCalls" | "stateOverride"
    >();
    expectTypeOf<ExecutionIdentity["type"]>().toEqualTypeOf<
      "transaction" | "authorization" | "probe"
    >();
    expectTypeOf<
      VerificationDiff["markets"][number]["borrowApyWad"]
    >().toEqualTypeOf<ApplicableChange<bigint>>();
    expectTypeOf<
      Extract<VaultState, { type: "vaultV1" }>["lostAssets"]
    >().toEqualTypeOf<Applicable<bigint>>();
    expectTypeOf<bigint | undefined>().not.toExtend<
      Extract<VaultState, { type: "vaultV1" }>["lostAssets"]
    >();
    expectTypeOf<
      Extract<
        AuthorizationPreparation,
        { type: "approvalCalls" }
      >["calls"][number]["result"]
    >().toEqualTypeOf<SuccessfulCall>();
    expectTypeOf<SimulationCall>().not.toExtend<
      Extract<
        AuthorizationPreparation,
        { type: "approvalCalls" }
      >["calls"][number]["result"]
    >();
    expectTypeOf<"lostAssets">().not.toExtend<
      keyof Extract<VaultState, { type: "vaultV2" }>
    >();
  });

  test("behavior: missing evidence and debt-free metrics cannot masquerade as measurements", () => {
    expectTypeOf<
      EvidenceRead<VerificationSnapshot>
    >().not.toExtend<VerificationSnapshot>();
    expectTypeOf<bigint>().not.toExtend<RiskMetric>();
    expectTypeOf<{ type: "debtFree" }>().toExtend<RiskMetric>();
    expectTypeOf<{
      type: "unbounded";
      reason: "zeroCollateral";
    }>().toExtend<RiskMetric>();
    expectTypeOf<{ type: "missing" }>().not.toExtend<RiskMetric>();
  });

  test("behavior: authorization/probe indices are separate from user indices", () => {
    expectTypeOf<"transactionIndex" | "txIdx">().not.toExtend<
      keyof Extract<ExecutionIdentity, { type: "authorization" }>
    >();
    expectTypeOf<"authorizationIndex">().not.toExtend<
      keyof Extract<ExecutionIdentity, { type: "probe" }>
    >();
    expectTypeOf<"txIdx">().not.toExtend<keyof AuthorizationEvidence>();
  });

  test("behavior: nonce transitions and Permit2-specific checks are retained", () => {
    expectTypeOf<
      Extract<PermissionChange["before"], { type: "erc2612Nonce" }>
    >().not.toBeNever();
    expectTypeOf<
      Extract<
        AuthorizationEvidence["requestChecks"],
        { type: "permit2SignatureTransfer" }
      >["canonicalPermit2Allowance"]
    >().toEqualTypeOf<"passed">();
  });
});
