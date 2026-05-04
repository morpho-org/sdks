import {
  type Address,
  type ChainId,
  getChainAddresses,
  type Token,
} from "@morpho-org/blue-sdk";
import {
  type Client,
  domainSeparator,
  erc20Abi,
  isAddressEqual,
  type TypedDataDefinition,
  type TypedDataDomain,
} from "viem";
import { readContract } from "viem/actions";
import { erc2612Abi } from "../abis.js";
import {
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  UnverifiablePermitDomainError,
} from "../error.js";
import type { FetchParameters } from "../types.js";

export interface PermitArgs {
  erc20: Token;
  owner: Address;
  spender: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
}

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * Asserts that an EIP-712 domain binds to the expected token and chain,
 * throwing the dedicated typed errors otherwise. Used by both static
 * (EIP-5267) and discovered (`DOMAIN_SEPARATOR`) domain paths so callers
 * cannot accidentally sign a domain pointing to a different token/chain.
 *
 * @param token - The token whose permit will be signed.
 * @param chainId - The expected chain id.
 * @param domain - The candidate EIP-712 domain.
 * @throws {InvalidPermitDomainChainIdError} if the domain chain does not match.
 * @throws {InvalidPermitDomainVerifyingContractError} if the verifying contract is missing or differs from the token address.
 */
// biome-ignore lint/complexity/useMaxParams: triple is intentional: token, expected chainId, candidate domain
const assertDomainBinds = (
  token: Address,
  chainId: ChainId,
  domain: TypedDataDomain,
): void => {
  if (domain.chainId !== chainId) {
    throw new InvalidPermitDomainChainIdError(token, chainId, domain.chainId);
  }

  if (
    domain.verifyingContract == null ||
    !isAddressEqual(domain.verifyingContract, token)
  ) {
    throw new InvalidPermitDomainVerifyingContractError(
      token,
      domain.verifyingContract,
    );
  }
};

export interface GetPermitTypedDataOptions {
  /**
   * A pre-verified EIP-712 domain. When provided it takes precedence over
   * `erc20.eip5267Domain` and the function never falls back to guessing.
   * Obtain one from {@link getVerifiedPermitDomain}.
   */
  domain?: TypedDataDomain;
}

/**
 * Builds EIP-2612 permit typed data for an ERC-20 token. The signing domain
 * comes from one of three sources, in order:
 *
 * 1. An explicit, pre-verified `options.domain` (preferred — see
 *    {@link getVerifiedPermitDomain}).
 * 2. The token's EIP-5267 metadata (`erc20.eip5267Domain.eip712Domain`).
 *
 * If neither is available the function fails closed with
 * {@link UnverifiablePermitDomainError} rather than guessing a domain from
 * ERC-20 metadata. Callers that need to support tokens without EIP-5267 must
 * resolve the domain on-chain first via {@link getVerifiedPermitDomain}.
 *
 * @param args - Permit arguments (token, owner, spender, allowance, nonce, deadline).
 * @param chainId - The chain on which the permit will be submitted.
 * @param options - Optional pre-verified domain.
 * @returns A `TypedDataDefinition` ready to pass to `signTypedData`.
 * @throws {InvalidPermitDomainChainIdError} if a provided domain targets another chain.
 * @throws {InvalidPermitDomainVerifyingContractError} if a provided domain targets another token.
 * @throws {UnverifiablePermitDomainError} if no verified domain is available.
 *
 * @example
 * ```ts
 * import { getPermitTypedData, getVerifiedPermitDomain } from "@morpho-org/blue-sdk-viem";
 *
 * const domain = await getVerifiedPermitDomain(client, { token, chainId });
 * if (domain == null) {
 *   // Fall back to Permit2.
 *   return;
 * }
 * const typedData = getPermitTypedData(args, chainId, { domain });
 * ```
 *
 * Docs: https://eips.ethereum.org/EIPS/eip-2612
 */
// biome-ignore lint/complexity/useMaxParams: kept signature stable; verifier path uses `options`
export const getPermitTypedData = (
  { deadline, owner, nonce, spender, erc20, allowance }: PermitArgs,
  chainId: ChainId,
  options: GetPermitTypedDataOptions = {},
): TypedDataDefinition<typeof permitTypes, "Permit"> => {
  const explicitDomain = options.domain;
  const eip5267Domain = erc20.eip5267Domain?.eip712Domain;

  const permitDomain = explicitDomain ?? eip5267Domain;

  if (permitDomain == null) {
    throw new UnverifiablePermitDomainError(erc20.address);
  }

  assertDomainBinds(erc20.address, chainId, permitDomain);

  return {
    domain: permitDomain,
    types: permitTypes,
    message: {
      owner,
      spender,
      value: allowance,
      nonce,
      deadline,
    },
    primaryType: "Permit",
  };
};

export interface PermitDomainCandidate {
  /** EIP-712 `name` field of the candidate domain. */
  name: string;
  /** EIP-712 `version` field of the candidate domain. */
  version: string;
}

