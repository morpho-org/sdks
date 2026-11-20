import { getChainAddresses } from "@morpho-org/blue-sdk";
import { isDefined } from "@morpho-org/morpho-ts";
import { type Client, isAddressEqual } from "viem";
import type { GetBundlesTokenRequirementsParams } from "../entities/requirements/getBundlesTokenRequirements.js";
import { getErc2612Permit } from "../entities/requirements/getErc2612Permit.js";
import type {
  Erc2612RequirementSignature,
  Requirement,
} from "../types/index.js";

/**
 * @internal Builds an ERC-2612 permit requirement, or returns undefined when the token has no
 * usable permit: DAI's non-standard permit, a reverting or undecodable `nonces()`, or no known
 * compatible permit domain and matching DOMAIN_SEPARATOR. Transport failures propagate.
 */
export async function getTokenPermit(
  client: Client,
  params: Pick<
    GetBundlesTokenRequirementsParams,
    | "token"
    | "spender"
    | "amount"
    | "owner"
    | "chainId"
    | "deadline"
    | "supportDeployless"
  > & {
    readonly now: bigint;
  },
): Promise<Requirement<Erc2612RequirementSignature> | undefined> {
  const { dai } = getChainAddresses(params.chainId);
  if (isDefined(dai) && isAddressEqual(params.token, dai)) {
    return undefined;
  }
  return getErc2612Permit(client, params);
}
