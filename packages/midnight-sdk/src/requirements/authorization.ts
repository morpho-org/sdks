import type { Address } from "viem";

import {
  MidnightCalls,
  type SetIsAuthorizedCallParams,
} from "../calls/index.js";
import { normalizeAddress } from "../internal.js";
import type { MidnightCall } from "../types.js";

/**
 * Authorization requirement descriptor.
 *
 * @example
 * ```ts
 * import type { MidnightAuthorizationRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = {} as MidnightAuthorizationRequirement;
 * console.log(requirement.authorized);
 * ```
 */
export interface MidnightAuthorizationRequirement {
  /** Requirement discriminator. */
  readonly type: "authorization";
  /** Account granting authorization. */
  readonly authorizer: Address;
  /** Account or contract being authorized. */
  readonly authorized: Address;
  /** Current authorization state. */
  readonly isAuthorized: boolean;
  /** Call that grants authorization. */
  readonly call: MidnightCall;
}

/**
 * Parameters for {@link planAuthorizationRequirement}.
 *
 * @example
 * ```ts
 * import type { PlanAuthorizationRequirementParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as PlanAuthorizationRequirementParams;
 * console.log(params.isAuthorized);
 * ```
 */
export interface PlanAuthorizationRequirementParams {
  /** Core Midnight contract address. */
  readonly midnight: Address | string;
  /** Account granting authorization. */
  readonly authorizer: Address | string;
  /** Account or contract being authorized. */
  readonly authorized: Address | string;
  /** Current authorization state. */
  readonly isAuthorized: boolean;
}

/**
 * Plans a Midnight authorization requirement.
 *
 * @param params - Authorization planning inputs.
 * @returns Authorization requirement, or `undefined` when already authorized.
 * @example
 * ```ts
 * import { planAuthorizationRequirement } from "@morpho-org/midnight-sdk";
 *
 * const requirement = planAuthorizationRequirement({
 *   midnight: "0x0000000000000000000000000000000000000001",
 *   authorizer: "0x0000000000000000000000000000000000000002",
 *   authorized: "0x0000000000000000000000000000000000000003",
 *   isAuthorized: false,
 * });
 * console.log(requirement?.call.to);
 * ```
 */
export function planAuthorizationRequirement(
  params: PlanAuthorizationRequirementParams,
): MidnightAuthorizationRequirement | undefined {
  if (params.isAuthorized) return;

  const callParams: SetIsAuthorizedCallParams = {
    midnight: params.midnight,
    authorized: params.authorized,
    newIsAuthorized: true,
    onBehalf: params.authorizer,
  };

  return {
    type: "authorization",
    authorizer: normalizeAddress(params.authorizer, "authorizer"),
    authorized: normalizeAddress(params.authorized, "authorized"),
    isAuthorized: false,
    call: MidnightCalls.setIsAuthorized(callParams),
  };
}
