import {
  erc2612Abi,
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  isContractRevertError,
  isTransportError,
  isUndecodableResultError,
  MissingPermitDomainNameError,
  UnsupportedPermitDomainExtensionsError,
} from "@morpho-org/blue-sdk-viem";
import { _try, isDefined } from "@morpho-org/morpho-ts";
import {
  type Client,
  getTypesForEIP712Domain,
  hashDomain,
  type TypedData,
} from "viem";
import { readContract } from "viem/actions";
import { encodeErc20Permit } from "../../actions/requirements/encode/encodeErc20Permit.js";

/**
 * @internal Resolves ERC-2612 eligibility from the nonce, signing domain and onchain separator.
 * Unsupported domains and reverted or undecodable probes return undefined; other errors propagate.
 */
export async function getErc2612Permit(
  viemClient: Client,
  params: Omit<Parameters<typeof encodeErc20Permit>[1], "nonce">,
) {
  const nonce = await readContract(viemClient, {
    abi: erc2612Abi,
    address: params.token,
    functionName: "nonces",
    args: [params.owner],
  }).catch((error: unknown) => {
    if (isTransportError(error)) {
      throw error;
    }
    if (isContractRevertError(error) || isUndecodableResultError(error)) {
      return undefined;
    }
    throw error;
  });
  if (isDefined(nonce)) {
    const permit = await _try(
      () =>
        encodeErc20Permit(viemClient, {
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
      MissingPermitDomainNameError,
      InvalidPermitDomainChainIdError,
      InvalidPermitDomainVerifyingContractError,
      UnsupportedPermitDomainExtensionsError,
    );
    if (isDefined(permit)) {
      const separator = await readContract(viemClient, {
        abi: erc2612Abi,
        address: params.token,
        functionName: "DOMAIN_SEPARATOR",
      }).catch((error: unknown) => {
        if (isTransportError(error)) {
          throw error;
        }
        if (isContractRevertError(error) || isUndecodableResultError(error)) {
          return undefined;
        }
        throw error;
      });
      const domain = permit.action.typedData.domain ?? {};
      if (
        separator?.toLowerCase() ===
        hashDomain<TypedData>({
          domain,
          types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
        }).toLowerCase()
      ) {
        return permit;
      }
    }
  }
  return undefined;
}
