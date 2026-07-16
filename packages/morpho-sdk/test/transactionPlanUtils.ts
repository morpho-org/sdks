import type {
  TransactionPlan,
  TransactionPlanHandler,
  TransactionPlanRequest,
} from "../src/transactionPlan/index.js";
import type {
  RequirementSignature,
  Transaction,
  TransactionAction,
} from "../src/types/index.js";

function getTestHandler<
  TAction extends TransactionAction,
  TOptions,
  TRequest extends TransactionPlanRequest,
  TSignatures,
>(
  plan: TransactionPlan<TAction, TOptions, TRequest, TSignatures>,
): TransactionPlanHandler<TAction, TOptions, TRequest, TSignatures> {
  return (
    plan as unknown as {
      readonly handler: TransactionPlanHandler<
        TAction,
        TOptions,
        TRequest,
        TSignatures
      >;
    }
  ).handler;
}

export async function buildPlanTx<
  TAction extends TransactionAction,
  TOptions,
  TRequest extends TransactionPlanRequest,
  TSignatures,
>(
  plan: TransactionPlan<TAction, TOptions, TRequest, TSignatures>,
  signatures?: TSignatures,
): Promise<Readonly<Transaction<TAction>>> {
  return getTestHandler(plan).buildPrimaryCall(signatures);
}

export async function getPlanRequests<
  TAction extends TransactionAction,
  TOptions,
  TRequest extends TransactionPlanRequest,
  TSignatures,
>(
  plan: TransactionPlan<TAction, TOptions, TRequest, TSignatures>,
  requestOptions?: TOptions,
): Promise<readonly TRequest[]>;
export async function getPlanRequests(
  plan: { readonly prepare: unknown },
  requestOptions?: unknown,
): Promise<readonly TransactionPlanRequest[]>;
export async function getPlanRequests(
  plan: unknown,
  requestOptions?: unknown,
): Promise<readonly TransactionPlanRequest[]> {
  const getRequirementRequests = getTestHandler(
    plan as TransactionPlan<
      TransactionAction,
      unknown,
      TransactionPlanRequest,
      readonly RequirementSignature[]
    >,
  ).getRequirementRequests;
  return getRequirementRequests ? getRequirementRequests(requestOptions) : [];
}

export async function buildPlanCalls<
  TAction extends TransactionAction,
  TOptions,
  TRequest extends TransactionPlanRequest,
  TSignatures,
>(
  plan: TransactionPlan<TAction, TOptions, TRequest, TSignatures>,
  signatures?: TSignatures,
) {
  return (await plan.prepare()).build(signatures).callRequests;
}

export function asSignatureArray(
  signature: RequirementSignature,
): readonly RequirementSignature[] {
  return [signature];
}
