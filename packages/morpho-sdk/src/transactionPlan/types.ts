import type { Address, Hex } from "viem";
import type {
  AuthorizationRequirementSignature,
  BaseAction,
  BlueAuthorizationAction,
  CallRequirement,
  ERC20ApprovalAction,
  PermitRequirementSignature,
  Requirement,
  RequirementSignature,
  SignatureRequirement,
  Transaction,
  TransactionAction,
} from "../types/action.js";

/** Options forwarded to token-approval request discovery. */
export interface TransactionPlanSimplePermitOptions {
  /**
   * Prefer the ERC-2612 simple-permit path when the SDK detects support.
   * Leave unset or set to `false` to force the Permit2/classic approval fallback when
   * a token is known to be incompatible despite passing the SDK's shallow nonce probe.
   */
  readonly useSimplePermit?: boolean;
}

/** Token approval request: on-chain approval or off-chain permit signature. */
export type TransactionPlanTokenRequest =
  | Readonly<Transaction<ERC20ApprovalAction>>
  | Requirement<PermitRequirementSignature>;

/** Operator authorization request: on-chain authorization or off-chain signature. */
export type TransactionPlanOperatorAuthorizationRequest =
  | Readonly<Transaction<BlueAuthorizationAction>>
  | Requirement<AuthorizationRequirementSignature>;

/** Raw viem-compatible call data extracted from a Morpho SDK transaction. */
export interface TransactionPlanViemCall {
  /** Contract that receives the call. */
  readonly to: Address;
  /** Encoded calldata. */
  readonly data: Hex;
  /** Native value attached to the call. */
  readonly value: bigint;
}

/** On-chain or signable request discovered while preparing a transaction plan. */
export type TransactionPlanRequest = CallRequirement | SignatureRequirement;

/** Builds the primary transaction call, optionally consuming previously signed requests. */
export type TransactionPlanBuildPrimaryCall<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TSignatures = readonly RequirementSignature[],
> = (signatures?: TSignatures) => Readonly<Transaction<TPrimaryAction>>;

/** Resolves requirement calls and signature requests before the primary transaction call. */
export type TransactionPlanGetRequirementRequests<
  TRequestOptions = unknown,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> = (options?: TRequestOptions) => Promise<readonly TRequest[]>;

/** Handler shape used internally by Morpho SDK entity methods such as `vault.deposit(...)`. */
export interface TransactionPlanHandler<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequestOptions = unknown,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
  TSignatures = readonly RequirementSignature[],
> {
  /** Builds the primary transaction call, optionally consuming previously signed requests. */
  readonly buildPrimaryCall: TransactionPlanBuildPrimaryCall<
    TPrimaryAction,
    TSignatures
  >;
  /**
   * Controls whether `prepare()` can include an unsigned preview of the primary call.
   *
   * Leave unset for normal flows where the primary call can be encoded without signatures. Set to
   * `false` for signature-dependent flows such as Midnight maker ECDSA offers, where the final
   * mempool payload is produced by the offer-root signature and can only be encoded inside
   * `prepared.build(signatures)`.
   */
  readonly previewPrimaryCall?:
    | false
    | (() => Readonly<Transaction<TPrimaryAction>>);
  /** Resolves requirement calls and signature requests before the primary transaction call. */
  readonly getRequirementRequests?: TransactionPlanGetRequirementRequests<
    TRequestOptions,
    TRequest
  >;
}

/** Options for preparing a TransactionPlan. */
export interface TransactionPlanPrepareOptions<TRequestOptions = unknown> {
  /** Options forwarded to request discovery, for example `{ useSimplePermit }`. */
  readonly requestOptions?: TRequestOptions;
}

/** Token approval intent shared by approval transactions, ERC-2612 permits, and Permit2 signatures. */
export interface TransactionPlanTokenApprovalIntent {
  /** Intent discriminator for filtering and app-specific rendering. */
  readonly type: "tokenApproval";
  /** Approval mechanism: on-chain approval tx, ERC-2612 permit, or Permit2 signature. */
  readonly method: "tx" | "permit" | "permit2";
  /** Token being approved when known from SDK-generated metadata. */
  readonly token?: Address;
  /** Spender receiving the approval. */
  readonly spender: Address;
  /** Amount approved or signed. */
  readonly amount: bigint;
  /** Signature deadline when the intent is signature-backed. */
  readonly deadline?: bigint;
  /** Permit2 allowance expiration when the intent is Permit2-backed. */
  readonly expiration?: bigint;
  /** Chain id when the intent is signature-backed and produced by the SDK. */
  readonly chainId?: number;
}

/** Operator authorization intent shared by on-chain authorization calls and signatures. */
export interface TransactionPlanOperatorAuthorizationIntent {
  /** Intent discriminator for filtering and app-specific rendering. */
  readonly type: "operatorAuthorization";
  /** Authorization mechanism: on-chain transaction or EIP-712 signature. */
  readonly method: "tx" | "signature";
  /** Operator being authorized. */
  readonly operator: Address;
  /** Whether the operator is granted or revoked. */
  readonly isAuthorized: boolean;
  /** Account authorizing the operator when the action metadata carries it. */
  readonly owner?: Address;
  /** Signature deadline when the intent is signature-backed. */
  readonly deadline?: bigint;
  /** Chain id when the intent is signature-backed and produced by the SDK. */
  readonly chainId?: number;
}

/** Midnight offer-root signature intent used by maker action flows. */
export interface TransactionPlanMidnightOfferRootIntent {
  /** Intent discriminator for filtering and app-specific rendering. */
  readonly type: "midnightOfferRootSignature";
  /** Merkle root being ratified. */
  readonly root: Hex;
  /** Ratifier contract that verifies the signature. */
  readonly ratifier: Address;
  /** Number of offers covered by the root. */
  readonly offers: number;
}

