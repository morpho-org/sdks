import { getChainAddresses } from "@morpho-org/blue-sdk";
import { fetchToken, getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { isDefined } from "@morpho-org/morpho-ts";
import { type Address, type Client, isAddressEqual } from "viem";
import {
  readErc2612Permit,
  validateErc2612Permit,
} from "../reads/readErc2612Permit.js";
import type { SignatureRequest } from "./types.js";

/**
 * @internal Prepares an unsigned ERC-2612 request when the nonce and domain are usable.
 * DAI's nonstandard permit is excluded; failed contract probes fall back to approval, but
 * transport failures propagate.
 */
export async function getTokenPermit(
  client: Client,
  params: {
    readonly id: string;
    readonly token: Address;
    readonly spender: Address;
    readonly amount: bigint;
    readonly owner: Address;
    readonly chainId: number;
    readonly deadline: bigint;
    readonly now: bigint;
    readonly supportDeployless: boolean | undefined;
  },
): Promise<Extract<SignatureRequest, { kind: "permit" }> | undefined> {
  const { id, token, spender, amount, owner, chainId, supportDeployless } =
    params;
  const { dai } = getChainAddresses(chainId);
  if (isDefined(dai) && isAddressEqual(token, dai)) {
    return undefined;
  }

  return readErc2612Permit(client, {
    token,
    owner,
    resolve: async (nonce) => {
      const deadline = await validateErc2612Permit(client, params);

      const typedData = getPermitTypedData(
        {
          erc20: await fetchToken(token, client, {
            deployless: supportDeployless,
          }),
          owner,
          spender,
          allowance: amount,
          nonce,
          deadline,
        },
        chainId,
      );
      const domain = { ...typedData.domain };
      return {
        domain,
        result: {
          id,
          kind: "permit" as const,
          typedData: { ...typedData, domain },
          args: { spender, amount, deadline, nonce },
        },
      };
    },
  });
}
