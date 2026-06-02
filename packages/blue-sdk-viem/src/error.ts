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
 *
 * Used to propagate factory validation errors instead of falling back to multicall.
 *
 * @param error - Error thrown by viem or another read path.
 * @returns `true` when `error` wraps a viem `ContractFunctionRevertedError` named
 *   `UnknownOfFactory`.
 * @example
 * ```ts
 * import { isUnknownOfFactoryError } from "@morpho-org/blue-sdk-viem";
 *
 * if (isUnknownOfFactoryError(error)) throw error;
 * ```
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
 *
 * @param error - Error thrown by viem or another read path.
 * @returns The unsupported adapter address when present, or `null` when the error does not match.
 * @example
 * ```ts
 * import { UnsupportedVaultV2AdapterError } from "@morpho-org/blue-sdk";
 * import { getUnsupportedVaultV2Adapter } from "@morpho-org/blue-sdk-viem";
 *
 * const adapter = getUnsupportedVaultV2Adapter(error);
 * if (adapter != null) throw new UnsupportedVaultV2AdapterError(adapter);
 * ```
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