/** Generic on-chain transaction intent for neutral requirement calls. */
export interface TransactionPlanContractCallIntent<
  TAction extends TransactionAction = TransactionAction,
> {
  /** Intent discriminator for filtering and app-specific rendering. */
  readonly type: "contractCall";
  /** SDK action type attached to the call metadata. */
  readonly actionType: TAction["type"];
}

/** Primary Morpho SDK transaction intent requested by the user action. */
export interface TransactionPlanPrimaryTransactionIntent<
  TAction extends TransactionAction = TransactionAction,
> {
  /** Intent discriminator for filtering and app-specific rendering. */
  readonly type: "primaryTransaction";
  /** Primary SDK action type, for example `vaultV2Deposit` or `blueRepayWithdrawCollateral`. */
  readonly actionType: TAction["type"];
}

/** Semantic intent attached to every transaction-plan request. */
export type TransactionPlanIntent<
  TPrimaryAction extends TransactionAction = TransactionAction,
> =
  | TransactionPlanTokenApprovalIntent
  | TransactionPlanOperatorAuthorizationIntent
  | TransactionPlanMidnightOfferRootIntent
  | TransactionPlanContractCallIntent<TPrimaryAction>
  | TransactionPlanPrimaryTransactionIntent<TPrimaryAction>;

/** Flow shape derived from a plan's signature and call request mix. */
export type TransactionPlanFlowKind =
  | "single_call"
  | "call_requests"
  | "signature_requests"
  | "mixed_requests";

/** A signable request in a transaction plan. */
export interface TransactionPlanSignatureRequest<
  TRequest extends SignatureRequirement = SignatureRequirement,
> {
  /** Request kind discriminator. */
  readonly kind: "signature";
  /** Stable id based on original request order, e.g. `request-1`. */
  readonly id: string;
  /** Original SDK signable descriptor. */
  readonly request: TRequest;
  /** Exact SDK/protocol action metadata used to encode this signature request. */
  readonly action: TRequest["action"];
  /** Higher-level plan category for app labels, filtering, and analytics. */
  readonly intent:
    | TransactionPlanTokenApprovalIntent
    | TransactionPlanOperatorAuthorizationIntent
    | TransactionPlanMidnightOfferRootIntent;
  /** Signs the request with the provided wallet client and user address. */
  readonly sign: TRequest["sign"];
}

/** A viem-compatible call request in a transaction plan. */
export interface TransactionPlanCallRequest<
  TAction extends BaseAction = TransactionAction,
  TTransaction extends Readonly<Transaction<TAction>> = Readonly<
    Transaction<TAction>
  >,
  TPhase extends "preparation" | "primary" = "preparation" | "primary",
> {
  /** Request kind discriminator. */
  readonly kind: "call";
  /** Stable id based on original request order, or `primary` for the requested action call. */
  readonly id: string;
  /** Whether this call supports the flow or executes the requested primary action. */
  readonly phase: TPhase;
  /** Original SDK transaction with Morpho action metadata. */
  readonly tx: TTransaction;
  /** Exact SDK/protocol action metadata used to encode this call. */
  readonly action: TAction;
  /** Higher-level plan category for app labels, filtering, and analytics. */
  readonly intent: TransactionPlanIntent<Extract<TAction, TransactionAction>>;
  /** viem-compatible call extracted from the transaction. */
  readonly call: TransactionPlanViemCall;
}

/** Prepared representation of one prerequisite request discovered by a transaction plan. */
export type TransactionPlanPreparedRequest<
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> =
  | TransactionPlanSignatureRequest<Extract<TRequest, SignatureRequirement>>
  | TransactionPlanCallRequest<
      Extract<TRequest, CallRequirement>["action"],
      Extract<TRequest, CallRequirement>,
      "preparation"
    >;

/** A request in a transaction plan: either a prerequisite step or the primary transaction. */
export type TransactionPlanStep<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> =
  | TransactionPlanPreparedRequest<TRequest>
  | TransactionPlanCallRequest<
      TPrimaryAction,
      Readonly<Transaction<TPrimaryAction>>,
      "primary"
    >;

/** Narrows transaction-plan steps by semantic intent type. */
export type TransactionPlanStepForIntent<
  TType extends TransactionPlanIntent["type"],
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> = TransactionPlanStep<TPrimaryAction, TRequest> & {
  readonly intent: Extract<TransactionPlanIntent, { readonly type: TType }>;
};

/** Prepared transaction plan shape consumed by app review/execution code. */
export interface PreparedTransactionPlanShape<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> {
  /** Ordered signable requests to present to the user. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest<
    Extract<TRequest, SignatureRequirement>
  >[];
  /** Ordered viem-compatible calls. Includes the primary action call last when previewable. */
  readonly callRequests: readonly Extract<
    TransactionPlanStep<TPrimaryAction, TRequest>,
    { readonly kind: "call" }
  >[];
  /** All signature requests and call requests in review order. */
  readonly steps: readonly TransactionPlanStep<TPrimaryAction, TRequest>[];
}

/** Built plan ready for transaction submission after signatures have been collected. */
export interface ExecutableTransactionPlanShape<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> {
  /** Ordered signable requests used to produce the signatures passed to `build(...)`. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest<
    Extract<TRequest, SignatureRequirement>
  >[];
  /** Ordered viem-compatible calls to submit, with the primary action call last. */
  readonly callRequests: readonly Extract<
    TransactionPlanStep<TPrimaryAction, TRequest>,
    { readonly kind: "call" }
  >[];
}
