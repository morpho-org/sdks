import type { Address, ChainId } from "@morpho-org/blue-sdk";
import { BaseError, ContractFunctionRevertedError } from "viem";

/** Thrown when a permit domain targets another chain; consumers should not sign it. */
export class InvalidPermitDomainChainIdError extends Error {
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  constructor(
    public readonly token: Address,
    public readonly expectedChainId: ChainId,
    public readonly domainChainId: number | undefined,
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

/** Thrown when a permit domain advertises unsupported EIP-5267 extensions. */
export class UnsupportedPermitDomainExtensionsError extends Error {
  public readonly extensions: readonly bigint[];

  constructor(
    public readonly token: Address,
    extensions: readonly bigint[],
  ) {
    super(
      `Unsupported EIP-5267 domain extensions for token "${token}": expected no extensions, got "${extensions.join(", ")}". Use another approval path instead of signing this permit.`,
    );

    this.extensions = [...extensions];
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
