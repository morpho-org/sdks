import type { Address } from "viem";
import type { SimulationCall, SimulationTransaction } from "../types.js";
import type {
  AuthorizationEvidence,
  AuthorizationPreparation,
  EvidenceRead,
  ExecutionContext,
  ExecutionIdentity,
  VerificationSnapshot,
} from "./evidence.js";
import type { EffectiveSimulationLimits, OperationLimit } from "./limits.js";
import type { DecodedOperation } from "./operations.js";
import type { NormalizedSimulateParams } from "./request.js";
import type {
  SimulationVerification,
  VerifiedSimulationResult,
} from "./result.js";

declare const stage: unique symbol;

/** Parsed immutable input; only the future boundary parser constructs this refinement. @internal */
export type ParsedRequest = NormalizedSimulateParams & {
  readonly [stage]: "parsed";
};

/** Decoded and deployment-bound request; still makes no financial verification claim. @internal */
export interface DecodedBundle {
  readonly [stage]: "decoded";
  readonly request: ParsedRequest;
  readonly owner: Address;
  readonly operations: readonly DecodedOperation[];
}

/** Complete real pre-state at one resolved execution context. @internal */
export interface PinnedInputs {
  readonly [stage]: "pinned";
  readonly bundle: DecodedBundle;
  readonly context: ExecutionContext;
  readonly before: VerificationSnapshot;
}

/** Request policy has passed; actual preparation/read-back is still pending. @internal */
export interface ValidatedAuthorizations {
  readonly [stage]: "authorizations";
  readonly inputs: PinnedInputs;
  readonly limits: EffectiveSimulationLimits;
}

/** One planned call whose identity is independent of its backend array offset. @internal */
export interface PlannedCall {
  readonly identity: ExecutionIdentity;
  readonly transaction: Required<Readonly<SimulationTransaction>>;
}

/** Explicit permission preparation and ordered probes/user calls for a single execution. @internal */
export interface ExecutionPlan {
  readonly [stage]: "planned";
  readonly authorizations: ValidatedAuthorizations;
  readonly calls: readonly PlannedCall[];
  readonly overrides: readonly {
    readonly authorizationIndex: number;
    readonly override: Extract<
      AuthorizationPreparation,
      { readonly type: "stateOverride" }
    >;
  }[];
}

/** Tagged sequential snapshot, with its own checked execution context. @internal */
export interface ObservedSnapshot {
  readonly identity: ExecutionIdentity;
  readonly context: ExecutionContext;
  readonly snapshot: VerificationSnapshot;
}

/** Untrusted/incomplete probe collection cannot enter effect verification. @internal */
export interface PendingEvidence {
  readonly snapshots: readonly EvidenceRead<ObservedSnapshot>[];
}

/** Complete evidence after response counts, references, statuses and probe results pass. @internal */
export interface CompleteEvidence {
  readonly [stage]: "complete";
  readonly plan: ExecutionPlan;
  readonly calls: readonly {
    readonly identity: ExecutionIdentity;
    readonly result: SimulationCall;
  }[];
  readonly snapshots: readonly ObservedSnapshot[];
  readonly authorizations: readonly AuthorizationEvidence[];
}

/** Policy-verified effects remain distinct from effects satisfying consumer constraints. @internal */
export interface VerifiedEffects {
  readonly [stage]: "effects";
  readonly evidence: CompleteEvidence;
  readonly verification: SimulationVerification;
}

/** Typed constraint binding, refined at runtime to one operation identity. @internal */
export type BoundOperationLimit = {
  [Type in OperationLimit["type"]]: {
    readonly operation: Extract<DecodedOperation, { readonly type: Type }>;
    readonly limit: Extract<OperationLimit, { readonly type: Type }>;
  };
}[OperationLimit["type"]];

/** Fully checked effects accepted by final assembly. @internal */
export interface ConstrainedEffects {
  readonly [stage]: "constrained";
  readonly effects: VerifiedEffects;
  readonly boundLimits: readonly BoundOperationLimit[];
}

/**
 * Narrow stage contracts, not implementations or a public plugin framework.
 * RPC dependencies belong to the future pinned-read/execution boundary implementations.
 * @internal
 */
export interface SimulationStageContracts {
  readonly parseRequest: (input: unknown) => ParsedRequest;
  readonly decodeAndBind: (request: ParsedRequest) => DecodedBundle;
  readonly readPinnedInputs: (bundle: DecodedBundle) => Promise<PinnedInputs>;
  readonly checkRequests: (
    inputs: PinnedInputs,
    limits: EffectiveSimulationLimits,
  ) => ValidatedAuthorizations;
  readonly planExecution: (
    authorizations: ValidatedAuthorizations,
  ) => ExecutionPlan;
  readonly executePlan: (plan: ExecutionPlan) => Promise<unknown>;
  readonly parseEvidence: (
    plan: ExecutionPlan,
    response: unknown,
  ) => CompleteEvidence;
  readonly verifyEffects: (evidence: CompleteEvidence) => VerifiedEffects;
  /** Binds the effective limits carried inside the effects; no external list is accepted. */
  readonly enforceLimits: (effects: VerifiedEffects) => ConstrainedEffects;
  readonly assembleResult: (
    effects: ConstrainedEffects,
  ) => VerifiedSimulationResult;
}
