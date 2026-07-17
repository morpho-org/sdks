import {
  isRequirementApproval,
  isRequirementBlueAuthorization,
  type RequirementSignature,
  type SignatureRequirement,
  type Transaction,
  type TransactionAction,
  type TransactionRequirement,
} from "../types/action.js";
import { MissingTransactionPlanSignaturesError } from "../types/error.js";
import type {
  ExecutableTransactionPlanShape,
  PreparedTransactionPlanShape,
  TransactionPlanBatchCall,
  TransactionPlanBuildPrimaryTransaction,
  TransactionPlanContractTransactionIntent,
  TransactionPlanFlowKind,
  TransactionPlanHandler,
  TransactionPlanIntent,
  TransactionPlanMidnightOfferRootIntent,
  TransactionPlanOperatorAuthorizationIntent,
  TransactionPlanPreparedStep,
  TransactionPlanPrepareOptions,
  TransactionPlanRequest,
  TransactionPlanSignatureRequest,
  TransactionPlanStep,
  TransactionPlanStepForIntent,
  TransactionPlanTokenApprovalIntent,
  TransactionPlanTransactionStep,
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
 * chosen intent: it resolves the signature requests and/or viem-compatible transaction steps that the
 * primary action depends on, while avoiding extra reads when no approval or operator authorization
 * check is needed.
 *
 * @example Vault app review branching and labels
 * ```ts
 * const plan = vault.deposit({ amount, userAddress, vaultData });
 * const prepared = await plan.prepare({ requestOptions: { useSimplePermit } });
 *
 * const txFlowType = prepared.flowKind === "single_transaction"
 *   ? "simple"
 *   : prepared.hasSignatureRequests
 *     ? "signature_required"
 *     : "bundled";
 *
 * const labels = prepared.steps.map((step) => {
 *   switch (step.intent.type) {
 *     case "tokenApproval":
 *       return step.intent.method === "tx"
 *         ? `Approve ${step.intent.amount}`
 *         : `Sign ${step.intent.method}`;
 *     case "operatorAuthorization":
 *       return "Authorize operator";
 *     case "contractTransaction":
 *       return `Review ${step.intent.actionType}`;
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
 * const signatures = [];
 * for (const request of prepared.signatureRequests) {
 *   signatures.push(await request.sign(walletClient, accountAddress));
 * }
 * const executable = prepared.build(signatures);
 * const transactionSteps = executable.transactionSteps.map((step) => ({
 *   label: step.intent.type === "primaryTransaction" ? "Submit transaction" : "Approve token",
 *   transaction: step.transaction,
 * }));
 * const calls = executable.calls;
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
   * @example
   * ```ts
   * const plan = new TransactionPlan({
   *   getRequirementRequests: async () => requests,
   *   buildPrimaryTransaction: () => transaction,
   * });
   * ```
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

  /**
   * Resolves the prerequisite requests and semantic review metadata for this plan.
   *
   * @param options - Optional request-discovery controls forwarded to the entity handler.
   * @returns A prepared plan whose request types and primary action match this plan.
   * @example
   * ```ts
   * const prepared = await vault.deposit(params).prepare({
   *   requestOptions: { useSimplePermit: true },
   * });
   * // prepared.steps contains the typed prerequisites followed by the primary step preview.
   * ```
   */
  async prepare(
    options?: TransactionPlanPrepareOptions<TRequestOptions>,
  ): Promise<PreparedTransactionPlan<TPrimaryAction, TRequest, TSignatures>> {
    const requests = this.handler.getRequirementRequests
      ? await this.handler.getRequirementRequests(options?.requestOptions)
      : [];
    const requirementSteps = requests.map(
      (request, index): TransactionPlanPreparedStep<TRequest> => {
        const id = `request-${index}`;
        if (isRequirementApproval(request)) {
          const tx = request as Extract<TRequest, TransactionRequirement>;
          return {
            kind: "transaction",
            id,
            phase: "preparation",
            transaction: tx,
            action: tx.action,
            intent: {
              type: "tokenApproval",
              method: "tx",
              token: request.to,
              spender: request.action.args.spender,
              amount: request.action.args.amount,
            },
          } satisfies TransactionPlanPreparedStep<TRequest>;
        }
        if (isRequirementBlueAuthorization(request)) {
          const tx = request as Extract<TRequest, TransactionRequirement>;
          return {
            kind: "transaction",
            id,
            phase: "preparation",
            transaction: tx,
            action: tx.action,
            intent: {
              type: "operatorAuthorization",
              method: "tx",
              operator: request.action.args.authorized,
              isAuthorized: request.action.args.isAuthorized,
            },
          } satisfies TransactionPlanPreparedStep<TRequest>;
        }
        if (
          typeof request === "object" &&
          request !== null &&
          "to" in request &&
          "value" in request &&
          "data" in request &&
          "action" in request
        ) {
          const tx = request as Extract<TRequest, TransactionRequirement>;
          const intent:
            | TransactionPlanOperatorAuthorizationIntent
            | TransactionPlanContractTransactionIntent<
                TransactionRequirement["action"]
              > =
            tx.action.type === "midnightAuthorization"
              ? {
                  type: "operatorAuthorization",
                  method: "tx",
                  operator: tx.action.args.authorized,
                  isAuthorized: tx.action.args.isAuthorized,
                  owner: tx.action.args.onBehalf,
                }
              : { type: "contractTransaction", actionType: tx.action.type };
          return {
            kind: "transaction",
            id,
            phase: "preparation",
            transaction: tx,
            action: tx.action,
            intent,
          } satisfies TransactionPlanPreparedStep<TRequest>;
        }

        const signatureRequest = request as Extract<
          TRequest,
          SignatureRequirement
        >;
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
          sign: signatureRequest.sign,
        } satisfies TransactionPlanPreparedStep<TRequest>;
      },
    );
    const primaryTx =
      this.handler.previewPrimaryTransaction === false
        ? undefined
        : (
            this.handler.previewPrimaryTransaction ??
            (() => this.handler.buildPrimaryTransaction())
          )();
    const primaryStep =
      primaryTx == null
        ? undefined
        : ({
            kind: "transaction",
            id: "primary",
            phase: "primary",
            transaction: primaryTx,
            action: primaryTx.action,
            intent: {
              type: "primaryTransaction",
              actionType: primaryTx.action.type,
            },
          } satisfies TransactionPlanTransactionStep<
            TPrimaryAction,
            Readonly<Transaction<TPrimaryAction>>,
            "primary"
          >);

    return new PreparedTransactionPlan<TPrimaryAction, TRequest, TSignatures>({
      buildPrimaryTransaction: this.handler.buildPrimaryTransaction,
      requirementSteps,
      primaryStep,
    });
  }

  /**
   * Creates a lazy TransactionPlan from SDK handler callbacks.
   *
   * @param handler - SDK handler callbacks used by `prepare()` and `PreparedTransactionPlan.build(...)`.
   * @returns A TransactionPlan exposing `prepare()` as the public execution entry point.
   * @example
   * ```ts
   * const plan = TransactionPlan.create({
   *   getRequirementRequests: async () => requests,
   *   buildPrimaryTransaction: () => transaction,
   * });
   * ```
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

/**
 * Prepared transaction plan with resolved requests and app-facing helpers.
 *
 * @example
 * ```ts
 * const prepared = await plan.prepare();
 * const approvals = prepared.findIntent("tokenApproval");
 * ```
 */
export class PreparedTransactionPlan<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
  TSignatures = readonly RequirementSignature[],
> implements PreparedTransactionPlanShape<TPrimaryAction, TRequest>
{
  private readonly buildPrimaryTransaction: TransactionPlanBuildPrimaryTransaction<
    TPrimaryAction,
    TSignatures
  >;

  private readonly rawRequirements: readonly TRequest[];

  private readonly previewPrimaryStep?: TransactionPlanTransactionStep<
    TPrimaryAction,
    Readonly<Transaction<TPrimaryAction>>,
    "primary"
  >;

  /** Ordered signable requests to present to the user. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest<
    Extract<TRequest, SignatureRequirement>
  >[];

  /** Ordered transaction steps. Includes the primary action step last when previewable. */
  readonly transactionSteps: PreparedTransactionPlanShape<
    TPrimaryAction,
    TRequest
  >["transactionSteps"];

  /** All signature requests and transaction steps in review order. */
  readonly steps: readonly TransactionPlanStep<TPrimaryAction, TRequest>[];

  /**
   * Creates a prepared plan from resolved request steps.
   *
   * @param params - Build callback, resolved requirements, and optional preview primary step.
   * @example
   * ```ts
   * const prepared = new PreparedTransactionPlan({
   *   buildPrimaryTransaction: () => transaction,
   *   requirementSteps: [],
   *   primaryStep,
   * });
   * ```
   */
  constructor(params: {
    readonly buildPrimaryTransaction: TransactionPlanBuildPrimaryTransaction<
      TPrimaryAction,
      TSignatures
    >;
    readonly requirementSteps: readonly TransactionPlanPreparedStep<TRequest>[];
    readonly primaryStep?: TransactionPlanTransactionStep<
      TPrimaryAction,
      Readonly<Transaction<TPrimaryAction>>,
      "primary"
    >;
  }) {
    this.buildPrimaryTransaction = params.buildPrimaryTransaction;
    this.rawRequirements = Object.freeze(
      params.requirementSteps.map(
        (step): TRequest =>
          step.kind === "transaction" ? step.transaction : step.request,
      ),
    );
    this.previewPrimaryStep = params.primaryStep;
    this.signatureRequests = Object.freeze(
      params.requirementSteps.filter(
        (
          step,
        ): step is TransactionPlanSignatureRequest<
          Extract<TRequest, SignatureRequirement>
        > => step.kind === "signature",
      ),
    );
    const requirementTransactionSteps = params.requirementSteps.filter(
      (
        step,
      ): step is Extract<
        TransactionPlanPreparedStep<TRequest>,
        { readonly kind: "transaction" }
      > => step.kind === "transaction",
    );
    const primaryStep = params.primaryStep;
    this.transactionSteps = Object.freeze(
      primaryStep == null
        ? [...requirementTransactionSteps]
        : [...requirementTransactionSteps, primaryStep],
    );
    this.steps = Object.freeze(
      primaryStep == null
        ? [...params.requirementSteps]
        : [...params.requirementSteps, primaryStep],
    );
  }

  /**
   * Returns the raw prerequisite requirements in discovery order.
   *
   * @returns The original typed call and signature requirements returned by the plan handler.
   * @example
   * ```ts
   * const requirements = (await plan.prepare()).requirements;
   * ```
   */
  get requirements(): readonly TRequest[] {
    return this.rawRequirements;
  }

  /**
   * Returns the previewable primary step.
   *
   * @returns The primary transaction step, or `undefined` when signatures are required before encoding.
   * @example
   * ```ts
   * const primaryStep = (await plan.prepare()).primaryStep;
   * ```
   */
  get primaryStep(): PreparedTransactionPlanShape<
    TPrimaryAction,
    TRequest
  >["primaryStep"] {
    return this.previewPrimaryStep;
  }

  /**
   * Returns the previewable primary SDK transaction.
   *
   * @returns The primary transaction, or `undefined` when signatures are required before encoding.
   * @example
   * ```ts
   * const tx = (await plan.prepare()).primaryTransaction;
   * ```
   */
  get primaryTransaction(): Readonly<Transaction<TPrimaryAction>> | undefined {
    return this.previewPrimaryStep?.transaction;
  }

  /**
   * Converts the currently previewable transaction steps to viem-compatible calls.
   *
   * Signature-dependent primary transactions are omitted until `build(...)` returns an executable plan.
   *
   * @returns The currently previewable calls in execution order.
   * @example
   * ```ts
   * const calls = prepared.calls;
   * ```
   */
  get calls(): readonly TransactionPlanBatchCall[] {
    return this.transactionSteps.map(({ transaction }) => ({
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    }));
  }

  /**
   * Counts the signature requests and transaction steps currently exposed by the plan.
   *
   * @returns The total number of exposed requests.
   * @example
   * ```ts
   * console.log(prepared.stepCount);
   * ```
   */
  get stepCount(): number {
    return this.signatureRequests.length + this.transactionSteps.length;
  }

  /**
   * Reports whether the plan requires at least one signature prompt.
   *
   * @returns `true` when `signatureRequests` is non-empty.
   * @example
   * ```ts
   * if (prepared.hasSignatureRequests) showSignatureReview();
   * ```
   */
  get hasSignatureRequests(): boolean {
    return this.signatureRequests.length > 0;
  }

  /**
   * Reports whether the plan currently exposes a transaction step.
   *
   * @returns `true` when `transactionSteps` is non-empty.
   * @example
   * ```ts
   * if (prepared.hasTransactionSteps) showTransactionReview();
   * ```
   */
  get hasTransactionSteps(): boolean {
    return this.transactionSteps.length > 0;
  }

  /**
   * Classifies the plan from its current signature-request and transaction-step mix.
   *
   * @returns The high-level transaction-plan flow kind.
   * @example
   * ```ts
   * const reviewMode = prepared.flowKind;
   * ```
   */
  get flowKind(): TransactionPlanFlowKind {
    const signatureRequests = this.signatureRequests.length;
    const preparationSteps = this.transactionSteps.filter(
      (step) => step.phase === "preparation",
    ).length;
    const primarySteps = this.transactionSteps.filter(
      (step) => step.phase === "primary",
    ).length;

    if (signatureRequests > 0 && this.transactionSteps.length > 0) {
      return "mixed_steps";
    }
    if (signatureRequests > 0) return "signature_steps";
    if (preparationSteps === 0 && primarySteps <= 1)
      return "single_transaction";
    return "transaction_steps";
  }

  /**
   * Checks whether at least one step carries the requested semantic intent.
   *
   * @param type - Intent discriminator to search for.
   * @returns `true` when a matching step exists.
   * @example
   * ```ts
   * const needsApproval = prepared.hasIntent("tokenApproval");
   * ```
   */
  hasIntent<TType extends TransactionPlanIntent["type"]>(type: TType): boolean {
    return this.steps.some((step) => step.intent.type === type);
  }

  /**
   * Returns every step carrying the requested semantic intent.
   *
   * @param type - Intent discriminator used to narrow the returned steps.
   * @returns The matching typed steps in execution order.
   * @example
   * ```ts
   * const approvals = prepared.findIntent("tokenApproval");
   * ```
   */
  findIntent<TType extends TransactionPlanIntent["type"]>(
    type: TType,
  ): readonly TransactionPlanStepForIntent<TType, TPrimaryAction, TRequest>[] {
    return this.steps.filter(
      (
        step,
      ): step is TransactionPlanStepForIntent<
        TType,
        TPrimaryAction,
        TRequest
      > => step.intent.type === type,
    );
  }

  /**
   * Builds the executable transaction steps from signatures collected by the integrator.
   *
   * @param signatures - Signatures produced from `signatureRequests`, in request order.
   * @returns An executable plan that preserves the prerequisite and primary-action types.
   * @throws {MissingTransactionPlanSignaturesError} when fewer signatures are supplied than requested.
   * @example
   * ```ts
   * const signatures = [];
   * for (const request of prepared.signatureRequests) {
   *   signatures.push(await request.sign(walletClient, userAddress));
   * }
   * const executable = prepared.build(signatures);
   * ```
   */
  build(
    signatures?: TSignatures,
  ): ExecutableTransactionPlan<TPrimaryAction, TRequest> {
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
    const requirementTransactionSteps = this.transactionSteps.filter(
      (step) => step.phase === "preparation",
    );
    const primaryTx = this.buildPrimaryTransaction(signatures);
    const primaryStep = {
      kind: "transaction",
      id: "primary",
      phase: "primary",
      transaction: primaryTx,
      action: primaryTx.action,
      intent: { type: "primaryTransaction", actionType: primaryTx.action.type },
    } satisfies TransactionPlanTransactionStep<
      TPrimaryAction,
      Readonly<Transaction<TPrimaryAction>>,
      "primary"
    >;
    return new ExecutableTransactionPlan<TPrimaryAction, TRequest>({
      primaryStep,
      signatureRequests: Object.freeze([...this.signatureRequests]),
      transactionSteps: Object.freeze([
        ...requirementTransactionSteps,
        primaryStep,
      ]),
    });
  }
}

/**
 * Executable transaction plan built after signature collection.
 *
 * @example
 * ```ts
 * const executable = prepared.build(signatures);
 * for (const step of executable.transactionSteps) {
 *   await walletClient.sendTransaction(step.transaction);
 * }
 * await walletClient.sendCalls({ calls: executable.calls });
 * ```
 */
export class ExecutableTransactionPlan<
  TPrimaryAction extends TransactionAction = TransactionAction,
  TRequest extends TransactionPlanRequest = TransactionPlanRequest,
> implements ExecutableTransactionPlanShape<TPrimaryAction, TRequest>
{
  private readonly builtPrimaryStep: TransactionPlanTransactionStep<
    TPrimaryAction,
    Readonly<Transaction<TPrimaryAction>>,
    "primary"
  >;

  /** Ordered signable requests used to produce the signatures passed to `PreparedTransactionPlan.build(...)`. */
  readonly signatureRequests: readonly TransactionPlanSignatureRequest<
    Extract<TRequest, SignatureRequirement>
  >[];

  /** Ordered transaction steps to submit, with the primary action step last. */
  readonly transactionSteps: ExecutableTransactionPlanShape<
    TPrimaryAction,
    TRequest
  >["transactionSteps"];

  /**
   * Creates an executable plan from built transaction requests.
   *
   * @param params - Executable plan shape.
   * @example
   * ```ts
   * const executable = new ExecutableTransactionPlan({
   *   primaryStep,
   *   signatureRequests: [],
   *   transactionSteps,
   * });
   * ```
   */
  constructor(
    params: Omit<
      ExecutableTransactionPlanShape<TPrimaryAction, TRequest>,
      "primaryTransaction" | "calls"
    >,
  ) {
    this.builtPrimaryStep = params.primaryStep;
    this.signatureRequests = Object.freeze([...params.signatureRequests]);
    this.transactionSteps = Object.freeze([...params.transactionSteps]);
  }

  /**
   * Returns the built primary step.
   *
   * @returns The final primary transaction step after signatures are applied.
   * @example
   * ```ts
   * const primaryStep = executable.primaryStep;
   * ```
   */
  get primaryStep(): TransactionPlanTransactionStep<
    TPrimaryAction,
    Readonly<Transaction<TPrimaryAction>>,
    "primary"
  > {
    return this.builtPrimaryStep;
  }

  /**
   * Returns the built primary SDK transaction.
   *
   * @returns The final primary transaction after signatures are applied.
   * @example
   * ```ts
   * const tx = executable.primaryTransaction;
   * ```
   */
  get primaryTransaction(): Readonly<Transaction<TPrimaryAction>> {
    return this.builtPrimaryStep.transaction;
  }

  /**
   * Extracts the ordered viem-compatible calls for transaction submission.
   *
   * @returns The raw calls in execution order.
   * @example
   * ```ts
   * const calls = executable.calls;
   * ```
   */
  get calls(): readonly TransactionPlanBatchCall[] {
    return this.transactionSteps.map(({ transaction }) => ({
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    }));
  }
}
