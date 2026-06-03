import type { Address } from "viem";

import type { BigIntish } from "../types.js";

/**
 * Approval requirement descriptor.
 *
 * @example
 * ```ts
 * import type { MidnightApprovalRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = {} as MidnightApprovalRequirement;
 * console.log(requirement.type);
 * ```
 */
export interface MidnightApprovalRequirement {
  /** Requirement discriminator. */
  readonly type: "approval";
  /** Token that must be approved. */
  readonly token: Address;
  /** Account granting approval. */
  readonly owner: Address;
  /** Spender requiring approval. */
  readonly spender: Address;
  /** Required allowance amount. */
  readonly amount: bigint;
  /** Current allowance amount. */
  readonly currentAllowance: bigint;
}

/**
 * Parameters for {@link planApprovalRequirement}.
 *
 * @example
 * ```ts
 * import type { PlanApprovalRequirementParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as PlanApprovalRequirementParams;
 * console.log(params.requiredAmount);
 * ```
 */
export interface PlanApprovalRequirementParams {
  /** Token that must be approved. */
  readonly token: Address | string;
  /** Account granting approval. */
  readonly owner: Address | string;
  /** Spender requiring approval. */
  readonly spender: Address | string;
  /** Required allowance amount. */
  readonly requiredAmount: BigIntish;
  /** Current allowance amount. */
  readonly currentAllowance: BigIntish;
}

/**
 * Plans an ERC-20 approval requirement.
 *
 * @param params - Approval planning inputs.
 * @returns Approval requirement, or `undefined` when current allowance is enough.
 * @example
 * ```ts
 * import { planApprovalRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = planApprovalRequirement({
 *   token: "0x0000000000000000000000000000000000000001",
 *   owner: "0x0000000000000000000000000000000000000002",
 *   spender: "0x0000000000000000000000000000000000000003",
 *   requiredAmount: 100n,
 *   currentAllowance: 0n,
 * });
 * console.log(requirement?.type);
 * ```
 */
export function planApprovalRequirement(
  params: PlanApprovalRequirementParams,
): MidnightApprovalRequirement | undefined {
  const requiredAmount = BigInt(params.requiredAmount);
  const currentAllowance = BigInt(params.currentAllowance);
  if (requiredAmount === 0n || currentAllowance >= requiredAmount) return;

  return {
    type: "approval",
    token: params.token as Address,
    owner: params.owner as Address,
    spender: params.spender as Address,
    amount: requiredAmount,
    currentAllowance,
  };
}
