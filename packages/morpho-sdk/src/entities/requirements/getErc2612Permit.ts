import type { Client } from "viem";
import { encodeErc20Permit } from "../../actions/requirements/encode/encodeErc20Permit.js";
import { readErc2612Permit } from "../../reads/readErc2612Permit.js";

/** @internal Resolves an eligible ERC-2612 permit for the entity signing flow. */
export async function getErc2612Permit(
  viemClient: Client,
  params: Omit<Parameters<typeof encodeErc20Permit>[1], "nonce">,
) {
  return readErc2612Permit(viemClient, {
    token: params.token,
    owner: params.owner,
    resolve: async (nonce) => {
      const result = await encodeErc20Permit(viemClient, { ...params, nonce });
      return { domain: result.action.typedData.domain, result };
    },
  });
}
