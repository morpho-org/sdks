import type { Address, WalletClient } from "viem";
import {
  type CallRequirement,
  isRequirementApproval,
  isRequirementBlueAuthorization,
  type RequirementSignature,
  type SignatureRequirement,
  type TransactionAction,
} from "../types/action.js";
import { MissingTransactionPlanSignaturesError } from "../types/error.js";
import type {
  ExecutableTransactionPlanShape,
  PreparedTransactionPlanShape,
  TransactionPlanBuildPrimaryCall,
  TransactionPlanCallRequest,
  TransactionPlanContractCallIntent,
  TransactionPlanFlowKind,
  TransactionPlanHandler,
  TransactionPlanIntent,
  TransactionPlanMidnightOfferRootIntent,
  TransactionPlanOperatorAuthorizationIntent,
  TransactionPlanPrepareOptions,
  TransactionPlanRequest,
  TransactionPlanSignatureRequest,
  TransactionPlanStep,
  TransactionPlanStepForIntent,
  TransactionPlanTokenApprovalIntent,
  TransactionPlanViemCall,
} from "./types.js";

export type {
  ExecutableTransactionPlanShape,
  PreparedTransactionPlanShape,
  TransactionPlanHandler,
  TransactionPlanIntent,
  TransactionPlanPrepareOptions,
} from "./types.js";

/**
 * Lazy transaction plan returned by Morpho SDK action flows.
 *
 * Entity action flows stay synchronous: the SDK does not fetch or own the full state needed to
 * decide user intent. Consumers pass already-fetched market, position, and vault snapshots into the
 * flow, so apps can batch, cache, stale-while-revalidate, or otherwise optimize state fetching for
 * their own UX. Calling `prepare()` performs only the minimal request discovery for the already
 * chosen intent: it resolves the signature requests and/or viem-compatible call requests that the
 * primary action depends on, while avoiding extra reads when no approval or operator authorization
 * check is needed.
 *
 * @example Vault app review branching and labels
 * ```ts
 * const plan = vault.deposit({ amount, userAddress, vaultData });
 * const prepared = await plan.prepare({ requestOptions: { useSimplePermit } });
 *
 * const txFlowType = prepared.flowKind === "single_call"
 *   ? "simple"
 *   : prepared.hasSignatureRequests
 *     ? "signature_required"
 *     : "bundled";
 *
 * const labels = prepared.steps.map((request) => {
 *   switch (request.intent.type) {
 *     case "tokenApproval":
 *       return request.intent.method === "tx"
 *         ? `Approve ${request.intent.amount}`
 *         : `Sign ${request.intent.method}`;
 *     case "operatorAuthorization":
 *       return "Authorize operator";
 *     case "contractCall":
 *       return `Review ${request.intent.actionType}`;
 *     case "midnightOfferRootSignature":
 *       return "Sign offer root";
 *     case "primaryTransaction":
 *       return "Vault deposit";
 *   }
 * });
 * ```
 *
 * @example Markets app action-flow shape
 * ```ts
 * const prepared = await market.supplyCollateralBorrow(params).prepare();
 *
 * const signatureRequests = prepared.signatureRequests.map((request) => ({
 *   label: request.intent.type === "operatorAuthorization" ? "Authorize operator" : "Sign",
 *   sign: (client) => request.sign(client, accountAddress),
 * }));
 *
 * const executable = prepared.build(await prepared.signAll(walletClient, accountAddress));
 * const callRequests = executable.callRequests.map((request) => ({
 *   label: request.intent.type === "primaryTransaction" ? "Submit transaction" : "Approve token",
 *   getCall: () => request.call,
 * }));
 * ```
 */
export class TransactionPlan<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequestOptions = unknown,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
  TSignatures = readonly RequirementSignature[],
