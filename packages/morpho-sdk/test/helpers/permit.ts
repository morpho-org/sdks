import { getChainAddresses } from "@morpho-org/blue-sdk";
import { mainnet } from "viem/chains";
import type { RequirementSignature } from "../../src/index.js";

/**
 * Builds a mainnet ERC-2612 permit {@link RequirementSignature} fixture targeting
 * `GeneralAdapter1`, for exercising the `requirementSignature` path of the Blue actions.
 */
export function makePermit({
  owner,
  asset,
  amount,
}: {
  owner: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
}): RequirementSignature {
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(mainnet.id);
  const signature = `0x${"11".repeat(64)}1b` as `0x${string}`;
  return {
    args: {
      owner,
      signature,
      deadline: 1n,
      amount,
      asset,
      nonce: 0n,
    },
    action: {
      type: "permit",
      args: {
        spender: generalAdapter1,
        amount,
        deadline: 1n,
      },
    },
  } satisfies RequirementSignature;
}
