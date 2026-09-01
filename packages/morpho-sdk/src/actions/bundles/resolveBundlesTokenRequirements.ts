import type {
  BlueBundlesV1TokenSignatureRequirement,
  ERC20ApprovalAction,
  Transaction,
} from "../../types/index.js";
import {
  type ResolveBundlesApprovalRequirementsParams,
  resolveBundlesApprovalRequirements,
} from "./resolveBundlesApprovalRequirements.js";
import {
  type ResolveBundlesPermit2TransferFromRequirementsParams,
  resolveBundlesPermit2TransferFromRequirements,
} from "./resolveBundlesPermit2TransferFromRequirements.js";

export type {
  ResolveBundlesApprovalRequirementsParams,
  ResolveBundlesPermit2TransferFromRequirementsParams,
};

/** Parameters dispatched by {@link resolveBundlesTokenRequirements}. */
export type ResolveBundlesTokenRequirementsParams =
  | (ResolveBundlesApprovalRequirementsParams & {
      /** Selects classic ERC-20 approval resolution. */
      readonly type: "approval";
    })
  | (ResolveBundlesPermit2TransferFromRequirementsParams & {
      /** Selects Permit2 SignatureTransfer resolution. */
      readonly type: "permit2TransferFrom";
    });

/**
 * Coordinates classic approval and Permit2 SignatureTransfer requirement resolution.
 *
 * Each branch delegates to its dedicated synchronous resolver. The SignatureTransfer branch always
 * places any ERC-20 approval to canonical Permit2 before the one-time signature requirement.
 *
 * @param params - Selected resolution path and its complete parameters.
 * @returns Ordered approval transactions and/or a Permit2 SignatureTransfer requirement.
 * @throws {NegativeInputError} when an amount or Permit2 nonce is negative.
 * @throws {InputExceedsMaxError} when the Permit2 nonce exceeds uint256.
 * @throws {Permit2TransferFromNonceAlreadyUsedError} when the selected nonce bit is set.
 * @throws {ApprovalAmountLessThanSpendAmountError} when a classic approval cannot cover the pull.
 * @throws {UnsupportedChainIdError} when `chainId` is absent from the address registry.
 * @throws {UnsupportedErc20ApprovalSpenderError} when a required spender is not registered for
 *   `chainId`.
 * @example
 * ```ts
 * import { addressesRegistry } from "@morpho-org/blue-sdk";
 * import { getChainAddress } from "@morpho-org/morpho-ts";
 * import { resolveBundlesTokenRequirements } from "@morpho-org/morpho-sdk";
 * import { mainnet } from "viem/chains";
 *
 * const requirements = resolveBundlesTokenRequirements({
 *   type: "approval",
 *   token: addressesRegistry[mainnet.id].usdc,
 *   spender: getChainAddress(mainnet.id, "bundles.vaultBundlesV1"),
 *   chainId: mainnet.id,
 *   amount: 1_000_000n,
 *   allowance: 1_000_000n,
 *   approvalAmount: 1_000_000n,
 * });
 * // requirements is empty because the allowance already covers the amount.
 * ```
 */
export const resolveBundlesTokenRequirements = (
  params: ResolveBundlesTokenRequirementsParams,
): readonly (
  | Readonly<Transaction<ERC20ApprovalAction>>
  | BlueBundlesV1TokenSignatureRequirement
)[] => {
  if (params.type === "approval") {
    return resolveBundlesApprovalRequirements(params);
  }

  return resolveBundlesPermit2TransferFromRequirements(params);
};
