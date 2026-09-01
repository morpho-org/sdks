import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { validateChainId } from "../../helpers/index.js";
import {
  type GetBundlesTokenRequirementsParams,
  getBundlesTokenRequirements,
} from "./getBundlesTokenRequirements.js";

/** Parameters for {@link getBlueBundlesV1TokenRequirements}. */
export type GetBlueBundlesV1TokenRequirementsParams = Omit<
  GetBundlesTokenRequirementsParams,
  "spender"
>;

/**
 * Resolves direct approval, ERC-2612, or Permit2 SignatureTransfer prerequisites for
 * BlueBundlesV1.
 *
 * Reads only the allowance and nonce state required by the selected path. Permit2 keeps the
 * ERC-20 allowance on canonical Permit2 while the one-time signed transfer names BlueBundlesV1
 * as spender. Permit2 SignatureTransfer requires an explicit unused unordered nonce so concurrent
 * requirements never silently sign the same owner-global nonce.
 *
 * @param viemClient - Connected viem client used for allowance and nonce reads.
 * @param params - BlueBundlesV1 token requirement parameters.
 * @returns Ordered deep-frozen approval transactions and/or signable token requirements.
 * @throws {ChainIdMismatchError} when the connected client targets another chain.
 * @throws {NegativeInputError} when `amount` or `permit2Nonce` is negative.
 * @throws {NonPositiveInputError} when `deadline` is not positive.
 * @throws {ExpiredDeadlineError} when `deadline` is not in the future.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when BlueBundlesV1 is not registered for the chain.
 * @throws {MissingPermit2TransferFromNonceError} when Permit2 is selected without a nonce.
 * @throws {Permit2TransferFromNonceAlreadyUsedError} when `permit2Nonce` is already consumed.
 * @throws {InputExceedsMaxError} when `amount`, `deadline`, or `permit2Nonce` exceeds uint256.
 * @throws {ApprovalAmountLessThanSpendAmountError} when `approvalAmount` is below `amount`.
 * @throws {viem.BaseError} when a required allowance, Permit2 nonce-bitmap, or ERC-2612 metadata
 *   read fails. A failed ERC-2612 nonce probe alone falls back to Permit2 or classic approval.
 * @example
 * ```ts
 * import { addressesRegistry } from "@morpho-org/blue-sdk";
 * import { createPublicClient, http, zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getBlueBundlesV1TokenRequirements } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirements = await getBlueBundlesV1TokenRequirements(client, {
 *   token: addressesRegistry[mainnet.id].usdc,
 *   amount: 1_000_000n,
 *   owner: zeroAddress,
 *   chainId: mainnet.id,
 *   deadline: 1_900_000_000n,
 *   supportSignature: true,
 *   permit2Nonce: 42n,
 * });
 * // requirements contains approvals and/or signable BlueBundlesV1 token requirements.
 * ```
 */
export const getBlueBundlesV1TokenRequirements = (
  viemClient: Client,
  params: GetBlueBundlesV1TokenRequirementsParams,
) => {
  // Preserve the public Blue resolver's chain-mismatch error ordering before registry lookup.
  validateChainId(viemClient.chain?.id, params.chainId);
  return getBundlesTokenRequirements(viemClient, {
    ...params,
    spender: getChainAddress(params.chainId, "bundles.blueBundlesV1"),
  });
};