export type GetVerifiedPermitDomainParameters = FetchParameters & {
  /** The ERC-20 token address. */
  token: Address;
  /** The chain on which the permit will be submitted. */
  chainId: ChainId;
  /**
   * Optional ERC-20 token name, e.g. fetched from a `Token` instance. When
   * omitted the token name is read on-chain. Used to seed the default
   * candidate set.
   */
  tokenName?: string;
  /**
   * Optional EIP-5267 domain already known for the token. When present and
   * bound to the token+chain it is returned immediately, skipping the
   * `DOMAIN_SEPARATOR()` discovery path.
   */
  knownDomain?: TypedDataDomain;
  /**
   * Extra `(name, version)` candidates to try when discovering the domain via
   * `DOMAIN_SEPARATOR()`. Useful for tokens whose EIP-712 `name` field does not
   * match the on-chain `name()` (e.g. legacy USDC: `"USD Coin"`).
   * Tried after the default candidates derived from `tokenName`.
   */
  extraCandidates?: readonly PermitDomainCandidate[];
};

/**
 * Default `version` strings tried against the on-chain `DOMAIN_SEPARATOR()`
 * during permit domain discovery. Order matters: `"1"` is by far the most
 * common, `"2"` covers tokens like USDC and EURC.
 */
export const DEFAULT_PERMIT_DOMAIN_VERSIONS = ["1", "2"] as const;

/**
 * Discovers an ERC-2612 token's EIP-712 permit domain in a fail-closed manner.
 *
 * - If a `knownDomain` (typically `Token.eip5267Domain.eip712Domain`) is
 *   provided and binds to the token and chain, returns it directly.
 * - Otherwise reads the token's `DOMAIN_SEPARATOR()` and tries each candidate
 *   `(name, version)` pair, returning the first whose hash matches.
 * - Returns `null` when neither path yields a match. Consumers must treat
 *   `null` as "simple permit unsupported" and fall back to Permit2 or classic
 *   approval; never sign a fabricated domain.
 *
 * The default candidate set is `(tokenName, version)` for each version in
 * {@link DEFAULT_PERMIT_DOMAIN_VERSIONS}, where `tokenName` is the parameter,
 * the on-chain `name()`, or both. Callers may extend the set via
 * `extraCandidates` without touching this package.
 *
 * @param client - A viem client connected to the target chain.
 * @param params - {@link GetVerifiedPermitDomainParameters}.
 * @returns The verified domain or `null` when no candidate matched.
 * @throws {InvalidPermitDomainChainIdError} if `knownDomain` targets another chain.
 * @throws {InvalidPermitDomainVerifyingContractError} if `knownDomain` targets another token.
 *
 * @example
 * ```ts
 * import { getVerifiedPermitDomain } from "@morpho-org/blue-sdk-viem";
 *
 * const domain = await getVerifiedPermitDomain(client, {
 *   token: usdc,
 *   chainId: 1,
 *   tokenName: "USDC",
 *   extraCandidates: [{ name: "USD Coin", version: "2" }],
 * });
 * ```
 */
export const getVerifiedPermitDomain = async (
  client: Client,
  params: GetVerifiedPermitDomainParameters,
): Promise<TypedDataDomain | null> => {
  const { token, chainId, knownDomain, tokenName, extraCandidates, ...rest } =
    params;

  if (knownDomain != null) {
    assertDomainBinds(token, chainId, knownDomain);
    return knownDomain;
  }

  const onchainSeparator = await readContract(client, {
    ...rest,
    address: token,
    abi: erc2612Abi,
    functionName: "DOMAIN_SEPARATOR",
  }).catch(() => undefined);

  if (onchainSeparator == null) return null;

  const resolvedName =
    tokenName ??
    (await readContract(client, {
      ...rest,
      address: token,
      abi: erc20Abi,
      functionName: "name",
    }).catch(() => undefined));

  const candidates: PermitDomainCandidate[] = [];
  if (typeof resolvedName === "string" && resolvedName.length > 0) {
    for (const version of DEFAULT_PERMIT_DOMAIN_VERSIONS) {
      candidates.push({ name: resolvedName, version });
    }
  }
  if (extraCandidates) candidates.push(...extraCandidates);

  for (const candidate of candidates) {
    const domain: TypedDataDomain = {
      name: candidate.name,
      version: candidate.version,
      chainId,
      verifyingContract: token,
    };

    if (domainSeparator({ domain }) === onchainSeparator) {
      return domain;
    }
  }

  return null;
};

export interface DaiPermitArgs {
  owner: Address;
  spender: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
}

const daiPermitTypes = {
  Permit: [
    { name: "holder", type: "address" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "allowed", type: "bool" },
  ],
} as const;

export const getDaiPermitTypedData = (
  { deadline, owner, nonce, spender, allowance }: DaiPermitArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof daiPermitTypes, "Permit"> => {
  const { dai } = getChainAddresses(chainId);

  const domain = {
    name: "Dai Stablecoin",
    version: "1",
    chainId,
    verifyingContract: dai,
  };

  return {
    domain,
    types: daiPermitTypes,
    message: {
      holder: owner,
      spender,
      allowed: allowance > 0n,
      nonce,
      expiry: deadline,
    },
    primaryType: "Permit",
  };
};