> {
  private readonly handler: TransactionPlanHandler<
    TPrimaryAction,
    TRequestOptions,
    TRequest,
    TSignatures
  >;

  /**
   * Creates a lazy TransactionPlan from SDK handler callbacks.
   *
   * @param handler - SDK handler callbacks used by `prepare()` and `PreparedTransactionPlan.build(...)`.
   */
  constructor(
    handler: TransactionPlanHandler<
      TPrimaryAction,
      TRequestOptions,
      TRequest,
      TSignatures
    >,
  ) {
    this.handler = handler;
  }

  /** Prepares semantic review and execution metadata by resolving current requests. */
  async prepare(
    options?: TransactionPlanPrepareOptions<TRequestOptions>,
  ): Promise<PreparedTransactionPlan<TPrimaryAction, TSignatures>> {
    const requests = this.handler.getRequirementRequests
      ? await this.handler.getRequirementRequests(options?.requestOptions)
      : [];
    const requestSteps = requests.map((request, index) => {
      const id = `request-${index}`;
      if (isRequirementApproval(request)) {
        return {
          kind: "call",
          id,
          phase: "preparation",
          tx: request,
          action: request.action,
          intent: {
            type: "tokenApproval",
            method: "tx",
            token: request.to,
            spender: request.action.args.spender,
            amount: request.action.args.amount,
          },
          call: { to: request.to, value: request.value, data: request.data },
        } satisfies TransactionPlanCallRequest;
      }
      if (isRequirementBlueAuthorization(request)) {
        return {
          kind: "call",
          id,
          phase: "preparation",
          tx: request,
          action: request.action,
          intent: {
            type: "operatorAuthorization",
            method: "tx",
            operator: request.action.args.authorized,
            isAuthorized: request.action.args.isAuthorized,
          },
          call: { to: request.to, value: request.value, data: request.data },
        } satisfies TransactionPlanCallRequest;
      }
      if (
        typeof request === "object" &&
        request !== null &&
        "to" in request &&
        "value" in request &&
        "data" in request &&
        "action" in request
      ) {
        const tx = request as CallRequirement;
        const intent:
          | TransactionPlanOperatorAuthorizationIntent
          | TransactionPlanContractCallIntent<CallRequirement["action"]> =
          tx.action.type === "midnightAuthorization"
            ? {
                type: "operatorAuthorization",
                method: "tx",
                operator: tx.action.args.authorized,
                isAuthorized: tx.action.args.isAuthorized,
                owner: tx.action.args.onBehalf,
              }
            : { type: "contractCall", actionType: tx.action.type };
        return {
          kind: "call",
          id,
          phase: "preparation",
          tx,
          action: tx.action,
          intent,
          call: { to: tx.to, value: tx.value, data: tx.data },
        } satisfies TransactionPlanCallRequest;
      }

      const signatureRequest = request as SignatureRequirement;
      let intent:
        | TransactionPlanTokenApprovalIntent
        | TransactionPlanOperatorAuthorizationIntent
        | TransactionPlanMidnightOfferRootIntent;
      switch (signatureRequest.action.type) {
        case "permit":
          intent = {
            type: "tokenApproval",
            method: "permit",
            token: signatureRequest.action.args.token,
            spender: signatureRequest.action.args.spender,
            amount: signatureRequest.action.args.amount,
            deadline: signatureRequest.action.args.deadline,
            chainId: signatureRequest.action.args.chainId,
          };
          break;
        case "permit2":
          intent = {
            type: "tokenApproval",
            method: "permit2",
            token: signatureRequest.action.args.token,
            spender: signatureRequest.action.args.spender,
            amount: signatureRequest.action.args.amount,
            deadline: signatureRequest.action.args.deadline,
            expiration: signatureRequest.action.args.expiration,
            chainId: signatureRequest.action.args.chainId,
          };
          break;
        case "authorization":
          intent = {
            type: "operatorAuthorization",
            method: "signature",
            operator: signatureRequest.action.args.authorized,
            isAuthorized: signatureRequest.action.args.isAuthorized,
            deadline: signatureRequest.action.args.deadline,
            chainId: signatureRequest.action.args.chainId,
          };
          break;
        case "midnightOfferRootSignature":
          intent = {
            type: "midnightOfferRootSignature",
            root: signatureRequest.action.args.root,
            ratifier: signatureRequest.action.args.ratifier,
            offers: signatureRequest.action.args.offers,
          };
          break;
      }
      return {
        kind: "signature",
        id,
        request: signatureRequest,
        action: signatureRequest.action,
        intent,
        sign: (client, userAddress) =>
          signatureRequest.sign(client, userAddress),
      } satisfies TransactionPlanSignatureRequest;
    });
    const primaryTx =
      this.handler.previewPrimaryCall === false
        ? undefined
        : (
            this.handler.previewPrimaryCall ??
            (() => this.handler.buildPrimaryCall())
          )();
    const primaryCall =
      primaryTx == null
        ? undefined
        : ({
            kind: "call",
            id: "primary",
            phase: "primary",
            tx: primaryTx,
            action: primaryTx.action,
            intent: {
              type: "primaryTransaction",
              actionType: primaryTx.action.type,
            },
            call: {
              to: primaryTx.to,
              value: primaryTx.value,
              data: primaryTx.data,
            },
          } satisfies TransactionPlanCallRequest<TPrimaryAction>);

    return new PreparedTransactionPlan({
      buildPrimaryCall: this.handler.buildPrimaryCall,
      requestSteps,
      primaryCall,
    });
  }

  /**
   * Creates a lazy TransactionPlan from SDK handler callbacks.
   *
   * @param handler - SDK handler callbacks used by `prepare()` and `PreparedTransactionPlan.build(...)`.
   * @returns A TransactionPlan exposing `prepare()` as the public execution entry point.
   */
  static create<
    TCreatedPrimaryAction extends TransactionAction,
    TCreatedRequestOptions = unknown,
    TCreatedRequest extends TransactionPlanRequest = TransactionPlanRequest,
    TCreatedSignatures = readonly RequirementSignature[],
  >(
    handler: TransactionPlanHandler<
      TCreatedPrimaryAction,
      TCreatedRequestOptions,
      TCreatedRequest,
      TCreatedSignatures
    >,
  ): TransactionPlan<
    TCreatedPrimaryAction,
    TCreatedRequestOptions,
    TCreatedRequest,
    TCreatedSignatures
  > {
    return new TransactionPlan(handler);
  }
}

