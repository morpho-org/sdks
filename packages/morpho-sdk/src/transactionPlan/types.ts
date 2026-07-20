import type { Address, Hex } from "viem";
import type {
  AuthorizationRequirementSignature,
  BaseAction,
  BlueAuthorizationAction,
  ERC20ApprovalAction,
  PermitRequirementSignature,
  Requirement,
  SignatureRequirement,
  Transaction,
  TransactionAction,
  TxRequirement,
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

/** EIP-5792-compatible batch call converted from a Morpho SDK transaction. */
export interface TransactionPlanBatchCall {
  /** Contract that receives the call. */
  readonly to: Address;
  /** Encoded calldata. */
  readonly data: Hex;
  /** Native value attached to the call. */
  readonly value: bigint;
}

/** On-chain or signable request discovered while preparing a transaction plan. */
export type TransactionPlanRequest = TxRequirement | SignatureRequirement;

/** Signature produced by a transaction-plan request, or `never` for on-chain-only requests. */
export type TransactionPlanSignatureForRequest<
  TRequest extends TransactionPlanRequest,
> = TRequest extends Requirement<infer TSignature> ? TSignature : never;

/** Ordered signatures accepted by a transaction plan, derived from its request types. */
export type TransactionPlanSignatures<
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> = readonly TransactionPlanSignatureForRequest<TRequest>[];

/** Builds the primary transaction, optionally consuming previously signed requests. */
export type TransactionPlanBuildPrimaryTx<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = never,
> = (
  signatures?: TransactionPlanSignatures<TRequest>,
) => Readonly<Transaction<TPrimaryAction>>;

/** Resolves transaction and signature requirements before the primary transaction. */
export type TransactionPlanGetRequirementRequests<
  TRequestOptions = unknown,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> = (options?: TRequestOptions) => Promise<readonly TRequest[]>;

/** Handler shape used internally by Morpho SDK entity methods such as `vault.deposit(...)`. */
export interface TransactionPlanHandler<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequestOptions = unknown,
  TRequest extends TransactionPlanRequest = never,
> {
  /** Builds the primary transaction, optionally consuming previously signed requests. */
  readonly buildPrimaryTx: TransactionPlanBuildPrimaryTx<
    TPrimaryAction,
    TRequest
  >;
  /**
   * Controls whether `prepare()` can include an unsigned preview of the primary transaction.
   *
   * Leave unset for normal flows where the primary transaction can be encoded without signatures. Set to
   * `false` for signature-dependent flows such as Midnight maker ECDSA offers, where the final
   * mempool payload is produced by the offer-root signature and can only be encoded inside
   * `prepared.build(signatures)`.
   */
  readonly previewPrimaryTx?:
    | false
    | (() => Readonly<Transaction<TPrimaryAction>>);
  /** Resolves transaction and signature requirements before the primary transaction. */
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

/** Generic on-chain transaction intent for neutral transaction requirements. */
export interface TransactionPlanContractTxIntent<
  TAction extends TransactionAction = TransactionAction,
> {
  /** Intent discriminator for filtering and app-specific rendering. */
  readonly type: "contractTx";
  /** SDK action type attached to the call metadata. */
  readonly actionType: TAction["type"];
}

/** Primary Morpho SDK transaction intent requested by the user action. */
export interface TransactionPlanPrimaryTxIntent<
  TAction extends TransactionAction = TransactionAction,
> {
  /** Intent discriminator for filtering and app-specific rendering. */
  readonly type: "primaryTx";
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
  | TransactionPlanContractTxIntent<TPrimaryAction>
  | TransactionPlanPrimaryTxIntent<TPrimaryAction>;

/** Flow shape derived from a plan's signature requests and transaction steps. */
export type TransactionPlanFlowKind =
  | "single_tx"
  | "tx_steps"
  | "signature_steps"
  | "mixed_steps";

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

/** A transaction step containing an SDK transaction and plan metadata. */
export interface TransactionPlanTxStep<
  TAction extends BaseAction = TransactionAction,
  TTx extends Readonly<Transaction<TAction>> = Readonly<Transaction<TAction>>,
  TPhase extends "preparation" | "primary" = "preparation" | "primary",
> {
  /** Request kind discriminator. */
  readonly kind: "tx";
  /** Stable id based on original requirement order, or `primary` for the requested action. */
  readonly id: string;
  /** Whether this step supports the flow or executes the requested primary action. */
  readonly phase: TPhase;
  /** Original SDK transaction with Morpho action metadata. */
  readonly tx: TTx;
  /** Exact SDK/protocol action metadata used to encode this transaction. */
  readonly action: TAction;
  /** Higher-level plan category for app labels, filtering, and analytics. */
  readonly intent: TransactionPlanIntent<Extract<TAction, TransactionAction>>;
}

/** Prepared representation of one prerequisite request discovered by a transaction plan. */
export type TransactionPlanPreparedStep<
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> =
  | TransactionPlanSignatureRequest<Extract<TRequest, SignatureRequirement>>
  | TransactionPlanTxStep<
      Extract<TRequest, TxRequirement>["action"],
      Extract<TRequest, TxRequirement>,
      "preparation"
    >;

/** A request in a transaction plan: either a prerequisite step or the primary transaction. */
export type TransactionPlanStep<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> =
  | TransactionPlanPreparedStep<TRequest>
  | TransactionPlanTxStep<
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
  /** Raw prerequisite requirements in discovery order. */
  readonly requirements: readonly TRequest[];
  /** Preview of the primary step, when its transaction can be encoded without signatures. */
  readonly primaryStep?: TransactionPlanTxStep<
    TPrimaryAction,
    Readonly<Transaction<TPrimaryAction>>,
    "primary"
  >;
  /** Preview of the primary SDK transaction, when it can be encoded without signatures. */
  readonly primaryTx?: Readonly<Transaction<TPrimaryAction>>;
  /** Ordered signable requests to present to the user. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest<
    Extract<TRequest, SignatureRequirement>
  >[];
  /** Ordered transaction steps. Includes the primary action step last when previewable. */
  readonly txSteps: readonly Extract<
    TransactionPlanStep<TPrimaryAction, TRequest>,
    { readonly kind: "tx" }
  >[];
  /** Viem-compatible calls converted from the currently previewable transaction steps. */
  readonly calls: readonly TransactionPlanBatchCall[];
  /** All signature requests and transaction steps in review order. */
  readonly steps: readonly TransactionPlanStep<TPrimaryAction, TRequest>[];
}

/** Built plan ready for transaction submission after signatures have been collected. */
export interface ExecutableTransactionPlanShape<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> {
  /** Built primary transaction step. */
  readonly primaryStep: TransactionPlanTxStep<
    TPrimaryAction,
    Readonly<Transaction<TPrimaryAction>>,
    "primary"
  >;
  /** Built primary SDK transaction. */
  readonly primaryTx: Readonly<Transaction<TPrimaryAction>>;
  /** Ordered signable requests used to produce the signatures passed to `build(...)`. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest<
    Extract<TRequest, SignatureRequirement>
  >[];
  /** Ordered transaction steps to submit, with the primary action step last. */
  readonly txSteps: readonly Extract<
    TransactionPlanStep<TPrimaryAction, TRequest>,
    { readonly kind: "tx" }
  >[];
  /** Viem-compatible calls converted from the executable transaction steps. */
  readonly calls: readonly TransactionPlanBatchCall[];
}
