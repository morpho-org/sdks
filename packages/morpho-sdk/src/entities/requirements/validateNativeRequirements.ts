import type { Client } from "viem";
import type { ChainCheck } from "../../actions/requirements/chainCheck.js";
import { validateClientChainId } from "../../actions/requirements/validateClientChainId.js";
import { ChainIdMismatchError } from "../../types/index.js";

/**
 * Checks native-funded write targets and the served chain concurrently.
 *
 * @param client - Connected viem client.
 * @param params - Validation parameters.
 * @param params.chainId - Expected chain ID.
 * @param params.chainCheck - Optional invocation-local chain validation shared with target checks.
 * @param params.assertWriteTargets - Contract-code validation for the selected flow.
 * @returns Resolves when both validations succeed.
 * @throws {ChainIdMismatchError} when the declared or served chain differs.
 * @throws {MissingContractCodeError} when a write target has no code on the expected chain.
 * @throws {viem.BaseError} when a validation RPC request fails.
 * @internal
 */
export const validateNativeRequirements = async (
  client: Client,
  {
    chainId,
    assertWriteTargets,
    chainCheck = () => validateClientChainId(client, chainId),
  }: {
    readonly chainId: number;
    readonly assertWriteTargets: () => Promise<void>;
    readonly chainCheck?: ChainCheck;
  },
): Promise<void> => {
  const [chain, targets] = await Promise.allSettled([
    chainCheck(),
    assertWriteTargets(),
  ]);
  // A served-chain mismatch explains a target failure; other chain errors must not hide it.
  if (
    chain.status === "rejected" &&
    chain.reason instanceof ChainIdMismatchError
  ) {
    throw chain.reason;
  }
  if (targets.status === "rejected") {
    throw targets.reason;
  }
  if (chain.status === "rejected") {
    throw chain.reason;
  }
};