/** Prepared transaction plan with resolved requests and app-facing helpers. */
export class PreparedTransactionPlan<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TSignatures = readonly RequirementSignature[],
> implements PreparedTransactionPlanShape
{
  private readonly buildPrimaryCall: TransactionPlanBuildPrimaryCall<
    TPrimaryAction,
    TSignatures
  >;

  /** Ordered signable requests to present to the user. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest[];

  /** Ordered viem-compatible calls. Includes the primary action call last when previewable. */
  readonly callRequests: readonly TransactionPlanCallRequest[];

  /** All signature requests and call requests in review order. */
  readonly steps: readonly TransactionPlanStep[];

  /**
   * Creates a prepared plan from resolved request steps.
   *
   * @param params - Build callback, resolved requests, and optional preview primary call.
   */
  constructor(params: {
    readonly buildPrimaryCall: TransactionPlanBuildPrimaryCall<
      TPrimaryAction,
      TSignatures
    >;
    readonly requestSteps: readonly (
      | TransactionPlanSignatureRequest
      | TransactionPlanCallRequest
    )[];
    readonly primaryCall?: TransactionPlanCallRequest<TPrimaryAction>;
  }) {
    this.buildPrimaryCall = params.buildPrimaryCall;
    this.signatureRequests = Object.freeze(
      params.requestSteps.filter(
        (request): request is TransactionPlanSignatureRequest =>
          request.kind === "signature",
      ),
    );
    const requirementCallRequests = params.requestSteps.filter(
      (request): request is TransactionPlanCallRequest =>
        request.kind === "call",
    );
    const primaryCall = params.primaryCall;
    this.callRequests = Object.freeze(
      primaryCall == null
        ? [...requirementCallRequests]
        : [...requirementCallRequests, primaryCall],
    );
    this.steps = Object.freeze(
      primaryCall == null
        ? [...params.requestSteps]
        : [...params.requestSteps, primaryCall],
    );
  }

  /** Number of signature requests plus call requests. */
  get requestCount(): number {
    return this.signatureRequests.length + this.callRequests.length;
  }

  /** Whether the plan requires at least one signature prompt. */
  get hasSignatureRequests(): boolean {
    return this.signatureRequests.length > 0;
  }

  /** Whether the plan has at least one viem-compatible call request available now. */
  get hasCallRequests(): boolean {
    return this.callRequests.length > 0;
  }

  /** High-level flow kind derived from the request mix. */
  get flowKind(): TransactionPlanFlowKind {
    const signatureRequests = this.signatureRequests.length;
    const preparationCalls = this.callRequests.filter(
      (request) => request.phase === "preparation",
    ).length;
    const primaryCalls = this.callRequests.filter(
      (request) => request.phase === "primary",
    ).length;

    if (signatureRequests > 0 && this.callRequests.length > 0) {
      return "mixed_requests";
    }
    if (signatureRequests > 0) return "signature_requests";
    if (preparationCalls === 0 && primaryCalls <= 1) return "single_call";
    return "call_requests";
  }

  /** Returns true when at least one request carries the requested intent type. */
  hasIntent<TType extends TransactionPlanIntent["type"]>(type: TType): boolean {
    return this.steps.some((request) => request.intent.type === type);
  }

  /** Returns all requests carrying the requested semantic intent type. */
  findIntent<TType extends TransactionPlanIntent["type"]>(
    type: TType,
  ): readonly TransactionPlanStepForIntent<TType>[] {
    return this.steps.filter(
      (request): request is TransactionPlanStepForIntent<TType> =>
        request.intent.type === type,
    );
  }

  /** Signs every signature request sequentially and returns the produced signatures. */
  async signAll(
    client: WalletClient,
    userAddress: Address,
  ): Promise<readonly RequirementSignature[]> {
    const signatures: RequirementSignature[] = [];
    for (const request of this.signatureRequests) {
      signatures.push(await request.sign(client, userAddress));
    }
    return Object.freeze(signatures);
  }

  /** Builds an executable transaction plan from already-collected signatures. */
  build(signatures?: TSignatures): ExecutableTransactionPlan {
    const expected = this.signatureRequests.length;
    const received =
      signatures == null
        ? 0
        : Array.isArray(signatures)
          ? signatures.length
          : 1;
    if (received < expected) {
      throw new MissingTransactionPlanSignaturesError(expected, received);
    }
    const requirementCallRequests = this.callRequests.filter(
      (request) => request.phase === "preparation",
    );
    const primaryTx = this.buildPrimaryCall(signatures);
    const primaryCall = {
      kind: "call",
      id: "primary",
      phase: "primary",
      tx: primaryTx,
      action: primaryTx.action,
      intent: { type: "primaryTransaction", actionType: primaryTx.action.type },
      call: { to: primaryTx.to, value: primaryTx.value, data: primaryTx.data },
    } satisfies TransactionPlanCallRequest<TPrimaryAction>;
    return new ExecutableTransactionPlan({
      signatureRequests: Object.freeze([...this.signatureRequests]),
      callRequests: Object.freeze([...requirementCallRequests, primaryCall]),
    });
  }
}

/** Executable transaction plan built from a PreparedTransactionPlan after signature collection. */
export class ExecutableTransactionPlan
  implements ExecutableTransactionPlanShape
{
  /** Ordered signable requests used to produce the signatures passed to `PreparedTransactionPlan.build(...)`. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest[];

  /** Ordered viem-compatible calls to submit, with the primary action call last. */
  readonly callRequests: readonly TransactionPlanCallRequest[];

  /**
   * Creates an executable plan from built transaction requests.
   *
   * @param params - Executable plan shape.
   */
  constructor(params: ExecutableTransactionPlanShape) {
    this.signatureRequests = Object.freeze([...params.signatureRequests]);
    this.callRequests = Object.freeze([...params.callRequests]);
  }

  /** Ordered viem-compatible calls for transaction submission. */
  get viemCalls(): readonly TransactionPlanViemCall[] {
    return this.callRequests.map((request) => request.call);
  }
}
