import type { Address } from "viem";

import {
  fetchErc20Allowance,
  fetchIsAuthorized,
  type MidnightFetchParams,
} from "../fetch/index.js";
import type { BigIntish } from "../types.js";

/**
 * Approval requirement inputs fetched from chain state.
 *
 * @example
 * ```ts
 * import type { ApprovalRequirementInputs } from "@morpho-org/midnight-sdk";
 *
 * const inputs = {} as ApprovalRequirementInputs;
 * console.log(inputs.currentAllowance);
 * ```
 */
export interface ApprovalRequirementInputs {
  /** Current allowance. */
  readonly currentAllowance: bigint;
}

/**
 * Authorization requirement inputs fetched from chain state.
 *
 * @example
 * ```ts
 * import type { AuthorizationRequirementInputs } from "@morpho-org/midnight-sdk";
 *
 * const inputs = {} as AuthorizationRequirementInputs;
 * console.log(inputs.isAuthorized);
 * ```
 */
export interface AuthorizationRequirementInputs {
  /** Current authorization state. */
  readonly isAuthorized: boolean;
}

/**
 * Fetches current allowance for approval planning.
 *
 * @param params - Fetch parameters.
 * @returns Approval planning inputs.
 * @example
 * ```ts
 * import { fetchApprovalRequirementInputs } from "@morpho-org/midnight-sdk";
 *
 * const inputs = await fetchApprovalRequirementInputs({} as never);
 * console.log(inputs.currentAllowance);
 * ```
 */
export async function fetchApprovalRequirementInputs(params: {
  readonly client: MidnightFetchParams["client"];
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly requiredAmount: BigIntish;
}): Promise<ApprovalRequirementInputs> {
  return {
    currentAllowance: await fetchErc20Allowance(params),
  };
}

/**
 * Fetches current Midnight authorization for requirement planning.
 *
 * @param params - Fetch parameters.
 * @returns Authorization planning inputs.
 * @example
 * ```ts
 * import { fetchAuthorizationRequirementInputs } from "@morpho-org/midnight-sdk";
 *
 * const inputs = await fetchAuthorizationRequirementInputs({} as never);
 * console.log(inputs.isAuthorized);
 * ```
 */
export async function fetchAuthorizationRequirementInputs(
  params: MidnightFetchParams & {
    readonly authorizer: Address;
    readonly authorized: Address;
  },
): Promise<AuthorizationRequirementInputs> {
  return {
    isAuthorized: await fetchIsAuthorized(params),
  };
}
