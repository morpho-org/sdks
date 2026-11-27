import { type Address, type Client, erc20Abi } from "viem";
import { readContract } from "viem/actions";
import {
  capTokenApproval,
  getTokenApprovalAmounts,
} from "../helpers/tokenApproval.js";
import { UnexpectedRequirementSignatureError } from "../types/error.js";
import type {
  ERC20ApprovalAction,
  Erc2612RequirementSignature,
  Requirement,
  Transaction,
} from "../types/index.js";
import { getTokenPermit } from "./getTokenPermit.js";
import type { Action, SignatureRequest, Step } from "./types.js";

/**
 * @internal Converts an ERC-2612 requirement into a plan-local signature request.
 * @param requirement - Permit requirement carrying its typed data and encoding arguments.
 * @param id - Signature request ID selected by the preparer.
 * @returns The unsigned request with a concrete nonce.
 * @throws {UnexpectedRequirementSignatureError} If the permit requirement has no nonce.
 */
export function buildPermitSignatureRequest(
  requirement: Pick<Requirement<Erc2612RequirementSignature>, "action">,
  id: string,
): Extract<SignatureRequest, { kind: "permit" }> {
  const { nonce, ...args } = requirement.action.args;
  if (nonce === undefined) {
    throw new UnexpectedRequirementSignatureError(requirement.action.type);
  }
  return {
    id,
    kind: "permit",
    typedData: requirement.action.typedData,
    args: { ...args, nonce },
  };
}

/**
 * @internal Converts an approval transaction into a step with prepared chain/account inputs.
 * @param requirement - Direct token approval prerequisite.
 * @param params - Step ID, chain, account and token denomination selected by the preparer.
 * @returns The approval recipe labeled for token spending.
 */
export function buildApprovalStep(
  requirement: Readonly<Transaction<ERC20ApprovalAction>>,
  {
    id,
    chainId,
    account,
    denomination,
  }: {
    readonly id: string;
    readonly chainId: number;
    readonly account: Address;
    readonly denomination: "assets" | "shares";
  },
): Step<Extract<Action, { type: "erc20Approval" }>> {
  return {
    id,
    label: "Approve token spending",
    action: {
      type: "erc20Approval",
      inputs: {
        token: requirement.to,
        spender: requirement.action.args.spender,
        ...(denomination === "assets"
          ? { assets: requirement.action.args.amount }
          : { shares: requirement.action.args.amount }),
        chainId,
        account,
      },
    },
  };
}

type TokenRequirementsParams = {
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly owner: Address;
  readonly chainId: number;
  readonly approvalId: (index: number) => string;
} & (
  | { readonly supportSignature?: false }
  | {
      readonly supportSignature: boolean;
      readonly deadline: bigint;
      readonly now: bigint;
      readonly deployless: boolean | undefined;
      readonly permitId: string;
    }
);

/**
 * @internal Resolves the token prerequisite of a bundles pull without Permit2. A sufficient
 * direct allowance yields nothing. Otherwise signature support prefers an ERC-2612 permit when
 * available and falls back to a direct unlimited approval. Without signature support, always approve.
 */
export async function getTokenRequirements(
  client: Client,
  params: TokenRequirementsParams,
): Promise<{
  readonly approvals: Step<Extract<Action, { type: "erc20Approval" }>>[];
  readonly permit?: Extract<SignatureRequest, { kind: "permit" }>;
}> {
  const { token, spender, amount, owner, chainId, approvalId } = params;
  // The allowance is trusted as returned by the RPC. See THREAT_MODEL.md, RPC.
  const allowance = await readContract(client, {
    abi: erc20Abi,
    address: token,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) {
    return { approvals: [] };
  }
  if (params.supportSignature) {
    const permit = await getTokenPermit(client, {
      ...params,
      id: params.permitId,
      supportDeployless: params.deployless,
    });
    if (permit !== undefined) {
      return { approvals: [], permit };
    }
  }
  const amounts = getTokenApprovalAmounts({
    token,
    chainId,
    allowance,
    spendAmount: amount,
  });
  return {
    approvals: amounts.map((approvalAmount, index) => ({
      id: approvalId(index),
      label: "Approve token spending",
      action: {
        type: "erc20Approval",
        inputs: {
          token,
          spender,
          assets: capTokenApproval({ token, chainId, amount: approvalAmount }),
          chainId,
          account: owner,
        },
      },
    })),
  };
}
