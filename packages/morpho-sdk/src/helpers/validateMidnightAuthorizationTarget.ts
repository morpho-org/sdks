import { getChainAddresses } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual } from "viem";
import { UnsupportedMidnightAuthorizationTargetError } from "../types/index.js";

/**
 * Validates that a Midnight authorization grant targets a supported protocol operator.
 *
 * @param params - Authorization target validation parameters.
 * @param params.chainId - Chain id used to resolve supported Midnight operators.
 * @param params.authorized - Operator address receiving authorization.
 * @returns Nothing after the operator matches MidnightBundles or a supported ratifier.
 * @throws {UnsupportedMidnightAuthorizationTargetError} when `authorized` is not a supported operator.
 * @internal
 */
export const validateMidnightAuthorizationTarget = (params: {
  readonly chainId: number;
  readonly authorized: Address;
}): void => {
  const { midnightBundles, ecrecoverRatifier, setterRatifier } =
    getChainAddresses(params.chainId);
  const supportedTargets = [
    midnightBundles,
    ecrecoverRatifier,
    setterRatifier,
  ].filter((target): target is Address => target != null);

  if (
    !supportedTargets.some((supported) =>
      isAddressEqual(params.authorized, supported),
    )
  ) {
    throw new UnsupportedMidnightAuthorizationTargetError({
      authorized: params.authorized,
      chainId: params.chainId,
      supportedTargets,
    });
  }
};
