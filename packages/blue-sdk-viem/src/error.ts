import type { Address, ChainId } from "@morpho-org/blue-sdk";
import { BaseError, ContractFunctionRevertedError } from "viem";

/** Thrown when a permit domain targets another chain; consumers should not sign it. */
export class InvalidPermitDomainChainIdError extends Error {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    public readonly token: Address,
    public readonly expectedChainId: ChainId,
    public readonly domainChainId: number | bigint | undefined,
  ) {
    super(
      `Invalid permit domain chain ID for token "${token}": expected "${expectedChainId}", got "${domainChainId}"`,
    );
  }
}

/** Thrown when a permit domain targets another token; consumers should not sign it. */
export class InvalidPermitDomainVerifyingContractError extends Error {
  constructor(
    public readonly token: Address,
    public readonly domainVerifyingContract: Address | undefined,
  ) {
    super(
      `Invalid permit domain verifying contract: expected "${token}", got "${domainVerifyingContract}"`,
    );
  }
}

/**
 * Thrown when a token's EIP-712 permit domain cannot be discovered: the token
 * exposes neither EIP-5267 introspection nor a `DOMAIN_SEPARATOR()` matching
 * any candidate domain. Consumers should fall back to another approval path
 * (e.g. Permit2) rather than sign an unverified domain.
 */
export class UnverifiablePermitDomainError extends Error {
  constructor(public readonly token: Address) {
    super(
      `Unverifiable permit domain for token "${token}": no EIP-5267 metadata and no candidate domain matched the on-chain DOMAIN_SEPARATOR. Use Permit2 or pass a verified domain explicitly.`,
    );
  }
}

/**
 * Checks if an error is a contract revert with the "UnknownOfFactory" error name.
 * Used to propagate factory validation errors instead of falling back to multicall.
 */
export function isUnknownOfFactoryError(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;

  const revertError = error.walk(
    (err) => err instanceof ContractFunctionRevertedError,
  );

  return (
    revertError instanceof ContractFunctionRevertedError &&
    revertError.data?.errorName === "UnknownOfFactory"
  );
}
