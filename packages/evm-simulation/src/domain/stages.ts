import type {
  AccrualVault,
  AccrualVaultV2,
  InputMarketParams,
  MarketId,
} from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type {
  PreLiquidationBinding,
  VaultBinding,
} from "../decode/operations.js";
import type { SimulationCall, SimulationTransaction } from "../types.js";
import type {
  AuthorizationEvidence,
  EvidenceRead,
  ExecutionContext,
  ExecutionIdentity,
  PermissionState,
  ProbeIdentity,
  VerificationSnapshot,
} from "./evidence.js";
import type { EffectiveSimulationLimits, OperationLimit } from "./limits.js";
import type { DecodedOperation, OperationSignature } from "./operations.js";
import type { NormalizedSimulateParams } from "./request.js";
import type {
  SimulationVerification,
  VerifiedSimulationResult,
} from "./result.js";

declare const stage: unique symbol;

/** Token-pull signature forms a `tokenPull` request can carry. @internal */
export type TokenPullSignature = Extract<
  OperationSignature,
  { readonly type: "none" | "erc2612Permit" | "permit2SignatureTransfer" }
>;

/** Operator-authority signature forms. @internal */
export type AuthoritySignature = Extract<
  OperationSignature,
  { readonly type: "none" | "blueAuthorizationSignature" }
>;

/**
 * A wallet request the decoded operations imply, with provenance. Preview
 * authorizations and final-mode pinned state are both checked against this
 * single source of truth.
 * @internal
 */
export type ExpectedRequest =
  | {
      readonly type: "tokenPull";
      readonly operationIndex: number;
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
      readonly signature: TokenPullSignature;
    }
  | {
      readonly type: "blueOperatorAuthority";
      readonly operationIndex: number;
      readonly authorizer: Address;
      readonly authorized: Address;
      readonly signature: AuthoritySignature;
      /**
       * True when a `blueAuthorization` operation at an earlier
       * `operationIndex` already grants this authority onchain (the bundle
       * executes sequentially), so pinned state does not need to carry it.
       */
      readonly satisfiedByEarlierOp: boolean;
    };

/** Parsed immutable input; only the future boundary parser constructs this refinement. @internal */
export type ParsedRequest = NormalizedSimulateParams & {
  readonly [stage]: "parsed";
};

/**
 * Stamp a normalized request with the `parsed` refinement. Only callable from
 * inside the request pipeline — the brand keeps unvalidated input out of the
 * planning and boundary stages.
 * @internal
 */
/** Stamp a parsed request; only the request parser may call this. @internal */
export function brandParsed(request: NormalizedSimulateParams): ParsedRequest {
  return request as ParsedRequest;
}

/**
 * Stamp a planner output with the `planned` refinement. The brand keeps
 * unplanned call lists out of the execution boundary.
 * @internal
 */
/**
 * Stamp decoded operations with provenance; only the decode+bind stage calls this.
 * @internal
 */
export function brandDecoded(
  bundle: Omit<DecodedBundle, typeof stage>,
): DecodedBundle {
  return bundle as DecodedBundle;
}

/** Stamp a planned execution; only `planExecution` may call this. @internal */
export function brandPlanned(
  plan: Omit<ExecutionPlan, typeof stage>,
): ExecutionPlan {
  return plan as ExecutionPlan;
}

/**
 * Stamp parsed boundary output with the `executed` refinement. The brand keeps
 * unverified responses out of authorization proof and effect verification.
 * @internal
 */
export function brandExecuted(
  evidence: Omit<ExecutionEvidence, typeof stage>,
): ExecutionEvidence {
  return evidence as ExecutionEvidence;
}

/**
 * Stamp pinned-read output with the `pinned` refinement. Only the pinned-state
 * backend may call this — the brand keeps unpinned snapshots out of policy.
 * @internal
 */
export function brandPinned(
  inputs: Omit<PinnedInputs, typeof stage>,
): PinnedInputs {
  return inputs as PinnedInputs;
}

/**
 * Stamp authorization-policy output with the `authorizations` refinement. Only
 * `checkRequests` may call this — the brand keeps unvalidated requests out of
 * execution planning.
 * @internal
 */
export function brandValidated(
  validated: Omit<ValidatedAuthorizations, typeof stage>,
): ValidatedAuthorizations {
  return validated as ValidatedAuthorizations;
}

/**
 * Stamp authorization-proof output with the `complete` refinement. Only
 * `proveAuthorizations` may call this.
 * @internal
 */
export function brandComplete(
  evidence: Omit<CompleteEvidence, typeof stage>,
): CompleteEvidence {
  return evidence as CompleteEvidence;
}

