import { BaseError, ContractFunctionRevertedError } from "viem";

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
