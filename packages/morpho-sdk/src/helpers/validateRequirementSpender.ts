import { type Address, getChainAddresses } from "@morpho-org/blue-sdk";
import { isAddressEqual } from "viem";
import { UnsupportedErc20ApprovalSpenderError } from "../types/index.js";

/** Supported spender slots that can be validated against the chain address registry. */
export type RequirementSpenderKey =
  | "generalAdapter1"
  | "permit2"
  | "midnight"
  | "midnightBundles";

/**
 * Validates that a requirement encoder spender matches one of the allowed chain addresses.
 *
 * @param params - Spender validation parameters.
 * @param params.chainId - Chain id used to resolve supported spender addresses.
 * @param params.spender - Spender address to validate.
 * @param params.allowed - Allowed registry slots for this requirement.
 * @returns Nothing after the spender matches an allowed chain address.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` does not match any allowed slot.
 * @example
 * ```ts
 * import { validateRequirementSpender } from "@morpho-org/morpho-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 *
 * validateRequirementSpender({
 *   chainId: 8453,
 *   spender: getChainAddress(8453, "midnightBundles"),
 *   allowed: ["midnightBundles"],
 * });
 * ```
 */
export const validateRequirementSpender = (params: {
  readonly chainId: number;
  readonly spender: Address;
  readonly allowed: readonly RequirementSpenderKey[];
}): void => {
  const {
    permit2,
    midnight,
    midnightBundles,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(params.chainId);
  const addresses = {
    generalAdapter1,
    permit2,
    midnight,
    midnightBundles,
  } satisfies Record<RequirementSpenderKey, Address | undefined>;
  const supportedSpenders = params.allowed.map((key) => addresses[key]);

  if (
    !supportedSpenders.some(
      (supported) =>
        supported != null && isAddressEqual(params.spender, supported),
    )
  ) {
    throw new UnsupportedErc20ApprovalSpenderError({
      spender: params.spender,
      chainId: params.chainId,
      generalAdapter1,
      permit2,
      midnight,
      midnightBundles,
      supportedSpenders,
    });
  }
};
