import { type Address, getChainAddresses } from "@morpho-org/blue-sdk";
import { isAddressEqual } from "viem";
import { UnsupportedErc20ApprovalSpenderError } from "../../../types/index.js";

type RequirementSpenderKey =
  | "generalAdapter1"
  | "permit2"
  | "midnight"
  | "midnightBundles";

/**
 * @internal
 * Validates that a requirement encoder spender is one of the supported chain addresses.
 */
export const validateRequirementSpender = (params: {
  readonly chainId: number;
  readonly spender: Address;
  readonly allowed: readonly RequirementSpenderKey[];
}) => {
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
