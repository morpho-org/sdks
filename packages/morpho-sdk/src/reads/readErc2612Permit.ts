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
import { _try, Time } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Client,
  getTypesForEIP712Domain,
  type Hex,
  hashDomain,
  type TypedData,
  type TypedDataDomain,
} from "viem";
import { readContract } from "viem/actions";
import { validateChainId, validateDeadline } from "../helpers/validate.js";
import { validateRequirementSpender } from "../helpers/validateRequirementSpender.js";
import { ExpiredDeadlineError } from "../types/index.js";
import { validateClientChainId } from "./validateClientChainId.js";

interface PermitInputs {
  readonly chainId: number;
  readonly spender: Address;
  readonly deadline?: bigint;
  readonly now: bigint;
}

function validatePermitInputs(
  clientChainId: number | undefined,
  { chainId, spender, deadline, now }: PermitInputs,
): bigint {
  validateChainId(clientChainId, chainId);
  validateRequirementSpender({
    chainId,
    spender,
    allowed: ["vaultBundlesV1", "blueBundlesV1"],
  });
  if (deadline == null) {
    return now + Time.s.from.h(2n);
  }
  validateDeadline(deadline);
  if (deadline <= now) {
    throw new ExpiredDeadlineError(deadline, now);
  }
  return deadline;
}

/** @internal Validates permit inputs and the transport chain before token metadata reads. */
export async function validateErc2612Permit(
  client: Client,
  params: PermitInputs,
): Promise<bigint> {
  const deadline = validatePermitInputs(client.chain?.id, params);
  await validateClientChainId(client, params.chainId);
  return deadline;
}

function unsupportedPermitRead(error: unknown): undefined {
  if (
    !isTransportError(error) &&
    (isContractRevertError(error) || isUndecodableResultError(error))
  ) {
    return undefined;
  }
  throw error;
}

function matchesPermitDomainSeparator(
  domain: TypedDataDomain,
  separator: Hex,
): boolean {
  return (
    separator.toLowerCase() ===
    hashDomain<TypedData>({
      domain,
      types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
    }).toLowerCase()
  );
}

/**
 * @internal Reads the owner nonce and checks the resolved signing domain against the token.
 * Returns undefined for an unsupported permit, while RPC transport failures propagate.
 */
export async function readErc2612Permit<T>(
  client: Client,
  {
    token,
    owner,
    resolve,
  }: {
    readonly token: Address;
    readonly owner: Address;
    readonly resolve: (
      nonce: bigint,
    ) => Promise<{ readonly domain?: TypedDataDomain; readonly result: T }>;
  },
): Promise<T | undefined> {
  const nonce = await readContract(client, {
    abi: erc2612Abi,
    address: token,
    functionName: "nonces",
    args: [owner],
  }).catch(unsupportedPermitRead);
  if (nonce === undefined) {
    return undefined;
  }

  const permit = await _try(
    () => resolve(nonce),
    MissingPermitDomainNameError,
    InvalidPermitDomainChainIdError,
    InvalidPermitDomainVerifyingContractError,
    UnsupportedPermitDomainExtensionsError,
  );
  if (permit === undefined) {
    return undefined;
  }

  const separator = await readContract(client, {
    abi: erc2612Abi,
    address: token,
    functionName: "DOMAIN_SEPARATOR",
  }).catch(unsupportedPermitRead);
  if (
    separator === undefined ||
    !matchesPermitDomainSeparator(permit.domain ?? {}, separator)
  ) {
    return undefined;
  }
  return permit.result;
}
