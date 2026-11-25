import type { Client } from "viem";
import type { ChainCheck } from "../../actions/requirements/chainCheck.js";
import {
  type encodeErc20Permit,
  encodeParsedErc20Permit,
  parseErc20Permit,
} from "../../actions/requirements/encode/encodeErc20Permit.js";
import { readErc2612Permit } from "../../reads/readErc2612Permit.js";
import type { GetBundlesTokenRequirementsInput } from "./getBundlesTokenRequirements.js";

/** Uses the enclosing token resolver's complete checked input, not scalar witnesses. @internal */
export const getBundlesErc2612Permit = (
  {
    viemClient,
    chainCheck,
  }: { readonly viemClient: Client; readonly chainCheck: ChainCheck },
  params: GetBundlesTokenRequirementsInput,
) =>
  resolveErc2612Permit(viemClient, {
    ...params,
    encodePermit: (nonce) =>
      encodeParsedErc20Permit(
        { viemClient, chainCheck },
        parseErc20Permit(viemClient, {
          token: params.token,
          owner: params.owner,
          spender: params.spender,
          amount: params.amount,
          chainId: params.chainId,
          nonce,
          deadline: params.deadline,
          now: params.now,
          supportDeployless: params.supportDeployless,
        }),
      ),
  });

/** Preserves the shared nonce/domain fallback and transport-error behavior. */
function resolveErc2612Permit(
  viemClient: Client,
  params: Omit<Parameters<typeof encodeErc20Permit>[1], "nonce"> & {
    readonly encodePermit: (
      nonce: bigint,
    ) => ReturnType<typeof encodeErc20Permit>;
  },
) {
  return readErc2612Permit(viemClient, {
    token: params.token,
    owner: params.owner,
    resolve: async (nonce) => {
      const result = await params.encodePermit(nonce);
      return { domain: result.action.typedData.domain, result };
    },
  });
}