/**
 * Stamp verified-effects output with the `effects` refinement. Only
 * `verifyEffects` may call this.
 * @internal
 */
export function brandVerified(
  effects: Omit<VerifiedEffects, typeof stage>,
): VerifiedEffects {
  return effects as VerifiedEffects;
}

/** Stamp constraint-checked effects; only `enforceLimits` may call this. @internal */
export function brandConstrained(
  effects: Omit<ConstrainedEffects, typeof stage>,
): ConstrainedEffects {
  return effects as ConstrainedEffects;
}

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
  /**
   * Fetched entity handles retained so exact SDK helpers
   * (`computeVaultMaxShareAllowance`, `toShares`) can be reused by policy
   * without re-fetching. Provenance data only — never part of the snapshot.
   */
  readonly internals: {
    readonly vaultData: ReadonlyMap<Address, AccrualVault | AccrualVaultV2>;
  };
}

/** Request policy has passed; actual preparation/read-back is still pending. @internal */
export interface ValidatedAuthorizations {
  readonly [stage]: "authorizations";
  readonly inputs: PinnedInputs;
  readonly limits: EffectiveSimulationLimits;
  readonly preparations: readonly PlannedPreparation[];
  /** One-to-one pairing of each covered authorization with its expected request. */
  readonly matches: readonly {
    readonly authorizationIndex: number;
    readonly expectedIndex: number;
  }[];
  /**
   * The derived expected requests `checkRequests` validated against —
   * required by {@link proveAuthorizations} and permission verification.
   */
  readonly expected: readonly ExpectedRequest[];
}

/** Ordered approval calls prepared for one authorization, with expected read-back state. @internal */
export interface PlannedPreparation {
  readonly authorizationIndex: number;
  readonly calls: readonly Required<Readonly<SimulationTransaction>>[];
  readonly expected: readonly PermissionState[];
}

/**
 * A single state read executed inside the simulated block through a synthetic
 * probe call. Variants mirror {@link PermissionState}, wallet balances, Blue
 * position/market state, oracle/IRM views, and vault dynamic fields.
 * @internal
 */
export type ProbeRead =
  | { readonly type: "nativeBalance"; readonly account: Address }
  | {
      readonly type: "erc20Balance";
      readonly token: Address;
      readonly account: Address;
    }
  | {
      readonly type: "erc20Allowance";
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
    }
  | {
      readonly type: "erc2612Nonce";
      readonly token: Address;
      readonly owner: Address;
    }
  | {
      readonly type: "permit2NonceBitmap";
      readonly permit2: Address;
      readonly owner: Address;
      readonly wordPosition: bigint;
    }
  | {
      readonly type: "blueIsAuthorized";
      readonly morpho: Address;
      readonly authorizer: Address;
      readonly authorized: Address;
    }
  | {
      readonly type: "blueNonce";
      readonly morpho: Address;
      readonly owner: Address;
    }
  | {
      readonly type: "bluePosition";
      readonly morpho: Address;
      readonly marketId: MarketId;
      readonly owner: Address;
    }
  | {
      readonly type: "blueMarket";
      readonly morpho: Address;
      readonly marketId: MarketId;
    }
  | { readonly type: "oraclePrice"; readonly oracle: Address }
  | {
      readonly type: "irmBorrowRateView";
      readonly irm: Address;
      readonly market: Readonly<InputMarketParams>;
      readonly marketState: {
        readonly totalSupplyAssets: bigint;
        readonly totalSupplyShares: bigint;
        readonly totalBorrowAssets: bigint;
        readonly totalBorrowShares: bigint;
        readonly lastUpdate: bigint;
        readonly fee: bigint;
      };
    }
  | {
      /** AdaptiveCurveIRM `rateAtTarget(marketId)` — the stored IRM parameter that drives accrual, distinct from the utilization-dependent `borrowRateView`. */
      readonly type: "irmRateAtTarget";
      readonly irm: Address;
      readonly marketId: MarketId;
    }
  | { readonly type: "vaultTotalAssets"; readonly vault: Address }
  | { readonly type: "vaultTotalSupply"; readonly vault: Address }
  | {
      readonly type: "vaultBalanceOf";
      readonly vault: Address;
      readonly account: Address;
    }
  | {
      /** VaultV2 idle assets: `asset.balanceOf(liquidityAdapter)` — V1 idle is modeled, not read. */
      readonly type: "vaultIdleAssets";
      readonly vault: Address;
      readonly asset: Address;
      readonly liquidityAdapter: Address;
    }
  | {
      /** VaultV2 allocation for a bytes32 id: `vault.allocation(id)`. */
      readonly type: "adapterAllocation";
      readonly vault: Address;
      readonly allocationId: Hex;
    };

