import { type Address, type Client, erc20Abi } from "viem";
import { readContract } from "viem/actions";
import { getRequirementsApproval } from "../actions/requirements/getRequirementsApproval.js";
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
  requirement: Requirement<Erc2612RequirementSignature>,
  id: string,
): SignatureRequest {
  const { nonce, ...args } = requirement.action.args;
  if (nonce === undefined)
    throw new UnexpectedRequirementSignatureError(requirement.action.type);
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
 * @param params - Step ID, chain and account selected by the preparer.
 * @returns The approval recipe labeled for token spending.
 */
export function buildApprovalStep(
  requirement: Readonly<Transaction<ERC20ApprovalAction>>,
  {
    id,
    chainId,
    account,
  }: {
    readonly id: string;
    readonly chainId: number;
    readonly account: Address;
  },
): Step<Extract<Action, { type: "erc20Approval" }>> {
  return {
    id,
    label: "Approve token spending",
    action: {
      type: "erc20Approval",
      inputs: {
        token: requirement.to,
        ...requirement.action.args,
        chainId,
        account,
      },
    },
  };
}

/** @internal Token pull prerequisites: direct approvals or an ERC-2612 permit. */
type TokenRequirement =
  | Readonly<Transaction<ERC20ApprovalAction>>
  | Requirement<Erc2612RequirementSignature>;

interface TokenRequirementsParams {
  readonly token: Address;
  readonly spender: Address;
  readonly amount: bigint;
  readonly owner: Address;
  readonly chainId: number;
  readonly deadline: bigint;
  readonly now: bigint;
  readonly supportSignature: boolean;
  readonly deployless: boolean | undefined;
}

/**
 * @internal Resolves the token prerequisite of a VaultBundlesV1 pull without Permit2. A sufficient
 * direct allowance yields nothing. Otherwise signature support prefers an ERC-2612 permit when
 * available and falls back to a direct unlimited approval. Without signature support, always approve.
 */
export async function getTokenRequirements(
  client: Client,
  params: TokenRequirementsParams,
): Promise<readonly TokenRequirement[]> {
  // The allowance is trusted as returned by the RPC. See THREAT_MODEL.md, RPC.
  const allowance = await readContract(client, {
    abi: erc20Abi,
    address: params.token,
    functionName: "allowance",
    args: [params.owner, params.spender],
  });
  if (allowance >= params.amount) return [];
  if (params.supportSignature) {
    const permit = await getTokenPermit(client, {
      ...params,
      supportDeployless: params.deployless,
    });
    if (permit !== undefined) return [permit];
  }
  return getRequirementsApproval({
    address: params.token,
    chainId: params.chainId,
    args: { spendAmount: params.amount, spender: params.spender },
    allowances: allowance,
  });
}
