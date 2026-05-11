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

/**
 * Checks if an error is a contract revert with the "UnsupportedVaultV2Adapter"
 * error name, returning the offending adapter address if so. Used to propagate
 * adapter validation errors from the deployless `GetVaultV2.query` to the
 * caller as a typed {@link UnsupportedVaultV2AdapterError}.
 */
export function getUnsupportedVaultV2Adapter(error: unknown): Address | null {
  if (!(error instanceof BaseError)) return null;

  const revertError = error.walk(
    (err) => err instanceof ContractFunctionRevertedError,
  );

  if (
    !(revertError instanceof ContractFunctionRevertedError) ||
    revertError.data?.errorName !== "UnsupportedVaultV2Adapter"
  )
    return null;

  const [adapter] = revertError.data.args ?? [];
  return typeof adapter === "string" ? (adapter as Address) : null;
}