/** A probe read paired with its decoded return value. @internal */
export type DecodedProbeRead = {
  [Type in ProbeRead["type"]]: Extract<ProbeRead, { readonly type: Type }> & {
    readonly value: Type extends "bluePosition"
      ? {
          readonly supplyShares: bigint;
          readonly borrowShares: bigint;
          readonly collateral: bigint;
        }
      : Type extends "blueMarket"
        ? {
            readonly totalSupplyAssets: bigint;
            readonly totalSupplyShares: bigint;
            readonly totalBorrowAssets: bigint;
            readonly totalBorrowShares: bigint;
            readonly lastUpdate: bigint;
            readonly fee: bigint;
          }
        : Type extends "blueIsAuthorized"
          ? boolean
          : bigint;
  };
}[ProbeRead["type"]];

/** One planned call whose identity is independent of its backend array offset. @internal */
export type PlannedCall =
  | {
      readonly identity: Extract<
        ExecutionIdentity,
        { readonly type: "transaction" }
      >;
      readonly transaction: Required<Readonly<SimulationTransaction>>;
    }
  | {
      readonly identity: Extract<
        ExecutionIdentity,
        { readonly type: "authorization" }
      >;
      readonly transaction: Required<Readonly<SimulationTransaction>>;
    }
  | {
      readonly identity: ProbeIdentity;
      readonly transaction: Required<Readonly<SimulationTransaction>>;
      readonly read: ProbeRead;
    };

/** Ordered probes and user calls for a single execution; context is resolved at the boundary. @internal */
export interface ExecutionPlan {
  readonly [stage]: "planned";
  readonly request: ParsedRequest;
  readonly owner: Address;
  readonly calls: readonly PlannedCall[];
  readonly stateOverrides: readonly {
    readonly address: Address;
    readonly code: Hex;
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

/** Evidence collected at the boundary before authorization proof. @internal */
export interface ExecutionEvidence {
  readonly [stage]: "executed";
  readonly plan: ExecutionPlan;
  readonly context: ExecutionContext;
  readonly calls: readonly {
    readonly identity: ExecutionIdentity;
    readonly result: SimulationCall;
  }[];
  /** Decoded probe observations, grouped by phase. */
  readonly probeReads: {
    readonly before: readonly DecodedProbeRead[];
    readonly prepared: readonly DecodedProbeRead[];
    readonly intermediate: readonly DecodedProbeRead[];
    readonly after: readonly DecodedProbeRead[];
  };
  /** Preparation call results paired with their authorization. */
  readonly preparations: readonly {
    readonly authorizationIndex: number;
    readonly calls: readonly SimulationCall[];
  }[];
  readonly snapshots: readonly ObservedSnapshot[];
}

/** Complete evidence after response counts, references, statuses and probe results pass. @internal */
export type CompleteEvidence = Omit<ExecutionEvidence, typeof stage> & {
  readonly [stage]: "complete";
  readonly authorizations: readonly AuthorizationEvidence[];
};

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
  readonly decodeAndBind: (
    request: ParsedRequest,
    bindings: {
      readonly vaults: readonly VaultBinding[];
      readonly preLiquidations: readonly PreLiquidationBinding[];
    },
  ) => DecodedBundle;
  readonly readPinnedInputs: (bundle: DecodedBundle) => Promise<PinnedInputs>;
  readonly checkRequests: (
    inputs: PinnedInputs,
    limits: EffectiveSimulationLimits,
  ) => ValidatedAuthorizations;
  readonly planExecution: (
    validated: ValidatedAuthorizations,
    reads: {
      readonly full: readonly ProbeRead[];
      readonly permissions: readonly ProbeRead[];
    },
  ) => ExecutionPlan;
  readonly executePlan: (plan: ExecutionPlan) => Promise<unknown>;
  readonly parseEvidence: (
    plan: ExecutionPlan,
    response: unknown,
  ) => ExecutionEvidence;
  readonly proveAuthorizations: (
    evidence: ExecutionEvidence,
    validated: ValidatedAuthorizations,
  ) => CompleteEvidence;
  readonly verifyEffects: (
    evidence: CompleteEvidence,
    validated: ValidatedAuthorizations,
  ) => VerifiedEffects;
  /** Binds the effective limits carried inside the effects; no external list is accepted. */
  readonly enforceLimits: (effects: VerifiedEffects) => ConstrainedEffects;
  readonly assembleResult: (
    effects: ConstrainedEffects,
  ) => VerifiedSimulationResult;
}
